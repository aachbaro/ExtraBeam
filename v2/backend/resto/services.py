"""Service templates and dated services; staffing remains in RestaurantShift."""
from copy import deepcopy
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError, NotFound
from rest_framework.response import Response
from .models import ServiceTemplate, RestaurantService, RestaurantShift, ShiftAssignment, ServiceCancellation, POSITION_CHOICES
from .serializers import RestaurantShiftSerializer
from . import scheduling
from .views import _get_restaurant, _require_auth, _require_manager, _require_team


class TaskInput(serializers.Serializer):
    key = serializers.CharField(max_length=80)
    label = serializers.CharField(max_length=300)
    phase = serializers.ChoiceField(choices=['opening', 'closing', 'during'], default='during')
    done = serializers.BooleanField(default=False)


class SlotInput(serializers.Serializer):
    key = serializers.CharField(max_length=80)
    title = serializers.CharField(max_length=120, allow_blank=True, default='')
    position = serializers.ChoiceField(choices=POSITION_CHOICES, default='serveur')
    positions_needed = serializers.IntegerField(min_value=1, max_value=50, default=1)
    start_time = serializers.TimeField(format='%H:%M')
    end_time = serializers.TimeField(format='%H:%M')
    break_minutes = serializers.IntegerField(min_value=0, max_value=180, default=30)
    required_skills = serializers.ListField(child=serializers.CharField(max_length=40), max_length=20, default=list)
    fixed_member_ids = serializers.ListField(child=serializers.IntegerField(), max_length=20, default=list, required=False)

    def validate(self, data):
        start, end = data['start_time'], data['end_time']
        duration = ((end.hour*60+end.minute)-(start.hour*60+start.minute)) % 1440
        if duration <= data['break_minutes']:
            raise ValidationError('Le temps de présence doit dépasser la pause.')
        return data


class DefinitionInput(serializers.Serializer):
    title = serializers.CharField(max_length=120)
    start_time = serializers.TimeField(format='%H:%M')
    kitchen_end_time = serializers.TimeField(format='%H:%M')
    end_time = serializers.TimeField(format='%H:%M')
    notes = serializers.CharField(max_length=10000, allow_blank=True, default='')
    tasks = TaskInput(many=True, max_length=100, default=list)
    slots = SlotInput(many=True, max_length=50, default=list)

    def validate(self, data):
        minute = lambda t: t.hour*60+t.minute
        start, kitchen, end = [minute(data[k]) for k in ['start_time','kitchen_end_time','end_time']]
        if (end-start)%1440 == 0 or (kitchen-start)%1440 > (end-start)%1440:
            raise ValidationError('La fermeture cuisine doit se situer entre le début du service et la fin du rangement.')
        for key in ('slots','tasks'):
            keys = [v['key'] for v in data[key]]
            if len(keys) != len(set(keys)):
                raise ValidationError('Identifiants dupliqués : '+key)
        return data


def definition(data):
    s = DefinitionInput(data=data)
    s.is_valid(raise_exception=True)
    return dict(s.data)


FIELDS = ('title','start_time','kitchen_end_time','end_time','notes')
SLOT_FIELDS = ('title','position','positions_needed','start_time','end_time','break_minutes','required_skills')


def current_definition(service):
    return {
        **{k: str(getattr(service,k))[:5] if k.endswith('_time') else getattr(service,k) for k in FIELDS},
        'tasks': deepcopy(service.tasks),
        'slots': [dict(key=s.template_slot_key or 'legacy-'+str(s.pk), **{
            k: str(getattr(s,k))[:5] if k.endswith('_time') else getattr(s,k) for k in SLOT_FIELDS
        }) for s in service.slots.all().order_by('id')],
    }


def service_structure(data):
    """Compare service needs, ignoring task progress and fixed-assignment metadata."""
    result = deepcopy(data)
    for task in result.get('tasks', []):
        task.pop('done', None)
    for slot in result.get('slots', []):
        slot.pop('fixed_member_ids', None)
    return result


def serialize_service(service):
    slots = list(service.slots.all().order_by('id'))
    return dict(id=service.id, date=service.date.isoformat(), template_id=service.template_id,
                template_snapshot=deepcopy(service.template_snapshot) if service.template_id else None,
                **current_definition(service),
                shifts=RestaurantShiftSerializer(slots,many=True).data,
                customized=bool(service.template_id and service_structure(current_definition(service)) != service_structure(service.template_snapshot)))


def definition_on(template,day):
    versions=[v for v in template.definition_versions if v['from']<=day.isoformat()]
    return deepcopy(max(versions,key=lambda v:v['from'])['definition'] if versions else template.definition)


def change_template(template,data,day):
    versions=template.definition_versions or [{'from':(template.starts_on or day).isoformat(),'definition':deepcopy(template.definition)}]
    template.definition_versions=[v for v in versions if v['from']<day.isoformat()]+[{'from':day.isoformat(),'definition':deepcopy(data)}]
    template.definition=deepcopy(data)
    template.name=data['title']
    template.save()


def serialize_template(template):
    return dict(id=template.id,name=template.name,weekday=template.weekday,definition=template.definition,starts_on=template.starts_on,ends_on=template.ends_on)


def _apply_fixed_assignments(shift, fixed_member_ids, restaurant):
    for member_id in (fixed_member_ids or []):
        member = restaurant.members.filter(id=member_id, is_active=True).first()
        if member:
            ShiftAssignment.objects.get_or_create(
                shift=shift, member=member,
                defaults={'locked': True, 'status': 'proposed'},
            )


def validate_assignments(slot):
    assignments=list(slot.assignments.exclude(status='declined').select_related('member'))
    if len(assignments)>slot.positions_needed:
        raise ValidationError('Retirez les affectations en trop avant de réduire le nombre de postes.')
    for a in assignments:
        blockers=scheduling.reasons(a.member,slot)
        if blockers:
            raise ValidationError(f'{slot.date} — {a.member.name} : '+', '.join(blockers))


def apply_definition(service, data, *, merge=False):
    """Three-way merge: occurrence overrides and completed tasks take precedence."""
    old = service.template_snapshot
    current = current_definition(service)
    for key in FIELDS:
        if not merge or current[key] == old.get(key):
            setattr(service,key,data[key])
    old_tasks={t['key']:t for t in old.get('tasks',[])}
    incoming={t['key']:t for t in data['tasks']}
    if merge:
        tasks=[]
        for task in current['tasks']:
            base=old_tasks.get(task['key'])
            new=incoming.get(task['key'])
            if base and not new and not task['done'] and all(task.get(k)==base.get(k) for k in ('label','phase')):
                continue
            if base and new:
                task={**task, **{k:new[k] for k in ('label','phase') if task.get(k)==base.get(k)}}
            tasks.append(task)
        existing={t['key'] for t in current['tasks']}
        tasks += [{**t,'done':False} for t in data['tasks'] if t['key'] not in old_tasks and t['key'] not in existing]
        service.tasks=tasks
    else:
        service.tasks=deepcopy(data['tasks'])
    service.save()
    old_slots={s['key']:s for s in old.get('slots',[])}
    new_slots={s['key']:s for s in data['slots']}
    seen=set()
    for slot in service.slots.all().order_by('id'):
        key=slot.template_slot_key or 'legacy-'+str(slot.pk)
        seen.add(key)
        new=new_slots.get(key)
        before=next(s for s in current['slots'] if s['key']==key)
        base=old_slots.get(key)
        if new is None:
            if merge and (not base or before!=base or slot.assignments.exists()):
                continue
            if slot.assignments.exists():
                raise ValidationError('Retirez les affectations avant de supprimer un poste.')
            slot.delete()
            continue
        changed=False
        for field in SLOT_FIELDS:
            if (not merge or (base and before[field]==base.get(field))) and before[field]!=new[field]:
                setattr(slot,field,new[field]); changed=True
        if changed:
            slot.status='draft'
            slot.save()
            # Re-fetch time fields converted by Django before constraint checks.
            slot.refresh_from_db()
            validate_assignments(slot)
    for key,new in new_slots.items():
        if key not in seen and (not merge or key not in old_slots):
            shift = RestaurantShift.objects.create(restaurant=service.restaurant,service_instance=service,
                template_slot_key=key,date=service.date,**{k:new[k] for k in SLOT_FIELDS})
            _apply_fixed_assignments(shift, new.get('fixed_member_ids'), service.restaurant)
    if merge:
        service.template_snapshot=deepcopy(data)
        service.save(update_fields=['template_snapshot'])


def parse_date(value):
    s=serializers.DateField()
    return s.run_validation(value)


@api_view(['GET','POST'])
@transaction.atomic
def templates(request,slug):
    restaurant=_get_restaurant(slug)
    profile=_require_auth(request)
    _require_manager(restaurant,profile)
    if request.method=='GET':
        return Response([serialize_template(t) for t in restaurant.service_templates.order_by('weekday','id')])
    data=definition(request.data.get('definition',{}))
    weekday=serializers.IntegerField(min_value=0,max_value=6).run_validation(request.data.get('weekday',0))
    data['tasks']=[{**t,'done':False} for t in data['tasks']]
    template=ServiceTemplate.objects.create(restaurant=restaurant,name=data['title'],weekday=weekday,definition=data,starts_on=parse_date(request.data.get('starts_on',timezone.localdate())))
    return Response(serialize_template(template),status=201)


@api_view(['PATCH','DELETE'])
@transaction.atomic
def template_detail(request,slug,template_id):
    restaurant=_get_restaurant(slug)
    _require_manager(restaurant,_require_auth(request))
    template=restaurant.service_templates.filter(pk=template_id).first()
    if not template: raise NotFound()
    if request.method=='DELETE':
        template.delete()
        return Response(status=204)
    data=definition(request.data.get('definition',{}))
    data['tasks']=[{**t,'done':False} for t in data['tasks']]
    weekday=serializers.IntegerField(min_value=0,max_value=6).run_validation(request.data.get('weekday',template.weekday))
    apply=serializers.BooleanField().run_validation(request.data.get('apply_future',False))
    updated=0
    if apply:
        for service in template.occurrences.filter(date__gte=timezone.localdate()).order_by('date','id'):
            if service.slots.filter(status='published').exists(): continue
            apply_definition(service,data,merge=True)
            updated+=1
    template.weekday=weekday
    change_template(template,data,timezone.localdate())
    return Response(dict(**serialize_template(template),updated_services=updated))


@api_view(['GET','POST'])
@transaction.atomic
def services(request,slug):
    restaurant=_get_restaurant(slug)
    profile=_require_auth(request)
    _require_team(restaurant,profile)
    if request.method=='GET':
        rows=restaurant.services.all()
        for key,lookup in [('from','date__gte'),('to','date__lte')]:
            if request.query_params.get(key):rows=rows.filter(**{lookup:parse_date(request.query_params[key])})
        return Response([serialize_service(s) for s in rows])
    _require_manager(restaurant,profile)
    when=parse_date(request.data.get('date'))
    template=None
    if request.data.get('template_id'):
        template=restaurant.service_templates.filter(pk=request.data['template_id']).first()
        if not template:raise NotFound('Modèle introuvable.')
    data=definition(request.data.get('definition') or (template.definition if template else {}))
    recurring=serializers.BooleanField().run_validation(request.data.get('recurring',False))
    if recurring and not template:
        template=ServiceTemplate.objects.create(restaurant=restaurant,name=data['title'],weekday=when.weekday(),definition={**deepcopy(data),'tasks':[{**t,'done':False} for t in data['tasks']]},starts_on=when)
    count=serializers.IntegerField(min_value=1,max_value=26).run_validation(request.data.get('repeat_weeks',1))
    interval=serializers.IntegerField(min_value=1,max_value=4).run_validation(request.data.get('repeat_interval',1))
    result=[]
    for i in range(count):
        day=when+timedelta(weeks=i*interval)
        if template and restaurant.services.filter(template=template,date=day).exists():continue
        service=RestaurantService.objects.create(restaurant=restaurant,template=template,date=day,
            template_snapshot=deepcopy(template.definition) if template else {},**{k:data[k] for k in FIELDS})
        fresh=deepcopy(data)
        fresh['tasks']=[{**t,'done':False} for t in fresh['tasks']]
        apply_definition(service,fresh)
        result.append(serialize_service(service))
    return Response(result,status=201)


@api_view(['PATCH','DELETE'])
@transaction.atomic
def service_detail(request,slug,service_id):
    restaurant=_get_restaurant(slug)
    profile=_require_auth(request)
    _require_team(restaurant,profile)
    service=restaurant.services.filter(pk=service_id).first()
    if not service:raise NotFound()
    if request.method=='PATCH' and set(request.data)=={'task_key','done'}:
        done=serializers.BooleanField().run_validation(request.data['done'])
        tasks=deepcopy(service.tasks)
        task=next((t for t in tasks if t['key']==request.data['task_key']),None)
        if task is None:raise NotFound('Tâche introuvable.')
        task['done']=done;service.tasks=tasks;service.save(update_fields=['tasks'])
        return Response(serialize_service(service))
    _require_manager(restaurant,profile)
    scope=serializers.ChoiceField(choices=['this','future']).run_validation(request.query_params.get('scope',request.data.get('scope','this')))
    if request.method=='DELETE':
        if service.template_id:
            ServiceCancellation.objects.get_or_create(template=service.template,date=service.date)
            if scope=='future':
                service.template.ends_on=service.date-timedelta(days=1)
                service.template.save(update_fields=['ends_on'])
                service.template.occurrences.filter(date__gte=service.date).delete()
                return Response(status=204)
        service.delete()
        return Response(status=204)
    data=definition(request.data.get('definition',{}))
    recurring=serializers.BooleanField().run_validation(request.data.get('recurring',False))
    if recurring and not service.template_id:
        template=ServiceTemplate.objects.create(restaurant=restaurant,name=data['title'],weekday=service.date.weekday(),starts_on=service.date,
            definition={**deepcopy(data),'tasks':[{**t,'done':False} for t in data['tasks']]})
        service.template=template
        service.template_snapshot=deepcopy(template.definition)
        service.save(update_fields=['template','template_snapshot'])
    if scope=='future' and service.template_id:
        template=service.template
        clean={**deepcopy(data),'tasks':[{**t,'done':False} for t in data['tasks']]}
        for other in template.occurrences.filter(date__gt=service.date):
            if not other.slots.filter(status='published').exists():
                apply_definition(other,clean,merge=True)
        change_template(template,clean,service.date)
        service.template_snapshot=deepcopy(clean)
        service.save(update_fields=['template_snapshot'])
    apply_definition(service,data)
    return Response(serialize_service(service))


def materialize(restaurant, start, end):
    """Expand a permanent weekly rule only over a bounded requested interval."""
    if end < start or (end-start).days>93:
        raise ValidationError('Choisissez une période de 94 jours maximum.')
    count=0
    for template in restaurant.service_templates.all():
        beginning=max(start,template.starts_on or timezone.localdate())
        finish=min(end,template.ends_on) if template.ends_on else end
        day=beginning+timedelta(days=(template.weekday-beginning.weekday())%7)
        cancelled=set(template.cancellations.filter(date__gte=beginning,date__lte=finish).values_list('date',flat=True))
        while day<=finish:
            if day not in cancelled and not template.occurrences.filter(date=day).exists():
                data=definition_on(template,day)
                data['tasks']=[{**t,'done':False} for t in data['tasks']]
                instance=RestaurantService.objects.create(restaurant=restaurant,template=template,date=day,
                    template_snapshot=deepcopy(data),**{k:data[k] for k in FIELDS})
                apply_definition(instance,data)
                count+=1
            day+=timedelta(days=7)
    return count


@api_view(['POST'])
@transaction.atomic
def prepare_services(request,slug):
    restaurant=_get_restaurant(slug)
    _require_team(restaurant,_require_auth(request))
    start=parse_date(request.data.get('from'))
    end=parse_date(request.data.get('to'))
    count=materialize(restaurant,start,end)
    return Response({'created':count})
