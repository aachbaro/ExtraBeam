from rest_framework import serializers
from .models import Restaurant, RestaurantMember, RestaurantShift, ShiftAvailability, ShiftAssignment


class RestaurantMemberSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    extra_slug = serializers.SerializerMethodField()

    class Meta:
        model = RestaurantMember
        fields = [
            "id", "name", "position", "is_active", "is_manager",
            "email", "joined_at", "avatar_url", "extra_slug",
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
            "avatar_url", "status", "note", "created_at",
        ]
        read_only_fields = ["id", "member_id", "member_name", "member_position", "avatar_url", "created_at"]

    def get_avatar_url(self, obj):
        if obj.member.profile:
            return obj.member.profile.avatar_url
        return None


class RestaurantShiftSerializer(serializers.ModelSerializer):
    availabilities = ShiftAvailabilitySerializer(many=True, read_only=True)
    assignments = ShiftAssignmentSerializer(many=True, read_only=True)
    assigned_count = serializers.SerializerMethodField()
    available_count = serializers.SerializerMethodField()

    class Meta:
        model = RestaurantShift
        fields = [
            "id", "title", "date", "start_time", "end_time",
            "service", "positions_needed", "position", "notes", "status",
            "created_at", "updated_at",
            "availabilities", "assignments",
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
            "id", "title", "date", "start_time", "end_time",
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
            "cuisine_type", "logo_url", "cover_url",
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


class RestaurantMemberCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantMember
        fields = ["name", "position", "email", "is_manager"]


class RestaurantMemberUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantMember
        fields = ["name", "position", "is_active", "is_manager"]


class RestaurantShiftCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantShift
        fields = ["title", "date", "start_time", "end_time", "service", "positions_needed", "position", "notes"]

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError("L'heure de fin doit être postérieure à l'heure de début.")
        return attrs


class RestaurantShiftUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantShift
        fields = ["title", "date", "start_time", "end_time", "service", "positions_needed", "position", "notes", "status"]

    def validate(self, attrs):
        start = attrs.get("start_time", self.instance.start_time if self.instance else None)
        end = attrs.get("end_time", self.instance.end_time if self.instance else None)
        if start and end and end <= start:
            raise serializers.ValidationError("L'heure de fin doit être postérieure à l'heure de début.")
        return attrs
