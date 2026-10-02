from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from .test_recruitment import RecruitmentTests
from .models import GuestRequestLink, MissionRequest, UserApiToken, RequestMessage
from .guest_recruitment import link_token
from .notification_delivery import deliver_pending
from . import recruitment as service


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class GuestRecruitmentTests(TestCase):
    # Reuse fixtures without inheriting the existing suite.
    profile = RecruitmentTests.profile
    def setUp(self):
        cache.clear()
        RecruitmentTests.setUp(self)
    req = RecruitmentTests.req
    def create_guest(self, email='guest@example.org'):
        client = APIClient()
        response = client.post('/api/guest/requests/', {**self.data, 'target_slug': self.extra.slug, 'email': email}, format='json')
        self.assertEqual(response.status_code, 202, response.data)
        return GuestRequestLink.objects.latest('created_at')

    def open_guest(self, link):
        client = APIClient()
        client.credentials(HTTP_X_GUEST_ACCESS=link_token(link))
        response = client.post(f'/api/guest/{link.pk}/open/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        link.refresh_from_db()
        return client, link.request

    def test_email_must_be_verified_before_any_extra_is_contacted(self):
        link = self.create_guest()
        self.assertFalse(MissionRequest.objects.exists())
        self.assertFalse(link.profile.user.is_active)
        self.assertFalse(link.profile.user.has_usable_password())
        self.assertEqual(link.profile.user.email, '')
        deliver_pending()
        self.assertEqual(mail.outbox[-1].to, ['guest@example.org'])
        self.assertIn(f'/guest/{link.pk}#access=', mail.outbox[-1].body)
        client, req = self.open_guest(link)
        self.assertEqual(req.offers.filter(state='offered').count(), 1)
        self.assertEqual(client.post(f'/api/guest/{link.pk}/open/', {}).status_code, 200)
        self.assertEqual(MissionRequest.objects.count(), 1)

    def test_guest_access_is_request_scoped_and_not_an_account_token(self):
        link = self.create_guest()
        client, req = self.open_guest(link)
        other = self.req()
        self.assertEqual(client.get(f'/api/requests/{other.pk}/').status_code, 403)
        self.assertEqual(client.get('/api/requests/').status_code, 401)
        self.assertEqual(client.get('/api/notifications/').status_code, 401)
        client.credentials(HTTP_X_GUEST_ACCESS=link_token(link) + 'tampered')
        self.assertEqual(client.get(f'/api/requests/{req.pk}/').status_code, 403)

    def test_expired_and_unverified_links_cannot_manage_requests(self):
        link = self.create_guest()
        client = APIClient()
        client.credentials(HTTP_X_GUEST_ACCESS=link_token(link))
        self.assertEqual(client.get(f'/api/requests/{self.req().pk}/').status_code, 403)
        link.expires_at = timezone.now() - timedelta(seconds=1)
        link.save()
        self.assertEqual(client.post(f'/api/guest/{link.pk}/open/', {}).status_code, 403)

    def test_guest_can_select_chat_validate_hours_and_supply_billing(self):
        link = self.create_guest()
        client, req = self.open_guest(link)
        offer = req.offers.get(extra=self.extra)
        service.respond(offer.pk, self.extra, 'interested')
        path = f'/api/requests/{req.pk}/offers/{offer.pk}/'
        self.assertEqual(client.post(path+'action/', {'action':'select'}, format='json').status_code, 200)
        self.assertEqual(client.post(path+'messages/', {'text':'Entrée côté cour'}, format='json').status_code, 201)
        self.assertEqual(client.get(path+'messages/').data[0]['text'], 'Entrée côté cour')
        req.ends_at = timezone.now() - timedelta(seconds=1)
        req.save()
        service.timesheet_action(offer.pk, self.extra, 'submit', Decimal('6.3333'))
        self.assertEqual(client.post(path+'timesheet/', {'action':'approve'}, format='json').status_code, 200)
        fields = {'legal_name':'Guest Restaurant SAS','siren':'987654321','address_line1':'1 rue Test','postal_code':'75001','city':'Paris'}
        self.assertEqual(client.patch(f'/api/requests/{req.pk}/guest/billing/', fields, format='json').status_code, 200)
        invoice = service.prepare_invoice(offer.pk, self.extra)
        self.assertEqual(invoice.contact_email, link.email)

    def test_guest_claim_requires_matching_account_and_revokes_old_link(self):
        link = self.create_guest(email=self.restaurant.user.email)
        guest, req = self.open_guest(link)
        wrong = APIClient()
        wrong.force_authenticate(self.extra.user)
        wrong.credentials(HTTP_X_GUEST_ACCESS=link_token(link))
        self.assertNotEqual(wrong.post(f'/api/requests/{req.pk}/guest/claim/').status_code, 200)
        account = APIClient()
        account.force_authenticate(self.restaurant.user)
        account.credentials(HTTP_X_GUEST_ACCESS=link_token(link))
        self.assertEqual(account.post(f'/api/requests/{req.pk}/guest/claim/').status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.client, self.restaurant)
        self.assertEqual(guest.get(f'/api/requests/{req.pk}/').status_code, 403)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', EMAIL_HOST='', BREVO_API_KEY='')
    def test_unconfigured_email_does_not_accept_unusable_guest_requests(self):
        response = APIClient().post('/api/guest/requests/', {}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertFalse(GuestRequestLink.objects.exists())

    def test_new_google_account_can_be_client_without_changing_existing_role(self):
        from .accounts import get_or_create_google_account
        profile = get_or_create_google_account(email='google-new@example.org', display_name='Google Client', avatar_url=None, google_sub='new-sub', role='client')
        self.assertEqual(profile.role, 'client')
        again = get_or_create_google_account(email='google-new@example.org', display_name='Google Client', avatar_url=None, google_sub='new-sub', role='freelance')
        self.assertEqual(again.role, 'client')

    @override_settings(EMAIL_BACKEND='api.brevo_email.BrevoEmailBackend', BREVO_API_KEY='invalid-test-key')
    @patch('api.guest_recruitment.requests.get')
    def test_rejected_brevo_key_does_not_promise_an_email(self, get):
        get.return_value.status_code = 401
        response = APIClient().post('/api/guest/requests/', {}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertFalse(GuestRequestLink.objects.exists())
