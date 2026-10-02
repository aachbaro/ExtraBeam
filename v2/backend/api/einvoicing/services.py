"""Business workflows use the provider interface; never import a concrete provider."""
import logging
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from ..models import AccountProfile, Facture, MissionTimesheet, ElectronicInvoiceAccount, ElectronicInvoiceTransmission as Transmission, ElectronicInvoiceEvent
from .mapper import issuer_data, invoice_to_superpdp_payload
from .providers import get_provider, ProviderError

logger = logging.getLogger(__name__)
STATUS_MAP = {
    "api:uploaded": "submitted", "api:validated": "validated", "api:invalid": "rejected",
    "api:sent": "sent", "api:received": "received", "api:acknowledged": "acknowledged",
    "api:accepted": "accepted", "api:rejected": "rejected",
    "fr:200": "submitted", "fr:201": "sent", "fr:202": "received", "fr:203": "available",
    "fr:204": "acknowledged", "fr:205": "accepted", "fr:206": "partial", "fr:207": "disputed",
    "fr:208": "held", "fr:209": "completed", "fr:210": "refused", "fr:211": "payment_sent",
    "fr:212": "payment_received", "fr:213": "rejected", "fr:501": "rejected",
}


def finalize(invoice):
    with transaction.atomic():
        AccountProfile.objects.filter(pk=invoice.profile_id).update(updated_at=F('updated_at'))
        invoice = Facture.objects.select_for_update().get(pk=invoice.pk)
        if invoice.finalized_at:
            return invoice
        if invoice.status == Facture.STATUS_CANCELED:
            raise ValidationError("Facture annulée.")
        if invoice.mission_id and invoice.mission.status != invoice.mission.STATUS_COMPLETED:
            raise ValidationError("Terminer la mission avant de finaliser la facture.")
        if invoice.mission_id and hasattr(invoice.mission, 'recruitment_offer'):
            if not MissionTimesheet.objects.filter(offer=invoice.mission.recruitment_offer, state='approved').exists():
                raise ValidationError('Valider les heures avant de finaliser la facture.')
        if invoice.numero.startswith('B-') and hasattr(invoice, 'recruitment_timesheet'):
            invoice.date_emission = timezone.localdate()
            prefix = f'RB-{timezone.localdate().year}-'
            numbers = Facture.objects.filter(profile=invoice.profile, numero__startswith=prefix).values_list('numero', flat=True)
            sequence = max((int(number[len(prefix):]) for number in numbers if number[len(prefix):].isdigit()), default=0) + 1
            invoice.numero = f'{prefix}{sequence:05d}'
        invoice.issuer_snapshot = issuer_data(invoice.profile)
        invoice_to_superpdp_payload(invoice)
        invoice.finalized_at = timezone.now()
        invoice.save(update_fields=["numero", "date_emission", "issuer_snapshot", "finalized_at", "updated_at"])
        return invoice


def connected_account(profile):
    try:
        account = ElectronicInvoiceAccount.objects.get(owner=profile, connection_status="connected")
    except ElectronicInvoiceAccount.DoesNotExist:
        raise ValidationError("Connecter et vérifier le compte SUPER PDP avant l'envoi.")
    return account


def submit(invoice):
    if not invoice.finalized_at or invoice.status == Facture.STATUS_CANCELED:
        raise ValidationError("Finaliser une facture non annulée avant l'envoi.")
    account = connected_account(invoice.profile)
    provider = get_provider(account.provider)
    existing = Transmission.objects.filter(invoice=invoice).first()
    if existing and existing.status != "failed":
        return existing
    provider.verify_account(account)
    if account.connection_status != "connected":
        raise ValidationError("Vérification SUPER PDP en attente.")
    invoice_to_superpdp_payload(invoice)
    # Conversion and validation cannot submit an invoice and may safely be retried.
    xml = provider.prepare_invoice(account, invoice)
    with transaction.atomic():
        locked = Facture.objects.select_for_update().get(pk=invoice.pk)
        transmission, created = Transmission.objects.get_or_create(invoice=locked, defaults={"account": account, "provider": account.provider})
        if not created and transmission.status != "failed":
            return transmission
        if not created:
            claimed = Transmission.objects.filter(pk=transmission.pk, status="failed").update(status="submitting", last_error="")
            if not claimed:
                transmission.refresh_from_db()
                return transmission
        transmission.metadata = {"payload": invoice_to_superpdp_payload(locked)}
        transmission.save()
    invoice._electronic_xml = xml
    try:
        result = provider.submit_invoice(account, invoice, transmission.external_id)
        if str(result.get("company_id")) != account.provider_account_id or result.get("direction") != "out" or not result.get("id"):
            raise ProviderError("Réponse de transmission incohérente : réconciliation nécessaire.")
        # A concurrent sync may already have reconciled and advanced this invoice.
        Transmission.objects.filter(pk=transmission.pk, provider_invoice_id="").update(
            provider_invoice_id=str(result["id"]), status="submitted", submitted_at=timezone.now(),
            last_error="", updated_at=timezone.now())
        transmission.refresh_from_db()
    except Exception as exc:
        # SUPER PDP does not promise idempotency of external_id. A timeout may hide success.
        Transmission.objects.filter(pk=transmission.pk, provider_invoice_id="").update(status="unknown",
            last_error="Envoi incertain. Synchroniser pour rechercher l'identifiant externe ; aucun renvoi automatique.", updated_at=timezone.now())
        if isinstance(exc, (ProviderError, ValidationError)):
            raise
        raise ProviderError()
    if invoice.status == Facture.STATUS_PAID:
        report_invoice_payment(invoice)
    return transmission


def apply_events(account, events):
    with transaction.atomic():
        ElectronicInvoiceAccount.objects.filter(pk=account.pk).update(event_cursor=F("event_cursor"))
        for event in sorted(events, key=lambda e: int(e["id"])):
            transmission = Transmission.objects.filter(account=account, provider_invoice_id=str(event["invoice_id"])).first()
            if not transmission:
                continue
            _, created = ElectronicInvoiceEvent.objects.get_or_create(account=account, provider_event_id=str(event["id"]),
                defaults={"transmission": transmission, "payload": event})
            if not created or int(event["id"]) <= transmission.last_event_id:
                continue
            transmission.last_event_id = int(event["id"])
            if event["status_code"] in STATUS_MAP:
                transmission.status = STATUS_MAP[event["status_code"]]
            if event["status_code"] in {"api:invalid", "api:rejected", "fr:210", "fr:213", "fr:501"}:
                transmission.last_error = event.get("status_text", "Facture rejetée par le destinataire.")[:2000]
            if event["status_code"] == "fr:212":
                transmission.payment_report_status = "reported"
            transmission.save()
            # Electronic status is independent of local payment state (partial receipts possible).
            logger.info("einvoice event account=%s transmission=%s event=%s", account.pk, transmission.pk, event["id"])


def sync_account(account):
    provider = get_provider(account.provider)
    provider.verify_account(account)
    if account.connection_status != "connected":
        return
    # Reconcile uncertain POSTs by scanning outgoing invoices, with a persisted external_id.
    uncertain = list(Transmission.objects.filter(account=account, provider_invoice_id=""))
    if uncertain:
        for remote in provider.list_outgoing_invoices(account):
            for transmission in uncertain:
                if remote.get("external_id") == str(transmission.external_id):
                    Transmission.objects.filter(pk=transmission.pk, provider_invoice_id="").update(
                        provider_invoice_id=str(remote["id"]), status="submitted", submitted_at=timezone.now(), last_error="", updated_at=timezone.now())
    for _ in range(100):
        page = provider.get_invoice_status(account)
        events = page.get("data", [])
        apply_events(account, events)
        if events:
            cursor = max(int(e["id"]) for e in events)
            ElectronicInvoiceAccount.objects.filter(pk=account.pk, event_cursor__lt=cursor).update(event_cursor=cursor)
            account.refresh_from_db()
        if not page.get("has_after"):
            break
        if not events:
            raise ProviderError("Pagination des événements incohérente.")
    for transmission in Transmission.objects.filter(account=account).exclude(provider_invoice_id=""):
        # Also replay per-invoice history after a formerly uncertain send is reconciled.
        remote = provider.get_invoice_status(account, transmission.provider_invoice_id)
        if str(remote.get("company_id")) != account.provider_account_id:
            raise ProviderError("Compte fournisseur incohérent.")
        apply_events(account, remote.get("events", []))
        if transmission.invoice.status == Facture.STATUS_PAID:
            report_invoice_payment(transmission.invoice)


def report_invoice_payment(invoice):
    """Call from any trusted payment confirmation (Stripe or manual receipt).

    Local payment persists even if the declaration fails; sync retries safe pre-send failures.
    """
    transmission = Transmission.objects.filter(invoice=invoice).exclude(provider_invoice_id="").first()
    if not transmission or invoice.status != Facture.STATUS_PAID:
        return
    # Declare service receipt as documented. No VAT receipt reporting for franchise / debit VAT.
    if not invoice.montant_ttc > invoice.montant_ht or transmission.account.company_metadata.get("has_vat_on_debits"):
        return
    if transmission.payment_report_status in {"reported", "sending", "unknown"}:
        return
    try:
        provider = get_provider(transmission.provider)
        claimed = Transmission.objects.filter(pk=transmission.pk, payment_report_status__in=["", "failed"]).update(payment_report_status="sending")
        if not claimed:
            return
        try:
            provider.report_payment(transmission.account, transmission)
        except Exception:
            Transmission.objects.filter(pk=transmission.pk).update(payment_report_status="unknown")
            logger.warning("einvoice receipt uncertain transmission=%s", transmission.pk)
            return
        Transmission.objects.filter(pk=transmission.pk).update(payment_report_status="reported")
    except (ProviderError, ValidationError):
        Transmission.objects.filter(pk=transmission.pk).update(payment_report_status="failed")
        logger.warning("einvoice receipt pending transmission=%s", transmission.pk)
