from django.db import migrations
from django.utils import timezone
import unicodedata

def seed(apps,schema_editor):
    Template=apps.get_model('resto','ServiceTemplate')
    Skill=apps.get_model('resto','RestaurantSkill')
    Member=apps.get_model('resto','RestaurantMember')
    for t in Template.objects.all():
        first=t.occurrences.order_by('date').first()
        t.starts_on=first.date if first else timezone.localdate()
        t.save(update_fields=['starts_on'])
    for member in Member.objects.all():
        for name in member.skills:
            if name.strip() and len(name.strip())<=40:
                Skill.objects.get_or_create(restaurant_id=member.restaurant_id,normalized=unicodedata.normalize('NFKC',name.strip()).casefold(),defaults={'name':name.strip()})

class Migration(migrations.Migration):
    dependencies=[('resto','0005_restaurantmember_pin_failures_and_more')]
    operations=[migrations.RunPython(seed,migrations.RunPython.noop)]
