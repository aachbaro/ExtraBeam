from datetime import date, time, datetime
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from api.models import AccountProfile, Unavailability
from .models import Restaurant, RestaurantMember, RestaurantShift, ShiftAssignment
from .scheduling import minutes, availability

class PlanningTests(APITestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user(username="owner")
        self.profile=AccountProfile.objects.create(user=self.user,slug="owner")
        self.restaurant=Restaurant.objects.create(slug="test-resto",name="Test",owner=self.profile)
        self.member=RestaurantMember.objects.create(restaurant=self.restaurant,name="Alice",position="serveur",default_availability="available")
        self.base="/api/resto/restaurants/test-resto/"
        self.client.force_authenticate(self.user)

    def shift(self, **kwargs):
        return RestaurantShift.objects.create(restaurant=self.restaurant,**{**dict(date=date(2026,9,7),start_time=time(11),end_time=time(15,30)),**kwargs})

    def test_recurrence_and_overnight(self):
        r=self.client.post(self.base+"shifts/",dict(date="2026-09-07",start_time="18:30",end_time="00:00",repeat_weeks=3,repeat_interval=2),format="json")
        self.assertEqual(r.status_code,201,r.data)
        rows=list(self.restaurant.shifts.all())
        self.assertEqual([s.date for s in rows],[date(2026,9,7),date(2026,9,21),date(2026,10,5)])
        self.assertEqual(minutes(rows[0]),300)
        self.assertEqual(len({s.series_id for s in rows}),1)
        bad=self.client.post(self.base+"shifts/",dict(date="2026-09-07",start_time="11:00",end_time="11:15",repeat_weeks=3),format="json")
        self.assertEqual(bad.status_code,400)
        self.assertEqual(self.restaurant.shifts.count(),3)

    def test_manual_assignment_survives_and_conflict_rejected(self):
        s=self.shift();other=self.shift(start_time=time(12))
        r=self.client.post(f"{self.base}shifts/{s.id}/assignments/",{"member_id":self.member.id})
        self.assertEqual(r.status_code,201,r.data)
        self.assertTrue(s.assignments.get().locked)
        self.assertEqual(self.client.post(f"{self.base}shifts/{other.id}/assignments/",{"member_id":self.member.id}).status_code,400)
        r=self.client.post(self.base+"generate/",{"from":"2026-09-07","to":"2026-09-13"})
        self.assertEqual(r.status_code,200,r.data)
        self.assertEqual(s.assignments.get().member_id,self.member.id)
        self.assertEqual(other.assignments.count(),0)

    def test_unknown_and_unqualified_not_generated(self):
        s=self.shift(required_skills=["clés"])
        self.client.post(self.base+"generate/",{"from":"2026-09-07","to":"2026-09-13"})
        self.assertEqual(s.assignments.count(),0)
        self.member.skills=["clés"];self.member.default_availability="unknown";self.member.save()
        self.client.post(self.base+"generate/",{"from":"2026-09-07","to":"2026-09-13"})
        self.assertEqual(s.assignments.count(),0)
        self.member.default_availability="maybe";self.member.save()
        self.client.post(self.base+"generate/",{"from":"2026-09-07","to":"2026-09-13"})
        self.assertEqual(s.assignments.get().member_id,self.member.id)

    def test_profile_unavailability_and_hours(self):
        self.member.profile=self.profile;self.member.save()
        s=self.shift()
        rule=Unavailability.objects.create(profile=self.profile,recurrence_type="weekly",weekday=1,start_time=time(12),end_time=time(13))
        self.assertEqual(availability(self.member,s),"unavailable")
        rule.exceptions=["2026-09-07"];rule.save()
        self.assertEqual(availability(self.member,s),"available")
        s.assignments.create(member=self.member)
        r=self.client.get(self.base+"hours/?month=2026-09")
        self.assertEqual(r.data[0]["draft_minutes"],240)
        self.assertEqual(r.data[0]["published_minutes"],0)
        r=self.client.patch(f"{self.base}shifts/{s.id}/",{"status":"published"},format="json")
        self.assertEqual(r.status_code,200,r.data)
        r=self.client.get(self.base+"hours/?month=2026-09")
        self.assertEqual(r.data[0]["published_minutes"],240)
        self.assertEqual(r.data[0]["draft_minutes"],0)

    def test_private_team_and_cross_restaurant(self):
        s=self.shift()
        outsider=get_user_model().objects.create_user(username="outsider")
        AccountProfile.objects.create(user=outsider,slug="outsider")
        self.client.force_authenticate(outsider)
        for path in ["members/","shifts/",f"shifts/{s.id}/","hours/?month=2026-09"]:
            self.assertEqual(self.client.get(self.base+path).status_code,403)
        self.assertEqual(self.client.post(self.base+"generate/",{"from":"2026-09-07","to":"2026-09-13"}).status_code,403)

class ServiceTests(PlanningTests):
    def definition(self):
        return dict(title='Mercredi midi',start_time='12:00',kitchen_end_time='14:30',end_time='15:30',notes='',tasks=[dict(key='opening',label='Installer la salle',phase='opening',done=False)],slots=[dict(key='salle',position='serveur',title='',positions_needed=3,start_time='11:00',end_time='15:30',break_minutes=30,required_skills=[]),dict(key='cuisine',position='cuisinier',title='',positions_needed=1,start_time='09:00',end_time='15:30',break_minutes=30,required_skills=[])])

    def create_template(self):
        response=self.client.post(self.base+'service-templates/',{'weekday':2,'definition':self.definition()},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data['id']

    def test_service_is_multi_role_and_tasks_are_independent(self):
        template=self.create_template()
        data=dict(date='2027-09-01',template_id=template,repeat_weeks=2)
        response=self.client.post(self.base+'services/',data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        a,b=response.data
        self.assertEqual(len(a['shifts']),2)
        self.assertEqual(a['shifts'][0]['positions_needed'],3)
        self.assertEqual(a['shifts'][0]['start_time'],'11:00:00')
        r=self.client.patch(f"{self.base}services/{a['id']}/",{'task_key':'opening','done':True},format='json')
        self.assertEqual(r.status_code,200,r.data)
        self.assertTrue(r.data['tasks'][0]['done'])
        rows=self.client.get(self.base+'services/').data
        self.assertFalse(next(s for s in rows if s['id']==b['id'])['tasks'][0]['done'])
        self.assertEqual(self.client.post(self.base+'services/',data,format='json').data,[])
        # Task and role edits on one occurrence do not affect its sibling/model.
        edited=self.definition();edited['notes']='Livraison';edited['slots'][0]['positions_needed']=4
        r=self.client.patch(f"{self.base}services/{a['id']}/",{'definition':edited},format='json')
        self.assertEqual(r.status_code,200,r.data)
        self.assertEqual(r.data['shifts'][0]['positions_needed'],4)
        from .models import RestaurantService
        self.assertEqual(RestaurantService.objects.get(pk=b['id']).slots.get(position='serveur').positions_needed,3)

    def test_template_merge_preserves_overrides_completed_tasks_and_published(self):
        from .models import RestaurantService
        template=self.create_template()
        rows=self.client.post(self.base+'services/',dict(date='2027-09-01',template_id=template,repeat_weeks=3),format='json').data
        a,b,c=[RestaurantService.objects.get(pk=r['id']) for r in rows]
        a.notes='Livraison de vin';a.tasks[0]['done']=True;a.save()
        slot=a.slots.get(position='serveur');slot.positions_needed=4;slot.save()
        b.slots.update(status='published')
        changed=self.definition();changed['notes']='Consigne générale';changed['end_time']='16:00';changed['slots'][0]['positions_needed']=2;changed['tasks'].append(dict(key='closing',label='Ranger',phase='closing',done=False))
        r=self.client.patch(f'{self.base}service-templates/{template}/',dict(definition=changed,apply_future=True),format='json')
        self.assertEqual(r.status_code,200,r.data)
        a.refresh_from_db();b.refresh_from_db();c.refresh_from_db()
        self.assertEqual(a.notes,'Livraison de vin');self.assertTrue(a.tasks[0]['done'])
        self.assertEqual(a.slots.get(position='serveur').positions_needed,4)
        self.assertEqual(c.slots.get(position='serveur').positions_needed,2)
        self.assertEqual(c.notes,'Consigne générale')
        self.assertEqual(len(a.tasks),2);self.assertEqual(len(b.tasks),1)
        self.assertEqual(str(b.end_time),'15:30:00')
        self.assertFalse(c.tasks[-1]['done'])
        # Removing a task on an occurrence remains an override on later sync.
        a.tasks=[];a.save()
        self.client.patch(f'{self.base}service-templates/{template}/',dict(definition=changed,apply_future=True),format='json')
        a.refresh_from_db();self.assertEqual(a.tasks,[])

    def test_service_validation_and_scope(self):
        template=self.create_template()
        data=self.definition();data['kitchen_end_time']='17:00'
        self.assertEqual(self.client.post(self.base+'services/',dict(date='2027-09-01',definition=data),format='json').status_code,400)
        row=self.client.post(self.base+'services/',dict(date='2027-09-01',template_id=template),format='json').data[0]
        slot=RestaurantShift.objects.get(pk=row['shifts'][0]['id'])
        slot.assignments.create(member=self.member)
        data=self.definition();data['slots']=[]
        r=self.client.patch(f"{self.base}services/{row['id']}/",dict(definition=data),format='json')
        self.assertEqual(r.status_code,400,r.data)
        self.assertTrue(slot.assignments.exists())
        outsider=get_user_model().objects.create_user(username='outside-services')
        AccountProfile.objects.create(user=outsider,slug='outside-services')
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(self.base+'services/').status_code,403)
        self.assertEqual(self.client.get(self.base+'service-templates/').status_code,403)
        self.assertEqual(self.client.patch(f"{self.base}services/{row['id']}/",{'task_key':'opening','done':True},format='json').status_code,403)
