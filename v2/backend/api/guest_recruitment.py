"""Email-verified, request-scoped access. No account login or raw secret in URLs/logs."""
import uuid
import hashlib
import requests
from datetime import timedelta
from django.conf import settings
from django.contrib.auth.models import User
from django.core import signing
from django.core.cache import cache
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView
from .models import AccountProfile, GuestRequestLink, AppNotification, RequestMessage, Mission
from . import recruitment as service

SALT = 'rivebelle.guest-request.v1'


def email_available():
    if settings.EMAIL_BACKEND == 'api.brevo_email.BrevoEmailBackend':
        if not settings.BREVO_API_KEY:
            return False
        key = 'guest-brevo-ready:' + hashlib.sha256(settings.BREVO_API_KEY.encode()).hexdigest()
        ready = cache.get(key)
        if ready is None:
            try:
                response = requests.get('https://api.brevo.com/v3/account', headers={'api-key': settings.BREVO_API_KEY}, timeout=5, allow_redirects=False)
                ready = response.status_code == 200
            except requests.RequestException:
                ready = False
            cache.set(key, ready, 60 if ready else 15)
        return ready
    return bool(settings.EMAIL_HOST) or settings.EMAIL_BACKEND != 'django.core.mail.backends.smtp.EmailBackend'


def link_token(link):
    return signing.dumps({'id': str(link.pk), 'nonce': str(link.nonce)}, salt=SALT)


def resolve_link(token, pk=None, verified=True):
    try:
        value = signing.loads(token, salt=SALT, max_age=90 * 86400)
        link = GuestRequestLink.objects.select_related('profile__user', 'target', 'request').get(pk=value['id'], nonce=value['nonce'])
    except (signing.BadSignature, KeyError, ValueError, GuestRequestLink.DoesNotExist):
        raise PermissionDenied('Ce lien est invalide ou a expiré.')
    if link.revoked_at or link.expires_at <= timezone.now() or (verified and not link.verified_at):
        raise PermissionDenied('Ce lien est invalide ou a expiré.')
    if pk is not None and str(link.request_id) != str(pk):
        raise PermissionDenied('Ce lien ne donne accès qu’à sa demande.')
    return link


def notification_url(notification):
    link = GuestRequestLink.objects.filter(profile=notification.recipient, revoked_at__isnull=True).first()
    if link:
        return f'/guest/{link.pk}#access={link_token(link)}'
    return notification.url


class GuestThrottle(SimpleRateThrottle):
    rate = '5/hour'
    scope = 'guest_request'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class GuestManagementThrottle(GuestThrottle):
    rate = '120/min'
    scope = 'guest_management'


class GuestCreateView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [GuestThrottle]

    @transaction.atomic
    def post(self, request):
        from .recruitment_views import RequestInput
        if not email_available():
            return Response({'detail': 'L’envoi sans compte est momentanément indisponible. Connectez-vous pour envoyer votre demande.'}, status=503)
        email = serializers.EmailField(max_length=254).run_validation(request.data.get('email'))
        target = get_object_or_404(AccountProfile, slug=request.data.get('target_slug'), role='freelance', user__is_active=True)
        data = RequestInput(data=request.data)
        data.is_valid(raise_exception=True)
        user = User.objects.create(username=f'guest-{uuid.uuid4().hex}', email='', is_active=False)
        user.set_unusable_password()
        user.save(update_fields=['password'])
        profile = AccountProfile.objects.create(user=user, display_name=data.validated_data['establishment'][:150], role='client', billing_email=email)
        link = GuestRequestLink.objects.create(profile=profile, target=target, email=email, draft=dict(data.data), expires_at=timezone.now() + timedelta(days=90))
        AppNotification.objects.create(recipient=profile, event_key=f'guest-verify:{link.pk}',
            title='Confirmez votre demande de mission Rivebelle', body='Ouvrez le lien pour confirmer votre adresse email et envoyer la demande aux extras. Gardez ce lien privé : il permet de gérer cette demande.', url=f'/guest/{link.pk}', push_state='skipped')
        return Response({'pending_email': True, 'detail': 'Vérifiez votre boîte mail pour confirmer et envoyer la demande.'}, status=202)


class GuestOpenView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [GuestManagementThrottle]

    def post(self, request, guest_id):
        from .recruitment_views import RequestInput, request_data
        link = resolve_link(request.headers.get('X-Guest-Access', ''), verified=False)
        if str(link.pk) != str(guest_id):
            raise PermissionDenied()
        with transaction.atomic():
            GuestRequestLink.objects.filter(pk=link.pk).update(nonce=link.nonce)
            link = GuestRequestLink.objects.select_for_update().select_related('profile', 'target').get(pk=link.pk)
            if link.revoked_at:
                raise PermissionDenied()
            if not link.verified_at:
                data = RequestInput(data=link.draft)
                data.is_valid(raise_exception=True)
                link.verified_at = timezone.now()
                link.request = service.create_request(link.profile, link.target, data.validated_data)
                link.draft = {}
                link.save(update_fields=['verified_at', 'request', 'draft'])
        return Response(request_data(link.request, link.profile))


class GuestBillingView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [GuestManagementThrottle]

    def get(self, request, pk):
        link = resolve_link(request.headers.get('X-Guest-Access', ''), pk)
        return Response({key: getattr(link.profile, key) for key in BILLING_FIELDS})

    def patch(self, request, pk):
        link = resolve_link(request.headers.get('X-Guest-Access', ''), pk)
        fields = {key: serializers.CharField(max_length=AccountProfile._meta.get_field(key).max_length, allow_blank=True, required=False) for key in BILLING_FIELDS}
        fields['siren'] = serializers.RegexField(r'^\d{9}$', allow_blank=True, required=False)
        fields['billing_email'] = serializers.EmailField(allow_blank=True, required=False)
        for key, field in fields.items():
            if key in request.data:
                setattr(link.profile, key, field.run_validation(request.data[key]))
        link.profile.save(update_fields=list(fields) + ['updated_at'])
        return Response({'saved': True})


BILLING_FIELDS = ('legal_name', 'siren', 'address_line1', 'address_line2', 'postal_code', 'city', 'country', 'vat_number', 'billing_email')


class GuestClaimView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        from .recruitment_views import request_data
        link = resolve_link(request.headers.get('X-Guest-Access', ''), pk)
        GuestRequestLink.objects.filter(pk=link.pk).update(nonce=link.nonce)
        link = GuestRequestLink.objects.select_for_update().get(pk=link.pk)
        if link.revoked_at:
            raise PermissionDenied()
        profile = get_object_or_404(AccountProfile, user=request.user, role='client')
        if request.user.email.casefold() != link.email.casefold():
            raise ValidationError('Connectez-vous avec l’adresse email utilisée pour cette demande.')
        req = service.lock_request(pk)
        old_profile = link.profile
        req.client = profile
        req.save(update_fields=['client'])
        Mission.objects.filter(recruitment_offer__request=req).update(client_profile=profile)
        RequestMessage.objects.filter(offer__request=req, author=old_profile).update(author=profile)
        AppNotification.objects.filter(recipient=old_profile).update(recipient=profile)
        for key in BILLING_FIELDS:
            if not getattr(profile, key) and getattr(old_profile, key):
                setattr(profile, key, getattr(old_profile, key))
        profile.save(update_fields=list(BILLING_FIELDS) + ['updated_at'])
        link.revoked_at = timezone.now()
        link.save(update_fields=['revoked_at'])
        return Response(request_data(req, profile))
