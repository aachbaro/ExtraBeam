"""
api/serializers.py
Layer  : Backend — sérialisation
Role   : Sérialise/désérialise les données pour les endpoints profil, slots, indispos,
         missions et factures.
Depends: api.models (AccountProfile, Skill, Experience, Slot, Unavailability, Mission, Facture)
"""

import re
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from rest_framework import serializers

from .avatar_storage import (
    build_profile_avatar_url,
    delete_profile_avatar_file,
    parse_avatar_upload_data,
    save_profile_avatar,
)
from .models import (
    AccountProfile,
    ClientContact,
    Experience,
    Facture,
    Mission,
    MissionTemplate,
    ProfileContact,
    Skill,
    Slot,
    Unavailability,
)


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ["id", "name"]


class ExperienceSerializer(serializers.ModelSerializer):
    start_date = serializers.DateField(format="%Y-%m-%d", required=False, allow_null=True)
    end_date = serializers.DateField(format="%Y-%m-%d", required=False, allow_null=True)

    class Meta:
        model = Experience
        fields = [
            "id",
            "title",
            "company",
            "start_date",
            "end_date",
            "description",
            "is_current",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs: dict) -> dict:
        attrs = super().validate(attrs)

        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        is_current = attrs.get("is_current", getattr(self.instance, "is_current", False))

        if is_current:
            attrs["end_date"] = None
            end_date = None

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                "La date de fin doit être postérieure à la date de début."
            )

        return attrs


class MissionTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MissionTemplate
        fields = [
            "id",
            "name",
            "establishment",
            "contact_name",
            "contact_email",
            "contact_phone",
            "instructions",
            "establishment_address_line1",
            "establishment_address_line2",
            "establishment_postal_code",
            "establishment_city",
            "establishment_country",
            "mode",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ClientContactProfileSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = AccountProfile
        fields = [
            "id",
            "slug",
            "display_name",
            "avatar_url",
            "job_title",
            "location",
            "bio",
            "phone",
            "address_line1",
            "address_line2",
            "postal_code",
            "city",
            "country",
            "email",
        ]

    def get_email(self, obj: AccountProfile) -> str:
        return obj.user.email or ""

    def get_avatar_url(self, obj: AccountProfile) -> str | None:
        return build_profile_avatar_url(obj, self.context.get("request"))


class ClientContactSerializer(serializers.ModelSerializer):
    profile = ClientContactProfileSerializer(source="contact_profile", read_only=True)
    profile_slug = serializers.SlugField(write_only=True)

    class Meta:
        model = ClientContact
        fields = ["id", "profile", "profile_slug", "created_at"]
        read_only_fields = ["id", "profile", "created_at"]

    def validate_profile_slug(self, value: str) -> str:
        profile = AccountProfile.objects.filter(slug=value).first()
        if not profile:
            raise serializers.ValidationError("Profil introuvable.")
        if profile.role != AccountProfile.ROLE_FREELANCE:
            raise serializers.ValidationError("Seuls les profils freelance peuvent etre ajoutes aux contacts.")
        return value


class ProfileSearchSerializer(serializers.ModelSerializer):
    """Profil public léger — utilisé pour la recherche et la liste de contacts."""
    avatar_url = serializers.SerializerMethodField()
    role = serializers.CharField()

    class Meta:
        model = AccountProfile
        fields = ["id", "slug", "display_name", "avatar_url", "job_title", "location", "role"]

    def get_avatar_url(self, obj: AccountProfile) -> str | None:
        return build_profile_avatar_url(obj, self.context.get("request"))


class ProfileContactSerializer(serializers.ModelSerializer):
    """Un lien de contact — inclut le profil de l'autre partie."""
    profile = serializers.SerializerMethodField()
    i_initiated = serializers.SerializerMethodField()

    class Meta:
        model = ProfileContact
        fields = ["link_id", "profile", "i_initiated", "created_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["link_id"] = instance.pk
        return ret

    def get_profile(self, obj: ProfileContact) -> dict:
        my_profile = self.context.get("my_profile")
        other = obj.to_profile if (my_profile and obj.from_profile_id == my_profile.pk) else obj.from_profile
        return ProfileSearchSerializer(other, context=self.context).data

    def get_i_initiated(self, obj: ProfileContact) -> bool:
        my_profile = self.context.get("my_profile")
        return my_profile is not None and obj.from_profile_id == my_profile.pk


class SlotSerializer(serializers.ModelSerializer):
    """Slot avec référence optionnelle à sa mission."""
    start = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S")
    end = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S")
    mission_id    = serializers.PrimaryKeyRelatedField(
        source="mission",
        queryset=Mission.objects.all(),
        required=False,
        allow_null=True,
    )
    mission_title = serializers.SerializerMethodField()

    class Meta:
        model = Slot
        fields = ["id", "title", "start", "end", "mission_id", "mission_title"]

    def get_mission_title(self, obj: Slot) -> str | None:
        return obj.mission.title if obj.mission_id else None


class UnavailabilitySerializer(serializers.ModelSerializer):
    def validate(self, attrs: dict) -> dict:
        attrs = super().validate(attrs)

        recurrence_type = attrs.get(
            "recurrence_type",
            getattr(self.instance, "recurrence_type", Unavailability.RECURRENCE_ONCE),
        )
        weekday = attrs.get("weekday", getattr(self.instance, "weekday", None))
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        recurrence_end = attrs.get(
            "recurrence_end", getattr(self.instance, "recurrence_end", None)
        )

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError(
                {"end_time": "L'heure de fin doit être après l'heure de début."}
            )

        if recurrence_type == Unavailability.RECURRENCE_WEEKLY:
            if weekday is None:
                raise serializers.ValidationError(
                    {"weekday": "Le jour de la semaine est requis."}
                )
            return attrs

        if start_date is None:
            raise serializers.ValidationError(
                {"start_date": "La date de début est requise."}
            )

        if recurrence_end is None:
            attrs["recurrence_end"] = start_date
            recurrence_end = start_date

        if recurrence_end and recurrence_end < start_date:
            raise serializers.ValidationError(
                {"recurrence_end": "La date de fin doit être après la date de début."}
            )

        return attrs

    class Meta:
        model = Unavailability
        fields = [
            "id",
            "recurrence_type",
            "weekday",
            "start_date",
            "start_time",
            "end_time",
            "recurrence_end",
            "exceptions",
        ]


class ProfilePublicSerializer(serializers.ModelSerializer):
    """Sérialise un profil public (lecture seule, inclut skills + experiences)."""

    PRIVATE_OWNER_FIELDS = {
        "siret",
        "legal_status",
        "vat_number",
        "vat_notice",
        "iban",
        "bic",
        "hourly_rate",
        "currency",
        "payment_terms",
        "late_penalties",
        "subscription_status",
        "subscription_plan",
        "hourly_rate_public",
    }

    email = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    skills = SkillSerializer(many=True, read_only=True)
    experiences = ExperienceSerializer(many=True, read_only=True)

    class Meta:
        model = AccountProfile
        fields = [
            "id",
            "slug",
            "display_name",
            "avatar_url",
            "role",
            "job_title",
            "location",
            "bio",
            "phone",
            "address_line1",
            "address_line2",
            "postal_code",
            "city",
            "country",
            "siret",
            "legal_status",
            "vat_number",
            "vat_notice",
            "iban",
            "bic",
            "hourly_rate",
            "hourly_rate_public",
            "currency",
            "payment_terms",
            "late_penalties",
            "subscription_status",
            "subscription_plan",
            "subscription_period_end",
            "subscription_cancel_at_period_end",
            "email",
            "skills",
            "experiences",
        ]

    def get_email(self, obj: AccountProfile) -> str:
        return obj.user.email or ""

    def get_avatar_url(self, obj: AccountProfile) -> str | None:
        return build_profile_avatar_url(obj, self.context.get("request"))

    def to_representation(self, instance: AccountProfile) -> dict:
        data = super().to_representation(instance)
        if self.context.get("include_private"):
            return data

        for field_name in self.PRIVATE_OWNER_FIELDS:
            if field_name == "hourly_rate":
                data[field_name] = str(instance.hourly_rate) if instance.hourly_rate_public and instance.hourly_rate else None
            elif field_name == "hourly_rate_public":
                data[field_name] = instance.hourly_rate_public
            else:
                data[field_name] = ""
        data["subscription_period_end"] = None
        data["subscription_cancel_at_period_end"] = False
        return data


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Désérialise une mise à jour partielle du profil (owner uniquement)."""

    avatar_url = serializers.CharField(required=False, allow_blank=True)
    avatar_upload_data = serializers.CharField(
        required=False, allow_blank=False, write_only=True
    )
    avatar_remove = serializers.BooleanField(required=False, default=False, write_only=True)
    hourly_rate = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )

    def validate_role(self, value: str) -> str:
        if value == AccountProfile.ROLE_ADMIN and (not self.instance or self.instance.role != AccountProfile.ROLE_ADMIN):
            raise serializers.ValidationError("Le role admin ne peut pas etre attribue depuis l'application.")
        return value

    def validate_siret(self, value: str) -> str:
        normalized = re.sub(r"\s+", "", value or "")
        if not normalized:
            return ""
        if not re.fullmatch(r"\d{14}", normalized):
            raise serializers.ValidationError("Le SIRET doit contenir 14 chiffres.")
        return normalized

    def validate_currency(self, value: str) -> str:
        return value.strip().upper()

    def validate_avatar_url(self, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            return ""

        validator = URLValidator(schemes=["http", "https"])
        try:
            validator(normalized)
        except DjangoValidationError as exc:
            raise serializers.ValidationError("URL d'avatar invalide.") from exc
        return normalized

    def validate_avatar_upload_data(self, value: str) -> str:
        try:
            parse_avatar_upload_data(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return value

    def validate(self, attrs: dict) -> dict:
        attrs = super().validate(attrs)
        if attrs.get("avatar_upload_data") and attrs.get("avatar_url"):
            raise serializers.ValidationError(
                {"avatar_upload_data": "Choisir soit un fichier, soit une URL externe."}
            )
        return attrs

    def update(self, instance: AccountProfile, validated_data: dict) -> AccountProfile:
        avatar_upload_data = validated_data.pop("avatar_upload_data", None)
        avatar_remove = validated_data.pop("avatar_remove", False)
        avatar_url_provided = "avatar_url" in validated_data
        avatar_url = validated_data.pop("avatar_url", None) if avatar_url_provided else None
        current_local_avatar_url = build_profile_avatar_url(
            instance, self.context.get("request")
        )

        for field, value in validated_data.items():
            setattr(instance, field, value)

        if avatar_remove:
            delete_profile_avatar_file(instance)
            instance.avatar_storage_key = ""
            instance.avatar_url = ""
        elif avatar_upload_data:
            instance.avatar_storage_key = save_profile_avatar(instance, avatar_upload_data)
            instance.avatar_url = ""
        elif avatar_url_provided:
            normalized_avatar_url = avatar_url or ""
            if (
                instance.avatar_storage_key
                and normalized_avatar_url
                and normalized_avatar_url == current_local_avatar_url
            ):
                pass
            else:
                delete_profile_avatar_file(instance)
                instance.avatar_storage_key = ""
                instance.avatar_url = normalized_avatar_url

        instance.save()
        return instance

    class Meta:
        model = AccountProfile
        fields = [
            "display_name",
            "avatar_url",
            "avatar_upload_data",
            "avatar_remove",
            "role",
            "job_title",
            "location",
            "bio",
            "phone",
            "address_line1",
            "address_line2",
            "postal_code",
            "city",
            "country",
            "siret",
            "legal_status",
            "vat_number",
            "vat_notice",
            "iban",
            "bic",
            "hourly_rate",
            "hourly_rate_public",
            "currency",
            "payment_terms",
            "late_penalties",
        ]


class MissionSlotSerializer(serializers.ModelSerializer):
    start = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S")
    end = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S")

    class Meta:
        model = Slot
        fields = ["id", "title", "start", "end"]
        read_only_fields = ["id"]

    def validate(self, attrs: dict) -> dict:
        attrs = super().validate(attrs)
        start = attrs.get("start", getattr(self.instance, "start", None))
        end = attrs.get("end", getattr(self.instance, "end", None))
        if start and end and end <= start:
            raise serializers.ValidationError(
                "L'heure de fin d'un créneau doit être postérieure à l'heure de début."
            )
        return attrs


class MissionSerializer(serializers.ModelSerializer):
    """Sérialise une mission complète (lecture + écriture pour l'owner)."""

    title = serializers.CharField(required=False, allow_blank=True)
    slot_count = serializers.SerializerMethodField()
    slots = MissionSlotSerializer(many=True, required=False)
    profile_slug = serializers.SerializerMethodField()
    profile_display_name = serializers.SerializerMethodField()
    client_profile_slug = serializers.SerializerMethodField()
    client_profile_display_name = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = [
            "id",
            "title",
            "description",
            "status",
            "notes",
            "establishment",
            "establishment_address_line1",
            "establishment_address_line2",
            "establishment_postal_code",
            "establishment_city",
            "establishment_country",
            "contact_name",
            "contact_email",
            "contact_phone",
            "instructions",
            "mode",
            "client_name",
            "client_email",
            "client_phone",
            "client_company",
            "daily_rate",
            "total_amount",
            "start_date",
            "end_date",
            "slots",
            "profile_slug",
            "profile_display_name",
            "client_profile_slug",
            "client_profile_display_name",
            "slot_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "profile_slug",
            "profile_display_name",
            "client_profile_slug",
            "client_profile_display_name",
            "slot_count",
            "created_at",
            "updated_at",
        ]

    def get_slot_count(self, obj: Mission) -> int:
        return obj.slots.count()

    def get_profile_slug(self, obj: Mission) -> str | None:
        return obj.profile.slug

    def get_profile_display_name(self, obj: Mission) -> str:
        return obj.profile.display_name or obj.profile.user.email or obj.profile.user.username

    def get_client_profile_slug(self, obj: Mission) -> str | None:
        if not obj.client_profile_id:
            return None
        return obj.client_profile.slug

    def get_client_profile_display_name(self, obj: Mission) -> str | None:
        if not obj.client_profile_id:
            return None
        return (
            obj.client_profile.display_name
            or obj.client_profile.user.email
            or obj.client_profile.user.username
        )

    def _derive_title(self, validated_data: dict) -> str:
        title = str(validated_data.get("title", "")).strip()
        if title:
            return title

        establishment = str(validated_data.get("establishment", "")).strip()
        client_company = str(validated_data.get("client_company", "")).strip()
        client_name = str(validated_data.get("client_name", "")).strip()
        return establishment or client_company or client_name or "Mission proposée"

    def _apply_slot_dates(self, validated_data: dict, slots_data: list[dict] | None) -> None:
        if not slots_data:
            return
        ordered_slots = sorted(slots_data, key=lambda slot: slot["start"])
        if not validated_data.get("start_date"):
            validated_data["start_date"] = ordered_slots[0]["start"].date()
        if not validated_data.get("end_date"):
            validated_data["end_date"] = ordered_slots[-1]["end"].date()

    def _sync_slots(self, mission: Mission, slots_data: list[dict] | None) -> None:
        if slots_data is None:
            return

        mission.slots.all().delete()

        created_slots: list[Slot] = []
        for slot_data in slots_data:
            created_slots.append(
                Slot.objects.create(
                    profile=mission.profile,
                    mission=mission,
                    title=slot_data.get("title", "").strip() or mission.title,
                    start=slot_data["start"],
                    end=slot_data["end"],
                )
            )

        if created_slots and (not mission.start_date or not mission.end_date):
            mission.start_date = min(slot.start.date() for slot in created_slots)
            mission.end_date = max(slot.end.date() for slot in created_slots)
            mission.save(update_fields=["start_date", "end_date", "updated_at"])

    def validate(self, attrs: dict) -> dict:
        attrs = super().validate(attrs)
        slots_data = attrs.get("slots")
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                "La date de fin doit être postérieure à la date de début."
            )

        if self.context.get("proposal_mode"):
            establishment = str(
                attrs.get("establishment", getattr(self.instance, "establishment", ""))
            ).strip()
            contact_email = str(
                attrs.get("contact_email", getattr(self.instance, "contact_email", ""))
            ).strip()
            if not establishment:
                raise serializers.ValidationError(
                    {"establishment": "L'établissement est requis pour proposer une mission."}
                )
            if not contact_email:
                raise serializers.ValidationError(
                    {"contact_email": "L'email de contact est requis pour proposer une mission."}
                )
            if not slots_data:
                raise serializers.ValidationError(
                    {"slots": "Au moins un créneau est requis pour proposer une mission."}
                )

        return attrs

    def create(self, validated_data: dict) -> Mission:
        slots_data = validated_data.pop("slots", None)
        validated_data["title"] = self._derive_title(validated_data)
        self._apply_slot_dates(validated_data, slots_data)
        mission = Mission.objects.create(**validated_data)
        self._sync_slots(mission, slots_data)
        return mission

    def update(self, instance: Mission, validated_data: dict) -> Mission:
        slots_data = validated_data.pop("slots", None)
        if "title" in validated_data:
            validated_data["title"] = self._derive_title(validated_data)
        self._apply_slot_dates(validated_data, slots_data)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        self._sync_slots(instance, slots_data)
        return instance


class FactureSerializer(serializers.ModelSerializer):
    """Sérialise une facture owner-only avec mission liée optionnelle."""

    date_emission = serializers.DateField(format="%Y-%m-%d", required=False)
    date_echeance = serializers.DateField(
        format="%Y-%m-%d", required=False, allow_null=True
    )
    mission_id = serializers.PrimaryKeyRelatedField(
        source="mission",
        queryset=Mission.objects.all(),
        required=False,
        allow_null=True,
    )
    mission_title = serializers.SerializerMethodField()
    profile_slug = serializers.SerializerMethodField()
    profile_display_name = serializers.SerializerMethodField()

    class Meta:
        model = Facture
        fields = [
            "id",
            "mission_id",
            "mission_title",
            "numero",
            "date_emission",
            "status",
            "client_name",
            "client_address_ligne1",
            "client_address_ligne2",
            "client_code_postal",
            "client_ville",
            "client_pays",
            "client_siren",
            "client_siret",
            "client_vat_number",
            "contact_name",
            "contact_phone",
            "contact_email",
            "description",
            "hours",
            "rate",
            "montant_ht",
            "tva",
            "montant_ttc",
            "mention_tva",
            "date_echeance",
            "conditions_paiement",
            "escompte",
            "penalites_retard",
            "indemnite_recouvrement",
            "profile_slug",
            "profile_display_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "mission_title", "created_at", "updated_at"]

    def get_mission_title(self, obj: Facture) -> str | None:
        return obj.mission.title if obj.mission_id else None

    def get_profile_slug(self, obj: Facture) -> str | None:
        return obj.profile.slug

    def get_profile_display_name(self, obj: Facture) -> str:
        return obj.profile.display_name or obj.profile.user.email or obj.profile.user.username

    def validate_numero(self, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"\d{4}-\d{1,}", normalized):
            raise serializers.ValidationError(
                "Format invalide. Utiliser AAAA-NNNN (ex: 2026-0001)."
            )
        return normalized

    def validate(self, attrs: dict) -> dict:
        profile = self.context.get("profile") or getattr(self.instance, "profile", None)
        mission = attrs.get("mission", getattr(self.instance, "mission", None))
        numero = attrs.get("numero", getattr(self.instance, "numero", ""))

        if profile and mission and mission.profile_id != profile.id:
            raise serializers.ValidationError(
                {"mission_id": "La mission choisie n'appartient pas à ce profil."}
            )

        if profile and numero:
            existing = Facture.objects.filter(profile=profile, numero=numero)
            if self.instance is not None:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(
                    {"numero": "Ce numéro de facture existe déjà pour ce profil."}
                )

        hours = attrs.get("hours", getattr(self.instance, "hours", None))
        rate = attrs.get("rate", getattr(self.instance, "rate", None))
        montant_ht = attrs.get("montant_ht", getattr(self.instance, "montant_ht", None))
        tva = attrs.get("tva", getattr(self.instance, "tva", Decimal("0")))
        montant_ttc = attrs.get("montant_ttc", getattr(self.instance, "montant_ttc", None))

        if montant_ht is None:
            if hours is not None and rate is not None:
                montant_ht = Decimal(hours) * Decimal(rate)
                attrs["montant_ht"] = montant_ht
            else:
                raise serializers.ValidationError(
                    {"montant_ht": "Le montant HT est requis."}
                )

        if montant_ttc is None:
            attrs["montant_ttc"] = montant_ht * (
                Decimal("1") + (Decimal(tva or 0) / Decimal("100"))
            )

        return attrs


class AdminAccountSummarySerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    skill_count = serializers.IntegerField(read_only=True)
    slot_count = serializers.IntegerField(read_only=True)
    mission_count = serializers.IntegerField(read_only=True)
    unavailability_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = AccountProfile
        fields = [
            "id",
            "slug",
            "display_name",
            "avatar_url",
            "role",
            "auth_provider",
            "job_title",
            "location",
            "email",
            "skill_count",
            "slot_count",
            "mission_count",
            "unavailability_count",
            "created_at",
            "updated_at",
        ]

    def get_email(self, obj: AccountProfile) -> str:
        return obj.user.email or ""

    def get_avatar_url(self, obj: AccountProfile) -> str | None:
        return build_profile_avatar_url(obj, self.context.get("request"))


class AdminAccountDetailSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = AccountProfile
        fields = [
            "id",
            "slug",
            "display_name",
            "avatar_url",
            "role",
            "auth_provider",
            "google_sub",
            "oidc_sub",
            "job_title",
            "location",
            "bio",
            "phone",
            "address_line1",
            "address_line2",
            "postal_code",
            "city",
            "country",
            "siret",
            "legal_status",
            "vat_number",
            "vat_notice",
            "iban",
            "bic",
            "hourly_rate",
            "currency",
            "payment_terms",
            "late_penalties",
            "email",
            "created_at",
            "updated_at",
        ]

    def get_email(self, obj: AccountProfile) -> str:
        return obj.user.email or ""

    def get_avatar_url(self, obj: AccountProfile) -> str | None:
        return build_profile_avatar_url(obj, self.context.get("request"))
