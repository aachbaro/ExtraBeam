import hashlib
import hmac
import json
import secrets
import time
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from .models import (AccountProfile, Facture, InvoiceLine, ElectronicInvoiceAccount,
    ElectronicInvoiceTransmission as Transmission, ElectronicInvoiceEvent,
    ElectronicInvoiceOAuthState, UserApiToken, Payment)
from .einvoicing.mapper import invoice_to_superpdp_payload
from .einvoicing.providers import SuperPDPProvider, ProviderError, ProviderInvoiceRejected, store_tokens
from .einvoicing.services import finalize, submit, apply_events, sync_account, report_invoice_payment


@override_settings(EINVOICE_TOKEN_KEY=Fernet.generate_key().decode(), SUPERPDP_CLIENT_ID="test-client",
    SUPERPDP_CLIENT_SECRET="test-secret", SUPERPDP_REDIRECT_URI="http://testserver/api/einvoicing/callback/",
    SUPERPDP_ENVIRONMENT="sandbox", STRIPE_WEBHOOK_SECRET="test-whsec", STRIPE_LIVE_MODE=False)
class ElectronicInvoicingTests(TestCase):
    def setUp(self):
        self.owner = AccountProfile.objects.create(user=User.objects.create_user("owner"), legal_name="Entreprise Test",
            siren="123456789", siret="12345678900012", address_line1="1 rue Test", postal_code="75001", city="Paris")
        self.other = AccountProfile.objects.create(user=User.objects.create_user("other"))
        self.invoice = Facture.objects.create(profile=self.owner, numero="2026-0001", client_name="Client fictif",
            client_siren="987654321", client_address_ligne1="2 rue Test", client_code_postal="75002", client_ville="Paris",
            client_pays="France", description="Prestation test", montant_ht="100.00", montant_ttc="100.00",
            date_emission=date(2026, 10, 1), date_echeance=date(2026, 10, 31), conditions_paiement="30 jours",
            mention_tva="TVA non applicable, art. 293 B du CGI", penalites_retard="Taux BCE + 10 points",
            indemnite_recouvrement="Indemnité forfaitaire 40 EUR")
        self.account = ElectronicInvoiceAccount.objects.create(owner=self.owner, provider_account_id="42",
            connection_status="connected", environment="sandbox", company_metadata={"has_vat_on_debits": False})
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Token " + UserApiToken.get_or_create_for_profile(self.owner).token)

    def finalized(self):
        self.invoice = finalize(self.invoice)
        return self.invoice

    def transmission(self, **kwargs):
        self.finalized()
        return Transmission.objects.create(invoice=self.invoice, account=self.account, provider_invoice_id="99", **kwargs)

    def test_mapper_franchise(self):
        payload = invoice_to_superpdp_payload(self.invoice)
        self.assertEqual(payload["totals"]["total_vat_amount"]["value"], "0.00")
        self.assertEqual(payload["vat_break_down"][0]["vat_category_code"], "E")
        self.assertEqual(payload["type_code"], 380)  # OpenAPI integer, never a string.
        self.assertEqual(payload["seller"]["electronic_address"], {"scheme": "0225", "value": "123456789"})

    def test_mapper_vat_multiple_lines(self):
        self.owner.vat_number = "FR12123456789"
        self.owner.save()
        self.invoice.montant_ht, self.invoice.montant_ttc, self.invoice.tva = Decimal("100"), Decimal("120"), Decimal("20")
        for description in ("Première prestation", "Deuxième prestation"):
            InvoiceLine.objects.create(invoice=self.invoice, description=description, quantity=2, unit_price_excl_tax=25, tax_rate=20, total_excl_tax=50)
        payload = invoice_to_superpdp_payload(self.invoice)
        self.assertEqual(len(payload["lines"]), 2)
        self.assertEqual(payload["totals"]["total_with_vat"], "120.00")

    def test_mapper_missing_legal_data(self):
        self.owner.legal_name = ""
        with self.assertRaises(ValidationError): invoice_to_superpdp_payload(self.invoice)

    def test_mapper_incoherent_totals(self):
        self.invoice.montant_ttc = Decimal("101")
        with self.assertRaises(ValidationError): invoice_to_superpdp_payload(self.invoice)

    def test_mapper_incoherent_siret(self):
        self.invoice.client_siret = "12345678900012"
        with self.assertRaises(ValidationError): invoice_to_superpdp_payload(self.invoice)

    def test_mapper_vat_requires_vat_number(self):
        self.invoice.tva, self.invoice.montant_ttc = Decimal("20"), Decimal("120")
        with self.assertRaises(ValidationError): invoice_to_superpdp_payload(self.invoice)

    def test_mapper_missing_exemption_and_dates(self):
        self.invoice.mention_tva = ""
        with self.assertRaises(ValidationError): invoice_to_superpdp_payload(self.invoice)
        self.invoice.date_echeance = date(2025, 1, 1)
        with self.assertRaises(ValidationError): invoice_to_superpdp_payload(self.invoice)

    def test_finalize_freezes_identity_and_prevents_mutation(self):
        self.finalized()
        self.owner.legal_name = "Nouveau nom"
        self.owner.save()
        self.assertEqual(invoice_to_superpdp_payload(self.invoice)["seller"]["name"], "Entreprise Test")
        url = f"/api/profiles/{self.owner.slug}/factures/{self.invoice.pk}/"
        self.assertEqual(self.client.patch(url, {"montant_ht": "1"}).status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 409)
        self.assertEqual(self.client.patch(url, {"status": "paid"}).status_code, 200)

    @patch("api.einvoicing.services.get_provider")
    def test_submit_idempotent(self, factory):
        self.finalized()
        provider = factory.return_value
        provider.prepare_invoice.return_value = b"<xml/>"
        provider.submit_invoice.return_value = {"id": 99, "company_id": 42, "direction": "out"}
        first, second = submit(self.invoice), submit(self.invoice)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(first.provider_invoice_id, "99")
        provider.submit_invoice.assert_called_once()

    @patch("api.einvoicing.services.get_provider")
    def test_sync_during_submit_cannot_regress_status(self, factory):
        self.finalized()
        def remote_post(*args):
            transmission = Transmission.objects.get(invoice=self.invoice)
            transmission.provider_invoice_id, transmission.status, transmission.last_event_id = "99", "accepted", 10
            transmission.save()
            return {"id": 99, "company_id": 42, "direction": "out"}
        factory.return_value.submit_invoice.side_effect = remote_post
        transmission = submit(self.invoice)
        self.assertEqual(transmission.status, "accepted")
        self.assertEqual(transmission.last_event_id, 10)

    @patch("api.einvoicing.services.get_provider")
    def test_uncertain_submit_never_resends(self, factory):
        self.finalized()
        provider = factory.return_value
        provider.submit_invoice.side_effect = ProviderError()
        with self.assertRaises(ProviderError): submit(self.invoice)
        self.assertEqual(submit(self.invoice).status, "unknown")
        provider.submit_invoice.assert_called_once()

    @patch("api.einvoicing.services.get_provider")
    def test_definite_provider_refusal_is_failed_not_unknown(self, factory):
        self.finalized()
        factory.return_value.submit_invoice.side_effect = ProviderInvoiceRejected()
        with self.assertRaises(ProviderInvoiceRejected):
            submit(self.invoice)
        transmission = Transmission.objects.get(invoice=self.invoice)
        self.assertEqual(transmission.status, "failed")
        self.assertIn("refusé", transmission.last_error)

    @patch("api.einvoicing.providers.requests.request")
    def test_invoice_bad_request_is_safe_refusal_without_exposing_body(self, request):
        store_tokens(self.account, {"access_token": "access", "expires_in": 1800})
        request.return_value = Mock(status_code=400, text="private provider data")
        self.invoice._electronic_xml = b"<Invoice/>"
        with self.assertRaises(ProviderInvoiceRejected) as error:
            SuperPDPProvider().submit_invoice(self.account, self.invoice, "test")
        self.assertNotIn("private", str(error.exception))

    @patch("api.einvoicing.providers.requests.request")
    def test_normal_invoice_is_not_sent_to_sandbox(self, request):
        with self.assertRaisesMessage(ValidationError, "entreprises fictives"):
            SuperPDPProvider().prepare_invoice(self.account, self.invoice)
        request.assert_not_called()

    @patch("api.einvoicing.services.get_provider")
    def test_validation_error_does_not_reserve_send(self, factory):
        self.finalized()
        factory.return_value.prepare_invoice.side_effect = ValidationError("Schematron")
        with self.assertRaises(ValidationError): submit(self.invoice)
        self.assertFalse(Transmission.objects.exists())

    def test_submit_requires_finalization_and_connection(self):
        with self.assertRaises(ValidationError): submit(self.invoice)
        self.finalized()
        self.account.connection_status = "disconnected"
        self.account.save()
        with self.assertRaises(ValidationError): submit(self.invoice)

    @override_settings(STRIPE_SECRET_KEY="sk_test_dummy")
    def test_endpoint_owner_separation_and_auth(self):
        self.client.credentials(HTTP_AUTHORIZATION="Token " + UserApiToken.get_or_create_for_profile(self.other).token)
        for action in ("finalize", "submit-electronic", "checkout"):
            response = self.client.post(f"/api/invoices/{self.invoice.pk}/{action}/")
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get("/api/einvoicing/status/").data["connection_status"], "disconnected")
        self.client.credentials()
        self.assertEqual(self.client.get("/api/einvoicing/status/").status_code, 401)

    def test_events_are_idempotent_ordered_and_account_scoped(self):
        transmission = self.transmission()
        event = {"id": 12, "invoice_id": 99, "status_code": "fr:205", "status_text": "Approuvée"}
        apply_events(self.account, [event, event])
        other_account = ElectronicInvoiceAccount.objects.create(owner=self.other, provider_account_id="43")
        apply_events(other_account, [{**event, "id": 13, "status_code": "fr:210"}])
        apply_events(self.account, [{**event, "id": 10, "status_code": "fr:200"}])
        transmission.refresh_from_db()
        self.assertEqual(transmission.status, "accepted")
        self.assertEqual(ElectronicInvoiceEvent.objects.filter(provider_event_id="12").count(), 1)

    @patch("api.einvoicing.services.get_provider")
    def test_sync_paginates_and_reconciles_without_resubmit(self, factory):
        transmission = self.transmission(status="unknown")
        transmission.provider_invoice_id = ""
        transmission.save()
        provider = factory.return_value
        provider.list_outgoing_invoices.return_value = [{"id": 99, "external_id": str(transmission.external_id)}]
        provider.get_invoice_status.side_effect = [
            {"data": [{"id": 1, "invoice_id": 99, "status_code": "api:uploaded"}], "has_after": True},
            {"data": [{"id": 2, "invoice_id": 99, "status_code": "fr:201"}], "has_after": False},
            {"company_id": 42, "events": []}]
        sync_account(self.account)
        transmission.refresh_from_db()
        self.assertEqual(transmission.provider_invoice_id, "99")
        self.assertEqual(transmission.status, "sent")
        self.assertEqual(self.account.event_cursor, 2)
        provider.submit_invoice.assert_not_called()

    def test_webhook_fails_closed(self):
        self.assertEqual(self.client.post("/api/webhooks/superpdp/", {"status_code": "fr:212"}, format="json").status_code, 501)
        self.assertFalse(ElectronicInvoiceEvent.objects.exists())

    def test_account_company_unique(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ElectronicInvoiceAccount.objects.create(owner=self.other, provider_account_id="42")

    def test_tokens_encrypted(self):
        store_tokens(self.account, {"access_token": "secret-access", "refresh_token": "secret-refresh", "expires_in": 60})
        self.account.refresh_from_db()
        self.assertNotIn("secret-access", self.account.encrypted_tokens)
        self.assertNotIn("secret-refresh", json.dumps(self.client.get("/api/einvoicing/status/").data))

    @patch("api.einvoicing.providers.requests.request")
    def test_transport_uses_convert_validator_then_xml(self, request):
        self.invoice.issuer_snapshot = {"sandbox_fixture": invoice_to_superpdp_payload(self.invoice)}
        store_tokens(self.account, {"access_token": "access", "refresh_token": "refresh", "expires_in": 1800})
        xml_response = Mock(status_code=200, content=b"<Invoice/>")
        valid_response = Mock(status_code=200)
        valid_response.json.return_value = {"data": [{"is_valid": True}]}
        sent_response = Mock(status_code=200)
        sent_response.json.return_value = {"id": 99, "company_id": 42, "direction": "out"}
        request.side_effect = [xml_response, valid_response, sent_response]
        provider = SuperPDPProvider()
        self.invoice._electronic_xml = provider.prepare_invoice(self.account, self.invoice)
        result = provider.submit_invoice(self.account, self.invoice, "test-external-id")
        self.assertEqual(result["id"], 99)
        calls = request.call_args_list
        self.assertEqual(calls[0].args[1], "https://api.superpdp.tech/v1.beta/invoices/convert")
        self.assertEqual(calls[0].kwargs["params"], {"from": "en16931", "to": "cii"})
        self.assertEqual(calls[1].kwargs["files"]["file_name"][2], "application/xml")
        self.assertEqual(calls[2].kwargs["data"], b"<Invoice/>")
        self.assertNotIn("json", calls[2].kwargs)

    @patch("api.einvoicing.providers.requests.request")
    def test_validator_rejection_prevents_post(self, request):
        self.invoice.issuer_snapshot = {"sandbox_fixture": invoice_to_superpdp_payload(self.invoice)}
        store_tokens(self.account, {"access_token": "access", "expires_in": 1800})
        xml_response = Mock(status_code=200, content=b"<Invoice/>")
        invalid = Mock(status_code=200)
        invalid.json.return_value = {"data": [{"is_valid": False, "subreports": [{"failures": [{"message": "BR-FR: adresse requise"}]}]}]}
        request.side_effect = [xml_response, invalid]
        with self.assertRaisesMessage(ValidationError, "adresse requise"):
            SuperPDPProvider().prepare_invoice(self.account, self.invoice)
        self.assertEqual(request.call_count, 2)

    @patch("api.einvoicing.providers.requests.request")
    def test_account_verification_preserves_rotated_tokens(self, request):
        store_tokens(self.account, {"access_token": "old", "refresh_token": "old-refresh", "expires_in": -1})
        token = Mock(status_code=200)
        token.json.return_value = {"access_token": "new", "refresh_token": "new-refresh", "expires_in": 1800}
        session = Mock(status_code=200)
        session.json.return_value = {"company_verification_status": "verified"}
        company = Mock(status_code=200)
        company.json.return_value = {"id": 42, "env": "sandbox", "number": "test"}
        request.side_effect = [token, session, company]
        provider = SuperPDPProvider()
        provider.verify_account(self.account)
        self.assertEqual(provider.access_token(self.account), "new")
        self.assertEqual(request.call_count, 3)

    @override_settings(SUPERPDP_ENVIRONMENT="production")
    @patch("api.einvoicing.providers.requests.request")
    def test_sandbox_company_rejected_in_production(self, request):
        store_tokens(self.account, {"access_token": "access", "expires_in": 1800})
        session = Mock(status_code=200)
        session.json.return_value = {"company_verification_status": "verified"}
        company = Mock(status_code=200)
        company.json.return_value = {"id": 42, "env": "sandbox", "number": "test"}
        request.side_effect = [session, company]
        with self.assertRaises(ValidationError): SuperPDPProvider().verify_account(self.account)

    def test_sandbox_fixture_cannot_be_sent_by_production_account(self):
        self.invoice.issuer_snapshot = {"sandbox_fixture": invoice_to_superpdp_payload(self.invoice)}
        self.account.environment = "production"
        with self.assertRaises(ValidationError): SuperPDPProvider().prepare_invoice(self.account, self.invoice)

    @patch("api.einvoicing.services.get_provider")
    def test_payment_timeout_never_resends(self, factory):
        self.owner.vat_number = "FR12123456789"
        self.owner.save()
        self.invoice.montant_ttc, self.invoice.tva = Decimal("120"), Decimal("20")
        self.invoice.save()
        transmission = self.transmission()
        self.invoice.status = "paid"
        self.invoice.save()
        factory.return_value.report_payment.side_effect = ProviderError()
        report_invoice_payment(self.invoice)
        report_invoice_payment(self.invoice)
        transmission.refresh_from_db()
        self.assertEqual(transmission.payment_report_status, "unknown")
        factory.return_value.report_payment.assert_called_once()

    def test_invoice_lines_api_and_private_legal_fields(self):
        response = self.client.patch(f"/api/profiles/{self.owner.slug}/factures/{self.invoice.pk}/", {
            "lines": [{"description": "Test", "quantity": "2", "unit_price_excl_tax": "50", "tax_rate": "0", "total_excl_tax": "100"}],
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["lines"]), 1)
        public = APIClient().get(f"/api/profiles/{self.owner.slug}/").data["profile"]
        self.assertEqual(public["siren"], "")
        self.assertEqual(public["legal_name"], "")

    @patch("api.einvoicing.providers.requests.request")
    def test_refresh_rotation(self, request):
        store_tokens(self.account, {"access_token": "old", "refresh_token": "refresh-old", "expires_in": -1})
        response = Mock(status_code=200)
        response.json.return_value = {"access_token": "new", "refresh_token": "refresh-new", "expires_in": 1800}
        request.return_value = response
        provider = SuperPDPProvider()
        self.assertEqual(provider.access_token(self.account), "new")
        self.assertEqual(provider.access_token(self.account), "new")
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.kwargs["data"]["refresh_token"], "refresh-old")

    @patch("api.einvoicing.providers.requests.request")
    def test_oauth_browser_binding_replay_and_mock_exchange(self, request):
        self.account.delete()
        response = self.client.get("/api/einvoicing/connect/")
        from urllib.parse import parse_qs, urlparse
        params = parse_qs(urlparse(response.data["authorization_url"]).query)
        state = params["state"][0]
        self.assertEqual(params["code_challenge_method"], ["S256"])
        stranger = APIClient()
        self.assertEqual(stranger.get(f"/api/einvoicing/callback/?state={state}&code=x").status_code, 400)
        token_response = Mock(status_code=200)
        token_response.json.return_value = {"access_token": "access", "refresh_token": "refresh", "expires_in": 1800}
        session_response = Mock(status_code=200)
        session_response.json.return_value = {"company_verification_status": "verified"}
        company_response = Mock(status_code=200)
        company_response.json.return_value = {"id": 42, "env": "sandbox", "number": "test", "has_vat_on_debits": False}
        request.side_effect = [token_response, session_response, company_response]
        callback = f"/api/einvoicing/callback/?state={state}&code=x"
        self.assertEqual(self.client.get(callback).status_code, 302)
        self.assertEqual(self.client.get(callback).status_code, 400)
        self.assertEqual(ElectronicInvoiceAccount.objects.get(owner=self.owner).connection_status, "connected")
        self.assertNotIn("access", callback)

    def test_oauth_expiry(self):
        self.client.get("/api/einvoicing/connect/")
        saved = ElectronicInvoiceOAuthState.objects.get(owner=self.owner)
        ElectronicInvoiceOAuthState.objects.filter(pk=saved.pk).update(created_at=timezone.now() - timedelta(minutes=11))
        self.assertEqual(self.client.get("/api/einvoicing/callback/?state=invalid&code=x").status_code, 400)

    @patch("api.einvoicing.services.get_provider")
    def test_payment_report_independent_idempotent(self, factory):
        self.invoice.montant_ttc, self.invoice.tva = Decimal("120"), Decimal("20")
        self.invoice.save()
        self.owner.vat_number = "FR12123456789"
        self.owner.save()
        transmission = self.transmission()
        self.invoice.status = "paid"
        self.invoice.save()
        report_invoice_payment(self.invoice)
        report_invoice_payment(self.invoice)
        factory.return_value.report_payment.assert_called_once()
        transmission.refresh_from_db()
        self.assertEqual(transmission.payment_report_status, "reported")

    @patch("api.einvoicing.services.get_provider")
    def test_franchise_does_not_report_vat_receipt(self, factory):
        self.transmission()
        self.invoice.status = "paid"
        report_invoice_payment(self.invoice)
        factory.assert_not_called()

    def signed_stripe_event(self, session, event_type="checkout.session.completed"):
        body = json.dumps({"id": "evt_test", "type": event_type, "livemode": False, "data": {"object": session}})
        timestamp = int(time.time())
        signature = hmac.new(b"test-whsec", f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
        return self.client.post("/api/webhooks/stripe/", body, content_type="application/json",
            HTTP_STRIPE_SIGNATURE=f"t={timestamp},v1={signature}")

    def test_stripe_verified_payment_and_replay(self):
        self.finalized()
        Payment.objects.create(invoice=self.invoice, provider_session_id="cs_test", amount=100, currency="EUR")
        session = {"id": "cs_test", "payment_status": "paid", "amount_total": 10000, "currency": "eur"}
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.signed_stripe_event(session).status_code, 200)
            self.assertEqual(self.signed_stripe_event(session).status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "paid")
        self.assertEqual(Payment.objects.get(invoice=self.invoice).status, "paid")

    @override_settings(STRIPE_SECRET_KEY="sk_test_dummy")
    @patch("api.payments.stripe.checkout.Session.create")
    def test_stripe_checkout_reuses_session_without_einvoice_connection(self, create):
        self.finalized()
        self.account.delete()
        create.return_value = Mock(id="cs_checkout", url="https://checkout.stripe.com/test")
        url = f"/api/invoices/{self.invoice.pk}/checkout/"
        self.assertEqual(self.client.post(url).status_code, 200)
        self.assertEqual(self.client.post(url).data["url"], "https://checkout.stripe.com/test")
        create.assert_called_once()
        self.assertEqual(create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"], 10000)

    @patch("api.einvoicing.services.get_provider")
    @patch("api.management.commands.superpdp_sandbox.get_provider")
    @patch("api.management.commands.superpdp_sandbox.sync_account")
    def test_sandbox_command_creates_only_official_fictitious_fixture(self, sync, command_factory, service_factory):
        from django.core.management import call_command
        from io import StringIO
        payload = invoice_to_superpdp_payload(self.invoice)
        payload["number"] = "2026-9999"
        provider = service_factory.return_value
        command_factory.return_value = provider
        provider.request.return_value.json.return_value = payload
        provider.submit_invoice.return_value = {"id": 199, "company_id": 42, "direction": "out"}
        output = StringIO()
        call_command("superpdp_sandbox", owner_slug=self.owner.slug, send_fictitious_invoice=True, stdout=output)
        fake = Facture.objects.get(numero="2026-9999")
        self.assertTrue(fake.issuer_snapshot["sandbox_fixture"])
        self.assertEqual(fake.lines.count(), 1)
        provider.submit_invoice.assert_called_once()
        self.assertIn("provider_invoice_id=199", output.getvalue())

    def test_stripe_bad_signature_amount_and_unpaid(self):
        self.finalized()
        Payment.objects.create(invoice=self.invoice, provider_session_id="cs_test", amount=100, currency="EUR")
        self.assertEqual(self.client.post("/api/webhooks/stripe/", {}, format="json").status_code, 400)
        session = {"id": "cs_test", "payment_status": "paid", "amount_total": 1, "currency": "eur"}
        self.assertEqual(self.signed_stripe_event(session).status_code, 400)
        self.assertEqual(self.signed_stripe_event({**session, "payment_status": "unpaid"}).status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "pending_payment")
