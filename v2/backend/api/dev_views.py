"""
api/dev_views.py
Endpoints de développement : créer/lister/supprimer des comptes de test.
Actifs uniquement en mode DEBUG=True.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.response import Response
from rest_framework.views import APIView

from .accounts import get_or_create_profile_for_user, serialize_profile
from .models import AccountProfile, UserApiToken

User = get_user_model()


def _dev_only(view_fn):
    def wrapper(self, request, *args, **kwargs):
        if not settings.DEBUG:
            return Response({"error": "Non disponible en production."}, status=403)
        return view_fn(self, request, *args, **kwargs)
    wrapper.__name__ = view_fn.__name__
    return wrapper


class DevAccountsView(APIView):
    """GET: liste tous les comptes de test avec leur token."""

    @_dev_only
    def get(self, request):
        profiles = AccountProfile.objects.select_related("user").order_by("id")
        result = []
        for profile in profiles:
            api_token = UserApiToken.get_or_create_for_profile(profile)
            result.append({
                "id": str(profile.pk),
                "slug": profile.slug,
                "email": profile.user.email,
                "display_name": profile.display_name or profile.user.username,
                "role": profile.role,
                "token": api_token.token,
                "username": profile.user.username,
            })
        return Response(result)


class DevLoginView(APIView):
    """POST: connexion ou création d'un compte de test par username."""

    @_dev_only
    def post(self, request):
        username = request.data.get("username", "").strip()
        display_name = request.data.get("display_name", "").strip()
        role = request.data.get("role", AccountProfile.ROLE_FREELANCE).strip()
        if not username:
            return Response({"error": "username requis."}, status=400)
        user, _ = User.objects.get_or_create(
            username=username,
            defaults={"email": f"{username}@dev.local", "first_name": display_name or username},
        )
        if display_name and not user.first_name:
            user.first_name = display_name
            user.save(update_fields=["first_name"])
        profile = get_or_create_profile_for_user(user, role=role, display_name=display_name or username)
        if display_name and profile.display_name != display_name:
            profile.display_name = display_name
            profile.save(update_fields=["display_name"])
        api_token = UserApiToken.get_or_create_for_profile(profile)
        return Response({
            "user": serialize_profile(profile, request),
            "access_token": api_token.token,
        })


class DevAccountDeleteView(APIView):
    """DELETE: supprimer un compte de test par username."""

    @_dev_only
    def delete(self, request, username):
        user = User.objects.filter(username=username).first()
        if not user:
            return Response({"error": "Compte introuvable."}, status=404)
        user.delete()
        return Response(status=204)
