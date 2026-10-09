from datetime import date
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from api.models import Facture, InvoiceLine
from .services import connected_account
from .providers import get_provider


def create_sandbox_invoice(owner):
    if settings.SUPERPDP_ENVIRONMENT != "sandbox":
        raise ValidationError("La génération de test est réservée au bac à sable.")
    account = connected_account(owner)
    provider = get_provider(account.provider)
    provider.verify_account(account)
    if account.environment != "sandbox" or account.connection_status != "connected":
        raise ValidationError("Connecter un compte sandbox vérifié via l'OAuth Rivebelle.")
    payload = provider.request("GET", "/v1.beta/invoices/generate_test_invoice", account, params={"format": "en16931"}).json()
    totals, buyer = payload["totals"], payload["buyer"]
    number = payload["number"]
    existing = Facture.objects.filter(profile=owner, numero=number).first()
    if existing and not existing.issuer_snapshot.get("sandbox_fixture"):
        raise ValidationError("Numéro déjà utilisé par une facture réelle ; aucune modification effectuée.")
    invoice = existing or Facture.objects.create(profile=owner, numero=number,
        date_emission=date.fromisoformat(payload["issue_date"]),
        date_echeance=date.fromisoformat(payload.get("payment_due_date", payload["issue_date"])),
        currency=payload["currency_code"], client_name=buyer["name"],
        description="TEST SANDBOX — facture fictive officielle SUPER PDP",
        montant_ht=Decimal(totals["total_without_vat"]), montant_ttc=Decimal(totals["total_with_vat"]),
        conditions_paiement=payload.get("payment_terms", "Test sandbox"),
        finalized_at=timezone.now(), issuer_snapshot={"sandbox_fixture": payload})
    if not existing:
        for line in payload["lines"]:
            InvoiceLine.objects.create(invoice=invoice, description=line["item_information"]["name"],
                quantity=Decimal(line.get("invoiced_quantity", "1")), unit=line.get("invoiced_quantity_code", "C62"),
                unit_price_excl_tax=Decimal(line["price_details"]["item_net_price"]),
                tax_rate=Decimal(line.get("vat_information", {}).get("invoiced_item_vat_rate", "0")),
                total_excl_tax=Decimal(line["net_amount"]))
    return invoice
