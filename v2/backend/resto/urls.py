from django.urls import path
from . import views

urlpatterns = [
    path("restaurants/", views.restaurants),
    path("restaurants/me/", views.my_restaurants),
    path("restaurants/<slug:slug>/", views.restaurant_detail),
    path("restaurants/<slug:slug>/members/", views.members),
    path("restaurants/<slug:slug>/members/<int:member_id>/", views.member_detail),
    path("restaurants/<slug:slug>/shifts/", views.shifts),
    path("restaurants/<slug:slug>/shifts/<int:shift_id>/", views.shift_detail),
    path("restaurants/<slug:slug>/shifts/<int:shift_id>/availability/", views.shift_availability),
    path("restaurants/<slug:slug>/shifts/<int:shift_id>/assignments/", views.shift_assignments),
    path("restaurants/<slug:slug>/shifts/<int:shift_id>/assignments/<int:assignment_id>/", views.shift_assignment_detail),
]
