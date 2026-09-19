from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('resto', '0007_servicetemplate_definition_versions'),
    ]

    operations = [
        # Changer le default à False : locked=True signifie désormais "poste fixe"
        migrations.AlterField(
            model_name='shiftassignment',
            name='locked',
            field=models.BooleanField(default=False),
        ),
        # Remettre les assignments existants à False (le champ n'était pas utilisé avant)
        migrations.RunSQL(
            sql='UPDATE resto_shiftassignment SET locked = 0 WHERE locked = 1',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
