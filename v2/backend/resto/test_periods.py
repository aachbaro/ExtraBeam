from datetime import date, time, timedelta
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from api.models import AccountProfile
from .models import Restaurant, RestaurantMember, RestaurantShift
from .scheduling import reasons


class PeriodPlanningTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="period-owner")
        self.profile = AccountProfile.objects.create(user=self.user, slug="period-owner")
        self.restaurant = Restaurant.objects.create(slug="period-resto", name="Test", owner=self.profile)
        self.base = "/api/resto/restaurants/period-resto/"
        self.client.force_authenticate(self.user)

    def test_rules_validation_and_daily_limit(self):
        response = self.client.patch(self.base, {"planning_rules": {"cycle_start_day": 15, "max_daily_hours": 3}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.patch(self.base, {"planning_rules": {"cycle_start_day": 32}}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(self.base, {"planning_rules": {"max_days": 8}}, format="json").status_code, 400)
        self.restaurant.refresh_from_db()
        member = RestaurantMember.objects.create(restaurant=self.restaurant, name="Alice", default_availability="available")
        shift = RestaurantShift.objects.create(restaurant=self.restaurant, date=date(2027, 9, 15), start_time=time(10), end_time=time(14), break_minutes=0)
        self.assertIn("Maximum journalier", reasons(member, shift))
        self.client.patch(self.base, {"planning_rules": {"min_rest_hours": 12}}, format="json")
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.planning_rules["cycle_start_day"], 15)
        outsider = get_user_model().objects.create_user(username="outsider-period")
        AccountProfile.objects.create(user=outsider, slug="outsider-period")
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.patch(self.base, {"planning_rules": {"max_daily_hours": 12}}, format="json").status_code, 403)

    def test_whole_cycle_generation_and_hours_cross_month(self):
        members = [RestaurantMember.objects.create(restaurant=self.restaurant, name=str(hours), weekly_hours=hours, default_availability="available") for hours in (10, 20)]
        start, end = date(2027, 9, 15), date(2027, 10, 14)
        for n in range(12):
            RestaurantShift.objects.create(restaurant=self.restaurant, date=start+timedelta(days=n*2), start_time=time(11), end_time=time(14), break_minutes=0)
        outside = RestaurantShift.objects.create(restaurant=self.restaurant, date=date(2027, 10, 15), start_time=time(11), end_time=time(14))
        response = self.client.post(self.base+"generate/", {"from": str(start), "to": str(end)}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["warnings"], [])
        self.assertEqual(outside.assignments.count(), 0)
        self.assertEqual([m.assignments.count() for m in members], [4, 8])
        response = self.client.get(self.base+f"hours/?from={start}&to={end}")
        self.assertEqual(response.status_code, 200, response.data)
        rows = {r["member_id"]: r for r in response.data}
        self.assertEqual(rows[members[0].id]["draft_minutes"], 4*180)
        self.assertEqual(rows[members[1].id]["target_minutes"], round(20*60*30/7))
        self.assertEqual(self.client.get(self.base+"hours/?from=2027-10-14&to=2027-09-15").status_code, 400)
