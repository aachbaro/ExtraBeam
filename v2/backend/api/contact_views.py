"""
api/contact_views.py
Contacts mutuels entre profils et recherche de profils publics.
"""

from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AccountProfile, ProfileContact
from .serializers import ProfileContactSerializer, ProfileSearchSerializer
from .views import get_request_profile


class ContactsView(APIView):
    """GET: liste des contacts, POST: ajouter un contact par slug."""

    def get(self, request):
        profile = get_request_profile(request)
        if not profile:
            return Response({"error": "Authentification requise."}, status=401)
        contacts = ProfileContact.objects.filter(
            Q(from_profile=profile) | Q(to_profile=profile)
        ).select_related("from_profile__user", "to_profile__user").order_by("-created_at")
        serializer = ProfileContactSerializer(contacts, many=True, context={"request": request, "my_profile": profile})
        return Response(serializer.data)

    def post(self, request):
        profile = get_request_profile(request)
        if not profile:
            return Response({"error": "Authentification requise."}, status=401)
        slug = request.data.get("profile_slug")
        if not slug:
            return Response({"error": "profile_slug requis."}, status=400)
        other = AccountProfile.objects.filter(slug=slug).first()
        if not other:
            return Response({"error": "Profil introuvable."}, status=404)
        if other.pk == profile.pk:
            return Response({"error": "Vous ne pouvez pas vous ajouter vous-même."}, status=400)
        existing = ProfileContact.objects.filter(
            Q(from_profile=profile, to_profile=other) | Q(from_profile=other, to_profile=profile)
        ).first()
        if existing:
            serializer = ProfileContactSerializer(existing, context={"request": request, "my_profile": profile})
            return Response(serializer.data, status=200)
        contact = ProfileContact.objects.create(from_profile=profile, to_profile=other)
        serializer = ProfileContactSerializer(contact, context={"request": request, "my_profile": profile})
        return Response(serializer.data, status=201)


class ContactDetailView(APIView):
    """DELETE: supprimer un contact par slug de l'autre profil."""

    def delete(self, request, slug):
        profile = get_request_profile(request)
        if not profile:
            return Response({"error": "Authentification requise."}, status=401)
        other = AccountProfile.objects.filter(slug=slug).first()
        if not other:
            return Response({"error": "Profil introuvable."}, status=404)
        ProfileContact.objects.filter(
            Q(from_profile=profile, to_profile=other) | Q(from_profile=other, to_profile=profile)
        ).delete()
        return Response(status=204)


class ContactStatusView(APIView):
    """GET: indique si le profil slug est un contact de l'utilisateur connecté."""

    def get(self, request, slug):
        profile = get_request_profile(request)
        if not profile:
            return Response({"is_contact": False})
        other = AccountProfile.objects.filter(slug=slug).first()
        if not other:
            return Response({"is_contact": False})
        is_contact = ProfileContact.objects.filter(
            Q(from_profile=profile, to_profile=other) | Q(from_profile=other, to_profile=profile)
        ).exists()
        return Response({"is_contact": is_contact})


class ProfileSearchView(APIView):
    """GET /profiles/search/?q=...&role=... : recherche de profils publics."""

    def get(self, request):
        profile = get_request_profile(request)
        if not profile:
            return Response({"error": "Authentification requise."}, status=401)
        q = request.query_params.get("q", "").strip()
        role = request.query_params.get("role", "").strip()
        qs = AccountProfile.objects.select_related("user").exclude(pk=profile.pk)
        if role:
            qs = qs.filter(role=role)
        if q:
            qs = qs.filter(
                Q(display_name__icontains=q) | Q(user__email__icontains=q) | Q(job_title__icontains=q)
            )
        qs = qs.order_by("display_name")[:30]
        serializer = ProfileSearchSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)
