"""Restaurant scheduling: availability, eligibility, hours and draft generation."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import unicodedata
from django.db.models import Q
from .models import ShiftAssignment

TZ = ZoneInfo("Europe/Paris")
DEFAULT_RULES = {"max_daily_hours": 10, "max_weekly_hours": 48, "min_rest_hours": 11, "max_days": 6}

def interval(shift):
    start = datetime.combine(shift.date, shift.start_time, TZ)
    end = datetime.combine(shift.date, shift.end_time, TZ)
    if end <= start: end += timedelta(days=1)
    return start, end

def minutes(shift):
    a,b = interval(shift)
    return max(0, int((b-a).total_seconds()/60)-shift.break_minutes)

def availability(member, shift):
    a,b = interval(shift)
    if member.profile_id:
        # Existing mission bookings and profile unavailability are hard constraints.
        if member.profile.slots.filter(mission__isnull=False, start__lt=b, end__gt=a).exists():
            return "unavailable"
        for rule in member.profile.unavailabilities.all():
            for day in (shift.date-timedelta(days=1), shift.date, shift.date+timedelta(days=1)):
                if day.isoformat() in rule.exceptions or (rule.recurrence_end and day > rule.recurrence_end): continue
                if rule.recurrence_type == "once" and rule.start_date != day: continue
                if rule.recurrence_type == "weekly" and rule.weekday != day.isoweekday(): continue
                x = datetime.combine(day, rule.start_time, TZ); y = datetime.combine(day, rule.end_time, TZ)
                if y <= x: y += timedelta(days=1)
                if a < y and x < b: return "unavailable"
    explicit = next((v.status for v in shift.availabilities.all() if v.member_id == member.id), None)
    if explicit: return explicit
    if member.profile_id and member.profile.slots.filter(mission__isnull=True, start__lte=a, end__gte=b).exists():
        return "available"
    return member.default_availability

def bookings(member, shift):
    query=Q(member=member)
    if member.profile_id: query |= Q(member__profile_id=member.profile_id)
    return [a.shift for a in ShiftAssignment.objects.filter(query).exclude(status="declined").exclude(shift=shift).select_related("shift")]

def has_skills(member, required):
    normalize=lambda s:unicodedata.normalize('NFKC',s.strip()).casefold()
    return {normalize(s) for s in required}.issubset({normalize(s) for s in member.skills})

def reasons(member, shift, existing=None):
    result=[]
    if not member.is_active: result.append("Membre inactif")
    if shift.position not in {member.position, *member.skills}: result.append("Poste non habilité")
    if not has_skills(member,shift.required_skills): result.append("Compétence requise manquante")
    if availability(member,shift)=="unavailable": result.append("Indisponible")
    a,b=interval(shift); rows=bookings(member,shift) if existing is None else existing
    week=shift.date-timedelta(days=shift.date.weekday())
    daily=minutes(shift); weekly=minutes(shift); days={shift.date}
    rules={**DEFAULT_RULES, **shift.restaurant.planning_rules}
    for other in rows:
        x,y=interval(other)
        if a < y and x < b: result.append("Chevauchement")
        elif other.date != shift.date and min(abs((a-y).total_seconds()),abs((x-b).total_seconds())) < rules["min_rest_hours"]*3600:
            result.append("Repos insuffisant")
        if other.date == shift.date: daily += minutes(other)
        if week <= other.date < week+timedelta(days=7):
            weekly += minutes(other); days.add(other.date)
    if daily > rules["max_daily_hours"]*60: result.append("Maximum journalier")
    if weekly > rules["max_weekly_hours"]*60: result.append("Maximum hebdomadaire")
    if len(days) > rules["max_days"]: result.append("Maximum de jours")
    return list(dict.fromkeys(result))

def candidate_details(shift):
    return [dict(member_id=m.id,status=availability(m,shift),reasons=reasons(m,shift)) for m in shift.restaurant.members.filter(is_active=True).select_related("profile")]

def generate(restaurant, shifts, assigned_by, period_start=None, period_end=None):
    period_start = period_start or min((s.date for s in shifts), default=None)
    period_end = period_end or max((s.date for s in shifts), default=None)
    # Caller holds a restaurant lock. Published, confirmed and manual rows survive.
    ShiftAssignment.objects.filter(shift__in=shifts, shift__status="draft", locked=False, status="proposed").delete()
    staff=list(restaurant.members.filter(is_active=True).select_related("profile"))
    tasks=[s for s in shifts if s.status=="draft"]
    tasks.sort(key=lambda s:(sum(availability(m,s) in ("available","maybe") and not reasons(m,s) for m in staff)-s.positions_needed,s.date,s.start_time))
    warnings=[]
    for s in tasks:
        while s.assignments.exclude(status="declined").count() < s.positions_needed:
            already=set(s.assignments.values_list("member_id",flat=True))
            candidates=[m for m in staff if m.id not in already and availability(m,s) != "unavailable" and not reasons(m,s)]
            if not candidates: break
            def score(m):
                rows=bookings(m,s); pref=m.preferences
                period=[o for o in rows if o.restaurant_id == restaurant.id and period_start <= o.date <= period_end]
                same_day=any(o.date==s.date for o in rows)
                target=m.weekly_hours*60*((period_end-period_start).days+1)/7
                cost=100*(sum(minutes(o) for o in period)+minutes(s))/max(target,1)
                cost+=pref.get("weekends",0)*4*(s.date.weekday()>4)
                cost+=pref.get("split",0)*4*same_day-pref.get("compact",0)*3*same_day
                cost+=pref.get("evenings" if s.start_time.hour>=17 else "lunches",0)*4
                if any(o.date.weekday()==s.date.weekday() and o.start_time==s.start_time for o in rows):cost-=pref.get("stable",0)*2
                coworkers=set(s.assignments.exclude(status="declined").values_list("member_id",flat=True))
                cost+=pref.get("variety",1)*sum(1 for o in rows if o.assignments.filter(member_id__in=coworkers).exists())
                return (availability(m,s)!="available",cost,m.id)
            chosen=min(candidates,key=score)
            s.assignments.create(member=chosen,assigned_by=assigned_by,locked=False)
        missing=s.positions_needed-s.assignments.exclude(status="declined").count()
        if missing:
            warnings.append(dict(shift_id=s.id,missing=missing,candidates=candidate_details(s)))
    return warnings
