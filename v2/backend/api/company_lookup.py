"""Public SIRENE billing data, accessed server-side through the State's directory."""
import re

import requests
from django.core.cache import cache
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView


class CompanyLookupThrottle(UserRateThrottle):
    scope = "company_lookup"
    rate = "30/min"


def clean(value):
    return " ".join(str(value or "").split())


def normalize_company(company, siret):
    if company.get("siren") != siret[:9] or company.get("statut_diffusion") not in (None, "O"):
        return None
    headquarters = company.get("siege") or {}
    establishment = headquarters if headquarters.get("siret") == siret else next(
        (item for item in company.get("matching_etablissements", []) if item.get("siret") == siret), None
    )
    if not establishment or establishment.get("statut_diffusion_etablissement") != "O":
        return None
    name = clean(company.get("nom_raison_sociale") or company.get("nom_complet"))
    postal = clean(establishment.get("code_postal"))
    city = clean(establishment.get("libelle_commune"))
    street = clean(" ".join(clean(establishment.get(key)) for key in (
        "numero_voie", "indice_repetition", "type_voie", "libelle_voie"
    )))
    complement = clean(establishment.get("complement_adresse"))
    if not street:
        address = clean(establishment.get("adresse"))
        suffix = clean(f"{postal} {city}")
        if suffix and address.upper().endswith(suffix.upper()):
            street = address[:-len(suffix)].strip()
    fields = [name, street, complement, postal, city]
    if not name or not street or not postal or not city or any("[ND]" in value for value in fields):
        return None
    state = establishment.get("etat_administratif")
    return {
        "legal_name": name, "siren": siret[:9], "siret": siret,
        "address_line1": street, "address_line2": complement,
        "postal_code": postal, "city": city, "country": "FR",
        "status": "closed" if state == "F" or company.get("etat_administratif") == "C" else "active" if state == "A" else "unknown",
        "source": "recherche-entreprises.api.gouv.fr",
    }


class CompanyLookupView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [CompanyLookupThrottle]

    def get(self, request):
        siret = re.sub(r"\s", "", request.query_params.get("siret", ""))
        if not re.fullmatch(r"[0-9]{14}", siret):
            return Response({"detail": "Saisissez un SIRET de 14 chiffres."}, status=400)
        key = f"company-lookup:v1:{siret}"
        cached = cache.get(key)
        if cached:
            return Response(cached)
        try:
            response = requests.get(
                "https://recherche-entreprises.api.gouv.fr/search",
                params={"q": siret, "per_page": 1, "minimal": "true", "include": "siege,matching_etablissements"},
                headers={"Accept": "application/json", "User-Agent": "Rivebelle/1.0"},
                timeout=(3, 8),
            )
            response.raise_for_status()
            payload = response.json()
            results = payload["results"]
            if not isinstance(results, list):
                raise ValueError("Invalid directory response")
            result = next((data for item in results if (data := normalize_company(item, siret))), None)
        except (requests.RequestException, ValueError, TypeError, KeyError, AttributeError):
            return Response({"detail": "L’annuaire est momentanément indisponible. Réessayez ou renseignez le client manuellement."}, status=503)
        if result is None:
            return Response({"detail": "Aucun établissement avec une adresse publique complète trouvé pour ce SIRET. Vous pouvez renseigner le client manuellement."}, status=404)
        cache.set(key, result, 3600)
        return Response(result)
