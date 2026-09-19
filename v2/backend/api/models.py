"""
api/models.py
Layer  : Backend — modèles de données
Role   : Définit tous les modèles Django de l'application ExtraBeam v2.
         AccountProfile centralise le profil utilisateur (auth + CV).
         Skill, Experience, Slot, Unavailability, UserApiToken complètent le domaine métier.
Depends: settings.AUTH_USER_MODEL (Django User standard)
"""

import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unique_slug(base: str, model_class, exclude_pk=None) -> str:
    """Génère un slug unique pour un modèle donné."""
    slug = slugify(base or "user") or "user"
    candidate = slug
    counter = 1
    qs = model_class.objects.all()
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    while qs.filter(slug=candidate).exists():
        candidate = f"{slug}-{counter}"
        counter += 1
    return candidate


# ---------------------------------------------------------------------------
# AccountProfile
# ---------------------------------------------------------------------------

class AccountProfile(models.Model):
    AUTH_PROVIDER_LOCAL = "local"
    AUTH_PROVIDER_GOOGLE = "google"
    AUTH_PROVIDER_PASCUANS = "pascuans"
    AUTH_PROVIDER_CHOICES = [
        (AUTH_PROVIDER_LOCAL, "Local"),
        (AUTH_PROVIDER_GOOGLE, "Google"),
        (AUTH_PROVIDER_PASCUANS, "Pascuans"),
    ]
    ROLE_FREELANCE = "freelance"
    ROLE_CLIENT = "client"
    ROLE_ADMIN = "admin"
    ROLE_CHOICES = [
        (ROLE_FREELANCE, "Freelance"),
        (ROLE_CLIENT, "Client"),
        (ROLE_ADMIN, "Admin"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="account_profile",
    )

    # --- Identité publique ---
    slug = models.SlugField(max_length=80, unique=True, null=True, blank=True)
    display_name = models.CharField(max_length=150, blank=True)
    avatar_url = models.URLField(blank=True)
    avatar_storage_key = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_FREELANCE)

    # --- CV ---
    job_title = models.CharField(max_length=120, blank=True)
    location = models.CharField(max_length=120, blank=True)
    bio = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    city = models.CharField(max_length=120, blank=True)
    country = models.CharField(max_length=120, blank=True, default="France")
    siret = models.CharField(max_length=20, blank=True)
    legal_status = models.CharField(
        max_length=120, blank=True, default="micro-entreprise"
    )
    vat_number = models.CharField(max_length=40, blank=True)
    vat_notice = models.CharField(
        max_length=255,
        blank=True,
        default="TVA non applicable, art. 293 B du CGI",
    )
    iban = models.CharField(max_length=64, blank=True)
    bic = models.CharField(max_length=20, blank=True)
    hourly_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    hourly_rate_public = models.BooleanField(default=False)
    currency = models.CharField(max_length=8, blank=True, default="EUR")
    payment_terms = models.TextField(
        blank=True, default="Paiement comptant a reception"
    )
    late_penalties = models.TextField(
        blank=True,
        default="Taux BCE + 10 points",
    )
    subscription_status = models.CharField(max_length=24, blank=True, default="")
    subscription_plan = models.CharField(max_length=80, blank=True)
    subscription_period_end = models.DateTimeField(null=True, blank=True)
    subscription_cancel_at_period_end = models.BooleanField(default=False)

    # --- Auth ---
    auth_provider = models.CharField(
        max_length=24, choices=AUTH_PROVIDER_CHOICES, default=AUTH_PROVIDER_LOCAL
    )
    google_sub = models.CharField(max_length=255, unique=True, blank=True, null=True)
    oidc_sub = models.CharField(
        max_length=255, unique=True, blank=True, null=True, db_index=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = self.display_name or (
                self.user.username if self.user_id else "user"
            )
            self.slug = _unique_slug(base, AccountProfile, exclude_pk=self.pk)
            # Si update_fields est passé, on ajoute slug pour qu'il soit bien persisté.
            # Sans ça, le slug serait généré en mémoire mais jamais sauvegardé en base.
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = list(kwargs["update_fields"]) + ["slug"]
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.display_name or self.user.email or self.user.username


# ---------------------------------------------------------------------------
# CV — Compétences
# ---------------------------------------------------------------------------

class Skill(models.Model):
    profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="skills"
    )
    name = models.CharField(max_length=80)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["profile", "name"], name="unique_skill_per_profile"
            )
        ]

    def __str__(self) -> str:
        return self.name


# ---------------------------------------------------------------------------
# CV — Expériences
# ---------------------------------------------------------------------------

class Experience(models.Model):
    profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="experiences"
    )
    title = models.CharField(max_length=160)
    company = models.CharField(max_length=160, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)
    is_current = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_current", "-start_date", "-created_at"]

    def __str__(self) -> str:
        if self.company:
            return f"{self.title} — {self.company}"
        return self.title


# ---------------------------------------------------------------------------
# Client workspace — Templates & contacts
# ---------------------------------------------------------------------------

class MissionTemplate(models.Model):
    MODE_FREELANCE = "freelance"
    MODE_SALARIE = "salarie"
    MODE_CHOICES = [
        (MODE_FREELANCE, "Freelance"),
        (MODE_SALARIE, "Salarie"),
    ]

    profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="mission_templates"
    )
    name = models.CharField(max_length=160)
    establishment = models.CharField(max_length=160)
    contact_name = models.CharField(max_length=160, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    instructions = models.TextField(blank=True)
    establishment_address_line1 = models.CharField(max_length=255, blank=True)
    establishment_address_line2 = models.CharField(max_length=255, blank=True)
    establishment_postal_code = models.CharField(max_length=20, blank=True)
    establishment_city = models.CharField(max_length=120, blank=True)
    establishment_country = models.CharField(max_length=120, blank=True)
    mode = models.CharField(
        max_length=20, choices=MODE_CHOICES, default=MODE_FREELANCE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class ClientContact(models.Model):
    client_profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="client_contacts"
    )
    contact_profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="saved_by_clients"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["client_profile", "contact_profile"],
                name="unique_contact_per_client_profile",
            )
        ]

    def __str__(self) -> str:
        return f"{self.client_profile} -> {self.contact_profile}"


class ProfileContact(models.Model):
    """
    Lien mutuel entre deux profils.
    Quand A ajoute B, les deux apparaissent dans leurs contacts respectifs.
    La suppression d'un côté retire le lien des deux côtés.
    """
    from_profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="contacts_initiated"
    )
    to_profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="contacts_received"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["from_profile", "to_profile"],
                name="unique_profile_contact",
            )
        ]

    def __str__(self) -> str:
        return f"{self.from_profile} ↔ {self.to_profile}"


# ---------------------------------------------------------------------------
# Agenda — Créneaux de disponibilité
# ---------------------------------------------------------------------------

class Slot(models.Model):
    profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="slots"
    )
    # Mission optionnelle : un slot peut être lié à une mission ou être libre.
    mission = models.ForeignKey(
        "Mission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="slots",
    )
    title = models.CharField(max_length=200, blank=True)
    start = models.DateTimeField()
    end = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start"]

    def __str__(self) -> str:
        return f"Slot {self.start:%Y-%m-%d %H:%M} → {self.end:%H:%M}"


# ---------------------------------------------------------------------------
# Agenda — Indisponibilités récurrentes
# ---------------------------------------------------------------------------

class Unavailability(models.Model):
    RECURRENCE_ONCE = "once"
    RECURRENCE_WEEKLY = "weekly"
    RECURRENCE_CHOICES = [
        (RECURRENCE_ONCE, "Ponctuelle"),
        (RECURRENCE_WEEKLY, "Hebdomadaire"),
    ]

    profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="unavailabilities"
    )
    recurrence_type = models.CharField(
        max_length=20, choices=RECURRENCE_CHOICES, default=RECURRENCE_ONCE
    )
    weekday = models.IntegerField(null=True, blank=True)    # 1=Lundi … 7=Dimanche
    start_date = models.DateField(null=True, blank=True)    # pour "once"
    start_time = models.TimeField()
    end_time = models.TimeField()
    recurrence_end = models.DateField(null=True, blank=True)
    exceptions = models.JSONField(default=list)             # liste de "YYYY-MM-DD"
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["recurrence_type", "weekday", "start_time"]

    def __str__(self) -> str:
        return f"Indispo {self.get_recurrence_type_display()} — {self.profile}"


# ---------------------------------------------------------------------------
# Missions
# ---------------------------------------------------------------------------

class Mission(models.Model):
    STATUS_PROPOSED  = "proposée"
    STATUS_ONGOING   = "en_cours"
    STATUS_COMPLETED = "terminée"
    STATUS_REFUSED   = "refusée"
    MODE_FREELANCE = "freelance"
    MODE_SALARIE = "salarie"
    STATUS_CHOICES = [
        (STATUS_PROPOSED,  "Proposée"),
        (STATUS_ONGOING,   "En cours"),
        (STATUS_COMPLETED, "Terminée"),
        (STATUS_REFUSED,   "Refusée"),
    ]
    MODE_CHOICES = [
        (MODE_FREELANCE, "Freelance"),
        (MODE_SALARIE, "Salarie"),
    ]

    profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="missions"
    )
    client_profile = models.ForeignKey(
        AccountProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="client_missions",
    )

    # --- Infos mission ---
    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status      = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PROPOSED
    )
    notes       = models.TextField(blank=True)
    establishment = models.CharField(max_length=200, blank=True)
    establishment_address_line1 = models.CharField(max_length=255, blank=True)
    establishment_address_line2 = models.CharField(max_length=255, blank=True)
    establishment_postal_code = models.CharField(max_length=20, blank=True)
    establishment_city = models.CharField(max_length=120, blank=True)
    establishment_country = models.CharField(
        max_length=120, blank=True, default="France"
    )
    contact_name = models.CharField(max_length=200, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    instructions = models.TextField(blank=True)
    mode = models.CharField(
        max_length=20, choices=MODE_CHOICES, default=MODE_FREELANCE
    )

    # --- Client ---
    client_name    = models.CharField(max_length=200, blank=True)
    client_email   = models.EmailField(blank=True)
    client_phone   = models.CharField(max_length=30, blank=True)
    client_company = models.CharField(max_length=200, blank=True)

    # --- Tarif ---
    daily_rate   = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    total_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )

    # --- Dates ---
    start_date = models.DateField(null=True, blank=True)
    end_date   = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} — {self.profile}"


# ---------------------------------------------------------------------------
# Factures
# ---------------------------------------------------------------------------

class Facture(models.Model):
    STATUS_PENDING_PAYMENT = "pending_payment"
    STATUS_PAID = "paid"
    STATUS_CANCELED = "canceled"
    STATUS_CHOICES = [
        (STATUS_PENDING_PAYMENT, "Paiement en attente"),
        (STATUS_PAID, "Payée"),
        (STATUS_CANCELED, "Annulée"),
    ]

    profile = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="factures"
    )
    mission = models.ForeignKey(
        Mission,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="factures",
    )

    numero = models.CharField(max_length=40)
    date_emission = models.DateField(default=timezone.localdate)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING_PAYMENT
    )

    client_name = models.CharField(max_length=200)
    client_address_ligne1 = models.CharField(max_length=255, blank=True)
    client_address_ligne2 = models.CharField(max_length=255, blank=True)
    client_code_postal = models.CharField(max_length=20, blank=True)
    client_ville = models.CharField(max_length=120, blank=True)
    client_pays = models.CharField(max_length=120, blank=True)
    client_siren = models.CharField(max_length=20, blank=True)
    client_siret = models.CharField(max_length=20, blank=True)
    client_vat_number = models.CharField(max_length=32, blank=True)
    contact_name = models.CharField(max_length=200, blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    contact_email = models.EmailField(blank=True)

    description = models.TextField(blank=True)
    hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    montant_ht = models.DecimalField(max_digits=12, decimal_places=2)
    tva = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    montant_ttc = models.DecimalField(max_digits=12, decimal_places=2)

    mention_tva = models.CharField(max_length=255, blank=True)
    date_echeance = models.DateField(null=True, blank=True)
    conditions_paiement = models.TextField(blank=True)
    escompte = models.TextField(blank=True)
    penalites_retard = models.TextField(blank=True)
    indemnite_recouvrement = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date_emission", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["profile", "numero"], name="unique_facture_numero_per_profile"
            )
        ]

    def __str__(self) -> str:
        return f"{self.numero} — {self.profile}"


# ---------------------------------------------------------------------------
# Auth — Token API
# ---------------------------------------------------------------------------

class UserApiToken(models.Model):
    """Token opaque 1:1 avec AccountProfile pour authentifier les appels API."""

    profile = models.OneToOneField(
        AccountProfile, on_delete=models.CASCADE, related_name="api_token"
    )
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Token — {self.profile}"

    @classmethod
    def get_or_create_for_profile(cls, profile: AccountProfile) -> "UserApiToken":
        try:
            return cls.objects.get(profile=profile)
        except cls.DoesNotExist:
            return cls.objects.create(
                profile=profile, token=secrets.token_urlsafe(48)
            )
