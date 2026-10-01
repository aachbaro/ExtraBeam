from django.core.management.base import BaseCommand
from api.models import ElectronicInvoiceAccount
from api.einvoicing.services import sync_account


class Command(BaseCommand):
    help = "Synchronise les statuts et encaissements SUPER PDP, par entreprise."

    def handle(self, *args, **options):
        failed = 0
        for account in ElectronicInvoiceAccount.objects.exclude(encrypted_tokens=""):
            try:
                sync_account(account)
            except Exception:
                failed += 1
                self.stderr.write(f"Compte {account.pk} : synchronisation échouée, vérifier la connexion.")
        if failed:
            from django.core.management.base import CommandError
            raise CommandError(f"{failed} compte(s) en échec.")
        self.stdout.write(self.style.SUCCESS("Synchronisation terminée."))
