import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction, IntegrityError
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Facture, ElectronicInvoiceAccount, ElectronicInvoiceOAuthState
from ..serializers import FactureSerializer
from .providers import get_provider, ProviderError
from .services import finalize, submit, sync_account
from .sandbox import create_sandbox_invoice

COOKIE = "einvoice_oauth"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def account_status(account):
    return {"provider": account.provider if account else "superpdp",
            "connection_status": account.connection_status if account else "disconnected",
            "environment": account.environment if account else settings.SUPERPDP_ENVIRONMENT}


class OwnerView(APIView):
    permission_classes = [IsAuthenticated]


class ConnectView(OwnerView):
    def get(self, request):
        profile = request.user.account_profile
        if profile.role != "freelance":
            raise ValidationError("Connexion réservée aux freelances.")
        provider = get_provider()
        state, browser, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(64)
        ElectronicInvoiceOAuthState.objects.filter(owner=profile).delete()
        ElectronicInvoiceOAuthState.objects.create(owner=profile, digest=digest(state), browser_digest=digest(browser), verifier=verifier)
        response = Response({"authorization_url": provider.connect_account(state, verifier, profile)})
        # Works for frontend/backend on separate origins via credentialed fetch.
        response.set_cookie(COOKIE, browser, max_age=600, httponly=True,
                            secure=not settings.DEBUG, samesite="Lax", path="/api/einvoicing/")
        response["Cache-Control"] = "no-store"
        return response


class CallbackView(APIView):
    authentication_classes = []

    def get(self, request):
        state, browser = request.query_params.get("state", ""), request.COOKIES.get(COOKIE, "")
        if not state or not browser:
            raise ValidationError("État OAuth ou cookie navigateur absent.")
        with transaction.atomic():
            saved = ElectronicInvoiceOAuthState.objects.select_for_update().filter(digest=digest(state), browser_digest=digest(browser),
                created_at__gte=timezone.now() - timedelta(minutes=10)).first()
            if not saved:
                raise ValidationError("État OAuth invalide, expiré ou déjà utilisé.")
            owner, verifier = saved.owner, saved.verifier
            saved.delete()
        if request.query_params.get("error") or not request.query_params.get("code"):
            raise ValidationError("Autorisation SUPER PDP refusée. Relancer la connexion.")
        account, _ = ElectronicInvoiceAccount.objects.get_or_create(owner=owner)
        try:
            with transaction.atomic():
                get_provider().complete_connection(account, request.query_params["code"], verifier)
        except (ProviderError, ValidationError, IntegrityError):
            raise ValidationError("Connexion SUPER PDP impossible. Vérifier entreprise, environnement et autorisation.")
        response = HttpResponseRedirect(settings.FRONTEND_URL.rstrip("/") + f"/extras/{owner.slug}?einvoicing=connected")
        response.delete_cookie(COOKIE, path="/api/einvoicing/")
        response["Cache-Control"] = "no-store"
        return response


class StatusView(OwnerView):
    def get(self, request):
        account = ElectronicInvoiceAccount.objects.filter(owner=request.user.account_profile).first()
        response = Response(account_status(account))
        response["Cache-Control"] = "no-store"
        return response


class SandboxInvoiceView(OwnerView):
    def post(self, request):
        profile = request.user.account_profile
        if profile.role != "freelance":
            raise ValidationError("Les factures de test sont réservées aux freelances.")
        invoice = create_sandbox_invoice(profile)
        return Response(FactureSerializer(invoice).data, status=201)


class SyncView(OwnerView):
    def post(self, request):
        account = get_object_or_404(ElectronicInvoiceAccount, owner=request.user.account_profile)
        if not account.encrypted_tokens:
            raise ValidationError("Connecter SUPER PDP avant la synchronisation.")
        sync_account(account)
        return Response(account_status(account))


class FinalizeView(OwnerView):
    def post(self, request, invoice_id):
        invoice = get_object_or_404(Facture, pk=invoice_id, profile__user=request.user)
        return Response(FactureSerializer(finalize(invoice)).data)


class SubmitView(OwnerView):
    def post(self, request, invoice_id):
        invoice = get_object_or_404(Facture, pk=invoice_id, profile__user=request.user)
        submit(invoice)
        invoice.refresh_from_db()
        return Response(FactureSerializer(invoice).data)


class WebhookView(APIView):
    authentication_classes = []

    def post(self, request):
        # Fail closed, never accept an invented signature or mutate invoices.
        return Response({"detail": "Webhook non activé : contrat officiel de signature indisponible. Utiliser le polling."}, status=501)
