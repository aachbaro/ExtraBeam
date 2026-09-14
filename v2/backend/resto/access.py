"""Restaurant-scoped employee PIN sessions and the shared skill catalogue."""
import hashlib
import re
import secrets
import unicodedata
from datetime import timedelta
from django.contrib.auth.hashers import make_password, check_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.response import Response
from .models import RestaurantMember, EmployeeSession, RestaurantSkill
from .views import _get_restaurant, _require_auth, _require_manager
from .services import materialize, parse_date
from . import scheduling


def normalized(name):
    return unicodedata.normalize('NFKC',name.strip()).casefold()


@api_view(['GET','POST'])
@transaction.atomic
def skills(request,slug):
    restaurant=_get_restaurant(slug)
    _require_manager(restaurant,_require_auth(request))
    known={normalized(s.name):s.name for s in restaurant.skill_catalog.all()}
    for m in restaurant.members.all():
        for name in m.skills:known.setdefault(normalized(name),name)
    if request.method=='GET':
        return Response(sorted(known.values(),key=str.casefold))
    name=serializers.CharField(max_length=40).run_validation(request.data.get('name'))
    key=normalized(name)
    if key in known:return Response({'name':known[key],'created':False})
    ids=serializers.ListField(child=serializers.IntegerField(min_value=1),allow_empty=False,max_length=100).run_validation(request.data.get('member_ids'))
    members=list(restaurant.members.filter(pk__in=ids,is_active=True))
    if len(members)!=len(set(ids)):raise ValidationError('Choisissez des employés actifs de ce restaurant.')
    skill=RestaurantSkill.objects.create(restaurant=restaurant,name=name.strip(),normalized=key)
    for member in members:
        member.skills=[*member.skills,skill.name]
        member.save(update_fields=['skills'])
    return Response({'name':skill.name,'created':True},status=201)


@api_view(['POST'])
@transaction.atomic
def set_pin(request,slug,member_id):
    restaurant=_get_restaurant(slug)
    profile=_require_auth(request)
    if restaurant.owner_id!=profile.id:raise PermissionDenied('Seul le propriétaire gère les accès PIN.')
    member=restaurant.members.filter(pk=member_id,is_active=True).first()
    if not member:raise NotFound()
    pin=request.data.get('pin','')
    if not isinstance(pin,str) or not re.fullmatch(r'\d{4,8}',pin,flags=re.ASCII):
        raise ValidationError('Le PIN doit contenir 4 à 8 chiffres.')
    member.pin_hash=make_password(pin)
    member.pin_failures=0;member.pin_locked_until=None
    member.save(update_fields=['pin_hash','pin_failures','pin_locked_until'])
    member.pin_sessions.all().delete()
    return Response({'configured':True})


def employee(request,restaurant):
    token=request.headers.get('X-Resto-Session','')
    if not token:raise PermissionDenied('Connectez-vous avec votre PIN.')
    session=EmployeeSession.objects.select_related('member').filter(token_hash=hashlib.sha256(token.encode()).hexdigest(),member__restaurant=restaurant,member__is_active=True,expires_at__gt=timezone.now()).first()
    if not session:raise PermissionDenied('Session expirée. Connectez-vous de nouveau.')
    return session.member


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def people(request,slug):
    restaurant=_get_restaurant(slug)
    return Response({'restaurant':restaurant.name,'people':list(restaurant.members.filter(is_active=True).exclude(pin_hash='').values('id','name'))})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@transaction.atomic
def login(request,slug):
    restaurant=_get_restaurant(slug)
    identifier=serializers.IntegerField(min_value=1).run_validation(request.data.get('member_id'))
    member=restaurant.members.select_for_update().filter(pk=identifier,is_active=True).first()
    now=timezone.now()
    if not member or not member.pin_hash:return Response({'detail':'Nom ou PIN incorrect.'},status=400)
    if member.pin_locked_until and member.pin_locked_until>now:
        return Response({'detail':'Trop de tentatives. Réessayez dans 15 minutes.'},status=429)
    pin=request.data.get('pin')
    if not isinstance(pin,str) or len(pin)>8 or not check_password(pin,member.pin_hash):
        member.pin_failures=(member.pin_failures if not member.pin_locked_until else 0)+1
        member.pin_locked_until=now+timedelta(minutes=15) if member.pin_failures>=5 else None
        member.save(update_fields=['pin_failures','pin_locked_until'])
        return Response({'detail':'Nom ou PIN incorrect.'},status=400)
    member.pin_failures=0;member.pin_locked_until=None
    member.save(update_fields=['pin_failures','pin_locked_until'])
    member.pin_sessions.filter(expires_at__lte=now).delete()
    token=secrets.token_urlsafe(32)
    EmployeeSession.objects.create(member=member,token_hash=hashlib.sha256(token.encode()).hexdigest(),expires_at=now+timedelta(days=7))
    return Response({'token':token,'name':member.name})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@transaction.atomic
def board(request,slug):
    restaurant=_get_restaurant(slug)
    member=employee(request,restaurant)
    start=parse_date(request.data.get('from'));end=parse_date(request.data.get('to'))
    materialize(restaurant,start,end)
    rows=[]
    for shift in restaurant.shifts.filter(date__gte=start,date__lte=end).select_related('service_instance'):
        if shift.position!=member.position and shift.position not in member.skills:continue
        if not scheduling.has_skills(member,shift.required_skills):continue
        av=shift.availabilities.filter(member=member).first()
        mine=shift.assignments.filter(member=member).exclude(status='declined').exists()
        rows.append({'id':shift.id,'date':shift.date,'title':shift.service_instance.title if shift.service_instance_id else shift.title,
            'start':shift.start_time,'end':shift.end_time,'role':shift.position,'required':shift.required_skills,
            'response':av.status if av else '', 'effective':scheduling.availability(member,shift),
            'assigned':mine and shift.status=='published','break_minutes':shift.break_minutes})
    return Response({'name':member.name,'default_availability':member.default_availability,'slots':rows})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@transaction.atomic
def availability(request,slug):
    restaurant=_get_restaurant(slug)
    member=employee(request,restaurant)
    status=serializers.ChoiceField(choices=['unknown','available','maybe','unavailable']).run_validation(request.data.get('status'))
    if request.data.get('shift_id') is None:
        member.default_availability=status;member.save(update_fields=['default_availability'])
    else:
        shift=restaurant.shifts.filter(pk=request.data['shift_id']).first()
        if not shift:raise NotFound()
        if shift.position!=member.position and shift.position not in member.skills or not scheduling.has_skills(member,shift.required_skills):
            raise PermissionDenied('Ce poste ne correspond pas à vos compétences.')
        if status=='unknown':shift.availabilities.filter(member=member).delete()
        else:shift.availabilities.update_or_create(member=member,defaults={'status':status})
    return Response({'saved':True})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def logout(request,slug):
    restaurant=_get_restaurant(slug)
    token=request.headers.get('X-Resto-Session','')
    EmployeeSession.objects.filter(token_hash=hashlib.sha256(token.encode()).hexdigest(),member__restaurant=restaurant).delete()
    return Response(status=204)
