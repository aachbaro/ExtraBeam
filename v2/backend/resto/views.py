from django.db.models import Prefetch
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from api.models import AccountProfile

from .models import (
    Restaurant, RestaurantMember, RestaurantShift,
    ShiftAssignment, ShiftAvailability,
)
from .serializers import (
    RestaurantCreateSerializer, RestaurantMemberCreateSerializer,
    RestaurantMemberSerializer, RestaurantMemberUpdateSerializer,
    RestaurantSerializer, RestaurantShiftCreateSerializer,
    RestaurantShiftSerializer,
    RestaurantShiftUpdateSerializer,
    ShiftAssignmentSerializer,
    ShiftAvailabilitySerializer,
)


def _profile(request) -> AccountProfile | None:
    if not request.user or not request.user.is_authenticated:
        return None
    return getattr(request.user, "account_profile", None)


def _require_auth(request) -> AccountProfile:
    profile = _profile(request)
    if not profile:
        raise PermissionDenied("Authentification requise.")
    return profile


def _get_restaurant(slug: str) -> Restaurant:
    try:
        return Restaurant.objects.get(slug=slug)
    except Restaurant.DoesNotExist:
        raise NotFound("Restaurant introuvable.")


def _require_manager(restaurant: Restaurant, profile: AccountProfile):
    if restaurant.owner_id == profile.id:
        return
    if RestaurantMember.objects.filter(
        restaurant=restaurant, profile=profile, is_manager=True, is_active=True
    ).exists():
        return
    raise PermissionDenied("Accès réservé aux responsables du restaurant.")


def _my_member(restaurant: Restaurant, profile: AccountProfile) -> "RestaurantMember | None":
    if not profile:
        return None
    return RestaurantMember.objects.filter(
        restaurant=restaurant, profile=profile, is_active=True
    ).first()


def _is_manager(restaurant: Restaurant, profile: "AccountProfile | None") -> bool:
    if not profile:
        return False
    if restaurant.owner_id == profile.id:
        return True
    return RestaurantMember.objects.filter(
        restaurant=restaurant, profile=profile, is_manager=True, is_active=True
    ).exists()


def _shift_qs(restaurant: Restaurant):
    return restaurant.shifts.prefetch_related(
        Prefetch("availabilities", queryset=ShiftAvailability.objects.select_related("member")),
        Prefetch("assignments", queryset=ShiftAssignment.objects.select_related("member__profile")),
    )


# ---------------------------------------------------------------------------
# Restaurants
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
def restaurants(request):
    if request.method == "GET":
        qs = Restaurant.objects.prefetch_related("members")
        return Response(RestaurantSerializer(qs, many=True).data)

    profile = _require_auth(request)
    ser = RestaurantCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    restaurant = ser.save(owner=profile)
    RestaurantMember.objects.create(
        restaurant=restaurant,
        profile=profile,
        name=profile.display_name or profile.slug or str(profile.id),
        position="manager",
        is_manager=True,
        is_active=True,
        email=profile.user.email or "",
    )
    return Response(RestaurantSerializer(restaurant).data, status=201)


@api_view(["GET", "PATCH"])
def restaurant_detail(request, slug):
    restaurant = _get_restaurant(slug)

    if request.method == "GET":
        profile = _profile(request)
        data = RestaurantSerializer(restaurant).data
        data["is_manager"] = _is_manager(restaurant, profile)
        member = _my_member(restaurant, profile) if profile else None
        data["my_member_id"] = member.id if member else None
        return Response(data)

    profile = _require_auth(request)
    _require_manager(restaurant, profile)
    from .serializers import RestaurantUpdateSerializer
    ser = RestaurantUpdateSerializer(restaurant, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(RestaurantSerializer(restaurant).data)


# ---------------------------------------------------------------------------
# Team members
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
def members(request, slug):
    restaurant = _get_restaurant(slug)

    if request.method == "GET":
        qs = restaurant.members.select_related("profile").order_by("name")
        return Response(RestaurantMemberSerializer(qs, many=True).data)

    profile = _require_auth(request)
    _require_manager(restaurant, profile)

    extra_slug = request.data.get("extra_slug")
    linked = None
    if extra_slug:
        try:
            linked = AccountProfile.objects.get(slug=extra_slug)
        except AccountProfile.DoesNotExist:
            raise ValidationError({"extra_slug": "Profil ExtraBeam introuvable."})
        if RestaurantMember.objects.filter(restaurant=restaurant, profile=linked).exists():
            raise ValidationError({"extra_slug": "Cette personne est déjà membre."})

    ser = RestaurantMemberCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    member = ser.save(restaurant=restaurant, profile=linked)
    return Response(RestaurantMemberSerializer(member).data, status=201)


@api_view(["PATCH", "DELETE"])
def member_detail(request, slug, member_id):
    restaurant = _get_restaurant(slug)
    profile = _require_auth(request)
    _require_manager(restaurant, profile)

    try:
        member = restaurant.members.get(id=member_id)
    except RestaurantMember.DoesNotExist:
        raise NotFound("Membre introuvable.")

    if request.method == "DELETE":
        if member.profile_id == restaurant.owner_id:
            raise PermissionDenied("Le propriétaire ne peut pas être retiré.")
        member.delete()
        return Response(status=204)

    ser = RestaurantMemberUpdateSerializer(member, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(RestaurantMemberSerializer(member).data)


# ---------------------------------------------------------------------------
# Shifts
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
def shifts(request, slug):
    restaurant = _get_restaurant(slug)
    profile = _profile(request)

    if request.method == "GET":
        qs = _shift_qs(restaurant)
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        if not _is_manager(restaurant, profile):
            qs = qs.filter(status="published")
        return Response(RestaurantShiftSerializer(qs, many=True).data)

    profile = _require_auth(request)
    _require_manager(restaurant, profile)
    ser = RestaurantShiftCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    shift = ser.save(restaurant=restaurant)
    return Response(RestaurantShiftSerializer(shift).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
def shift_detail(request, slug, shift_id):
    restaurant = _get_restaurant(slug)

    try:
        shift = _shift_qs(restaurant).get(id=shift_id)
    except RestaurantShift.DoesNotExist:
        raise NotFound("Shift introuvable.")

    if request.method == "GET":
        return Response(RestaurantShiftSerializer(shift).data)

    profile = _require_auth(request)
    _require_manager(restaurant, profile)

    if request.method == "DELETE":
        shift.delete()
        return Response(status=204)

    ser = RestaurantShiftUpdateSerializer(shift, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    shift.refresh_from_db()
    return Response(RestaurantShiftSerializer(shift).data)


# ---------------------------------------------------------------------------
# Shift availability
# ---------------------------------------------------------------------------

@api_view(["GET", "PUT"])
def shift_availability(request, slug, shift_id):
    restaurant = _get_restaurant(slug)
    profile = _require_auth(request)

    try:
        shift = restaurant.shifts.get(id=shift_id)
    except RestaurantShift.DoesNotExist:
        raise NotFound("Shift introuvable.")

    member = _my_member(restaurant, profile)
    if not member:
        raise PermissionDenied("Vous n'êtes pas membre de ce restaurant.")

    if request.method == "GET":
        qs = shift.availabilities.select_related("member")
        if not _is_manager(restaurant, profile):
            qs = qs.filter(member=member)
        return Response(ShiftAvailabilitySerializer(qs, many=True).data)

    status_value = request.data.get("status")
    if status_value not in ("available", "unavailable", "maybe"):
        raise ValidationError({"status": "Valeur invalide."})
    note = request.data.get("note", "")
    if not isinstance(note, str) or len(note) > 200:
        raise ValidationError({"note": "Note trop longue."})

    av, _ = ShiftAvailability.objects.update_or_create(
        shift=shift, member=member,
        defaults={"status": status_value, "note": note},
    )
    return Response(ShiftAvailabilitySerializer(av).data)


# ---------------------------------------------------------------------------
# Shift assignments
# ---------------------------------------------------------------------------

@api_view(["POST"])
def shift_assignments(request, slug, shift_id):
    restaurant = _get_restaurant(slug)
    profile = _require_auth(request)
    _require_manager(restaurant, profile)

    try:
        shift = restaurant.shifts.get(id=shift_id)
    except RestaurantShift.DoesNotExist:
        raise NotFound("Shift introuvable.")

    member_id = request.data.get("member_id")
    try:
        member = restaurant.members.get(id=member_id, is_active=True)
    except RestaurantMember.DoesNotExist:
        raise NotFound("Membre introuvable ou inactif.")

    if shift.assignments.exclude(status="declined").count() >= shift.positions_needed:
        raise ValidationError("Ce shift est déjà complet.")

    assignment, created = ShiftAssignment.objects.get_or_create(
        shift=shift, member=member,
        defaults={"assigned_by": profile, "status": "proposed"},
    )
    if not created:
        assignment.status = "proposed"
        assignment.save(update_fields=["status"])

    return Response(ShiftAssignmentSerializer(assignment).data, status=201 if created else 200)


@api_view(["PATCH", "DELETE"])
def shift_assignment_detail(request, slug, shift_id, assignment_id):
    restaurant = _get_restaurant(slug)
    profile = _require_auth(request)

    try:
        shift = restaurant.shifts.get(id=shift_id)
        assignment = shift.assignments.select_related("member__profile").get(id=assignment_id)
    except (RestaurantShift.DoesNotExist, ShiftAssignment.DoesNotExist):
        raise NotFound("Introuvable.")

    manager = _is_manager(restaurant, profile)
    my_member = _my_member(restaurant, profile)

    if request.method == "DELETE":
        if not manager:
            raise PermissionDenied("Réservé aux responsables.")
        assignment.delete()
        return Response(status=204)

    if my_member and assignment.member_id == my_member.id:
        status_value = request.data.get("status")
        if status_value not in ("confirmed", "declined"):
            raise ValidationError({"status": "Valeur invalide."})
        assignment.status = status_value
        assignment.save(update_fields=["status"])
        return Response(ShiftAssignmentSerializer(assignment).data)

    if manager:
        status_value = request.data.get("status")
        if status_value not in ("proposed", "confirmed", "declined"):
            raise ValidationError({"status": "Valeur invalide."})
        assignment.status = status_value
        assignment.save(update_fields=["status"])
        return Response(ShiftAssignmentSerializer(assignment).data)

    raise PermissionDenied("Action non autorisée.")


# ---------------------------------------------------------------------------
# My restaurants
# ---------------------------------------------------------------------------

@api_view(["GET"])
def my_restaurants(request):
    profile = _require_auth(request)
    owned = Restaurant.objects.filter(owner=profile)
    member_of = Restaurant.objects.filter(
        members__profile=profile, members__is_active=True
    ).exclude(owner=profile)
    qs = (owned | member_of).distinct().prefetch_related("members")
    return Response(RestaurantSerializer(qs, many=True).data)
