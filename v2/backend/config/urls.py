from django.contrib import admin
from django.urls import include, path

from config.views import social_frontend_bridge, social_logout

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/lulu/", include("lulu.urls")),
    path("api/auth/social/bridge/", social_frontend_bridge, name="social-bridge"),
    path("api/auth/social/logout/", social_logout, name="social-logout"),
    path("api/auth/social/", include("social_django.urls", namespace="social")),
    path("api/resto/", include("resto.urls")),
    path("api/", include("api.urls")),
]
