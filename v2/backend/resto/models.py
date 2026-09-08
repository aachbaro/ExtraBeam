from django.db import models
from api.models import AccountProfile


class Restaurant(models.Model):
    slug = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=80, blank=True)
    cuisine_type = models.CharField(max_length=60, blank=True)
    logo_url = models.URLField(blank=True)
    cover_url = models.URLField(blank=True)
    owner = models.ForeignKey(
        AccountProfile, on_delete=models.CASCADE, related_name="owned_restaurants"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


POSITION_CHOICES = [
    ("serveur", "Serveur·se"),
    ("chef_de_rang", "Chef de rang"),
    ("barman", "Barman / Barmaid"),
    ("sommelier", "Sommelier·e"),
    ("hote_accueil", "Hôte·sse d'accueil"),
    ("chef_cuisine", "Chef de cuisine"),
    ("cuisinier", "Cuisinier·e"),
    ("plongeur", "Plongeur·se"),
    ("manager", "Manager"),
    ("autre", "Autre"),
]


class RestaurantMember(models.Model):
    restaurant = models.ForeignKey(
        Restaurant, on_delete=models.CASCADE, related_name="members"
    )
    profile = models.ForeignKey(
        AccountProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="restaurant_memberships"
    )
    name = models.CharField(max_length=80)
    position = models.CharField(max_length=40, choices=POSITION_CHOICES, default="serveur")
    is_active = models.BooleanField(default=True)
    is_manager = models.BooleanField(default=False)
    email = models.EmailField(blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("restaurant", "profile")]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} @ {self.restaurant.name}"


SERVICE_CHOICES = [
    ("midi", "Midi"),
    ("soir", "Soir"),
    ("journee", "Journée"),
    ("autre", "Autre"),
]

SHIFT_STATUS_CHOICES = [
    ("draft", "Brouillon"),
    ("published", "Publié"),
]


class RestaurantShift(models.Model):
    restaurant = models.ForeignKey(
        Restaurant, on_delete=models.CASCADE, related_name="shifts"
    )
    title = models.CharField(max_length=120, blank=True)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    service = models.CharField(max_length=20, choices=SERVICE_CHOICES, default="soir")
    positions_needed = models.PositiveSmallIntegerField(default=1)
    position = models.CharField(max_length=40, choices=POSITION_CHOICES, default="serveur")
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=SHIFT_STATUS_CHOICES, default="draft")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "start_time"]

    def __str__(self):
        return f"{self.restaurant.name} · {self.date} {self.start_time}–{self.end_time}"


AVAILABILITY_STATUS = [
    ("available", "Disponible"),
    ("unavailable", "Indisponible"),
    ("maybe", "Peut-être"),
]


class ShiftAvailability(models.Model):
    shift = models.ForeignKey(
        RestaurantShift, on_delete=models.CASCADE, related_name="availabilities"
    )
    member = models.ForeignKey(
        RestaurantMember, on_delete=models.CASCADE, related_name="availabilities"
    )
    status = models.CharField(max_length=20, choices=AVAILABILITY_STATUS, default="available")
    note = models.CharField(max_length=200, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("shift", "member")]

    def __str__(self):
        return f"{self.member.name} / {self.shift} → {self.status}"


ASSIGNMENT_STATUS = [
    ("proposed", "Proposé"),
    ("confirmed", "Confirmé"),
    ("declined", "Décliné"),
]


class ShiftAssignment(models.Model):
    shift = models.ForeignKey(
        RestaurantShift, on_delete=models.CASCADE, related_name="assignments"
    )
    member = models.ForeignKey(
        RestaurantMember, on_delete=models.CASCADE, related_name="assignments"
    )
    assigned_by = models.ForeignKey(
        AccountProfile, on_delete=models.SET_NULL, null=True, blank=True
    )
    status = models.CharField(max_length=20, choices=ASSIGNMENT_STATUS, default="proposed")
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("shift", "member")]

    def __str__(self):
        return f"{self.member.name} assigné à {self.shift}"
