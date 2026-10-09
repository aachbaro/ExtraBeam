from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from api.models import AccountProfile
from api.einvoicing.services import connected_account, submit, sync_account
from api.einvoicing.sandbox import create_sandbox_invoice


class Command(BaseCommand):
    help = "Test E2E sandbox avec une facture fictive générée par SUPER PDP ; jamais une facture client."

    def add_arguments(self, parser):
        parser.add_argument("--owner-slug", required=True)
        parser.add_argument("--send-fictitious-invoice", action="store_true")

    def handle(self, *args, **options):
        if settings.SUPERPDP_ENVIRONMENT != "sandbox" or not options["send_fictitious_invoice"]:
            raise CommandError("Configurer sandbox et passer --send-fictitious-invoice.")
        owner = AccountProfile.objects.get(slug=options["owner_slug"])
        invoice = create_sandbox_invoice(owner)
        account = connected_account(owner)
        first = submit(invoice)
        second = submit(invoice)
        if first.pk != second.pk or not first.provider_invoice_id:
            raise CommandError("Résultat incertain : conserver cette facture et synchroniser ; ne pas renvoyer.")
        sync_account(account)
        first.refresh_from_db()
        self.stdout.write(self.style.SUCCESS(f"Facture locale={invoice.pk} provider_invoice_id={first.provider_invoice_id} statut={first.status}. Double appel sans renvoi."))
        self.stdout.write("Relancer sync_einvoices pour suivre les statuts asynchrones.")
