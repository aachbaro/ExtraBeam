from django.db import migrations


def group_existing(apps, schema_editor):
    Shift=apps.get_model('resto','RestaurantShift')
    Service=apps.get_model('resto','RestaurantService')
    groups={}
    for shift in Shift.objects.filter(service_instance__isnull=True).order_by('restaurant_id','date','start_time','id'):
        groups.setdefault((shift.restaurant_id,shift.date,shift.service),[]).append(shift)
    labels={'midi':'Service du midi','soir':'Service du soir','journee':'Service de la journée','autre':'Service'}
    for (restaurant,day,kind),slots in groups.items():
        start=min(s.start_time for s in slots)
        # Extend overnight ends relative to the earliest staff start.
        minute=lambda t:t.hour*60+t.minute
        end=max(slots,key=lambda s:(minute(s.end_time)-minute(start))%1440).end_time
        notes='\n'.join(dict.fromkeys(s.notes for s in slots if s.notes))
        service=Service.objects.create(restaurant_id=restaurant,date=day,title=labels.get(kind,'Service'),
            start_time=start,end_time=end,kitchen_end_time=end,
            notes=(notes+'\nHoraires repris de l’ancien planning : ouverture clients et fermeture cuisine à préciser.').strip())
        for s in slots:
            s.service_instance_id=service.id;s.template_slot_key='legacy-'+str(s.id)
            s.save(update_fields=['service_instance','template_slot_key'])


class Migration(migrations.Migration):
    dependencies=[('resto','0003_restaurantshift_template_slot_key_restaurantservice_and_more')]
    operations=[migrations.RunPython(group_existing,migrations.RunPython.noop)]
