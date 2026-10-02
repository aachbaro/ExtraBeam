"""Hiring lifecycle, kept separate from legacy direct missions."""
import uuid
from django.db import models
from django.utils import timezone


class MissionRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client = models.ForeignKey('api.AccountProfile', on_delete=models.PROTECT, related_name='mission_requests')
    target = models.ForeignKey('api.AccountProfile', on_delete=models.PROTECT, related_name='targeted_requests')
    establishment = models.CharField(max_length=200)
    address = models.CharField(max_length=500)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    job = models.CharField(max_length=40)
    custom_job = models.CharField(max_length=120, blank=True)
    dress_code = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    quantity = models.PositiveSmallIntegerField(default=1)
    cascade = models.BooleanField(default=False)
    rate_kind = models.CharField(max_length=12, default='none')
    rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=16, default='recruiting')
    wave = models.PositiveSmallIntegerField(default=0)
    next_wave_at = models.DateTimeField(null=True, blank=True)
    deferred_reinvited = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class CandidateOffer(models.Model):
    request = models.ForeignKey(MissionRequest, on_delete=models.CASCADE, related_name='offers')
    extra = models.ForeignKey('api.AccountProfile', on_delete=models.PROTECT, related_name='candidate_offers')
    wave = models.PositiveSmallIntegerField()
    state = models.CharField(max_length=16, default='queued')
    offered_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    mission = models.OneToOneField('api.Mission', on_delete=models.PROTECT, null=True, blank=True, related_name='recruitment_offer')

    class Meta:
        ordering = ['wave', 'id']
        constraints = [models.UniqueConstraint(fields=['request', 'extra'], name='one_request_offer_per_extra')]


class RequestMessage(models.Model):
    offer = models.ForeignKey(CandidateOffer, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey('api.AccountProfile', on_delete=models.PROTECT)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']


class MissionTimesheet(models.Model):
    offer = models.OneToOneField(CandidateOffer, on_delete=models.PROTECT, related_name='timesheet')
    hours = models.DecimalField(max_digits=8, decimal_places=4)
    original_hours = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    state = models.CharField(max_length=16, default='submitted')
    note = models.CharField(max_length=1000, blank=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    approved_at = models.DateTimeField(null=True, blank=True)
    invoice = models.OneToOneField('api.Facture', on_delete=models.SET_NULL, null=True, blank=True, related_name='recruitment_timesheet')


class NotificationPreference(models.Model):
    profile = models.OneToOneField('api.AccountProfile', on_delete=models.CASCADE, related_name='notification_preference')
    email = models.BooleanField(default=True)
    push = models.BooleanField(default=False)
    sound = models.BooleanField(default=True)
    broadcasts = models.BooleanField(default=False)
    jobs = models.JSONField(default=list, blank=True)


class AppNotification(models.Model):
    recipient = models.ForeignKey('api.AccountProfile', on_delete=models.CASCADE, related_name='notifications')
    event_key = models.CharField(max_length=200)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=1000, blank=True)
    url = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    email_state = models.CharField(max_length=16, default='pending')
    push_state = models.CharField(max_length=16, default='pending')
    attempts = models.PositiveSmallIntegerField(default=0)
    email_attempts = models.PositiveSmallIntegerField(default=0)
    push_attempts = models.PositiveSmallIntegerField(default=0)
    retry_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['recipient', 'event_key'], name='notification_event_once')]


class WebPushSubscription(models.Model):
    profile = models.ForeignKey('api.AccountProfile', on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint = models.URLField(max_length=2000, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
