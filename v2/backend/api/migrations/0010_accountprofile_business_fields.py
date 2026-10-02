# Generated manually for Rivebelle v2 business profile fields.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0009_experience"),
    ]

    operations = [
        migrations.AddField(
            model_name="accountprofile",
            name="address_line1",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="address_line2",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="bic",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="city",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="country",
            field=models.CharField(blank=True, default="France", max_length=120),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="currency",
            field=models.CharField(blank=True, default="EUR", max_length=8),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="hourly_rate",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="iban",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="late_penalties",
            field=models.TextField(blank=True, default="Taux BCE + 10 pts, indemnite forfaitaire 40 EUR"),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="legal_status",
            field=models.CharField(blank=True, default="micro-entreprise", max_length=120),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="payment_terms",
            field=models.TextField(blank=True, default="Paiement comptant a reception"),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="postal_code",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="siret",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="vat_notice",
            field=models.CharField(blank=True, default="TVA non applicable, art. 293 B du CGI", max_length=255),
        ),
        migrations.AddField(
            model_name="accountprofile",
            name="vat_number",
            field=models.CharField(blank=True, max_length=40),
        ),
    ]
