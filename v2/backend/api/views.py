"""
api/views.py
Layer  : Backend — vues REST
Role   : Endpoints de l'API ExtraBeam v2.
         Auth (login, register, Google OAuth) + Profile/Slots/Unavailabilities.
Depends: api.accounts, api.models, api.serializers, api.token_auth
"""

import json
from urllib import error, parse, request as urllib_request
from uuid import NAMESPACE_URL, uuid5

from django.conf import settings
from django.db.models import Count, Q
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .accounts import (
    authenticate_local_account,
    get_or_create_google_account,
    register_local_account,
    serialize_profile,
)
from .avatar_storage import get_avatar_file_path, guess_avatar_content_type
from .avatar_storage import delete_profile_avatar_file
from .models import (
    AccountProfile,
    ClientContact,
    Experience,
    Facture,
    Mission,
    MissionTemplate,
    Skill,
    Slot,
    Unavailability,
    UserApiToken,
)
from .serializers import (
    AdminAccountDetailSerializer,
    AdminAccountSummarySerializer,
    ClientContactSerializer,
    ExperienceSerializer,
    FactureSerializer,
    MissionSerializer,
    MissionTemplateSerializer,
    ProfilePublicSerializer,
    ProfileUpdateSerializer,
    SkillSerializer,
    SlotSerializer,
    UnavailabilitySerializer,
)
from .token_auth import ProfileTokenAuthentication

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_mock_user(email: str, display_name: str | None = None, avatar_url: str | None = None) -> dict:
    resolved_display_name = display_name or email.split("@")[0]
    return {
        "id": str(uuid5(NAMESPACE_URL, email)),
        "email": email,
        "display_name": resolved_display_name,
        "avatar_url": avatar_url,
        "role": AccountProfile.ROLE_FREELANCE,
        "slug": None,
        "token": None,
    }


class GoogleOAuthError(Exception):
    pass


def get_request_profile(request: Request) -> AccountProfile | None:
    if not request.user.is_authenticated:
        return None
    return getattr(request.user, "account_profile", None)


def require_admin_profile(request: Request) -> tuple[AccountProfile | None, Response | None]:
    if not request.user.is_authenticated:
        return None, Response({"error": "Authentification requise."}, status=401)

    profile = get_request_profile(request)
    if not profile or profile.role != AccountProfile.ROLE_ADMIN:
        return None, Response({"error": "Acces admin requis."}, status=403)

    return profile, None


def require_client_profile(request: Request) -> tuple[AccountProfile | None, Response | None]:
    if not request.user.is_authenticated:
        return None, Response({"error": "Authentification requise."}, status=401)

    profile = get_request_profile(request)
    if not profile or profile.role != AccountProfile.ROLE_CLIENT:
        return None, Response({"error": "Acces client requis."}, status=403)

    return profile, None


# ---------------------------------------------------------------------------
# Sérialiseurs de requête
# ---------------------------------------------------------------------------

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(
        error_messages={
            "required": "L'adresse email est requise.",
            "blank": "L'adresse email est requise.",
            "invalid": "Adresse email invalide.",
        }
    )
    password = serializers.CharField(
        error_messages={
            "required": "Le mot de passe est requis.",
            "blank": "Le mot de passe est requis.",
        }
    )


class RegisterSerializer(serializers.Serializer):
    display_name = serializers.CharField(
        max_length=150,
        error_messages={
            "required": "Le nom affiché est requis.",
            "blank": "Le nom affiché est requis.",
            "max_length": "Le nom affiché est trop long.",
        },
    )
    email = serializers.EmailField(
        error_messages={
            "required": "L'adresse email est requise.",
            "blank": "L'adresse email est requise.",
            "invalid": "Adresse email invalide.",
        }
    )
    password = serializers.CharField(
        min_length=8,
        error_messages={
            "required": "Le mot de passe est requis.",
            "blank": "Le mot de passe est requis.",
            "min_length": "Le mot de passe doit contenir au moins 8 caractères.",
        },
    )
    role = serializers.ChoiceField(
        choices=[AccountProfile.ROLE_FREELANCE, AccountProfile.ROLE_CLIENT],
        required=False,
        default=AccountProfile.ROLE_FREELANCE,
        error_messages={
            "invalid_choice": "Le role choisi est invalide.",
        },
    )


class GoogleLoginSerializer(serializers.Serializer):
    code = serializers.CharField()


# ---------------------------------------------------------------------------
# Vues — Auth
# ---------------------------------------------------------------------------

class HealthView(APIView):
    def get(self, request: Request) -> Response:
        return Response({"status": "ok", "service": "extrabeam-v2-backend"})


class LoginView(APIView):
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        profile = authenticate_local_account(email=email, password=password)
        if profile:
            api_token = UserApiToken.get_or_create_for_profile(profile)
            return Response({
                "user": serialize_profile(profile, request),
                "access_token": api_token.token,
            })

        if password != "test" or not settings.DEBUG:
            return Response(
                {"error": "Identifiants incorrects"}, status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            "user": build_mock_user(email=email),
            "access_token": "dev-login-token",
        })


class RegisterView(APIView):
    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            profile = register_local_account(
                email=serializer.validated_data["email"],
                password=serializer.validated_data["password"],
                display_name=serializer.validated_data["display_name"].strip(),
                role=serializer.validated_data["role"],
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        api_token = UserApiToken.get_or_create_for_profile(profile)
        return Response(
            {
                "user": serialize_profile(profile, request),
                "access_token": api_token.token,
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Vues — Google OAuth
# ---------------------------------------------------------------------------

def normalize_origin(value: str) -> str:
    return value.rstrip("/")


def get_allowed_google_origins() -> set[str]:
    return {normalize_origin(origin) for origin in settings.GOOGLE_OAUTH_ALLOWED_ORIGINS if origin}


def build_google_claims(payload: dict) -> dict:
    subject = payload.get("sub")
    email = payload.get("email")
    if not subject or not email:
        raise GoogleOAuthError("Le compte Google n'a pas retourné les informations attendues.")
    return {
        "sub": subject,
        "email": email,
        "display_name": payload.get("name") or email.split("@")[0],
        "avatar_url": payload.get("picture"),
    }


def parse_google_error_response(raw_body: str) -> str:
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return "La connexion Google a échoué."
    if isinstance(payload, dict):
        if isinstance(payload.get("error_description"), str):
            return payload["error_description"]
        nested_error = payload.get("error")
        if isinstance(nested_error, dict) and isinstance(nested_error.get("message"), str):
            return nested_error["message"]
        if isinstance(nested_error, str):
            return nested_error
    return "La connexion Google a échoué."


def google_post_form(url: str, form_data: dict[str, str]) -> dict:
    encoded_data = parse.urlencode(form_data).encode("utf-8")
    http_request = urllib_request.Request(
        url,
        data=encoded_data,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(http_request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise GoogleOAuthError(parse_google_error_response(body)) from exc
    except error.URLError as exc:
        raise GoogleOAuthError("Impossible de joindre Google pour le moment.") from exc
    except json.JSONDecodeError as exc:
        raise GoogleOAuthError("La réponse Google est invalide.") from exc


def google_get_json(url: str, access_token: str) -> dict:
    http_request = urllib_request.Request(
        url,
        headers={"Accept": "application/json", "Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    try:
        with urllib_request.urlopen(http_request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise GoogleOAuthError(parse_google_error_response(body)) from exc
    except error.URLError as exc:
        raise GoogleOAuthError("Impossible de joindre Google pour le moment.") from exc
    except json.JSONDecodeError as exc:
        raise GoogleOAuthError("La réponse Google est invalide.") from exc


def validate_google_popup_request(request: Request) -> str:
    requested_with = request.headers.get("X-Requested-With", "")
    if requested_with.lower() != "xmlhttprequest":
        raise GoogleOAuthError("Requete Google invalide.")
    origin = normalize_origin(request.headers.get("Origin", ""))
    if not origin:
        raise GoogleOAuthError("Origine Google manquante.")
    if origin not in get_allowed_google_origins():
        raise GoogleOAuthError("Origine Google non autorisée.")
    return origin


def exchange_google_code(code: str, origin: str) -> str:
    if not settings.GOOGLE_OAUTH_CLIENT_ID or not settings.GOOGLE_OAUTH_CLIENT_SECRET:
        raise GoogleOAuthError("Les credentials Google ne sont pas configurés sur le backend.")
    token_payload = google_post_form(GOOGLE_TOKEN_URL, {
        "code": code,
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
        "redirect_uri": origin,
        "grant_type": "authorization_code",
    })
    access_token = token_payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise GoogleOAuthError("Google n'a pas retourné de token d'accès.")
    return access_token


def fetch_google_claims(access_token: str) -> dict:
    userinfo = google_get_json(GOOGLE_USERINFO_URL, access_token)
    if userinfo.get("email_verified") is False:
        raise GoogleOAuthError("L'adresse email Google n'est pas vérifiée.")
    return build_google_claims(userinfo)


class GoogleLoginView(APIView):
    def post(self, request: Request) -> Response:
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        try:
            origin = validate_google_popup_request(request)
        except GoogleOAuthError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if code == "dev-google-code" and not settings.GOOGLE_OAUTH_CLIENT_ID:
            return Response({
                "user": build_mock_user(email="adam@gmail.com", display_name="Adam"),
                "access_token": "dev-google-token",
            })

        try:
            google_access_token = exchange_google_code(code=code, origin=origin)
            claims = fetch_google_claims(google_access_token)
            profile = get_or_create_google_account(
                email=claims["email"],
                display_name=claims["display_name"],
                avatar_url=claims["avatar_url"],
                google_sub=claims["sub"],
            )
        except GoogleOAuthError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        api_token = UserApiToken.get_or_create_for_profile(profile)
        return Response({
            "user": serialize_profile(profile, request),
            "access_token": api_token.token,
        })


# ---------------------------------------------------------------------------
# Vues — Espace client
# ---------------------------------------------------------------------------

class ClientDashboardView(APIView):
    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request) -> Response:
        profile, err = require_client_profile(request)
        if err:
            return err

        contacts = profile.client_contacts.select_related("contact_profile__user").all()
        missions = Mission.objects.select_related("profile__user", "client_profile__user").prefetch_related(
            "slots"
        ).filter(
            Q(client_profile=profile) | Q(client_email__iexact=profile.user.email)
        ).distinct()
        factures = Facture.objects.select_related("profile__user", "mission").filter(
            contact_email__iexact=profile.user.email
        )

        return Response(
            {
                "profile": ProfilePublicSerializer(
                    profile,
                    context={"request": request, "include_private": True},
                ).data,
                "contacts": ClientContactSerializer(
                    contacts, many=True, context={"request": request}
                ).data,
                "templates": MissionTemplateSerializer(
                    profile.mission_templates.all(), many=True
                ).data,
                "missions": MissionSerializer(missions, many=True).data,
                "factures": FactureSerializer(factures, many=True).data,
            }
        )


class ClientTemplatesView(APIView):
    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request) -> Response:
        profile, err = require_client_profile(request)
        if err:
            return err
        return Response(MissionTemplateSerializer(profile.mission_templates.all(), many=True).data)

    def post(self, request: Request) -> Response:
        profile, err = require_client_profile(request)
        if err:
            return err

        serializer = MissionTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save(profile=profile)
        return Response(MissionTemplateSerializer(template).data, status=201)


class ClientTemplateDetailView(APIView):
    authentication_classes = [ProfileTokenAuthentication]

    def _get_owned_template(self, request: Request, template_id: int):
        profile, err = require_client_profile(request)
        if err:
            return None, err
        template = get_object_or_404(MissionTemplate, pk=template_id, profile=profile)
        return template, None

    def patch(self, request: Request, template_id: int) -> Response:
        template, err = self._get_owned_template(request, template_id)
        if err:
            return err

        serializer = MissionTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MissionTemplateSerializer(template).data)

    def delete(self, request: Request, template_id: int) -> Response:
        template, err = self._get_owned_template(request, template_id)
        if err:
            return err
        template.delete()
        return Response(status=204)


class ClientContactsView(APIView):
    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request) -> Response:
        profile, err = require_client_profile(request)
        if err:
            return err

        contacts = profile.client_contacts.select_related("contact_profile__user").all()
        return Response(
            ClientContactSerializer(contacts, many=True, context={"request": request}).data
        )

    def post(self, request: Request) -> Response:
        profile, err = require_client_profile(request)
        if err:
            return err

        serializer = ClientContactSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        target_profile = get_object_or_404(
            AccountProfile.objects.select_related("user"),
            slug=serializer.validated_data["profile_slug"],
            role=AccountProfile.ROLE_FREELANCE,
        )
        if target_profile.pk == profile.pk:
            return Response({"error": "Impossible de s'ajouter soi-meme en contact."}, status=400)

        contact, created = ClientContact.objects.get_or_create(
            client_profile=profile,
            contact_profile=target_profile,
        )
        status_code = 201 if created else 200
        return Response(
            ClientContactSerializer(contact, context={"request": request}).data,
            status=status_code,
        )


class ClientContactDetailView(APIView):
    authentication_classes = [ProfileTokenAuthentication]

    def delete(self, request: Request, contact_id: int) -> Response:
        profile, err = require_client_profile(request)
        if err:
            return err

        contact = get_object_or_404(ClientContact, pk=contact_id, client_profile=profile)
        contact.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Vues — Profil public
# ---------------------------------------------------------------------------

class ProfileOverviewView(APIView):
    """
    GET /api/profiles/:slug/
    Public. Retourne les infos du profil + unavailabilities + mode (owner/public).
    Les slots sont chargés séparément par l'agenda (GET /api/profiles/:slug/slots/).
    """

    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request, slug: str) -> Response:
        profile = get_object_or_404(
            AccountProfile.objects.select_related("user").prefetch_related(
                "skills", "experiences"
            ),
            slug=slug,
        )
        is_owner = (
            request.user.is_authenticated
            and hasattr(request.user, "account_profile")
            and request.user.account_profile.slug == slug
        )
        if profile.role == AccountProfile.ROLE_CLIENT and not is_owner:
            return Response({"error": "Ce profil n'est pas public."}, status=404)
        return Response({
            "profile": ProfilePublicSerializer(
                profile,
                context={"request": request, "include_private": is_owner},
            ).data,
            "unavailabilities": UnavailabilitySerializer(
                profile.unavailabilities.all(), many=True
            ).data,
            "mode": "owner" if is_owner else "public",
        })

    def patch(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)
        serializer = ProfileUpdateSerializer(
            profile, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        profile.refresh_from_db()
        return Response(
            ProfilePublicSerializer(
                profile,
                context={"request": request, "include_private": True},
            ).data
        )


class ProfileAccountDeleteView(APIView):
    """POST /api/profiles/:slug/account/delete/"""

    authentication_classes = [ProfileTokenAuthentication]

    def post(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)

        profile = get_object_or_404(AccountProfile.objects.select_related("user"), slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)

        confirmation = str(request.data.get("confirmation", "")).strip().upper()
        if confirmation != "SUPPRIMER":
            return Response(
                {"error": "Confirmation invalide. Taper SUPPRIMER pour continuer."},
                status=400,
            )

        if profile.factures.filter(finalized_at__isnull=False).exists():
            return Response({"error": "Ce compte possède des factures finalisées. Leur conservation empêche la suppression automatique du compte."}, status=409)

        delete_profile_avatar_file(profile)
        profile.user.delete()
        return Response({"success": True})


class AvatarFileView(APIView):
    """GET /api/avatars/:avatar_id/"""

    def get(self, request: Request, avatar_id: str):
        profile = get_object_or_404(AccountProfile, avatar_storage_key=avatar_id)
        file_path = get_avatar_file_path(profile.avatar_storage_key)
        if not file_path.exists():
            return Response({"error": "Avatar introuvable."}, status=404)

        return FileResponse(
            file_path.open("rb"),
            content_type=guess_avatar_content_type(profile.avatar_storage_key),
        )


# ---------------------------------------------------------------------------
# Vues — Expériences
# ---------------------------------------------------------------------------

class ExperiencesView(APIView):
    """GET + POST /api/profiles/:slug/experiences/"""

    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request, slug: str) -> Response:
        profile = get_object_or_404(AccountProfile, slug=slug)
        return Response(ExperienceSerializer(profile.experiences.all(), many=True).data)

    def post(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)

        serializer = ExperienceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        experience = serializer.save(profile=profile)
        return Response(ExperienceSerializer(experience).data, status=201)


class ExperienceDetailView(APIView):
    """PATCH + DELETE /api/profiles/:slug/experiences/:experience_id/"""

    authentication_classes = [ProfileTokenAuthentication]

    def patch(self, request: Request, slug: str, experience_id: int) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)

        experience = get_object_or_404(Experience, pk=experience_id, profile=profile)
        serializer = ExperienceSerializer(experience, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ExperienceSerializer(experience).data)

    def delete(self, request: Request, slug: str, experience_id: int) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)

        experience = get_object_or_404(Experience, pk=experience_id, profile=profile)
        experience.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Vues — Skills
# ---------------------------------------------------------------------------

class SkillsView(APIView):
    """GET + POST /api/profiles/:slug/skills/"""

    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request, slug: str) -> Response:
        profile = get_object_or_404(AccountProfile, slug=slug)
        return Response(SkillSerializer(profile.skills.all(), many=True).data)

    def post(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)
        name = str(request.data.get("name", "")).strip()
        if not name:
            return Response({"error": "Le nom est requis."}, status=400)
        skill, created = Skill.objects.get_or_create(profile=profile, name=name)
        return Response(SkillSerializer(skill).data, status=201 if created else 200)


class SkillDetailView(APIView):
    """DELETE /api/profiles/:slug/skills/:skill_id/"""

    authentication_classes = [ProfileTokenAuthentication]

    def delete(self, request: Request, slug: str, skill_id: int) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)
        skill = get_object_or_404(Skill, pk=skill_id, profile=profile)
        skill.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Vues — Slots
# ---------------------------------------------------------------------------

class SlotsView(APIView):
    """GET + POST /api/profiles/:slug/slots/"""

    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request, slug: str) -> Response:
        profile = get_object_or_404(AccountProfile, slug=slug)
        qs = profile.slots.all()
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        if from_date:
            qs = qs.filter(start__date__gte=from_date)
        if to_date:
            qs = qs.filter(end__date__lte=to_date)
        return Response(SlotSerializer(qs, many=True).data)

    def post(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)
        serializer = SlotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        slot = serializer.save(profile=profile)
        return Response(SlotSerializer(slot).data, status=201)


class SlotDetailView(APIView):
    """PATCH + DELETE /api/profiles/:slug/slots/:slot_id/"""

    authentication_classes = [ProfileTokenAuthentication]

    def patch(self, request: Request, slug: str, slot_id: int) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)
        slot = get_object_or_404(Slot, pk=slot_id, profile=profile)
        serializer = SlotSerializer(slot, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SlotSerializer(slot).data)

    def delete(self, request: Request, slug: str, slot_id: int) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)
        slot = get_object_or_404(Slot, pk=slot_id, profile=profile)
        slot.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Vues — Unavailabilities
# ---------------------------------------------------------------------------

class UnavailabilitiesView(APIView):
    """GET + POST /api/profiles/:slug/unavailabilities/"""

    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request, slug: str) -> Response:
        profile = get_object_or_404(AccountProfile, slug=slug)
        return Response(
            UnavailabilitySerializer(profile.unavailabilities.all(), many=True).data
        )

    def post(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)
        serializer = UnavailabilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        unavailability = serializer.save(profile=profile)
        return Response(UnavailabilitySerializer(unavailability).data, status=201)


class UnavailabilityDetailView(APIView):
    """PATCH + DELETE /api/profiles/:slug/unavailabilities/:unavailability_id/"""

    authentication_classes = [ProfileTokenAuthentication]

    def _get_owned(self, request: Request, slug: str, unavailability_id: int):
        if not request.user.is_authenticated:
            return None, Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return None, Response({"error": "Accès refusé."}, status=403)
        obj = get_object_or_404(Unavailability, pk=unavailability_id, profile=profile)
        return obj, None

    def patch(self, request: Request, slug: str, unavailability_id: int) -> Response:
        obj, err = self._get_owned(request, slug, unavailability_id)
        if err:
            return err
        serializer = UnavailabilitySerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UnavailabilitySerializer(obj).data)

    def delete(self, request: Request, slug: str, unavailability_id: int) -> Response:
        obj, err = self._get_owned(request, slug, unavailability_id)
        if err:
            return err
        # Suppression d'une occurrence unique via query param ?exception=YYYY-MM-DD
        exception_date = request.query_params.get("exception")
        if exception_date:
            if exception_date not in obj.exceptions:
                obj.exceptions = [*obj.exceptions, exception_date]
                obj.save(update_fields=["exceptions"])
            return Response(UnavailabilitySerializer(obj).data)
        obj.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Vues — Missions
# ---------------------------------------------------------------------------

class MissionsView(APIView):
    """
    GET  /api/profiles/:slug/missions/  — liste des missions (owner uniquement)
    POST /api/profiles/:slug/missions/  — créer une mission
    """

    authentication_classes = [ProfileTokenAuthentication]

    def _get_target_profile(self, slug: str) -> AccountProfile:
        return get_object_or_404(AccountProfile.objects.select_related("user"), slug=slug)

    def get(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = self._get_target_profile(slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)
        if profile.role != AccountProfile.ROLE_FREELANCE:
            return Response({"error": "Ce profil ne gere pas de missions owner."}, status=400)

        status_filter = request.query_params.get("status")
        qs = profile.missions.select_related("profile__user", "client_profile__user").prefetch_related("slots").all()
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response(MissionSerializer(qs, many=True).data)

    def post(self, request: Request, slug: str) -> Response:
        profile = self._get_target_profile(slug)
        requesting_profile = get_request_profile(request)
        is_owner = request.user.is_authenticated and profile.user == request.user
        is_client_proposal = (
            request.user.is_authenticated
            and requesting_profile is not None
            and requesting_profile.role == AccountProfile.ROLE_CLIENT
            and profile.role == AccountProfile.ROLE_FREELANCE
            and profile.user != request.user
        )
        is_public_proposal = not request.user.is_authenticated and profile.role == AccountProfile.ROLE_FREELANCE

        if is_owner and profile.role != AccountProfile.ROLE_FREELANCE:
            return Response({"error": "Ce profil ne gere pas de missions owner."}, status=400)
        if not (is_owner or is_client_proposal or is_public_proposal):
            if not request.user.is_authenticated:
                return Response({"error": "Ce profil ne peut pas recevoir de mission publique."}, status=403)
            return Response({"error": "Accès refusé."}, status=403)

        serializer = MissionSerializer(
            data=request.data,
            context={
                "request": request,
                "profile": profile,
                "proposal_mode": not is_owner,
            },
        )
        serializer.is_valid(raise_exception=True)
        save_kwargs = {"profile": profile}

        if is_client_proposal and requesting_profile is not None:
            save_kwargs["client_profile"] = requesting_profile
            save_kwargs["status"] = Mission.STATUS_PROPOSED
            if not serializer.validated_data.get("client_name"):
                save_kwargs["client_name"] = requesting_profile.display_name or requesting_profile.user.email
            if not serializer.validated_data.get("client_email"):
                save_kwargs["client_email"] = requesting_profile.user.email
        elif is_public_proposal:
            save_kwargs["status"] = Mission.STATUS_PROPOSED

        mission = serializer.save(**save_kwargs)
        return Response(MissionSerializer(mission).data, status=201)


class MissionDetailView(APIView):
    """
    GET    /api/profiles/:slug/missions/:mission_id/
    PATCH  /api/profiles/:slug/missions/:mission_id/
    DELETE /api/profiles/:slug/missions/:mission_id/
    """

    authentication_classes = [ProfileTokenAuthentication]

    def _get_owned_mission(self, request: Request, slug: str, mission_id: int):
        if not request.user.is_authenticated:
            return None, Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile.objects.select_related("user"), slug=slug)
        if profile.user != request.user:
            return None, Response({"error": "Accès refusé."}, status=403)
        mission = get_object_or_404(
            Mission.objects.select_related("profile__user", "client_profile__user").prefetch_related("slots"),
            pk=mission_id,
            profile=profile,
        )
        return mission, None

    def get(self, request: Request, slug: str, mission_id: int) -> Response:
        mission, err = self._get_owned_mission(request, slug, mission_id)
        if err:
            return err
        return Response(MissionSerializer(mission).data)

    def patch(self, request: Request, slug: str, mission_id: int) -> Response:
        mission, err = self._get_owned_mission(request, slug, mission_id)
        if err:
            return err
        serializer = MissionSerializer(
            mission,
            data=request.data,
            partial=True,
            context={"request": request, "profile": mission.profile},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MissionSerializer(mission).data)

    def delete(self, request: Request, slug: str, mission_id: int) -> Response:
        mission, err = self._get_owned_mission(request, slug, mission_id)
        if err:
            return err
        mission.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Vues — Factures
# ---------------------------------------------------------------------------

class FacturesView(APIView):
    """
    GET  /api/profiles/:slug/factures/  — liste des factures (owner uniquement)
    POST /api/profiles/:slug/factures/  — créer une facture manuelle
    """

    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)

        qs = profile.factures.select_related("mission").all()
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response(FactureSerializer(qs, many=True).data)

    def post(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return Response({"error": "Accès refusé."}, status=403)

        serializer = FactureSerializer(data=request.data, context={"profile": profile})
        serializer.is_valid(raise_exception=True)
        facture = serializer.save(profile=profile)
        return Response(FactureSerializer(facture).data, status=201)


class FactureDetailView(APIView):
    """
    GET    /api/profiles/:slug/factures/:facture_id/
    PATCH  /api/profiles/:slug/factures/:facture_id/
    DELETE /api/profiles/:slug/factures/:facture_id/
    """

    authentication_classes = [ProfileTokenAuthentication]

    def _get_owned_facture(self, request: Request, slug: str, facture_id: int):
        if not request.user.is_authenticated:
            return None, Response({"error": "Authentification requise."}, status=401)
        profile = get_object_or_404(AccountProfile, slug=slug)
        if profile.user != request.user:
            return None, Response({"error": "Accès refusé."}, status=403)
        facture = get_object_or_404(
            (Facture.objects.select_for_update() if request.method in {"PATCH", "DELETE"} else Facture.objects).select_related("mission"), pk=facture_id, profile=profile
        )
        return facture, None

    def get(self, request: Request, slug: str, facture_id: int) -> Response:
        facture, err = self._get_owned_facture(request, slug, facture_id)
        if err:
            return err
        return Response(FactureSerializer(facture).data)

    @transaction.atomic
    def patch(self, request: Request, slug: str, facture_id: int) -> Response:
        facture, err = self._get_owned_facture(request, slug, facture_id)
        if err:
            return err
        serializer = FactureSerializer(
            facture,
            data=request.data,
            partial=True,
            context={"profile": facture.profile},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        facture.refresh_from_db()
        if facture.status == Facture.STATUS_PAID:
            from .einvoicing.services import report_invoice_payment
            transaction.on_commit(lambda: report_invoice_payment(facture))
        return Response(FactureSerializer(facture).data)

    @transaction.atomic
    def delete(self, request: Request, slug: str, facture_id: int) -> Response:
        facture, err = self._get_owned_facture(request, slug, facture_id)
        if err:
            return err
        if facture.finalized_at or hasattr(facture, "electronic_transmission"):
            return Response({"error": "Une facture finalisée ou transmise ne peut pas être supprimée."}, status=409)
        facture.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Vues — Admin
# ---------------------------------------------------------------------------

class AdminOverviewView(APIView):
    """
    GET /api/admin/overview/

    Retourne un résumé global de la base et la liste des comptes avec filtres
    simples (recherche texte + role).
    """

    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request) -> Response:
        _, err = require_admin_profile(request)
        if err:
            return err

        query = str(request.query_params.get("q", "")).strip()
        role = str(request.query_params.get("role", "")).strip()

        accounts = AccountProfile.objects.select_related("user").annotate(
            skill_count=Count("skills", distinct=True),
            slot_count=Count("slots", distinct=True),
            mission_count=Count("missions", distinct=True),
            unavailability_count=Count("unavailabilities", distinct=True),
        )

        if query:
            accounts = accounts.filter(
                Q(display_name__icontains=query)
                | Q(user__email__icontains=query)
                | Q(slug__icontains=query)
                | Q(job_title__icontains=query)
                | Q(location__icontains=query)
                | Q(phone__icontains=query)
                | Q(city__icontains=query)
                | Q(country__icontains=query)
                | Q(siret__icontains=query)
            )

        if role in {
            AccountProfile.ROLE_FREELANCE,
            AccountProfile.ROLE_CLIENT,
            AccountProfile.ROLE_ADMIN,
        }:
            accounts = accounts.filter(role=role)

        summary = {
            "total_accounts": AccountProfile.objects.count(),
            "freelance_accounts": AccountProfile.objects.filter(
                role=AccountProfile.ROLE_FREELANCE
            ).count(),
            "client_accounts": AccountProfile.objects.filter(
                role=AccountProfile.ROLE_CLIENT
            ).count(),
            "admin_accounts": AccountProfile.objects.filter(
                role=AccountProfile.ROLE_ADMIN
            ).count(),
            "total_skills": Skill.objects.count(),
            "total_slots": Slot.objects.count(),
            "total_unavailabilities": Unavailability.objects.count(),
            "total_missions": Mission.objects.count(),
        }

        return Response(
            {
                "summary": summary,
                "accounts": AdminAccountSummarySerializer(
                    accounts, many=True, context={"request": request}
                ).data,
                "filters": {
                    "q": query,
                    "role": role or None,
                },
            }
        )


class AdminAccountDetailView(APIView):
    """
    GET /api/admin/accounts/:account_id/

    Retourne la fiche complète d'un compte avec les objets métier associés.
    """

    authentication_classes = [ProfileTokenAuthentication]

    def get(self, request: Request, account_id: int) -> Response:
        _, err = require_admin_profile(request)
        if err:
            return err

        account = get_object_or_404(
            AccountProfile.objects.select_related("user").prefetch_related(
                "skills",
                "missions",
                "unavailabilities",
                "slots__mission",
            ),
            pk=account_id,
        )

        return Response(
            {
                "account": AdminAccountDetailSerializer(
                    account, context={"request": request}
                ).data,
                "stats": {
                    "skill_count": account.skills.count(),
                    "slot_count": account.slots.count(),
                    "mission_count": account.missions.count(),
                    "unavailability_count": account.unavailabilities.count(),
                },
                "skills": SkillSerializer(account.skills.all(), many=True).data,
                "slots": SlotSerializer(account.slots.all(), many=True).data,
                "missions": MissionSerializer(account.missions.all(), many=True).data,
                "unavailabilities": UnavailabilitySerializer(
                    account.unavailabilities.all(), many=True
                ).data,
            }
        )
