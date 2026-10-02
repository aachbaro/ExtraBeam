"""Durable delivery with independent channels and bounded retries. No secrets in logs."""
import json
import logging
from datetime import timedelta
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q, F
from django.utils import timezone
from .models import AppNotification, NotificationPreference, MissionRequest

logger = logging.getLogger(__name__)


def send_push(notification, prefs):
    from pywebpush import webpush, WebPushException
    for sub in notification.recipient.push_subscriptions.all():
        try:
            webpush(subscription_info={'endpoint': sub.endpoint, 'keys': {'p256dh': sub.p256dh, 'auth': sub.auth}},
                data=json.dumps({'title': notification.title, 'body': notification.body, 'url': notification.url,
                    'tag': f'rivebelle-{notification.pk}', 'silent': not prefs.sound}),
                vapid_private_key=settings.WEBPUSH_PRIVATE_KEY,
                vapid_claims={'sub': settings.WEBPUSH_SUBJECT}, ttl=900, timeout=15)
        except WebPushException as error:
            if error.response is not None and error.response.status_code in (404, 410):
                sub.delete()
            else:
                raise


def deliver_pending(limit=50):
    now = timezone.now()
    # Recover a worker that died after claiming a delivery. At-least-once email
    # delivery can duplicate after a crash; push uses a stable notification tag.
    for channel in ('email_state', 'push_state'):
        AppNotification.objects.filter(**{channel: 'sending'}, retry_at__lte=now).update(**{channel: 'pending'})
    ids = list(AppNotification.objects.filter(Q(email_state='pending', email_attempts__lt=6) | Q(push_state='pending', push_attempts__lt=6),
        retry_at__lte=now).values_list('pk', flat=True)[:limit])
    for pk in ids:
        notification = AppNotification.objects.select_related('recipient__user').get(pk=pk)
        if notification.event_key.startswith(('offer:', 'reinvite:', 'interested:')) and MissionRequest.objects.filter(
            pk=notification.url.rsplit('/', 1)[-1], status__in=['filled', 'canceled', 'expired']).exists():
            for field in ('email_state', 'push_state'):
                AppNotification.objects.filter(pk=pk, **{field: 'pending'}).update(**{field: 'skipped'})
            continue
        prefs, _ = NotificationPreference.objects.get_or_create(profile=notification.recipient)
        for channel in ('email', 'push'):
            field = f'{channel}_state'
            counter = f'{channel}_attempts'
            if getattr(notification, field) != 'pending' or getattr(notification, counter) >= 6:
                continue
            enabled = getattr(prefs, channel)
            if not enabled or (channel == 'email' and not notification.recipient.user.email):
                AppNotification.objects.filter(pk=pk).update(**{field: 'skipped'})
                continue
            configured = (bool(settings.EMAIL_HOST) or settings.EMAIL_BACKEND != 'django.core.mail.backends.smtp.EmailBackend') if channel == 'email' else bool(settings.WEBPUSH_PRIVATE_KEY)
            if not configured:
                continue
            claimed = AppNotification.objects.filter(pk=pk, **{field: 'pending'}).update(
                **{field: 'sending'}, retry_at=now + timedelta(minutes=5))
            if not claimed:
                continue
            try:
                if channel == 'email':
                    send_mail(notification.title,
                        f'{notification.body}\n\n{settings.RECRUITMENT_PUBLIC_URL}{notification.url}\n\nVos préférences : {settings.RECRUITMENT_PUBLIC_URL}/notifications',
                        settings.DEFAULT_FROM_EMAIL, [notification.recipient.user.email], fail_silently=False)
                else:
                    send_push(notification, prefs)
                AppNotification.objects.filter(pk=pk).update(**{field: 'sent'})
            except Exception:
                # Provider errors may include subscription URLs or authentication
                # data. Log only the event id and channel, never the exception.
                logger.warning('Notification delivery failed: id=%s channel=%s', pk, channel)
                AppNotification.objects.filter(pk=pk).update(**{field: 'pending', counter: F(counter) + 1}, attempts=F('attempts') + 1)
        AppNotification.objects.filter(pk=pk).update(retry_at=now + timedelta(minutes=5))
    AppNotification.objects.filter(email_attempts__gte=6, email_state='pending').update(email_state='failed')
    AppNotification.objects.filter(push_attempts__gte=6, push_state='pending').update(push_state='failed')
