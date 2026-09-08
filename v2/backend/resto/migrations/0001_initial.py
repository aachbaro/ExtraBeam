from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("api", "0016_accountprofile_hourly_rate_public"),
    ]

    operations = [
        migrations.CreateModel(
            name="Restaurant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=80, unique=True)),
                ("name", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("address", models.CharField(blank=True, max_length=255)),
                ("city", models.CharField(blank=True, max_length=80)),
                ("cuisine_type", models.CharField(blank=True, max_length=60)),
                ("logo_url", models.URLField(blank=True)),
                ("cover_url", models.URLField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="owned_restaurants", to="api.accountprofile")),
            ],
        ),
        migrations.CreateModel(
            name="RestaurantMember",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80)),
                ("position", models.CharField(choices=[("serveur", "Serveur·se"), ("chef_de_rang", "Chef de rang"), ("barman", "Barman / Barmaid"), ("sommelier", "Sommelier·e"), ("hote_accueil", "Hôte·sse d'accueil"), ("chef_cuisine", "Chef de cuisine"), ("cuisinier", "Cuisinier·e"), ("plongeur", "Plongeur·se"), ("manager", "Manager"), ("autre", "Autre")], default="serveur", max_length=40)),
                ("is_active", models.BooleanField(default=True)),
                ("is_manager", models.BooleanField(default=False)),
                ("email", models.EmailField(blank=True)),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("restaurant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="members", to="resto.restaurant")),
                ("profile", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="restaurant_memberships", to="api.accountprofile")),
            ],
            options={"ordering": ["name"], "unique_together": {("restaurant", "profile")}},
        ),
        migrations.CreateModel(
            name="RestaurantShift",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(blank=True, max_length=120)),
                ("date", models.DateField()),
                ("start_time", models.TimeField()),
                ("end_time", models.TimeField()),
                ("service", models.CharField(choices=[("midi", "Midi"), ("soir", "Soir"), ("journee", "Journée"), ("autre", "Autre")], default="soir", max_length=20)),
                ("positions_needed", models.PositiveSmallIntegerField(default=1)),
                ("position", models.CharField(choices=[("serveur", "Serveur·se"), ("chef_de_rang", "Chef de rang"), ("barman", "Barman / Barmaid"), ("sommelier", "Sommelier·e"), ("hote_accueil", "Hôte·sse d'accueil"), ("chef_cuisine", "Chef de cuisine"), ("cuisinier", "Cuisinier·e"), ("plongeur", "Plongeur·se"), ("manager", "Manager"), ("autre", "Autre")], default="serveur", max_length=40)),
                ("notes", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("draft", "Brouillon"), ("published", "Publié")], default="draft", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("restaurant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shifts", to="resto.restaurant")),
            ],
            options={"ordering": ["date", "start_time"]},
        ),
        migrations.CreateModel(
            name="ShiftAvailability",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("available", "Disponible"), ("unavailable", "Indisponible"), ("maybe", "Peut-être")], default="available", max_length=20)),
                ("note", models.CharField(blank=True, max_length=200)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="availabilities", to="resto.restaurantmember")),
                ("shift", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="availabilities", to="resto.restaurantshift")),
            ],
            options={"unique_together": {("shift", "member")}},
        ),
        migrations.CreateModel(
            name="ShiftAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("proposed", "Proposé"), ("confirmed", "Confirmé"), ("declined", "Décliné")], default="proposed", max_length=20)),
                ("note", models.CharField(blank=True, max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("assigned_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="api.accountprofile")),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="assignments", to="resto.restaurantmember")),
                ("shift", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="assignments", to="resto.restaurantshift")),
            ],
            options={"unique_together": {("shift", "member")}},
        ),
    ]
