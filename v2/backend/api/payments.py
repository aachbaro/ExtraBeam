"""Optional Stripe checkout, independent from electronic invoice transmission.

Keeps the legacy platform checkout behavior; no new Connect/onboarding flow.
"""
import stripe
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Facture, Payment


class InvoiceCheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, invoice_id):
        if not settings.STRIPE_SECRET_KEY:
            raise ValidationError("Configurer STRIPE_SECRET_KEY pour activer les liens de paiement.")
        expected_mode = "live" if settings.STRIPE_LIVE_MODE else "test"
        if not settings.STRIPE_SECRET_KEY.startswith((f"sk_{expected_mode}_", f"rk_{expected_mode}_")):
            raise ValidationError("La clé Stripe ne correspond pas au mode configuré.")
        with transaction.atomic():
            invoice = get_object_or_404(Facture.objects.select_for_update(), pk=invoice_id, profile__user=request.user)
            if not invoice.finalized_at or invoice.status != "pending_payment":
                raise ValidationError("Une facture finalisée en attente de paiement est requise.")
            payment, _ = Payment.objects.get_or_create(invoice=invoice, defaults={"amount": invoice.montant_ttc, "currency": invoice.currency})
        if payment.checkout_url:
            return Response({"url": payment.checkout_url})
        try:
            session = stripe.checkout.Session.create(api_key=settings.STRIPE_SECRET_KEY,
                idempotency_key=f"rivebelle-invoice-payment-{payment.pk}", mode="payment",
                line_items=[{"price_data": {"currency": payment.currency.lower(),
                    "product_data": {"name": f"Facture {invoice.numero}"},
                    "unit_amount": int(payment.amount * 100)}, "quantity": 1}],
                success_url=settings.FRONTEND_URL.rstrip("/") + f"/extras/{invoice.profile.slug}?payment=success",
                cancel_url=settings.FRONTEND_URL.rstrip("/") + f"/extras/{invoice.profile.slug}?payment=canceled",
                metadata={"rivebelle_payment_id": str(payment.pk)})
        except stripe.StripeError:
            raise ValidationError("Création du lien Stripe impossible ; réessayer.")
        payment.provider_session_id = session.id
        payment.checkout_url = session.url
        payment.save()
        return Response({"url": payment.checkout_url})


class StripeWebhookView(APIView):
    authentication_classes = []

    def post(self, request):
        if not settings.STRIPE_WEBHOOK_SECRET:
            return Response({"detail": "Webhook Stripe non configuré."}, status=503)
        try:
            event = stripe.Webhook.construct_event(request.body, request.headers.get("Stripe-Signature", ""), settings.STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.SignatureVerificationError):
            return Response({"detail": "Signature Stripe invalide."}, status=400)
        if event.type not in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
            return Response({"received": True})
        session = event.data.object
        if session.payment_status != "paid":
            return Response({"received": True})
        if bool(event.livemode) != settings.STRIPE_LIVE_MODE:
            return Response({"detail": "Environnement Stripe incohérent."}, status=400)
        with transaction.atomic():
            payment = Payment.objects.select_for_update().filter(provider_session_id=session.id).first()
            if not payment:
                # Other subscriptions / legacy sessions on the same Stripe account.
                return Response({"received": True})
            if session.amount_total != int(payment.amount * 100) or session.currency.upper() != payment.currency:
                return Response({"detail": "Montant Stripe incohérent."}, status=400)
            if payment.status != "paid":
                payment.status, payment.paid_at = "paid", timezone.now()
                payment.save()
                Facture.objects.filter(pk=payment.invoice_id).update(status="paid", updated_at=timezone.now())
            from .einvoicing.services import report_invoice_payment
            transaction.on_commit(lambda: report_invoice_payment(payment.invoice))
        return Response({"received": True})
