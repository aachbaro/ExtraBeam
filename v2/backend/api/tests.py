import datetime
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

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
from .pipeline import sync_pascuans_profile

User = get_user_model()


class DummyHttpResponse:
    def __init__(self, payload: dict):
        self.payload = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class AuthApiTests(APITestCase):
    def test_health(self):
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, 200)

    @override_settings(DEBUG=True)
    def test_login_with_test_password(self):
        response = self.client.post(
            reverse("login"),
            {"email": "adam@rivebelle.fr", "password": "test"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], "adam@rivebelle.fr")

    def test_register_creates_local_account(self):
        response = self.client.post(
            reverse("register"),
            {
                "display_name": "Adam",
                "email": "adam@rivebelle.fr",
                "password": "bonjour123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["display_name"], "Adam")
        self.assertEqual(response.data["user"]["auth_provider"], "local")
        self.assertEqual(response.data["user"]["role"], AccountProfile.ROLE_FREELANCE)
        self.assertTrue(User.objects.filter(email="adam@rivebelle.fr").exists())
        self.assertTrue(AccountProfile.objects.filter(user__email="adam@rivebelle.fr").exists())

    def test_register_allows_client_role(self):
        response = self.client.post(
            reverse("register"),
            {
                "display_name": "Client Adam",
                "email": "client@rivebelle.fr",
                "password": "bonjour123",
                "role": AccountProfile.ROLE_CLIENT,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["role"], AccountProfile.ROLE_CLIENT)
        self.assertTrue(AccountProfile.objects.filter(user__email="client@rivebelle.fr", role=AccountProfile.ROLE_CLIENT).exists())

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(username="adam@rivebelle.fr", email="adam@rivebelle.fr", password="bonjour123")

        response = self.client.post(
            reverse("register"),
            {
                "display_name": "Adam",
                "email": "adam@rivebelle.fr",
                "password": "bonjour123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Un compte existe deja avec cette adresse email.")

    def test_login_with_registered_account(self):
        response = self.client.post(
            reverse("register"),
            {
                "display_name": "Adam",
                "email": "adam@rivebelle.fr",
                "password": "bonjour123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

        login_response = self.client.post(
            reverse("login"),
            {"email": "adam@rivebelle.fr", "password": "bonjour123"},
            format="json",
        )

        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.data["user"]["email"], "adam@rivebelle.fr")
        self.assertEqual(login_response.data["user"]["auth_provider"], "local")

    def test_login_preserves_client_role(self):
        response = self.client.post(
            reverse("register"),
            {
                "display_name": "Client Adam",
                "email": "client-login@rivebelle.fr",
                "password": "bonjour123",
                "role": AccountProfile.ROLE_CLIENT,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

        login_response = self.client.post(
            reverse("login"),
            {"email": "client-login@rivebelle.fr", "password": "bonjour123"},
            format="json",
        )

        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.data["user"]["role"], AccountProfile.ROLE_CLIENT)

    @override_settings(
        GOOGLE_OAUTH_CLIENT_ID="",
        GOOGLE_OAUTH_CLIENT_SECRET="",
        GOOGLE_OAUTH_ALLOWED_ORIGINS=["http://127.0.0.1:5180"],
    )
    def test_google_login_dev_fallback(self):
        response = self.client.post(
            reverse("google-login"),
            {"code": "dev-google-code"},
            format="json",
            HTTP_ORIGIN="http://127.0.0.1:5180",
            HTTP_X_REQUESTED_WITH="XmlHttpRequest",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], "adam@gmail.com")

    @override_settings(
        GOOGLE_OAUTH_CLIENT_ID="google-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="google-client-secret",
        GOOGLE_OAUTH_ALLOWED_ORIGINS=["http://127.0.0.1:5180"],
    )
    @patch("api.views.urllib_request.urlopen")
    def test_google_login_real_exchange(self, urlopen_mock):
        urlopen_mock.side_effect = [
            DummyHttpResponse(
                {
                    "access_token": "google-access-token",
                    "expires_in": 3599,
                    "scope": "openid email profile",
                    "token_type": "Bearer",
                }
            ),
            DummyHttpResponse(
                {
                    "sub": "google-sub-123",
                    "email": "adam@rivebelle.fr",
                    "email_verified": True,
                    "name": "Adam",
                    "picture": "https://example.com/avatar.png",
                }
            ),
        ]

        response = self.client.post(
            reverse("google-login"),
            {"code": "real-google-code"},
            format="json",
            HTTP_ORIGIN="http://127.0.0.1:5180",
            HTTP_X_REQUESTED_WITH="XmlHttpRequest",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], "adam@rivebelle.fr")
        self.assertEqual(response.data["user"]["auth_provider"], "google")
        self.assertTrue(AccountProfile.objects.filter(google_sub="google-sub-123", user__email="adam@rivebelle.fr").exists())
        created_profile = AccountProfile.objects.get(google_sub="google-sub-123")
        self.assertEqual(response.data["access_token"], created_profile.api_token.token)

        token_request = urlopen_mock.call_args_list[0].args[0]
        self.assertEqual(token_request.full_url, "https://oauth2.googleapis.com/token")
        self.assertIn("redirect_uri=http%3A%2F%2F127.0.0.1%3A5180", token_request.data.decode("utf-8"))
        self.assertIn("code=real-google-code", token_request.data.decode("utf-8"))

        userinfo_request = urlopen_mock.call_args_list[1].args[0]
        self.assertEqual(userinfo_request.full_url, "https://openidconnect.googleapis.com/v1/userinfo")
        self.assertEqual(userinfo_request.headers["Authorization"], "Bearer google-access-token")

    @override_settings(
        GOOGLE_OAUTH_CLIENT_ID="google-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="google-client-secret",
        GOOGLE_OAUTH_ALLOWED_ORIGINS=["http://127.0.0.1:5180"],
    )
    def test_google_login_requires_x_requested_with_header(self):
        response = self.client.post(
            reverse("google-login"),
            {"code": "real-google-code"},
            format="json",
            HTTP_ORIGIN="http://127.0.0.1:5180",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Requete Google invalide.")

    @override_settings(FRONTEND_URL="http://127.0.0.1:5180")
    def test_social_bridge_redirects_with_serialized_profile(self):
        user = User.objects.create_user(
            username="adam@rivebelle.fr",
            email="adam@rivebelle.fr",
            password="bonjour123",
            first_name="Adam",
        )
        profile = AccountProfile.objects.create(
            user=user,
            display_name="Adam",
            role=AccountProfile.ROLE_CLIENT,
            auth_provider=AccountProfile.AUTH_PROVIDER_PASCUANS,
            oidc_sub="oidc-sub-123",
        )

        self.client.force_login(user)
        response = self.client.get(reverse("social-bridge"))

        self.assertEqual(response.status_code, 302)
        parsed = urlparse(response.url)
        self.assertEqual(parsed.scheme, "http")
        self.assertEqual(parsed.netloc, "127.0.0.1:5180")
        self.assertEqual(parsed.path, "/auth/callback")

        params = parse_qs(parsed.query)
        self.assertEqual(params["id"], [str(profile.pk)])
        self.assertEqual(params["email"], ["adam@rivebelle.fr"])
        self.assertEqual(params["display_name"], ["Adam"])
        self.assertEqual(params["role"], [AccountProfile.ROLE_CLIENT])
        self.assertEqual(params["auth_provider"], [AccountProfile.AUTH_PROVIDER_PASCUANS])
        self.assertEqual(params["oidc_sub"], ["oidc-sub-123"])

    @override_settings(FRONTEND_URL="http://127.0.0.1:5180", OIDC_ISSUER_URL="http://127.0.0.1:8001")
    def test_social_logout_clears_session_and_redirects_to_auth_server(self):
        user = User.objects.create_user(
            username="adam@rivebelle.fr",
            email="adam@rivebelle.fr",
            password="bonjour123",
        )
        self.client.force_login(user)

        response = self.client.get(reverse("social-logout"), {"next": "http://127.0.0.1:5180/login"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "http://127.0.0.1:8001/logout/?next=http%3A%2F%2F127.0.0.1%3A5180%2Flogin")
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_sync_pascuans_profile_uses_role_stored_in_session(self):
        user = User.objects.create_user(
            username="role-choice@rivebelle.fr",
            email="role-choice@rivebelle.fr",
            password="bonjour123",
        )
        backend = SimpleNamespace(
            strategy=SimpleNamespace(
                session_pop=lambda name: AccountProfile.ROLE_CLIENT
                if name == "role"
                else None
            )
        )

        sync_pascuans_profile(
            backend,
            user=user,
            uid="oidc-role-choice",
            response={"sub": "oidc-role-choice"},
            details={"email": user.email},
        )

        user.refresh_from_db()
        self.assertEqual(user.account_profile.role, AccountProfile.ROLE_CLIENT)

    def test_sync_pascuans_profile_handles_missing_role_in_session(self):
        user = User.objects.create_user(
            username="role-missing@rivebelle.fr",
            email="role-missing@rivebelle.fr",
            password="bonjour123",
        )
        backend = SimpleNamespace(
            strategy=SimpleNamespace(
                session_pop=lambda name: None
            )
        )

        sync_pascuans_profile(
            backend,
            user=user,
            uid="oidc-role-missing",
            response={"sub": "oidc-role-missing"},
            details={"email": user.email},
        )

        user.refresh_from_db()
        self.assertEqual(user.account_profile.role, AccountProfile.ROLE_FREELANCE)


class ProfileApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="profile@rivebelle.fr",
            email="profile@rivebelle.fr",
            password="bonjour123",
        )
        self.profile = AccountProfile.objects.create(
            user=self.user,
            display_name="Profile Owner",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="profile-owner",
        )
        self.token = UserApiToken.get_or_create_for_profile(self.profile)

    def test_profile_patch_updates_business_fields_for_owner(self):
        response = self.client.patch(
            reverse("profile-overview", args=[self.profile.slug]),
            {
                "phone": "0601020304",
                "address_line1": "12 rue des Halles",
                "postal_code": "59000",
                "city": "Lille",
                "country": "France",
                "siret": "123 456 789 00012",
                "legal_status": "micro-entreprise",
                "vat_number": "FR00123456789",
                "vat_notice": "TVA non applicable, art. 293 B du CGI",
                "iban": "FR7612345987650123456789014",
                "bic": "AGRIFRPP",
                "hourly_rate": "25.50",
                "currency": "eur",
                "payment_terms": "Paiement comptant a reception",
                "late_penalties": "Taux BCE + 10 pts",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["city"], "Lille")
        self.assertEqual(response.data["siret"], "12345678900012")
        self.assertEqual(response.data["currency"], "EUR")
        self.assertEqual(response.data["hourly_rate"], "25.50")

    def test_profile_public_view_hides_private_business_fields(self):
        self.profile.siret = "12345678900012"
        self.profile.iban = "FR7612345987650123456789014"
        self.profile.vat_number = "FR00123456789"
        self.profile.subscription_status = "active"
        self.profile.subscription_plan = "Rivebelle Pro"
        self.profile.subscription_period_end = timezone.now() + datetime.timedelta(days=30)
        self.profile.subscription_cancel_at_period_end = True
        self.profile.address_line1 = "12 rue des Halles"
        self.profile.city = "Lille"
        self.profile.save(
            update_fields=[
                "siret",
                "iban",
                "vat_number",
                "subscription_status",
                "subscription_plan",
                "subscription_period_end",
                "subscription_cancel_at_period_end",
                "address_line1",
                "city",
                "updated_at",
            ]
        )

        response = self.client.get(reverse("profile-overview", args=[self.profile.slug]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["profile"]["address_line1"], "12 rue des Halles")
        self.assertEqual(response.data["profile"]["city"], "Lille")
        self.assertEqual(response.data["profile"]["siret"], "")
        self.assertEqual(response.data["profile"]["iban"], "")
        self.assertEqual(response.data["profile"]["vat_number"], "")
        self.assertEqual(response.data["profile"]["subscription_status"], "")
        self.assertEqual(response.data["profile"]["subscription_plan"], "")
        self.assertIsNone(response.data["profile"]["subscription_period_end"])
        self.assertFalse(response.data["profile"]["subscription_cancel_at_period_end"])
        self.assertIsNone(response.data["profile"]["hourly_rate"])

    def test_profile_owner_view_includes_subscription_fields(self):
        subscription_end = timezone.now() + datetime.timedelta(days=14)
        self.profile.subscription_status = "active"
        self.profile.subscription_plan = "Rivebelle Pro"
        self.profile.subscription_period_end = subscription_end
        self.profile.subscription_cancel_at_period_end = True
        self.profile.save(
            update_fields=[
                "subscription_status",
                "subscription_plan",
                "subscription_period_end",
                "subscription_cancel_at_period_end",
                "updated_at",
            ]
        )

        response = self.client.get(
            reverse("profile-overview", args=[self.profile.slug]),
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mode"], "owner")
        self.assertEqual(response.data["profile"]["subscription_status"], "active")
        self.assertEqual(response.data["profile"]["subscription_plan"], "Rivebelle Pro")
        self.assertEqual(
            response.data["profile"]["subscription_period_end"],
            subscription_end.isoformat().replace("+00:00", "Z"),
        )
        self.assertTrue(response.data["profile"]["subscription_cancel_at_period_end"])

    def test_profile_patch_accepts_uploaded_avatar_and_serves_short_url(self):
        upload_data = "data:image/jpeg;base64,QUJDREVGR0g="

        with TemporaryDirectory() as tmpdir, patch(
            "api.avatar_storage.get_avatar_storage_root",
            return_value=Path(tmpdir),
        ):
            response = self.client.patch(
                reverse("profile-overview", args=[self.profile.slug]),
                {
                    "display_name": "Profile Owner",
                    "avatar_upload_data": upload_data,
                },
                format="json",
                HTTP_AUTHORIZATION=f"Token {self.token.token}",
            )

            self.assertEqual(response.status_code, 200)
            self.profile.refresh_from_db()
            self.assertTrue(self.profile.avatar_storage_key.endswith(".jpg"))
            self.assertIn("/api/avatars/", response.data["avatar_url"])

            avatar_path = response.data["avatar_url"].replace("http://testserver", "")
            avatar_response = self.client.get(avatar_path)
            self.assertEqual(avatar_response.status_code, 200)
            self.assertEqual(avatar_response["Content-Type"], "image/jpeg")

    def test_profile_patch_rejects_invalid_avatar_data(self):
        response = self.client.patch(
            reverse("profile-overview", args=[self.profile.slug]),
            {
                "avatar_upload_data": "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["avatar_upload_data"][0],
            "Format d'image invalide. Utiliser JPEG, PNG ou WebP.",
        )

    def test_profile_overview_includes_experiences(self):
        Experience.objects.create(
            profile=self.profile,
            title="Chef de rang",
            company="Brasserie du Centre",
            start_date="2024-04-01",
            end_date="2025-01-01",
            description="Service en salle et coordination du rang.",
        )

        response = self.client.get(reverse("profile-overview", args=[self.profile.slug]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["profile"]["experiences"]), 1)
        self.assertEqual(
            response.data["profile"]["experiences"][0]["title"], "Chef de rang"
        )

    def test_profile_account_delete_requires_confirmation_keyword(self):
        response = self.client.post(
            reverse("profile-account-delete", args=[self.profile.slug]),
            {"confirmation": "non"},
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["error"],
            "Confirmation invalide. Taper SUPPRIMER pour continuer.",
        )
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())
        self.assertTrue(AccountProfile.objects.filter(pk=self.profile.pk).exists())

    def test_profile_account_delete_removes_user_and_profile(self):
        response = self.client.post(
            reverse("profile-account-delete", args=[self.profile.slug]),
            {"confirmation": "SUPPRIMER"},
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"success": True})
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertFalse(AccountProfile.objects.filter(pk=self.profile.pk).exists())
        self.assertFalse(UserApiToken.objects.filter(token=self.token.token).exists())


class ExperiencesApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="experiences@rivebelle.fr",
            email="experiences@rivebelle.fr",
            password="bonjour123",
        )
        self.profile = AccountProfile.objects.create(
            user=self.user,
            display_name="Experiences Owner",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="experiences-owner",
        )
        self.token = UserApiToken.get_or_create_for_profile(self.profile)

        self.other_user = User.objects.create_user(
            username="other-experiences@rivebelle.fr",
            email="other-experiences@rivebelle.fr",
            password="bonjour123",
        )
        self.other_profile = AccountProfile.objects.create(
            user=self.other_user,
            display_name="Other Experiences",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="other-experiences",
        )
        self.other_token = UserApiToken.get_or_create_for_profile(self.other_profile)

    def test_owner_can_create_update_and_delete_experience(self):
        create_response = self.client.post(
            reverse("experiences", args=[self.profile.slug]),
            {
                "title": "Serveur evenementiel",
                "company": "Maison Martin",
                "start_date": "2024-06-01",
                "end_date": "2025-02-01",
                "description": "Cocktails, banquets et mise en place.",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.data["company"], "Maison Martin")
        experience_id = create_response.data["id"]

        patch_response = self.client.patch(
            reverse("experience-detail", args=[self.profile.slug, experience_id]),
            {
                "is_current": True,
                "description": "Service en salle, banquets et renfort bar.",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(patch_response.status_code, 200)
        self.assertTrue(patch_response.data["is_current"])
        self.assertIsNone(patch_response.data["end_date"])

        delete_response = self.client.delete(
            reverse("experience-detail", args=[self.profile.slug, experience_id]),
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Experience.objects.filter(pk=experience_id).exists())

    def test_experience_rejects_invalid_period(self):
        response = self.client.post(
            reverse("experiences", args=[self.profile.slug]),
            {
                "title": "Chef de partie",
                "start_date": "2025-05-01",
                "end_date": "2025-04-01",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["non_field_errors"][0],
            "La date de fin doit être postérieure à la date de début.",
        )

    def test_experience_write_requires_owner(self):
        response = self.client.post(
            reverse("experiences", args=[self.profile.slug]),
            {"title": "Runner"},
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.other_token.token}",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"], "Accès refusé.")


class SlotsApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="adam@rivebelle.fr",
            email="adam@rivebelle.fr",
            password="bonjour123",
        )
        self.profile = AccountProfile.objects.create(
            user=self.user,
            display_name="Adam",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="adam-rivebelle",
        )
        self.token = UserApiToken.get_or_create_for_profile(self.profile)

    def test_slot_create_preserves_wall_clock_times(self):
        response = self.client.post(
            reverse("slots", args=[self.profile.slug]),
            {
                "title": "Disponibilite matin",
                "start": "2026-04-14T09:00:00",
                "end": "2026-04-14T15:00:00",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["start"], "2026-04-14T09:00:00")
        self.assertEqual(response.data["end"], "2026-04-14T15:00:00")

        slot = Slot.objects.get(pk=response.data["id"])
        self.assertEqual(timezone.localtime(slot.start).strftime("%H:%M"), "09:00")
        self.assertEqual(timezone.localtime(slot.end).strftime("%H:%M"), "15:00")

    def test_slot_list_returns_local_wall_clock_times(self):
        Slot.objects.create(
            profile=self.profile,
            title="Apres-midi client",
            start=datetime.datetime(2026, 4, 14, 7, 0, tzinfo=datetime.timezone.utc),
            end=datetime.datetime(2026, 4, 14, 13, 0, tzinfo=datetime.timezone.utc),
        )

        response = self.client.get(reverse("slots", args=[self.profile.slug]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["start"], "2026-04-14T09:00:00")
        self.assertEqual(response.data[0]["end"], "2026-04-14T15:00:00")


class FacturesApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="factures@rivebelle.fr",
            email="factures@rivebelle.fr",
            password="bonjour123",
        )
        self.profile = AccountProfile.objects.create(
            user=self.user,
            display_name="Factures Owner",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="factures-owner",
        )
        self.token = UserApiToken.get_or_create_for_profile(self.profile)
        self.mission = Mission.objects.create(
            profile=self.profile,
            title="Mission de design sprint",
            client_name="Acme",
            client_email="acme@client.fr",
            client_phone="0600000000",
            client_company="Acme Corp",
            daily_rate="650.00",
        )

        self.other_user = User.objects.create_user(
            username="other@rivebelle.fr",
            email="other@rivebelle.fr",
            password="bonjour123",
        )
        self.other_profile = AccountProfile.objects.create(
            user=self.other_user,
            display_name="Other Owner",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="other-owner",
        )
        self.other_mission = Mission.objects.create(
            profile=self.other_profile,
            title="Mission externe",
            client_name="Globex",
        )

    def test_create_facture_manually(self):
        response = self.client.post(
            reverse("factures", args=[self.profile.slug]),
            {
                "mission_id": self.mission.pk,
                "numero": "2026-0001",
                "date_emission": "2026-05-05",
                "client_name": "Acme Corp",
                "client_siret": "94246706900012",
                "client_vat_number": "FR17942467069",
                "contact_name": "Eva Client",
                "contact_email": "eva@acme.fr",
                "description": "Sprint produit du mois de mai",
                "hours": "7.50",
                "rate": "80.00",
                "montant_ht": "600.00",
                "tva": "20.00",
                "montant_ttc": "720.00",
                "mention_tva": "TVA 20%",
                "date_echeance": "2026-06-05",
                "conditions_paiement": "Paiement comptant a reception",
                "escompte": "Escompte pour paiement anticipe : neant",
                "penalites_retard": "Taux BCE + 10 points",
                "indemnite_recouvrement": "Indemnite forfaitaire pour frais de recouvrement : 40 EUR",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["numero"], "2026-0001")
        self.assertEqual(response.data["mission_id"], self.mission.pk)
        self.assertEqual(response.data["mission_title"], self.mission.title)
        self.assertEqual(response.data["montant_ttc"], "720.00")
        self.assertEqual(response.data["client_siret"], "94246706900012")
        self.assertEqual(response.data["date_echeance"], "2026-06-05")
        self.assertEqual(
            response.data["indemnite_recouvrement"],
            "Indemnite forfaitaire pour frais de recouvrement : 40 EUR",
        )
        self.assertTrue(
            Facture.objects.filter(profile=self.profile, numero="2026-0001").exists()
        )

    def test_list_factures_requires_owner(self):
        Facture.objects.create(
            profile=self.profile,
            mission=self.mission,
            numero="2026-0002",
            client_name="Acme Corp",
            montant_ht="500.00",
            montant_ttc="500.00",
        )

        unauthorized = self.client.get(reverse("factures", args=[self.profile.slug]))
        self.assertEqual(unauthorized.status_code, 401)

        forbidden = self.client.get(
            reverse("factures", args=[self.profile.slug]),
            HTTP_AUTHORIZATION=f"Token {UserApiToken.get_or_create_for_profile(self.other_profile).token}",
        )
        self.assertEqual(forbidden.status_code, 403)

        owner = self.client.get(
            reverse("factures", args=[self.profile.slug]),
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )
        self.assertEqual(owner.status_code, 200)
        self.assertEqual(len(owner.data), 1)

    def test_facture_rejects_foreign_mission(self):
        response = self.client.post(
            reverse("factures", args=[self.profile.slug]),
            {
                "mission_id": self.other_mission.pk,
                "numero": "2026-0003",
                "client_name": "Globex",
                "montant_ht": "500.00",
                "montant_ttc": "500.00",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["mission_id"][0],
            "La mission choisie n'appartient pas à ce profil.",
        )

    def test_update_and_delete_facture(self):
        facture = Facture.objects.create(
            profile=self.profile,
            mission=self.mission,
            numero="2026-0004",
            client_name="Acme Corp",
            montant_ht="400.00",
            montant_ttc="400.00",
        )

        patch_response = self.client.patch(
            reverse("facture-detail", args=[self.profile.slug, facture.pk]),
            {
                "status": Facture.STATUS_PAID,
                "contact_name": "Eva Client",
                "date_echeance": "2026-06-10",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data["status"], Facture.STATUS_PAID)
        self.assertEqual(patch_response.data["contact_name"], "Eva Client")
        self.assertEqual(patch_response.data["date_echeance"], "2026-06-10")

        delete_response = self.client.delete(
            reverse("facture-detail", args=[self.profile.slug, facture.pk]),
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Facture.objects.filter(pk=facture.pk).exists())


class UnavailabilityApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="indispo@rivebelle.fr",
            email="indispo@rivebelle.fr",
            password="bonjour123",
        )
        self.profile = AccountProfile.objects.create(
            user=self.user,
            display_name="Indispo Owner",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="indispo-owner",
        )
        self.token = UserApiToken.get_or_create_for_profile(self.profile)

    def test_create_once_unavailability_date_range(self):
        response = self.client.post(
            reverse("unavailabilities", args=[self.profile.slug]),
            {
                "recurrence_type": "once",
                "start_date": "2026-05-20",
                "recurrence_end": "2026-05-24",
                "start_time": "07:00:00",
                "end_time": "23:59:00",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["start_date"], "2026-05-20")
        self.assertEqual(response.data["recurrence_end"], "2026-05-24")

    def test_create_once_unavailability_rejects_reverse_date_range(self):
        response = self.client.post(
            reverse("unavailabilities", args=[self.profile.slug]),
            {
                "recurrence_type": "once",
                "start_date": "2026-05-24",
                "recurrence_end": "2026-05-20",
                "start_time": "07:00:00",
                "end_time": "23:59:00",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.token.token}",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["recurrence_end"][0],
            "La date de fin doit être après la date de début.",
        )


class AdminApiTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="admin@rivebelle.fr",
            email="admin@rivebelle.fr",
            password="bonjour123",
            is_staff=True,
        )
        self.admin_profile = AccountProfile.objects.create(
            user=self.admin_user,
            display_name="Admin",
            role=AccountProfile.ROLE_ADMIN,
            auth_provider=AccountProfile.AUTH_PROVIDER_PASCUANS,
        )
        self.admin_token = UserApiToken.get_or_create_for_profile(self.admin_profile)

        self.freelance_user = User.objects.create_user(
            username="freelance@rivebelle.fr",
            email="freelance@rivebelle.fr",
            password="bonjour123",
        )
        self.freelance_profile = AccountProfile.objects.create(
            user=self.freelance_user,
            display_name="Freelance Adam",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            job_title="Full-stack freelance",
            location="Lille",
            bio="Disponible pour des missions produit.",
            phone="0601020304",
        )

        Skill.objects.create(profile=self.freelance_profile, name="Django")
        Skill.objects.create(profile=self.freelance_profile, name="React")
        mission = Mission.objects.create(
            profile=self.freelance_profile,
            title="Refonte plateforme",
            status=Mission.STATUS_ONGOING,
            client_name="Acme",
        )
        Slot.objects.create(
            profile=self.freelance_profile,
            mission=mission,
            title="Atelier kickoff",
            start="2026-04-14T09:00:00Z",
            end="2026-04-14T11:00:00Z",
        )
        Unavailability.objects.create(
            profile=self.freelance_profile,
            recurrence_type=Unavailability.RECURRENCE_WEEKLY,
            weekday=3,
            start_time="14:00:00",
            end_time="18:00:00",
        )

        self.client_user = User.objects.create_user(
            username="client@rivebelle.fr",
            email="client@rivebelle.fr",
            password="bonjour123",
        )
        self.client_profile = AccountProfile.objects.create(
            user=self.client_user,
            display_name="Client Eve",
            role=AccountProfile.ROLE_CLIENT,
            auth_provider=AccountProfile.AUTH_PROVIDER_GOOGLE,
        )
        self.client_token = UserApiToken.get_or_create_for_profile(self.client_profile)

    def test_admin_overview_requires_admin_role(self):
        response = self.client.get(
            reverse("admin-overview"),
            HTTP_AUTHORIZATION=f"Token {self.client_token.token}",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"], "Acces admin requis.")

    def test_admin_overview_returns_summary_and_accounts(self):
        response = self.client.get(
            reverse("admin-overview"),
            HTTP_AUTHORIZATION=f"Token {self.admin_token.token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["total_accounts"], 3)
        self.assertEqual(response.data["summary"]["freelance_accounts"], 1)
        self.assertEqual(response.data["summary"]["client_accounts"], 1)
        self.assertEqual(response.data["summary"]["admin_accounts"], 1)
        self.assertEqual(response.data["summary"]["total_skills"], 2)
        self.assertEqual(response.data["summary"]["total_slots"], 1)
        self.assertEqual(response.data["summary"]["total_unavailabilities"], 1)
        self.assertEqual(response.data["summary"]["total_missions"], 1)
        self.assertEqual(len(response.data["accounts"]), 3)

        freelance_entry = next(
            account for account in response.data["accounts"]
            if account["email"] == "freelance@rivebelle.fr"
        )
        self.assertEqual(freelance_entry["skill_count"], 2)
        self.assertEqual(freelance_entry["mission_count"], 1)
        self.assertEqual(freelance_entry["slot_count"], 1)
        self.assertEqual(freelance_entry["unavailability_count"], 1)

    def test_admin_overview_supports_role_and_query_filters(self):
        response = self.client.get(
            reverse("admin-overview"),
            {"role": AccountProfile.ROLE_FREELANCE, "q": "Lille"},
            HTTP_AUTHORIZATION=f"Token {self.admin_token.token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["accounts"]), 1)
        self.assertEqual(response.data["accounts"][0]["email"], "freelance@rivebelle.fr")

    def test_admin_account_detail_returns_full_account_payload(self):
        response = self.client.get(
            reverse("admin-account-detail", args=[self.freelance_profile.pk]),
            HTTP_AUTHORIZATION=f"Token {self.admin_token.token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["account"]["email"], "freelance@rivebelle.fr")
        self.assertEqual(response.data["account"]["role"], AccountProfile.ROLE_FREELANCE)
        self.assertEqual(response.data["stats"]["skill_count"], 2)
        self.assertEqual(len(response.data["skills"]), 2)
        self.assertEqual(len(response.data["missions"]), 1)
        self.assertEqual(len(response.data["slots"]), 1)
        self.assertEqual(len(response.data["unavailabilities"]), 1)


class ClientWorkspaceApiTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username="client-workspace@rivebelle.fr",
            email="client-workspace@rivebelle.fr",
            password="bonjour123",
        )
        self.client_profile = AccountProfile.objects.create(
            user=self.client_user,
            display_name="Client Workspace",
            role=AccountProfile.ROLE_CLIENT,
            auth_provider=AccountProfile.AUTH_PROVIDER_PASCUANS,
            slug="client-workspace",
        )
        self.client_token = UserApiToken.get_or_create_for_profile(self.client_profile)

        self.freelance_user = User.objects.create_user(
            username="freelance-contact@rivebelle.fr",
            email="freelance-contact@rivebelle.fr",
            password="bonjour123",
        )
        self.freelance_profile = AccountProfile.objects.create(
            user=self.freelance_user,
            display_name="Freelance Contact",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="freelance-contact",
            job_title="Chef de rang",
            city="Lille",
            phone="0601020304",
        )

        self.template = MissionTemplate.objects.create(
            profile=self.client_profile,
            name="Service soir",
            establishment="Bistrot Central",
            contact_name="Lea",
            contact_email="lea@bistrot.fr",
        )
        self.contact = ClientContact.objects.create(
            client_profile=self.client_profile,
            contact_profile=self.freelance_profile,
        )
        self.mission = Mission.objects.create(
            profile=self.freelance_profile,
            title="Renfort vendredi",
            status=Mission.STATUS_PROPOSED,
            client_name="Client Workspace",
            client_email=self.client_user.email,
            client_company="Bistrot Central",
        )
        self.facture = Facture.objects.create(
            profile=self.freelance_profile,
            mission=self.mission,
            numero="2026-0001",
            client_name="Bistrot Central",
            contact_name="Client Workspace",
            contact_email=self.client_user.email,
            montant_ht="120.00",
            tva="0.00",
            montant_ttc="120.00",
        )

    def test_client_dashboard_returns_workspace_payload(self):
        response = self.client.get(
            reverse("client-dashboard"),
            HTTP_AUTHORIZATION=f"Token {self.client_token.token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["profile"]["role"], AccountProfile.ROLE_CLIENT)
        self.assertEqual(len(response.data["templates"]), 1)
        self.assertEqual(len(response.data["contacts"]), 1)
        self.assertEqual(response.data["contacts"][0]["profile"]["slug"], "freelance-contact")
        self.assertEqual(len(response.data["missions"]), 1)
        self.assertEqual(response.data["missions"][0]["profile_slug"], "freelance-contact")
        self.assertEqual(len(response.data["factures"]), 1)
        self.assertEqual(response.data["factures"][0]["profile_slug"], "freelance-contact")

    def test_client_can_crud_templates(self):
        create_response = self.client.post(
            reverse("client-templates"),
            {
                "name": "Brunch weekend",
                "establishment": "Cafe du Marche",
                "contact_name": "Nina",
                "mode": "freelance",
            },
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.client_token.token}",
        )

        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.data["id"]

        patch_response = self.client.patch(
            reverse("client-template-detail", args=[template_id]),
            {"instructions": "Arriver 30 minutes avant le service."},
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.client_token.token}",
        )

        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(
            patch_response.data["instructions"],
            "Arriver 30 minutes avant le service.",
        )

        delete_response = self.client.delete(
            reverse("client-template-detail", args=[template_id]),
            HTTP_AUTHORIZATION=f"Token {self.client_token.token}",
        )

        self.assertEqual(delete_response.status_code, 204)

    def test_client_can_add_and_remove_contact_by_slug(self):
        other_freelance_user = User.objects.create_user(
            username="other-freelance@rivebelle.fr",
            email="other-freelance@rivebelle.fr",
            password="bonjour123",
        )
        other_freelance_profile = AccountProfile.objects.create(
            user=other_freelance_user,
            display_name="Other Freelance",
            role=AccountProfile.ROLE_FREELANCE,
            auth_provider=AccountProfile.AUTH_PROVIDER_LOCAL,
            slug="other-freelance",
        )

        create_response = self.client.post(
            reverse("client-contacts"),
            {"profile_slug": other_freelance_profile.slug},
            format="json",
            HTTP_AUTHORIZATION=f"Token {self.client_token.token}",
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.data["profile"]["slug"], "other-freelance")

        delete_response = self.client.delete(
            reverse("client-contact-detail", args=[create_response.data["id"]]),
            HTTP_AUTHORIZATION=f"Token {self.client_token.token}",
        )

        self.assertEqual(delete_response.status_code, 204)
