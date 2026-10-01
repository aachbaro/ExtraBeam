from datetime import date
from decimal import Decimal
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from api.models import AccountProfile, Facture, InvoiceLine
from api.einvoicing.services import connected_account, submit, sync_account
from api.einvoicing.providers import get_provider


class Command(BaseCommand):
    help = "Test E2E sandbox avec une facture fictive générée par SUPER PDP ; jamais une facture client."

    def add_arguments(self, parser):
        parser.add_argument("--owner-slug", required=True)
        parser.add_argument("--send-fictitious-invoice", action="store_true")

    def handle(self, *args, **options):
        if settings.SUPERPDP_ENVIRONMENT != "sandbox" or not options["send_fictitious_invoice"]:
            raise CommandError("Configurer sandbox et passer --send-fictitious-invoice.")
        owner = AccountProfile.objects.get(slug=options["owner_slug"])
        account = connected_account(owner)
        provider = get_provider(account.provider)
        provider.verify_account(account)
        if account.environment != "sandbox" or account.connection_status != "connected":
            raise CommandError("Connecter un compte sandbox vérifié via l'OAuth Rivebelle.")
        payload = provider.request("GET", "/v1.beta/invoices/generate_test_invoice", account, params={"format": "en16931"}).json()
        totals, buyer = payload["totals"], payload["buyer"]
        number = payload["number"]
        existing = Facture.objects.filter(profile=owner, numero=number).first()
        if existing and not existing.issuer_snapshot.get("sandbox_fixture"):
            raise CommandError("Numéro déjà utilisé par une facture réelle ; aucune modification effectuée.")
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
        first = submit(invoice)
        second = submit(invoice)
        if first.pk != second.pk or not first.provider_invoice_id:
            raise CommandError("Résultat incertain : conserver cette facture et synchroniser ; ne pas renvoyer.")
        sync_account(account)
        first.refresh_from_db()
        self.stdout.write(self.style.SUCCESS(f"Facture locale={invoice.pk} provider_invoice_id={first.provider_invoice_id} statut={first.status}. Double appel sans renvoi."))
        self.stdout.write("Relancer sync_einvoices pour suivre les statuts asynchrones.")
