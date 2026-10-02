# Generated manually for Rivebelle v2 invoice support.

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0006_accountprofile_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="Facture",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("numero", models.CharField(max_length=40)),
                ("date_emission", models.DateField(default=django.utils.timezone.localdate)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending_payment", "Paiement en attente"),
                            ("paid", "Payée"),
                            ("canceled", "Annulée"),
                        ],
                        default="pending_payment",
                        max_length=20,
                    ),
                ),
                ("client_name", models.CharField(max_length=200)),
                ("client_address_ligne1", models.CharField(blank=True, max_length=255)),
                ("client_address_ligne2", models.CharField(blank=True, max_length=255)),
                ("client_code_postal", models.CharField(blank=True, max_length=20)),
                ("client_ville", models.CharField(blank=True, max_length=120)),
                ("client_pays", models.CharField(blank=True, max_length=120)),
                ("contact_name", models.CharField(blank=True, max_length=200)),
                ("contact_phone", models.CharField(blank=True, max_length=30)),
                ("contact_email", models.EmailField(blank=True, max_length=254)),
                ("description", models.TextField(blank=True)),
                ("hours", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("rate", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("montant_ht", models.DecimalField(decimal_places=2, max_digits=12)),
                ("tva", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("montant_ttc", models.DecimalField(decimal_places=2, max_digits=12)),
                ("mention_tva", models.CharField(blank=True, max_length=255)),
                ("conditions_paiement", models.TextField(blank=True)),
                ("penalites_retard", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "mission",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="factures",
                        to="api.mission",
                    ),
                ),
                (
                    "profile",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="factures",
                        to="api.accountprofile",
                    ),
                ),
            ],
            options={
                "ordering": ["-date_emission", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="facture",
            constraint=models.UniqueConstraint(
                fields=("profile", "numero"),
                name="unique_facture_numero_per_profile",
            ),
        ),
    ]
