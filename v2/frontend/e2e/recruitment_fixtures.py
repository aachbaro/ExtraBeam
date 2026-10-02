"""Fixtures and time advancement for the mobile scenario, only in a temporary DB."""
import json
import os
from pathlib import Path
import sys
import tempfile
from datetime import datetime, time, timedelta
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from api.models import AccountProfile, ProfileContact, Slot, MissionRequest
from api.recruitment import tick_request

database = Path(settings.DATABASES['default']['NAME']).resolve()
if not settings.DEBUG or not database.is_relative_to(Path(tempfile.gettempdir()).resolve()):
    raise SystemExit('This scenario requires DEBUG and a database under the temporary directory.')

action = sys.argv[1]
if action == 'seed':
    suffix = uuid.uuid4().hex[:8]
    start = timezone.make_aware(datetime.combine(timezone.localdate() + timedelta(days=2), time(18)))
    profiles = []
    for name, display in [('adam', 'Adam'), ('extra-b', 'Extra B')]:
        user = User.objects.create_user(f'{name}-{suffix}', email=f'{name}-{suffix}@scenario.invalid', password='Scenario-local-2026', first_name=display)
        profile = AccountProfile.objects.create(user=user, slug=f'{name}-{suffix}', display_name=display,
            job_title='Service en salle', legal_name=f'{display} Test EI', siren='123456789', siret='12345678900012',
            address_line1='2 rue du Test', postal_code='75002', city='Paris')
        Slot.objects.create(profile=profile, start=start, end=start + timedelta(hours=8))
        profiles.append({'slug': profile.slug, 'email': user.email})
    ProfileContact.objects.create(from_profile=AccountProfile.objects.get(slug=profiles[0]['slug']),
        to_profile=AccountProfile.objects.get(slug=profiles[1]['slug']))
    print(json.dumps({'adam': profiles[0], 'extra_b': profiles[1], 'restaurant_email': f'restaurant-{suffix}@scenario.invalid',
        'password': 'Scenario-local-2026', 'start_local': start.strftime('%Y-%m-%dT%H:%M'),
        'end_local': (start + timedelta(hours=5)).strftime('%Y-%m-%dT%H:%M')}))
elif action == 'email-link':
    from django.core import mail
    from django.test import override_settings
    from api.models import GuestRequestLink
    from api.notification_delivery import deliver_pending
    email = sys.argv[2]
    if not email.endswith('@scenario.invalid'):
        raise SystemExit('Only scenario email addresses are permitted.')
    link = GuestRequestLink.objects.get(email=email)
    with override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
        deliver_pending(limit=5000)
    message = next(item for item in mail.outbox if item.to == [email] and '#access=' in item.body)
    url = next(line for line in message.body.splitlines() if '#access=' in line)
    print(json.dumps({'url': url}))
else:
    req = MissionRequest.objects.get(pk=sys.argv[2], client__user__email__endswith='@scenario.invalid')
    if action == 'advance':
        req.next_wave_at = timezone.now() - timedelta(seconds=1)
        req.save(update_fields=['next_wave_at'])
        tick_request(req.pk)
    elif action == 'finish':
        req.starts_at, req.ends_at = timezone.now() - timedelta(hours=9), timezone.now() - timedelta(hours=3)
        req.save(update_fields=['starts_at', 'ends_at'])
        for offer in req.offers.filter(state='selected').select_related('mission'):
            offer.mission.slots.update(start=req.starts_at, end=req.ends_at)
            offer.mission.start_date = timezone.localtime(req.starts_at).date()
            offer.mission.end_date = timezone.localtime(req.ends_at).date()
            offer.mission.save(update_fields=['start_date', 'end_date'])
    else:
        raise SystemExit('Unknown fixture action')
    print(json.dumps({'status': req.status, 'offers': list(req.offers.values('id', 'state', 'mission_id'))}))
