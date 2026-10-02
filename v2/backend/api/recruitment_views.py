from decimal import Decimal
from urllib.parse import urlsplit
from django.conf import settings
from django.db import transaction
from django.db.models import Q, F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from .models import (AccountProfile, MissionRequest, CandidateOffer, RequestMessage,
    NotificationPreference, AppNotification, WebPushSubscription, MissionTimesheet)
from . import recruitment as service


class RecruitmentThrottle(UserRateThrottle):
    rate = '120/min'


class RequestInput(serializers.ModelSerializer):
    class Meta:
        model = MissionRequest
        fields = ['establishment', 'address', 'starts_at', 'ends_at', 'job', 'custom_job',
            'dress_code', 'notes', 'quantity', 'cascade', 'rate_kind', 'rate']

    def validate(self, attrs):
        if attrs['starts_at'] <= timezone.now() or attrs['ends_at'] <= attrs['starts_at']:
            raise ValidationError('Choisissez un créneau futur avec une fin après le début.')
        if attrs['ends_at'] - attrs['starts_at'] > timezone.timedelta(days=7):
            raise ValidationError('Une demande couvre au maximum sept jours. Créez une demande par service.')
        if not 1 <= attrs.get('quantity', 1) <= 50:
            raise ValidationError('Choisissez entre 1 et 50 extras.')
        if attrs['job'] not in service.JOBS or (attrs['job'] == 'other' and not attrs.get('custom_job', '').strip()):
            raise ValidationError('Choisissez un poste ou précisez le poste personnalisé.')
        kind = attrs.get('rate_kind', 'none')
        if kind not in ('none', 'hourly', 'fixed'):
            raise ValidationError('Type de tarif inconnu.')
        if kind != 'none' and (attrs.get('rate') is None or attrs['rate'] <= 0):
            raise ValidationError('Le tarif doit être positif.')
        if kind == 'none':
            attrs['rate'] = None
        if len(attrs.get('notes', '')) > 5000:
            raise ValidationError('Les notes sont limitées à 5 000 caractères.')
        return attrs


def profile_brief(profile):
    return {'slug': profile.slug, 'display_name': profile.display_name, 'avatar_url': profile.avatar_url}


def offer_data(offer):
    sheet = MissionTimesheet.objects.filter(offer=offer).first()
    return {'id': offer.pk, 'extra': profile_brief(offer.extra), 'state': offer.state,
        'wave': offer.wave, 'diffusion_source': ['profile', 'restaurant_network', 'target_network', 'rivebelle_network'][min(offer.wave, 3)],
        'offered_at': offer.offered_at, 'mission_id': offer.mission_id,
        'timesheet': None if not sheet else {'hours': str(sheet.hours), 'original_hours': str(sheet.original_hours) if sheet.original_hours else None, 'state': sheet.state,
            'note': sheet.note, 'invoice_id': sheet.invoice_id}}


def request_data(req, profile):
    result = RequestInput(req).data
    result.update({'id': str(req.pk), 'status': req.status, 'wave': req.wave, 'next_wave_at': req.next_wave_at,
        'client': profile_brief(req.client), 'target': profile_brief(req.target), 'is_client': req.client_id == profile.pk,
        'remaining': req.quantity - req.offers.filter(state='selected').count(),
        'interested_count': req.offers.filter(state='interested').count(),
        'created_at': req.created_at})
    if req.client_id == profile.pk:
        result['offers'] = [offer_data(offer) for offer in req.offers.select_related('extra')]
        result['billing_complete'] = all(getattr(profile, field) for field in ('legal_name', 'siren', 'address_line1', 'postal_code', 'city'))
    else:
        own = req.offers.get(extra=profile)
        result['offers'] = [offer_data(own)]
        later = [o for o in req.offers.select_related('extra') if o.extra_id != profile.pk
            and (o.wave > own.wave or o.state == 'queued') and o.state not in ('closed', 'rejected', 'declined', 'selected')
            and service.compatible(o.extra, req)]
        result['compatible_after'] = len(later)
        result['available_after'] = sum(service.availability(o.extra, req) == 'available' for o in later)
        result['own_availability'] = service.availability(profile, req)
    return result


class AuthView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [RecruitmentThrottle]

    def profile(self, request):
        return get_object_or_404(AccountProfile, user=request.user)


def accessible_request(pk, profile):
    return get_object_or_404(MissionRequest.objects.select_related('client', 'target').filter(
        Q(client=profile) | Q(offers__extra=profile, offers__offered_at__isnull=False)).distinct(), pk=pk)


class RequestListView(AuthView):
    def get(self, request):
        profile = self.profile(request)
        requests = MissionRequest.objects.filter(Q(client=profile) |
            Q(offers__extra=profile, offers__offered_at__isnull=False)).distinct()[:100]
        return Response([request_data(req, profile) for req in requests])

    def post(self, request):
        profile = self.profile(request)
        if profile.role != 'client':
            raise PermissionDenied('Un compte restaurateur est nécessaire pour proposer une mission.')
        target = get_object_or_404(AccountProfile, slug=request.data.get('target_slug'), role='freelance', user__is_active=True)
        serializer = RequestInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        req = service.create_request(profile, target, serializer.validated_data)
        return Response(request_data(req, profile), status=201)


class RequestDetailView(AuthView):
    def get(self, request, pk):
        profile = self.profile(request)
        return Response(request_data(accessible_request(pk, profile), profile))

    def post(self, request, pk):
        profile = self.profile(request)
        req = get_object_or_404(MissionRequest, pk=pk, client=profile)
        if request.data.get('action') != 'cancel':
            raise ValidationError('Action inconnue.')
        return Response(request_data(service.cancel(req.pk, profile), profile))


class OfferActionView(AuthView):
    def post(self, request, pk, offer_id):
        profile = self.profile(request)
        req = accessible_request(pk, profile)
        offer = get_object_or_404(CandidateOffer, pk=offer_id, request=req)
        action = request.data.get('action')
        if action in ('select', 'decline'):
            if req.client_id != profile.pk:
                raise PermissionDenied()
            result = service.select(offer.pk, profile, action == 'select')
        else:
            if offer.extra_id != profile.pk:
                raise PermissionDenied()
            result = service.respond(offer.pk, profile, action)
        return Response(request_data(result, profile))


def accessible_offer(req, offer_id, profile):
    offer = get_object_or_404(CandidateOffer, pk=offer_id, request=req, offered_at__isnull=False)
    if profile.pk not in (req.client_id, offer.extra_id):
        raise PermissionDenied()
    return offer


class MessageView(AuthView):
    def get(self, request, pk, offer_id):
        profile = self.profile(request)
        req = accessible_request(pk, profile)
        offer = accessible_offer(req, offer_id, profile)
        # Return the most recent 200 messages in conversation order.
        messages = list(offer.messages.select_related('author').order_by('-id')[:200])
        return Response([{'id': m.pk, 'author': profile_brief(m.author), 'text': m.text, 'created_at': m.created_at}
            for m in reversed(messages)])

    @transaction.atomic
    def post(self, request, pk, offer_id):
        MissionRequest.objects.filter(pk=pk).update(wave=F('wave'))
        profile = self.profile(request)
        req = service.lock_request(accessible_request(pk, profile).pk)
        offer = accessible_offer(req, offer_id, profile)
        if req.status == 'canceled' or offer.state in ('closed', 'declined', 'rejected'):
            raise ValidationError('Cette conversation est fermée.')
        field = serializers.CharField(max_length=3000)
        text = field.run_validation(request.data.get('text', ''))
        msg = RequestMessage.objects.create(offer=offer, author=profile, text=text)
        recipient = offer.extra if profile.pk == req.client_id else req.client
        # Do not email private message contents; only a link to the conversation.
        service.notify(recipient, f'message:{msg.pk}', f'Nouveau message de {profile.display_name}', req)
        return Response({'id': msg.pk}, status=201)


class TimesheetView(AuthView):
    def post(self, request, pk, offer_id):
        profile = self.profile(request)
        req = accessible_request(pk, profile)
        offer = accessible_offer(req, offer_id, profile)
        action = request.data.get('action')
        hours = None
        if action in ('submit', 'correct'):
            if 'minutes' in request.data:
                minutes = serializers.IntegerField(min_value=1, max_value=10080).run_validation(request.data['minutes'])
                hours = (Decimal(minutes) / 60).quantize(Decimal('.0001'))
            else:
                hours = serializers.DecimalField(max_digits=8, decimal_places=4, min_value=Decimal('.0001'), max_value=Decimal('168')).run_validation(request.data.get('hours'))
        note = serializers.CharField(max_length=1000, allow_blank=True).run_validation(request.data.get('note', ''))
        if action == 'correct' and not note:
            raise ValidationError('Expliquez la correction des heures.')
        result = service.timesheet_action(offer.pk, profile, action, hours, note)
        return Response(request_data(result, profile))


class PrepareInvoiceView(AuthView):
    def post(self, request, pk, offer_id):
        profile = self.profile(request)
        req = accessible_request(pk, profile)
        offer = get_object_or_404(CandidateOffer, pk=offer_id, request=req, extra=profile)
        rate = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('.01'), allow_null=True).run_validation(request.data.get('rate'))
        tax = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('0'), max_value=Decimal('100')).run_validation(request.data.get('tax', '0'))
        invoice = service.prepare_invoice(offer.pk, profile, rate, tax)
        return Response({'invoice_id': invoice.pk, 'numero': invoice.numero}, status=201)


class PreferenceInput(serializers.ModelSerializer):
    jobs = serializers.ListField(child=serializers.ChoiceField(choices=list(service.JOBS)), max_length=6, required=False)
    class Meta:
        model = NotificationPreference
        fields = ['email', 'push', 'sound', 'broadcasts', 'jobs']


class PreferencesView(AuthView):
    def get(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(profile=self.profile(request))
        return Response({**PreferenceInput(prefs).data, 'vapid_public_key': settings.WEBPUSH_PUBLIC_KEY,
            'push_ready': bool(settings.WEBPUSH_PUBLIC_KEY and settings.WEBPUSH_PRIVATE_KEY),
            'email_ready': bool(settings.EMAIL_HOST or settings.BREVO_API_KEY), 'jobs_options': service.JOBS})

    def patch(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(profile=self.profile(request))
        serializer = PreferenceInput(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self.get(request)


class NotificationsView(AuthView):
    def get(self, request):
        profile = self.profile(request)
        return Response({'unread': profile.notifications.filter(read_at=None).count(),
            'items': list(profile.notifications.values('id', 'title', 'body', 'url', 'created_at', 'read_at')[:50])})

    def post(self, request):
        profile = self.profile(request)
        notification_id = request.data.get('id')
        qs = profile.notifications.filter(read_at=None)
        if notification_id is not None:
            qs = qs.filter(pk=serializers.IntegerField(min_value=1).run_validation(notification_id))
        qs.update(read_at=timezone.now())
        return self.get(request)


class PushView(AuthView):
    def post(self, request):
        profile = self.profile(request)
        if not settings.WEBPUSH_PUBLIC_KEY or not settings.WEBPUSH_PRIVATE_KEY:
            raise ValidationError('Les notifications push ne sont pas encore configurées sur le serveur.')
        endpoint = serializers.URLField(max_length=2000).run_validation(request.data.get('endpoint'))
        parsed = urlsplit(endpoint)
        # Endpoints are user input. Restrict to the configured browser push services
        # to prevent requests to internal networks or arbitrary external servers.
        allowed = settings.WEBPUSH_ALLOWED_HOSTS
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(
            parsed.hostname == host or parsed.hostname.endswith('.' + host) for host in allowed):
            raise ValidationError('Service push non reconnu.')
        keys = request.data.get('keys', {})
        if not isinstance(keys, dict):
            raise ValidationError('Clés push invalides.')
        p256dh = serializers.RegexField(r'^[A-Za-z0-9_-]{80,100}={0,2}$').run_validation(keys.get('p256dh'))
        auth = serializers.RegexField(r'^[A-Za-z0-9_-]{20,30}={0,2}$').run_validation(keys.get('auth'))
        existing = WebPushSubscription.objects.filter(endpoint=endpoint).first()
        if existing and existing.profile_id != profile.pk:
            raise ValidationError('Cet abonnement est déjà lié à un autre compte. Réinitialisez les notifications sur cet appareil.')
        WebPushSubscription.objects.update_or_create(endpoint=endpoint, defaults={'profile': profile, 'p256dh': p256dh, 'auth': auth})
        return Response({'subscribed': True}, status=201)

    def delete(self, request):
        WebPushSubscription.objects.filter(profile=self.profile(request), endpoint=request.data.get('endpoint')).delete()
        return Response(status=204)
