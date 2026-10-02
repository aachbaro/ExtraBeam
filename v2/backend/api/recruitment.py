"""Transactional recruitment services. A worker advances waves without an open browser."""
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from django.conf import settings
from django.db import transaction
from django.db.models import Q, F
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import (AccountProfile, MissionRequest, CandidateOffer, Mission, Slot,
    ClientContact, ProfileContact, NotificationPreference, AppNotification,
    MissionTimesheet, Facture, InvoiceLine)

JOBS = {'service': 'Service en salle', 'bar': 'Bar', 'cuisine': 'Cuisine',
        'plonge': 'Plonge', 'accueil': 'Accueil', 'other': 'Autre'}
OPEN = ('recruiting', 'exhausted')


def notify(profile, key, title, req, body=''):
    AppNotification.objects.get_or_create(recipient=profile, event_key=str(key),
        defaults={'title': title, 'body': body, 'url': f'/requests/{req.pk}'})


def lock_request(pk):
    # UPDATE obtains the SQLite writer lock before any read; SELECT FOR UPDATE
    # also supports row locking when the database is migrated to PostgreSQL.
    MissionRequest.objects.filter(pk=pk).update(wave=F('wave'))
    return MissionRequest.objects.select_for_update().select_related('client__user', 'target').get(pk=pk)


def availability(profile, req):
    """Return unavailable / available / unknown, with overnight recurrence support."""
    if Slot.objects.filter(profile=profile, mission__isnull=False,
        mission__status__in=[Mission.STATUS_PROPOSED, Mission.STATUS_ONGOING],
        start__lt=req.ends_at, end__gt=req.starts_at).exists():
        return 'unavailable'
    local_start, local_end = timezone.localtime(req.starts_at), timezone.localtime(req.ends_at)
    for rule in profile.unavailabilities.all():
        day = local_start.date() - timedelta(days=1)
        while day <= local_end.date():
            applies = (rule.recurrence_type == 'once' and rule.start_date == day) or (
                rule.recurrence_type == 'weekly' and rule.weekday == day.isoweekday()
                and (not rule.start_date or day >= rule.start_date)
                and (not rule.recurrence_end or day <= rule.recurrence_end))
            if applies and day.isoformat() not in rule.exceptions:
                start = timezone.make_aware(datetime.combine(day, rule.start_time))
                end_day = day + timedelta(days=1) if rule.end_time <= rule.start_time else day
                end = timezone.make_aware(datetime.combine(end_day, rule.end_time))
                if start < req.ends_at and end > req.starts_at:
                    return 'unavailable'
            day += timedelta(days=1)
    if Slot.objects.filter(profile=profile, mission__isnull=True,
        start__lte=req.starts_at, end__gte=req.ends_at).exists():
        return 'available'
    return 'unknown'


def compatible(profile, req):
    prefs = NotificationPreference.objects.filter(profile=profile).first()
    return profile.role == 'freelance' and profile.user.is_active and (not prefs or not prefs.jobs or req.job in prefs.jobs) and availability(profile, req) != 'unavailable'


@transaction.atomic
def create_request(client, target, data):
    req = MissionRequest.objects.create(client=client, target=target, **data)
    CandidateOffer.objects.create(request=req, extra=target, wave=0)
    if req.cascade:
        known = set(ClientContact.objects.filter(client_profile=client).values_list('contact_profile_id', flat=True))
        known.update(Mission.objects.filter(client_profile=client).exclude(status=Mission.STATUS_REFUSED).values_list('profile_id', flat=True))
        known.update(ProfileContact.objects.filter(from_profile=client).values_list('to_profile_id', flat=True))
        known.update(ProfileContact.objects.filter(to_profile=client).values_list('from_profile_id', flat=True))
        network = set(ProfileContact.objects.filter(from_profile=target).values_list('to_profile_id', flat=True))
        network.update(ProfileContact.objects.filter(to_profile=target).values_list('from_profile_id', flat=True))
        for profile in AccountProfile.objects.filter(role='freelance', user__is_active=True).exclude(pk=target.pk).order_by('pk'):
            prefs = NotificationPreference.objects.filter(profile=profile).first()
            wave = 1 if profile.pk in known else 2 if profile.pk in network else 3
            if (wave < 3 or (prefs and prefs.broadcasts)) and compatible(profile, req):
                CandidateOffer.objects.create(request=req, extra=profile, wave=wave)
    activate_wave(req, 0)
    notify(client, f'created:{req.pk}', 'Votre demande est envoyée', req, req.establishment)
    return req


def activate_wave(req, wave):
    offers = req.offers.filter(wave=wave, state='queued').select_related('extra')
    for offer in offers:
        broadcasting = offer.wave == 3 and not NotificationPreference.objects.filter(profile=offer.extra, broadcasts=True).exists()
        if offer.extra_id != req.target_id and (not compatible(offer.extra, req) or broadcasting):
            offer.state = 'closed'
        else:
            offer.state, offer.offered_at = 'offered', timezone.now()
            notify(offer.extra, f'offer:{offer.pk}', 'Une proposition de mission vous attend', req,
                f'{req.establishment} · {JOBS[req.job]}')
        offer.save(update_fields=['state', 'offered_at'])
    req.wave = wave
    req.next_wave_at = timezone.now() + timedelta(minutes=settings.RECRUITMENT_WAVE_MINUTES)
    req.status = 'recruiting'
    req.save(update_fields=['wave', 'next_wave_at', 'status'])


def advance(req):
    if req.status not in OPEN:
        return
    remaining = req.quantity - req.offers.filter(state='selected').count()
    if req.offers.filter(state='interested').count() >= remaining:
        req.next_wave_at = None
        req.save(update_fields=['next_wave_at'])
        return
    queued = req.offers.filter(state='queued').order_by('wave').first()
    if queued:
        activate_wave(req, queued.wave)
    elif not req.deferred_reinvited and req.offers.filter(state='deferred').exists():
        for offer in req.offers.filter(state='deferred').select_related('extra'):
            offer.state, offer.offered_at = 'offered', timezone.now()
            offer.save(update_fields=['state', 'offered_at'])
            notify(offer.extra, f'reinvite:{offer.pk}', 'Des places restent : souhaitez-vous revenir ?', req)
        req.deferred_reinvited = True
        req.next_wave_at = timezone.now() + timedelta(minutes=settings.RECRUITMENT_WAVE_MINUTES)
        req.save(update_fields=['deferred_reinvited', 'next_wave_at'])
    else:
        req.status, req.next_wave_at = 'exhausted', None
        req.save(update_fields=['status', 'next_wave_at'])
        notify(req.client, f'exhausted:{req.pk}', 'La diffusion est terminée, des places restent', req)


@transaction.atomic
def tick_request(pk):
    req = lock_request(pk)
    now = timezone.now()
    if req.status in OPEN and req.starts_at <= now:
        req.status, req.next_wave_at = 'expired', None
        req.save(update_fields=['status', 'next_wave_at'])
        req.offers.exclude(state='selected').update(state='closed')
        notify(req.client, f'expired:{req.pk}', 'La demande a expiré', req)
    elif req.status in OPEN and req.next_wave_at and req.next_wave_at <= now:
        advance(req)


@transaction.atomic
def respond(offer_id, extra, action):
    CandidateOffer.objects.filter(pk=offer_id, extra=extra).update(state=F('state'))
    raw = CandidateOffer.objects.get(pk=offer_id, extra=extra)
    req = lock_request(raw.request_id)
    offer = req.offers.get(pk=offer_id)
    if req.status not in OPEN or req.starts_at <= timezone.now() or offer.state not in ('offered', 'interested'):
        raise ValidationError('Cette proposition ne peut plus recevoir de réponse.')
    if action not in ('interested', 'deferred', 'rejected'):
        raise ValidationError('Réponse inconnue.')
    if action == 'interested' and availability(extra, req) == 'unavailable':
        raise ValidationError('Ce créneau chevauche une indisponibilité ou une mission confirmée.')
    offer.state, offer.responded_at = action, timezone.now()
    offer.save(update_fields=['state', 'responded_at'])
    if action == 'interested':
        notify(req.client, f'interested:{offer.pk}', f'{extra.display_name} se propose pour la mission', req)
    else:
        advance(req)
    return req


@transaction.atomic
def select(offer_id, client, accept):
    CandidateOffer.objects.filter(pk=offer_id, request__client=client).update(state=F('state'))
    raw = CandidateOffer.objects.get(pk=offer_id, request__client=client)
    req = lock_request(raw.request_id)
    offer = req.offers.select_related('extra__user').get(pk=offer_id)
    if accept and offer.state == 'selected':
        return req
    if req.status not in OPEN or req.starts_at <= timezone.now() or offer.state != 'interested':
        raise ValidationError('Cette candidature ne peut plus être sélectionnée.')
    if not accept:
        offer.state = 'declined'
        offer.save(update_fields=['state'])
        notify(offer.extra, f'declined:{offer.pk}', 'Votre candidature n’a pas été retenue', req)
        advance(req)
        return req
    AccountProfile.objects.filter(pk=offer.extra_id).update(updated_at=F('updated_at'))
    if req.offers.filter(state='selected').count() >= req.quantity:
        raise ValidationError('Toutes les places sont déjà attribuées.')
    if not compatible(offer.extra, req):
        raise ValidationError('Cet extra n’est plus disponible sur ce créneau.')
    mission = Mission.objects.create(profile=offer.extra, client_profile=client,
        title=f'{JOBS[req.job] if req.job != "other" else req.custom_job} · {req.establishment}',
        status=Mission.STATUS_ONGOING, establishment=req.establishment,
        establishment_address_line1=req.address, client_name=client.legal_name or client.display_name,
        client_email=client.billing_email or client.user.email, contact_name=client.display_name, contact_phone=client.phone,
        instructions=f'Tenue : {req.dress_code}\n{req.notes}',
        start_date=timezone.localtime(req.starts_at).date(), end_date=timezone.localtime(req.ends_at).date(),
        total_amount=req.rate if req.rate_kind == 'fixed' else None)
    Slot.objects.create(profile=offer.extra, mission=mission, title=mission.title, start=req.starts_at, end=req.ends_at)
    offer.state, offer.mission = 'selected', mission
    offer.save(update_fields=['state', 'mission'])
    notify(offer.extra, f'selected:{offer.pk}', 'Votre mission est confirmée', req)
    if req.offers.filter(state='selected').count() == req.quantity:
        req.status, req.next_wave_at = 'filled', None
        req.save(update_fields=['status', 'next_wave_at'])
        for other in req.offers.exclude(state__in=['selected', 'closed', 'rejected', 'declined']):
            if other.offered_at:
                notify(other.extra, f'filled:{other.pk}', 'Toutes les places ont été attribuées', req)
        req.offers.exclude(state='selected').update(state='closed')
    return req


@transaction.atomic
def cancel(pk, client):
    req = lock_request(pk)
    if req.client_id != client.pk:
        raise ValidationError('Accès refusé.')
    if req.offers.filter(state='selected').exists():
        raise ValidationError('Des missions sont confirmées : contactez les extras avant d’annuler.')
    if req.status == 'canceled':
        return req
    req.status, req.next_wave_at = 'canceled', None
    req.save(update_fields=['status', 'next_wave_at'])
    for offer in req.offers.exclude(offered_at=None).select_related('extra'):
        notify(offer.extra, f'canceled:{offer.pk}', 'La demande a été annulée', req)
    req.offers.update(state='closed')
    return req


@transaction.atomic
def timesheet_action(offer_id, actor, action, hours=None, note=''):
    CandidateOffer.objects.filter(pk=offer_id).update(state=F('state'))
    raw = CandidateOffer.objects.select_related('request').get(pk=offer_id)
    req = lock_request(raw.request_id)
    offer = req.offers.select_related('extra', 'mission').get(pk=offer_id)
    if offer.state != 'selected' or actor.pk not in (req.client_id, offer.extra_id):
        raise ValidationError('Accès refusé.')
    sheet = MissionTimesheet.objects.filter(offer=offer).first()
    if action == 'submit' and actor.pk == offer.extra_id:
        if timezone.now() < req.ends_at:
            raise ValidationError('Les heures peuvent être soumises après la fin du service.')
        if sheet and sheet.state != 'submitted':
            raise ValidationError('Un relevé corrigé ou validé ne peut pas être remplacé.')
        sheet, _ = MissionTimesheet.objects.update_or_create(offer=offer,
            defaults={'hours': hours, 'original_hours': hours, 'note': note, 'submitted_at': timezone.now()})
        notify(req.client, f'hours:{offer.pk}:{sheet.submitted_at.timestamp()}', 'Des heures attendent votre validation', req)
    elif sheet and action == 'correct' and actor.pk == req.client_id and sheet.state == 'submitted':
        sheet.hours, sheet.note, sheet.state = hours, note, 'corrected'
        sheet.save(update_fields=['hours', 'note', 'state'])
        notify(offer.extra, f'correction:{sheet.pk}', 'Le restaurateur propose une correction des heures', req)
    elif sheet and action == 'approve' and ((actor.pk == req.client_id and sheet.state == 'submitted') or
            (actor.pk == offer.extra_id and sheet.state == 'corrected')):
        sheet.state, sheet.approved_at = 'approved', timezone.now()
        sheet.save(update_fields=['state', 'approved_at'])
        offer.mission.status = Mission.STATUS_COMPLETED
        offer.mission.save(update_fields=['status'])
        notify(offer.extra, f'approved:{sheet.pk}', 'Les heures sont validées, préparez votre facture', req)
        notify(req.client, f'approved:{sheet.pk}', 'Les heures de la mission sont validées', req)
    elif sheet and action == 'reject_correction' and actor.pk == offer.extra_id and sheet.state == 'corrected':
        sheet.state = 'submitted'
        sheet.hours = sheet.original_hours or sheet.hours
        sheet.save(update_fields=['state', 'hours'])
        notify(req.client, f'disagree:{sheet.pk}:{timezone.now().timestamp()}', 'La correction des heures est à revoir', req)
    else:
        raise ValidationError('Cette action n’est pas disponible pour ce relevé.')
    return req


@transaction.atomic
def prepare_invoice(offer_id, extra, rate=None, tax=Decimal('0')):
    CandidateOffer.objects.filter(pk=offer_id, extra=extra).update(state=F('state'))
    raw = CandidateOffer.objects.get(pk=offer_id, extra=extra)
    req = lock_request(raw.request_id)
    offer = req.offers.select_related('mission', 'extra').get(pk=offer_id)
    sheet = MissionTimesheet.objects.filter(offer=offer, state='approved').first()
    if not sheet:
        raise ValidationError('Les heures doivent être validées avant la facturation.')
    if sheet.invoice_id:
        return sheet.invoice
    client = req.client
    required = ('legal_name', 'siren', 'address_line1', 'postal_code', 'city')
    if any(not getattr(client, field) for field in required):
        raise ValidationError('Le restaurateur doit compléter sa raison sociale, son SIREN et son adresse de facturation.')
    if len(client.siren) != 9 or not client.siren.isdigit():
        raise ValidationError('Le SIREN du client doit contenir neuf chiffres.')
    if not extra.vat_number and tax:
        raise ValidationError('Renseignez votre numéro de TVA avant de facturer de la TVA.')
    unit_price = req.rate if req.rate_kind != 'none' else rate
    if unit_price is None:
        raise ValidationError('Convenez d’un tarif puis renseignez-le pour préparer la facture.')
    qty = Decimal('1') if req.rate_kind == 'fixed' else sheet.hours
    total = (qty * unit_price).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    # An opaque draft number cannot collide with manually numbered invoices.
    invoice = Facture.objects.create(profile=extra, mission=offer.mission,
        numero=f'B-{req.pk.hex[:12]}-{offer.pk}', client_name=client.legal_name,
        client_siren=client.siren, client_siret=client.siret, client_vat_number=client.vat_number,
        client_address_ligne1=client.address_line1, client_address_ligne2=client.address_line2,
        client_code_postal=client.postal_code, client_ville=client.city, client_pays=client.country,
        contact_email=client.billing_email or client.user.email, contact_name=client.display_name, contact_phone=client.phone,
        description=f'{offer.mission.title} — prestation du {timezone.localtime(req.starts_at):%d/%m/%Y}',
        hours=sheet.hours if req.rate_kind != 'fixed' else None, rate=unit_price if req.rate_kind != 'fixed' else None,
        montant_ht=total, tva=tax, montant_ttc=(total * (1 + tax / 100)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP),
        mention_tva='' if tax else extra.vat_notice, date_echeance=timezone.localdate() + timedelta(days=30),
        conditions_paiement=extra.payment_terms, penalites_retard=extra.late_penalties,
        escompte='Aucun escompte pour paiement anticipé', indemnite_recouvrement='Indemnité forfaitaire de recouvrement : 40 EUR')
    InvoiceLine.objects.create(invoice=invoice, description=invoice.description, quantity=qty,
        unit='C62' if req.rate_kind == 'fixed' else 'HUR', unit_price_excl_tax=unit_price, tax_rate=tax, total_excl_tax=total)
    sheet.invoice = invoice
    sheet.save(update_fields=['invoice'])
    return invoice
