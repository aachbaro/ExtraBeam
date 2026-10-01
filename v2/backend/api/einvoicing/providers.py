import json
from abc import ABC, abstractmethod
from datetime import timedelta
from urllib.parse import urlencode, urlparse

import requests
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from ..models import ElectronicInvoiceAccount
from .mapper import invoice_to_superpdp_payload


class ProviderError(APIException):
    status_code = 502
    default_detail = "SUPER PDP indisponible. Réessayez la synchronisation."


def token_cipher():
    try:
        return Fernet(settings.EINVOICE_TOKEN_KEY.encode())
    except (ValueError, TypeError):
        raise ValidationError("EINVOICE_TOKEN_KEY doit contenir une clé Fernet dédiée.")


def store_tokens(account, tokens):
    if not tokens.get("access_token") or str(tokens.get("token_type", "Bearer")).lower() != "bearer":
        raise ProviderError("Réponse OAuth invalide.")
    account.encrypted_tokens = token_cipher().encrypt(json.dumps(tokens).encode()).decode()
    account.token_expires_at = timezone.now() + timedelta(seconds=int(tokens.get("expires_in", 1800)))
    account.save(update_fields=["encrypted_tokens", "token_expires_at", "updated_at"])


class ElectronicInvoiceProvider(ABC):
    @abstractmethod
    def verify_account(self, account): ...
    @abstractmethod
    def prepare_invoice(self, account, invoice): ...
    @abstractmethod
    def list_outgoing_invoices(self, account): ...
    @abstractmethod
    def connect_account(self, state, verifier, profile): ...
    @abstractmethod
    def complete_connection(self, account, code, verifier): ...
    @abstractmethod
    def submit_invoice(self, account, invoice, external_id): ...
    @abstractmethod
    def get_invoice_status(self, account, invoice_id=None): ...
    @abstractmethod
    def handle_webhook(self, request): ...
    @abstractmethod
    def report_payment(self, account, transmission): ...


class SuperPDPProvider(ElectronicInvoiceProvider):
    def __init__(self):
        self.base = settings.SUPERPDP_BASE_URL
        if urlparse(self.base).scheme != "https" or urlparse(self.base).query:
            raise ValidationError("SUPERPDP_BASE_URL doit être une URL HTTPS.")
        if not settings.SUPERPDP_CLIENT_ID or not settings.SUPERPDP_CLIENT_SECRET or not settings.SUPERPDP_REDIRECT_URI:
            raise ValidationError("Configurer les identifiants OAuth SUPER PDP et l'URI de retour.")
        token_cipher()

    def request(self, method, path, account=None, **kwargs):
        headers = kwargs.pop("headers", {})
        if account is not None:
            headers["Authorization"] = "Bearer " + self.access_token(account)
        try:
            response = requests.request(method, self.base + path, headers=headers, timeout=(5, 30), allow_redirects=False, **kwargs)
            if not 200 <= response.status_code < 300:
                # Never expose provider bodies: OAuth errors may contain credentials.
                raise ProviderError(f"SUPER PDP HTTP {response.status_code}. Consulter le compte ou relancer la synchronisation.")
            return response
        except requests.RequestException:
            raise ProviderError()

    def oauth_token(self, **data):
        return self.request("POST", "/oauth2/token", auth=(settings.SUPERPDP_CLIENT_ID, settings.SUPERPDP_CLIENT_SECRET), data=data).json()

    def connect_account(self, state, verifier, profile):
        import hashlib, base64
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        params = {"response_type": "code", "client_id": settings.SUPERPDP_CLIENT_ID,
                  "redirect_uri": settings.SUPERPDP_REDIRECT_URI, "state": state,
                  "code_challenge": challenge, "code_challenge_method": "S256", "login_hint": profile.user.email}
        if settings.SUPERPDP_ENVIRONMENT == "production" and (profile.siren or profile.siret):
            params.update(superpdp_company_number=profile.siren or profile.siret[:9], superpdp_company_number_scheme="fr_siren")
        return self.base + "/oauth2/authorize?" + urlencode(params)

    def complete_connection(self, account, code, verifier):
        tokens = self.oauth_token(grant_type="authorization_code", code=code, code_verifier=verifier, redirect_uri=settings.SUPERPDP_REDIRECT_URI)
        store_tokens(account, tokens)
        return self.verify_account(account)

    def verify_account(self, account):
        session = self.request("GET", "/v1.beta/oauth2_sessions/me", account).json()
        account.connection_status = session["company_verification_status"]
        if account.connection_status == "verified":
            company = self.request("GET", "/v1.beta/companies/me", account).json()
            if account.provider_account_id and account.provider_account_id != str(company["id"]):
                raise ValidationError("Impossible de remplacer l'entreprise d'un compte déjà lié.")
            if company["env"] != settings.SUPERPDP_ENVIRONMENT:
                raise ValidationError("Le compte SUPER PDP ne correspond pas à l'environnement configuré.")
            if company["env"] == "production" and company["number"] != (account.owner.siren or account.owner.siret[:9]):
                raise ValidationError("Le SIREN SUPER PDP ne correspond pas au profil Rivebelle.")
            account.provider_account_id = str(company["id"])
            account.environment = company["env"]
            account.company_metadata = {k: company.get(k) for k in ("number", "number_scheme", "has_vat_on_debits", "vat_regime")}
            account.connection_status = "connected"
        account.save(update_fields=["connection_status", "provider_account_id", "environment", "company_metadata", "updated_at"])
        return account

    def access_token(self, account):
        # Serializes refresh token rotation, including concurrent requests.
        with transaction.atomic():
            # SQLite is the deployed DB and ignores select_for_update. A no-op write
            # takes its write lock before reading/rotating credentials.
            ElectronicInvoiceAccount.objects.filter(pk=account.pk).update(updated_at=F("updated_at"))
            current = ElectronicInvoiceAccount.objects.select_for_update().get(pk=account.pk)
            try:
                tokens = json.loads(token_cipher().decrypt(current.encrypted_tokens.encode()))
            except (InvalidToken, ValueError):
                raise ValidationError("Connexion SUPER PDP à renouveler.")
            if not current.token_expires_at or current.token_expires_at <= timezone.now() + timedelta(seconds=60):
                if not tokens.get("refresh_token"):
                    raise ValidationError("Reconnecter SUPER PDP : refresh token absent.")
                tokens = self.oauth_token(grant_type="refresh_token", refresh_token=tokens["refresh_token"])
                if not tokens.get("refresh_token"):
                    raise ProviderError("Rotation OAuth incomplète : reconnecter SUPER PDP.")
                store_tokens(current, tokens)
            return tokens["access_token"]

    def prepare_invoice(self, account, invoice):
        if invoice.issuer_snapshot.get("sandbox_fixture") and account.environment != "sandbox":
            raise ValidationError("Une facture de test ne peut jamais être envoyée en production.")
        payload = invoice_to_superpdp_payload(invoice)
        if account.environment == "production" and payload["seller"]["legal_registration_identifier"]["value"] != account.company_metadata.get("number"):
            raise ValidationError("Le SIREN figé sur la facture ne correspond pas à l'entreprise SUPER PDP.")
        xml = self.request("POST", "/v1.beta/invoices/convert", account,
                           params={"from": "en16931", "to": "cii"}, json=payload).content
        report = self.request("POST", "/v1.beta/validation_reports", account,
                              files={"file_name": ("invoice.xml", xml, "application/xml")}).json()
        if not report.get("data") or not all(row.get("is_valid") is True for row in report["data"]):
            failures = [m.get("message", "") for row in report.get("data", []) for sub in row.get("subreports", []) for m in sub.get("failures", [])]
            raise ValidationError({"detail": "Facture refusée par le validateur officiel. " + " ".join(failures)[:2000], "validation_errors": failures})
        return xml

    def submit_invoice(self, account, invoice, external_id):
        # Caller must persist the sending reservation before this non-idempotent request.
        return self.request("POST", "/v1.beta/invoices", account,
            params={"external_id": str(external_id), "processing_rule": "B2B"},
            data=invoice._electronic_xml, headers={"Content-Type": "application/xml"}).json()

    def get_invoice_status(self, account, invoice_id=None):
        if invoice_id:
            invoice = self.request("GET", f"/v1.beta/invoices/{invoice_id}", account).json()
            events, cursor = [], 0
            for _ in range(100):
                page = self.request("GET", "/v1.beta/invoice_events", account,
                    params={"invoice_id": invoice_id, "starting_after_id": cursor, "limit": 100}).json()
                data = page.get("data", [])
                events.extend(data)
                if not page.get("has_after"):
                    invoice["events"] = events
                    return invoice
                if not data:
                    raise ProviderError("Pagination des événements incohérente.")
                cursor = max(int(row["id"]) for row in data)
            raise ProviderError("Trop d'événements : relancer la synchronisation.")
        return self.request("GET", "/v1.beta/invoice_events", account,
                            params={"starting_after_id": account.event_cursor, "limit": 100}).json()

    def list_outgoing_invoices(self, account):
        cursor = 0
        for _ in range(100):
            page = self.request("GET", "/v1.beta/invoices", account,
                params={"direction": "out", "starting_after_id": cursor, "limit": 100}).json()
            for invoice in page.get("data", []):
                if str(invoice["company_id"]) != account.provider_account_id:
                    raise ProviderError("Compte fournisseur incohérent.")
                yield invoice
            if not page.get("has_after"):
                return
            data = page.get("data", [])
            if not data:
                raise ProviderError("Pagination des factures incohérente.")
            cursor = max(int(row["id"]) for row in data)

    def handle_webhook(self, request):
        raise APIException("Webhooks désactivés : aucun contrat de signature publié. Utiliser la synchronisation officielle.", code="unsupported_webhook")

    def report_payment(self, account, transmission):
        return self.request("POST", "/v1.beta/invoice_events", account,
            json={"invoice_id": int(transmission.provider_invoice_id), "status_code": "fr:212"}).json()


def get_provider(name="superpdp"):
    if name != "superpdp":
        raise ValidationError("Provider de facturation inconnu.")
    return SuperPDPProvider()
