from __future__ import annotations

from django.contrib.auth import authenticate, get_user_model
from django.db import transaction

from .avatar_storage import build_profile_avatar_url
from .models import AccountProfile

User = get_user_model()


def get_display_name_for_email(email: str) -> str:
    return email.split("@")[0]


def infer_default_role_for_user(user) -> str:
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return AccountProfile.ROLE_ADMIN
    return AccountProfile.ROLE_FREELANCE


def serialize_profile(profile: AccountProfile, request=None) -> dict:
    user = profile.user
    display_name = profile.display_name or user.first_name or get_display_name_for_email(user.email or user.username)
    avatar_url = build_profile_avatar_url(profile, request)

    return {
        "id": str(profile.pk),
        "slug": profile.slug,
        "email": user.email,
        "display_name": display_name,
        "avatar_url": avatar_url,
        "role": profile.role,
        "auth_provider": profile.auth_provider,
        "oidc_sub": profile.oidc_sub,
    }


def get_user_by_email(email: str):
    return User.objects.filter(email__iexact=email).first()


def get_or_create_profile_for_user(user, **defaults) -> AccountProfile:
    creation_defaults = dict(defaults)
    creation_defaults.setdefault("role", infer_default_role_for_user(user))
    profile, created = AccountProfile.objects.get_or_create(
        user=user, defaults=creation_defaults
    )

    if not created:
        dirty_fields: list[str] = []
        for field_name, field_value in defaults.items():
            if field_value is None:
                continue

            normalized_value = field_value
            if field_name == "avatar_url" and field_value == "":
                normalized_value = ""

            if field_name == "avatar_url" and getattr(profile, "avatar_storage_key", ""):
                continue

            if getattr(profile, field_name) != normalized_value and normalized_value != "":
                setattr(profile, field_name, normalized_value)
                dirty_fields.append(field_name)

        # Profils créés avant la migration du champ slug : forcer la génération.
        # Le save() override génère le slug et l'ajoute automatiquement à update_fields.
        if not profile.slug and "slug" not in dirty_fields:
            dirty_fields.append("slug")

        if dirty_fields:
            profile.save(update_fields=dirty_fields + ["updated_at"])

    return profile


@transaction.atomic
def register_local_account(
    *,
    email: str,
    password: str,
    display_name: str,
    role: str = AccountProfile.ROLE_FREELANCE,
) -> AccountProfile:
    if get_user_by_email(email):
        raise ValueError("Un compte existe deja avec cette adresse email.")

    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=display_name,
    )

    return AccountProfile.objects.create(
        user=user,
        display_name=display_name,
        role=role,
        auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
    )


def authenticate_local_account(*, email: str, password: str) -> AccountProfile | None:
    user = get_user_by_email(email)
    if not user:
        return None

    authenticated_user = authenticate(username=user.username, password=password)
    if not authenticated_user:
        return None

    profile = get_or_create_profile_for_user(
        authenticated_user,
        auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
    )
    # A locally edited profile name is the identity users see in recruitment.
    # Reconnecting must not replace it with a stale Django User.first_name.
    if not profile.display_name:
        profile.display_name = authenticated_user.first_name or get_display_name_for_email(authenticated_user.email or authenticated_user.username)
        profile.save(update_fields=['display_name', 'updated_at'])
    return profile


@transaction.atomic
def get_or_create_google_account(*, email: str, display_name: str, avatar_url: str | None, google_sub: str) -> AccountProfile:
    existing_profile = AccountProfile.objects.filter(google_sub=google_sub).select_related("user").first()
    if existing_profile:
        if display_name and existing_profile.display_name != display_name:
            existing_profile.display_name = display_name
        if (
            avatar_url
            and not existing_profile.avatar_storage_key
            and existing_profile.avatar_url != avatar_url
        ):
            existing_profile.avatar_url = avatar_url
        if existing_profile.auth_provider != AccountProfile.AUTH_PROVIDER_GOOGLE:
            existing_profile.auth_provider = AccountProfile.AUTH_PROVIDER_GOOGLE
        existing_profile.save(update_fields=["display_name", "avatar_url", "auth_provider", "updated_at"])
        return existing_profile

    user = get_user_by_email(email)
    if not user:
        user = User.objects.create_user(
            username=email,
            email=email,
            password=None,
            first_name=display_name,
        )
    elif display_name and user.first_name != display_name:
        user.first_name = display_name
        user.save(update_fields=["first_name"])

    return get_or_create_profile_for_user(
        user,
        display_name=display_name,
        avatar_url=avatar_url or "",
        auth_provider=AccountProfile.AUTH_PROVIDER_GOOGLE,
        google_sub=google_sub,
    )
