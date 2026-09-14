from rest_framework import serializers
from .models import Restaurant, RestaurantMember, RestaurantShift, ShiftAvailability, ShiftAssignment


class RestaurantMemberSerializer(serializers.ModelSerializer):
    pin_configured = serializers.SerializerMethodField()

    def get_pin_configured(self, obj):
        return bool(obj.pin_hash)

    avatar_url = serializers.SerializerMethodField()
    extra_slug = serializers.SerializerMethodField()

    class Meta:
        model = RestaurantMember
        fields = [
            "id", "name", "position", "is_active", "is_manager",
            "pin_configured", "email", "joined_at", "avatar_url", "extra_slug", "weekly_hours", "skills", "preferences", "default_availability",
        ]
        read_only_fields = ["id", "joined_at", "avatar_url", "extra_slug"]

    def get_avatar_url(self, obj):
        if obj.profile:
            return obj.profile.avatar_url
        return None

    def get_extra_slug(self, obj):
        if obj.profile:
            return obj.profile.slug
        return None


class ShiftAvailabilitySerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.name", read_only=True)
    member_id = serializers.IntegerField(source="member.id", read_only=True)

    class Meta:
        model = ShiftAvailability
        fields = ["id", "member_id", "member_name", "status", "note", "updated_at"]
        read_only_fields = ["id", "member_id", "member_name", "updated_at"]


class ShiftAssignmentSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.name", read_only=True)
    member_id = serializers.IntegerField(source="member.id", read_only=True)
    member_position = serializers.CharField(source="member.position", read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = ShiftAssignment
        fields = [
            "id", "member_id", "member_name", "member_position",
            "avatar_url", "status", "note", "created_at", "locked",
        ]
        read_only_fields = ["id", "member_id", "member_name", "member_position", "avatar_url", "created_at"]

    def get_avatar_url(self, obj):
        if obj.member.profile:
            return obj.member.profile.avatar_url
        return None


class RestaurantShiftSerializer(serializers.ModelSerializer):
    candidates = serializers.SerializerMethodField()

    def get_candidates(self, obj):
        from .scheduling import candidate_details
        return candidate_details(obj)

    availabilities = ShiftAvailabilitySerializer(many=True, read_only=True)
    assignments = ShiftAssignmentSerializer(many=True, read_only=True)
    assigned_count = serializers.SerializerMethodField()
    available_count = serializers.SerializerMethodField()

    class Meta:
        model = RestaurantShift
        fields = [
            "id", "service_instance_id", "title", "date", "start_time", "end_time",
            "service", "positions_needed", "position", "notes", "status",
            "created_at", "updated_at",
            "availabilities", "assignments", "candidates", "break_minutes", "required_skills", "series_id",
            "assigned_count", "available_count",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_assigned_count(self, obj):
        return obj.assignments.exclude(status="declined").count()

    def get_available_count(self, obj):
        return obj.availabilities.filter(status="available").count()


class RestaurantShiftListSerializer(serializers.ModelSerializer):
    assigned_count = serializers.SerializerMethodField()
    available_count = serializers.SerializerMethodField()

    class Meta:
        model = RestaurantShift
        fields = [
            "id", "service_instance_id", "title", "date", "start_time", "end_time",
            "service", "positions_needed", "position", "notes", "status",
            "assigned_count", "available_count",
        ]

    def get_assigned_count(self, obj):
        return obj.assignments.exclude(status="declined").count()

    def get_available_count(self, obj):
        return obj.availabilities.filter(status="available").count()


class RestaurantSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Restaurant
        fields = [
            "id", "slug", "name", "description", "address", "city",
            "cuisine_type", "logo_url", "cover_url", "planning_rules",
            "created_at", "updated_at", "member_count", "is_owner",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "member_count", "is_owner"]

    def get_member_count(self, obj):
        return obj.members.filter(is_active=True).count()

    def get_is_owner(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request, "profile"):
            return False
        return obj.owner_id == request.profile.id


class RestaurantCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Restaurant
        fields = ["slug", "name", "description", "address", "city", "cuisine_type", "logo_url", "cover_url"]

    def validate_slug(self, value):
        import re
        if not re.match(r'^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$', value):
            raise serializers.ValidationError(
                "Le slug doit contenir 3 à 80 caractères alphanumériques ou tirets."
            )
        return value


class RestaurantUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Restaurant
        fields = ["name", "description", "address", "city", "cuisine_type", "logo_url", "cover_url"]


class MemberPlanningValidation(serializers.ModelSerializer):
    weekly_hours = serializers.FloatField(min_value=0, max_value=60, required=False)
    skills = serializers.ListField(child=serializers.CharField(max_length=40), max_length=20, required=False)
    default_availability = serializers.ChoiceField(choices=["unknown", "available", "maybe", "unavailable"], required=False)
    def validate_preferences(self, value):
        if not isinstance(value, dict) or any(k not in {"compact", "split", "weekends", "evenings", "lunches", "stable", "variety"} or type(v) is not int or v not in (0,1,2) for k,v in value.items()):
            raise serializers.ValidationError("Préférences invalides (0, 1 ou 2).")
        return value

class RestaurantMemberCreateSerializer(MemberPlanningValidation):
    class Meta:
        model = RestaurantMember
        fields = ["name", "position", "email", "is_manager", "weekly_hours", "skills", "preferences", "default_availability"]


class RestaurantMemberUpdateSerializer(MemberPlanningValidation):
    class Meta:
        model = RestaurantMember
        fields = ["name", "position", "is_active", "is_manager", "weekly_hours", "skills", "preferences", "default_availability"]


class RestaurantShiftCreateSerializer(serializers.ModelSerializer):
    fixed_member_id = serializers.IntegerField(min_value=1, required=False, write_only=True)
    positions_needed = serializers.IntegerField(min_value=1, max_value=50, required=False)
    break_minutes = serializers.IntegerField(min_value=0, max_value=180, required=False)
    required_skills = serializers.ListField(child=serializers.CharField(max_length=40), max_length=20, required=False)
    repeat_weeks = serializers.IntegerField(min_value=1, max_value=26, required=False, write_only=True)
    repeat_interval = serializers.IntegerField(min_value=1, max_value=4, required=False, write_only=True)

    class Meta:
        model = RestaurantShift
        fields = ["title", "date", "start_time", "end_time", "service", "positions_needed", "position", "notes", "break_minutes", "required_skills", "repeat_weeks", "repeat_interval", "fixed_member_id"]

    def validate(self, attrs):
        from datetime import datetime, date, timedelta
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end:
            length = ((datetime.combine(date.today(), end)-datetime.combine(date.today(), start)).total_seconds()/60) % 1440
            pause = attrs.get("break_minutes", getattr(self.instance, "break_minutes", 30))
            if not length or pause >= length:
                raise serializers.ValidationError("La durée du service doit dépasser celle de la pause.")
        return attrs

class RestaurantShiftUpdateSerializer(RestaurantShiftCreateSerializer):
    class Meta:
        model = RestaurantShift
        fields = ["title", "date", "start_time", "end_time", "service", "positions_needed", "position", "notes", "status", "break_minutes", "required_skills"]
