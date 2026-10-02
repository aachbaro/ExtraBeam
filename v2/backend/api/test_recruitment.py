from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from .models import (AccountProfile, MissionRequest, CandidateOffer, Mission, Slot, Unavailability,
    ClientContact, ProfileContact, NotificationPreference, AppNotification, Facture, WebPushSubscription)
from . import recruitment as hiring
from .recruitment_views import request_data
from .notification_delivery import deliver_pending, send_push
from .einvoicing.services import finalize


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', WEBPUSH_PRIVATE_KEY='test')
class RecruitmentTests(TestCase):
    def profile(self, name, role='freelance', **kwargs):
        return AccountProfile.objects.create(user=User.objects.create_user(name, email=f'{name}@example.org'),
            display_name=name, role=role, **kwargs)

    def setUp(self):
        self.restaurant = self.profile('restaurant', 'client', legal_name='Restaurant Test', siren='987654321',
            address_line1='1 rue Test', postal_code='75001', city='Paris', billing_email='compta@example.org')
        self.extra = self.profile('adam', legal_name='Adam Test EI', siren='123456789', siret='12345678900012',
            address_line1='2 rue Test', postal_code='75002', city='Paris')
        self.known = self.profile('known')
        self.friend = self.profile('friend')
        self.broad = self.profile('broad')
        self.other = self.profile('other')
        ClientContact.objects.create(client_profile=self.restaurant, contact_profile=self.known)
        ProfileContact.objects.create(from_profile=self.extra, to_profile=self.friend)
        NotificationPreference.objects.create(profile=self.broad, broadcasts=True, jobs=['service'])
        self.starts = timezone.now() + timedelta(days=2)
        self.data = dict(establishment='Restaurant Test', address='1 rue Test, Paris', starts_at=self.starts,
            ends_at=self.starts + timedelta(hours=5), job='service', quantity=1, cascade=True,
            rate_kind='hourly', rate=Decimal('25'))
        self.client = APIClient()

    def req(self, **kwargs):
        return hiring.create_request(self.restaurant, self.extra, {**self.data, **kwargs})

    def login(self, profile):
        self.client.force_authenticate(user=profile.user)

    def offer(self, req, extra=None):
        return req.offers.get(extra=extra or self.extra)

    def selected(self, **kwargs):
        req = self.req(**kwargs)
        offer = self.offer(req)
        hiring.respond(offer.pk, self.extra, 'interested')
        hiring.select(offer.pk, self.restaurant, True)
        req.ends_at = timezone.now() - timedelta(minutes=1)
        req.save(update_fields=['ends_at'])
        offer.refresh_from_db()
        return req, offer

    def approved(self, **kwargs):
        req, offer = self.selected(**kwargs)
        hiring.timesheet_action(offer.pk, self.extra, 'submit', Decimal('4.50'))
        hiring.timesheet_action(offer.pk, self.restaurant, 'approve')
        return req, offer

    def test_initial_proposal_is_not_a_mission_and_uses_four_priority_waves(self):
        req = self.req()
        self.assertEqual(Mission.objects.count(), 0)
        self.assertEqual(list(req.offers.values_list('extra__slug', 'wave', 'state')),
            [('adam', 0, 'offered'), ('known', 1, 'queued'), ('friend', 2, 'queued'), ('broad', 3, 'queued')])
        self.assertFalse(req.offers.filter(extra=self.other).exists())

    def test_cascade_is_opt_in_per_request(self):
        req = self.req(cascade=False)
        self.assertEqual(req.offers.count(), 1)

    def test_restaurant_profile_contacts_take_priority_over_target_network(self):
        ProfileContact.objects.create(from_profile=self.restaurant, to_profile=self.friend)
        req = self.req()
        self.assertEqual(self.offer(req, self.friend).wave, 1)
        self.assertEqual(req.offers.filter(extra=self.friend).count(), 1)

    def test_local_login_preserves_edited_profile_name(self):
        from .accounts import authenticate_local_account
        self.extra.user.first_name = 'Ancien nom'
        self.extra.user.set_password('Local-test-password')
        self.extra.user.save()
        profile = authenticate_local_account(email=self.extra.user.email, password='Local-test-password')
        self.assertEqual(profile.display_name, 'adam')

    def test_deferred_response_advances_immediately_and_returns_only_once(self):
        req = self.req()
        hiring.respond(self.offer(req).pk, self.extra, 'deferred')
        self.assertEqual(self.offer(req, self.known).state, 'offered')
        hiring.respond(self.offer(req, self.known).pk, self.known, 'rejected')
        hiring.respond(self.offer(req, self.friend).pk, self.friend, 'rejected')
        hiring.respond(self.offer(req, self.broad).pk, self.broad, 'rejected')
        self.assertEqual(self.offer(req).state, 'offered')
        hiring.respond(self.offer(req).pk, self.extra, 'deferred')
        req.refresh_from_db()
        self.assertEqual(req.status, 'exhausted')
        self.assertEqual(AppNotification.objects.filter(event_key=f'reinvite:{self.offer(req).pk}').count(), 1)

    def test_worker_advances_without_browser_and_expires_unfilled_requests(self):
        req = self.req()
        req.next_wave_at = timezone.now() - timedelta(seconds=1)
        req.save()
        hiring.tick_request(req.pk)
        self.assertEqual(self.offer(req, self.known).state, 'offered')
        req.starts_at = timezone.now() - timedelta(seconds=1)
        req.save()
        hiring.tick_request(req.pk)
        req.refresh_from_db()
        self.assertEqual(req.status, 'expired')
        self.assertFalse(req.offers.exclude(state='closed').exists())

    def test_enough_interested_candidates_pause_further_waves_until_declined(self):
        req = self.req()
        hiring.respond(self.offer(req).pk, self.extra, 'interested')
        hiring.advance(req)
        req.refresh_from_db()
        self.assertIsNone(req.next_wave_at)
        hiring.select(self.offer(req).pk, self.restaurant, False)
        self.assertEqual(self.offer(req, self.known).state, 'offered')

    def test_selection_creates_one_mission_and_closes_others_and_is_idempotent(self):
        req = self.req()
        offer = self.offer(req)
        hiring.respond(offer.pk, self.extra, 'interested')
        self.assertEqual(Mission.objects.count(), 0)
        hiring.select(offer.pk, self.restaurant, True)
        hiring.select(offer.pk, self.restaurant, True)
        self.assertEqual(Mission.objects.count(), 1)
        self.assertEqual(Slot.objects.filter(mission__isnull=False).count(), 1)
        self.assertFalse(req.offers.exclude(extra=self.extra).exclude(state='closed').exists())

    def test_quantity_allows_exactly_two_selections(self):
        req = self.req(quantity=2)
        hiring.respond(self.offer(req).pk, self.extra, 'interested')
        hiring.respond(self.offer(req).pk, self.extra, 'deferred')
        hiring.respond(self.offer(req, self.known).pk, self.known, 'interested')
        hiring.advance(req)
        # Target waits deferred; reinvite after the remaining network replies.
        hiring.respond(self.offer(req, self.friend).pk, self.friend, 'rejected')
        hiring.respond(self.offer(req, self.broad).pk, self.broad, 'rejected')
        hiring.respond(self.offer(req).pk, self.extra, 'interested')
        hiring.select(self.offer(req).pk, self.restaurant, True)
        hiring.select(self.offer(req, self.known).pk, self.restaurant, True)
        req.refresh_from_db()
        self.assertEqual(req.status, 'filled')
        self.assertEqual(Mission.objects.count(), 2)

    def test_selection_rechecks_availability_and_prevents_double_booking(self):
        first = self.req(cascade=False)
        second = self.req(cascade=False)
        for req in [first, second]:
            hiring.respond(self.offer(req).pk, self.extra, 'interested')
        hiring.select(self.offer(first).pk, self.restaurant, True)
        with self.assertRaises(ValidationError):
            hiring.select(self.offer(second).pk, self.restaurant, True)
        self.assertEqual(Mission.objects.count(), 1)

    def test_availability_unknown_is_not_counted_as_declared_available(self):
        req = self.req()
        payload = request_data(req, self.extra)
        self.assertEqual(payload['compatible_after'], 3)
        self.assertEqual(payload['available_after'], 0)
        Slot.objects.create(profile=self.known, start=req.starts_at, end=req.ends_at)
        self.assertEqual(request_data(req, self.extra)['available_after'], 1)
        self.assertEqual(len(payload['offers']), 1)

    def test_overnight_unavailability_checks_previous_day_and_exceptions(self):
        day = timezone.localtime(self.starts).date()
        start = timezone.make_aware(datetime.combine(day, time(1)))
        req = self.req(starts_at=start, ends_at=start + timedelta(hours=2))
        rule = Unavailability.objects.create(profile=self.extra, recurrence_type='weekly',
            weekday=(day - timedelta(days=1)).isoweekday(), start_time=time(23), end_time=time(4))
        self.assertEqual(hiring.availability(self.extra, req), 'unavailable')
        rule.exceptions = [(day - timedelta(days=1)).isoformat()]
        rule.save()
        self.assertEqual(hiring.availability(self.extra, req), 'unknown')

    def test_broadcast_opt_out_before_wave_removes_offer(self):
        req = self.req()
        NotificationPreference.objects.filter(profile=self.broad).update(broadcasts=False)
        hiring.respond(self.offer(req).pk, self.extra, 'rejected')
        hiring.respond(self.offer(req, self.known).pk, self.known, 'rejected')
        hiring.respond(self.offer(req, self.friend).pk, self.friend, 'rejected')
        self.assertEqual(self.offer(req, self.broad).state, 'closed')

    def test_anonymous_and_non_client_cannot_create_requests(self):
        body = {**self.data, 'target_slug': self.extra.slug}
        self.assertIn(self.client.post('/api/requests/', body, format='json').status_code, (401, 403))
        self.login(self.extra)
        self.assertEqual(self.client.post('/api/requests/', body, format='json').status_code, 403)

    def test_queued_and_unrelated_extras_cannot_access_request_or_chat(self):
        req = self.req()
        for profile in [self.known, self.other]:
            self.login(profile)
            self.assertEqual(self.client.get(f'/api/requests/{req.pk}/').status_code, 404)
            self.assertEqual(self.client.get(f'/api/requests/{req.pk}/offers/{self.offer(req).pk}/messages/').status_code, 404)
        hiring.respond(self.offer(req).pk, self.extra, 'deferred')
        self.login(self.known)
        self.assertEqual(self.client.get(f'/api/requests/{req.pk}/offers/{self.offer(req).pk}/messages/').status_code, 403)

    def test_private_chat_and_notification_do_not_email_message_body(self):
        req = self.req()
        self.login(self.extra)
        path = f'/api/requests/{req.pk}/offers/{self.offer(req).pk}/messages/'
        self.assertEqual(self.client.post(path, {'text': 'Code porte confidentiel 1234'}, format='json').status_code, 201)
        self.login(self.restaurant)
        self.assertEqual(self.client.get(path).data[0]['text'], 'Code porte confidentiel 1234')
        notification = AppNotification.objects.get(event_key__startswith='message:')
        self.assertNotIn('1234', notification.body)

    def test_complete_api_scenario_from_proposal_to_validated_invoice_draft(self):
        self.login(self.restaurant)
        response = self.client.post('/api/requests/', {**self.data, 'target_slug': self.extra.slug}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        req_id = response.data['id']
        offer_id = response.data['offers'][0]['id']
        path = f'/api/requests/{req_id}/offers/{offer_id}/'
        self.login(self.extra)
        self.assertEqual(self.client.post(path + 'action/', {'action': 'interested'}, format='json').status_code, 200)
        self.login(self.restaurant)
        self.assertEqual(self.client.post(path + 'action/', {'action': 'select'}, format='json').status_code, 200)
        MissionRequest.objects.filter(pk=req_id).update(ends_at=timezone.now() - timedelta(seconds=1))
        self.login(self.extra)
        self.assertEqual(self.client.post(path + 'timesheet/', {'action': 'submit', 'hours': '4.50'}, format='json').status_code, 200)
        self.login(self.restaurant)
        self.assertEqual(self.client.post(path + 'timesheet/', {'action': 'approve'}, format='json').status_code, 200)
        self.login(self.extra)
        response = self.client.post(path + 'invoice/', {}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        invoice = Facture.objects.get(pk=response.data['invoice_id'])
        self.assertEqual(invoice.montant_ht, Decimal('112.50'))
        self.assertEqual(invoice.contact_email, 'compta@example.org')
        self.assertIsNone(invoice.finalized_at)

    def test_minutes_preserve_six_hours_twenty_and_invoice_amount(self):
        req, offer = self.selected(rate=Decimal('18'))
        path = f'/api/requests/{req.pk}/offers/{offer.pk}/timesheet/'
        self.login(self.extra)
        for invalid in (0, -1, 10081, '1.5'):
            self.assertEqual(self.client.post(path, {'action': 'submit', 'minutes': invalid}, format='json').status_code, 400)
        response = self.client.post(path, {'action': 'submit', 'minutes': 380}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        offer.refresh_from_db()
        self.assertEqual(offer.timesheet.hours, Decimal('6.3333'))
        hiring.timesheet_action(offer.pk, self.restaurant, 'approve')
        invoice = hiring.prepare_invoice(offer.pk, self.extra)
        self.assertEqual(invoice.montant_ht, Decimal('114.00'))
        self.assertEqual(invoice.lines.get().quantity, Decimal('6.3333'))

    def test_correction_requires_extra_confirmation_and_can_be_disputed(self):
        req, offer = self.selected()
        hiring.timesheet_action(offer.pk, self.extra, 'submit', Decimal('5'))
        hiring.timesheet_action(offer.pk, self.restaurant, 'correct', Decimal('4'), 'Pause de 1 h')
        with self.assertRaises(ValidationError):
            hiring.prepare_invoice(offer.pk, self.extra)
        with self.assertRaises(ValidationError):
            hiring.timesheet_action(offer.pk, self.restaurant, 'approve')
        hiring.timesheet_action(offer.pk, self.extra, 'reject_correction')
        self.assertEqual(offer.timesheet.hours, Decimal('5'))
        hiring.timesheet_action(offer.pk, self.restaurant, 'correct', Decimal('4'), 'Pause de 1 h')
        hiring.timesheet_action(offer.pk, self.extra, 'approve')
        offer.mission.refresh_from_db()
        self.assertEqual(offer.mission.status, Mission.STATUS_COMPLETED)

    def test_fixed_fee_draft_has_one_unit_and_generation_is_idempotent(self):
        req, offer = self.approved(rate_kind='fixed', rate=Decimal('150'))
        invoice = hiring.prepare_invoice(offer.pk, self.extra)
        self.assertEqual(invoice.montant_ht, Decimal('150'))
        self.assertEqual(invoice.lines.get().unit, 'C62')
        self.assertEqual(invoice.lines.get().quantity, 1)
        self.assertIsNone(invoice.hours)
        self.assertEqual(hiring.prepare_invoice(offer.pk, self.extra).pk, invoice.pk)
        self.assertEqual(Facture.objects.count(), 1)

    def test_no_agreed_rate_or_missing_billing_identity_blocks_invoice(self):
        req, offer = self.approved(rate_kind='none', rate=None)
        with self.assertRaises(ValidationError):
            hiring.prepare_invoice(offer.pk, self.extra)
        self.restaurant.siren = ''
        self.restaurant.save()
        with self.assertRaises(ValidationError):
            hiring.prepare_invoice(offer.pk, self.extra, rate=Decimal('30'))

    def test_draft_number_becomes_chronological_on_explicit_finalization(self):
        req, offer = self.approved()
        invoice = hiring.prepare_invoice(offer.pk, self.extra)
        final = finalize(invoice)
        self.assertEqual(final.numero, f'RB-{timezone.localdate().year}-00001')
        self.assertIsNotNone(final.finalized_at)
        self.assertEqual(finalize(final).numero, final.numero)

    def test_legacy_mission_and_slot_routes_cannot_bypass_approval(self):
        req, offer = self.selected()
        self.login(self.extra)
        path = f'/api/profiles/{self.extra.slug}/missions/{offer.mission_id}/'
        self.assertEqual(self.client.patch(path, {'status': Mission.STATUS_COMPLETED}, format='json').status_code, 409)
        self.assertEqual(self.client.delete(path).status_code, 409)
        slot = offer.mission.slots.get()
        self.assertEqual(self.client.delete(f'/api/profiles/{self.extra.slug}/slots/{slot.pk}/').status_code, 409)

    def test_cancel_closes_offers_but_refuses_confirmed_missions(self):
        req = self.req()
        hiring.cancel(req.pk, self.restaurant)
        self.assertTrue(all(state == 'closed' for state in req.offers.values_list('state', flat=True)))
        req, offer = self.selected()
        with self.assertRaises(ValidationError):
            hiring.cancel(req.pk, self.restaurant)

    def test_notification_delivery_respects_preferences_and_avoids_repeat_sends(self):
        req = self.req(cascade=False)
        prefs, _ = NotificationPreference.objects.get_or_create(profile=self.restaurant)
        prefs.email = False
        prefs.save()
        deliver_pending()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['adam@example.org'])
        deliver_pending()
        self.assertEqual(len(mail.outbox), 1)

    def test_failed_email_retries_and_does_not_mark_it_sent(self):
        req = self.req(cascade=False)
        with patch('api.notification_delivery.send_mail', side_effect=RuntimeError('secret')):
            deliver_pending()
        notification = self.extra.notifications.get()
        self.assertEqual(notification.email_state, 'pending')
        self.assertEqual(notification.attempts, 1)

    def test_push_uses_sound_preference_and_removes_expired_subscriptions(self):
        from pywebpush import WebPushException
        req = self.req(cascade=False)
        prefs = NotificationPreference.objects.create(profile=self.extra, push=True, sound=False)
        WebPushSubscription.objects.create(profile=self.extra, endpoint='https://fcm.googleapis.com/test', p256dh='A'*87, auth='B'*22)
        with patch('pywebpush.webpush') as send:
            send_push(self.extra.notifications.get(), prefs)
        self.assertIn('"silent": true', send.call_args.kwargs['data'])
        from unittest.mock import Mock
        with patch('pywebpush.webpush', side_effect=WebPushException('gone', response=Mock(status_code=410))):
            send_push(self.extra.notifications.get(), prefs)
        self.assertFalse(WebPushSubscription.objects.exists())

    def test_smtp_failure_does_not_exhaust_push_retries(self):
        req = self.req(cascade=False)
        NotificationPreference.objects.create(profile=self.extra, push=True)
        notification = self.extra.notifications.get()
        notification.email_attempts = 5
        notification.save()
        with patch('api.notification_delivery.send_mail', side_effect=RuntimeError()), patch('api.notification_delivery.send_push') as push:
            deliver_pending()
        notification.refresh_from_db()
        self.assertEqual(notification.email_state, 'failed')
        self.assertEqual(notification.push_state, 'sent')
        push.assert_called_once()

    def test_expired_invitation_is_not_delivered_after_configuration_arrives(self):
        req = self.req(cascade=False)
        req.status = 'expired'
        req.save()
        deliver_pending()
        self.assertEqual(self.extra.notifications.get().email_state, 'skipped')

    @override_settings(BREVO_API_KEY='test-key')
    def test_brevo_adapter_sends_plain_text_and_does_not_hide_rejection(self):
        from unittest.mock import Mock
        from django.core.mail import EmailMessage
        from .brevo_email import BrevoEmailBackend
        message = EmailMessage('Mission', 'Une proposition', 'Rivebelle <test@example.org>', ['recipient@example.org'])
        with patch('api.brevo_email.requests.post', return_value=Mock(status_code=201)) as post:
            self.assertEqual(BrevoEmailBackend().send_messages([message]), 1)
        self.assertEqual(post.call_args.kwargs['headers']['api-key'], 'test-key')
        self.assertEqual(post.call_args.kwargs['json']['textContent'], 'Une proposition')
        self.assertFalse(post.call_args.kwargs['allow_redirects'])
        with patch('api.brevo_email.requests.post', return_value=Mock(status_code=401)):
            with self.assertRaises(RuntimeError):
                BrevoEmailBackend().send_messages([message])

    def test_billing_email_is_not_visible_on_public_profile(self):
        self.extra.billing_email = 'private@example.org'
        self.extra.save()
        self.login(self.other)
        response = self.client.get(f'/api/profiles/{self.extra.slug}/')
        self.assertEqual(response.data['profile']['billing_email'], '')

    def test_accounting_email_does_not_hide_invoice_from_restaurant_dashboard(self):
        req, offer = self.approved()
        invoice = hiring.prepare_invoice(offer.pk, self.extra)
        self.login(self.restaurant)
        response = self.client.get('/api/client/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['factures'][0]['id'], invoice.pk)

    @override_settings(WEBPUSH_PUBLIC_KEY='public')
    def test_push_endpoint_rejects_private_network_and_other_account_ownership(self):
        self.login(self.extra)
        body = {'endpoint': 'https://192.168.1.14/private', 'keys': {'p256dh': 'A' * 87, 'auth': 'B' * 22}}
        self.assertEqual(self.client.post('/api/notifications/push/', body, format='json').status_code, 400)
        body['endpoint'] = 'https://fcm.googleapis.com/example'
        self.assertEqual(self.client.post('/api/notifications/push/', body, format='json').status_code, 201)
        self.login(self.other)
        self.assertEqual(self.client.post('/api/notifications/push/', body, format='json').status_code, 400)
        self.client.delete('/api/notifications/push/', body, format='json')
        self.assertEqual(WebPushSubscription.objects.count(), 1)

    def test_notifications_cannot_mark_another_accounts_items_read(self):
        req = self.req()
        self.login(self.other)
        self.client.post('/api/notifications/', {'id': self.extra.notifications.get().pk}, format='json')
        self.assertIsNone(self.extra.notifications.get().read_at)

    def test_request_input_rejects_invalid_dates_quantity_and_unknown_post(self):
        self.login(self.restaurant)
        for invalid in [{'quantity': 0}, {'job': 'invented'}, {'job': 'other', 'custom_job': ''},
                        {'ends_at': self.starts}, {'rate': '-1'}, {'starts_at': timezone.now() - timedelta(hours=1)}]:
            response = self.client.post('/api/requests/', {**self.data, 'target_slug': self.extra.slug, **invalid}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
