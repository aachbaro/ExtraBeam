from copy import deepcopy
from unittest.mock import Mock, patch

import requests
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .company_lookup import normalize_company


SIRET = "13002526500013"
COMPANY = {
    "siren": SIRET[:9], "nom_raison_sociale": "DINUM", "statut_diffusion": "O",
    "siege": {"siret": SIRET, "statut_diffusion_etablissement": "O", "etat_administratif": "A",
              "numero_voie": "20", "type_voie": "AVENUE", "libelle_voie": "DE SEGUR",
              "code_postal": "75007", "libelle_commune": "PARIS"},
}


class CompanyLookupTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user("lookup"))

    def lookup(self, value=SIRET):
        return self.client.get("/api/company-lookup/", {"siret": value})

    def test_authentication_required(self):
        self.client.force_authenticate(None)
        self.assertIn(self.lookup().status_code, (401, 403))

    @patch("api.company_lookup.requests.get")
    def test_invalid_siret_does_not_call_provider(self, get):
        for value in ("", "123", "a3002526500013", SIRET + "1"):
            self.assertEqual(self.lookup(value).status_code, 400)
        get.assert_not_called()

    @patch("api.company_lookup.requests.get")
    def test_public_response_and_cache(self, get):
        get.return_value = Mock(json=lambda: {"results": [COMPANY]})
        result = self.lookup("130 025 265 00013")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["address_line1"], "20 AVENUE DE SEGUR")
        self.assertEqual(result.data["siret"], SIRET)
        self.assertEqual(result.data["status"], "active")
        self.assertNotIn("dirigeants", result.data)
        self.assertEqual(self.lookup().data, result.data)
        get.assert_called_once()

    def test_branch_uses_own_address_instead_of_headquarters(self):
        company = deepcopy(COMPANY)
        company["siege"]["siret"] = "13002526500021"
        company["matching_etablissements"] = [{"siret": SIRET, "statut_diffusion_etablissement": "O",
            "etat_administratif": "A", "adresse": "3 RUE TEST 69001 LYON", "code_postal": "69001", "libelle_commune": "LYON"}]
        result = normalize_company(company, SIRET)
        self.assertEqual(result["address_line1"], "3 RUE TEST")
        self.assertEqual(result["city"], "LYON")
        company["matching_etablissements"] = []
        self.assertIsNone(normalize_company(company, SIRET))

    def test_private_or_incomplete_data_are_excluded(self):
        for field, value in (("statut_diffusion_etablissement", "P"), ("libelle_voie", "[ND]"), ("code_postal", None)):
            company = deepcopy(COMPANY)
            company["siege"][field] = value
            self.assertIsNone(normalize_company(company, SIRET))
        company = deepcopy(COMPANY)
        company["statut_diffusion"] = "P"
        self.assertIsNone(normalize_company(company, SIRET))

    def test_closed_establishment_is_explicit(self):
        company = deepcopy(COMPANY)
        company["siege"]["etat_administratif"] = "F"
        self.assertEqual(normalize_company(company, SIRET)["status"], "closed")

    @patch("api.company_lookup.requests.get")
    def test_no_exact_match(self, get):
        get.return_value = Mock(json=lambda: {"results": []})
        self.assertEqual(self.lookup().status_code, 404)

    @patch("api.company_lookup.requests.get")
    def test_provider_failures_allow_retry(self, get):
        get.side_effect = requests.Timeout()
        self.assertEqual(self.lookup().status_code, 503)
        get.side_effect = None
        get.return_value = Mock(json=lambda: {"results": [COMPANY]})
        self.assertEqual(self.lookup().status_code, 200)

    @patch("api.company_lookup.requests.get")
    def test_malformed_provider_response(self, get):
        get.return_value = Mock(json=lambda: {"results": None})
        self.assertEqual(self.lookup().status_code, 503)
