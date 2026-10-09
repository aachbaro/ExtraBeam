"""Pure EN16931 mapping, matching SUPER PDP OpenAPI 1.36.0.beta.

This JSON is accepted by /invoices/convert, not directly by /invoices.
"""
import re
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
from rest_framework.exceptions import ValidationError

CENT = Decimal("0.01")


def money(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def issuer_data(profile):
    data = {key: getattr(profile, key) for key in (
        "legal_name", "siren", "siret", "vat_number", "address_line1",
        "address_line2", "postal_code", "city", "country", "legal_status", "phone", "iban", "bic",
    )}
    data["email"] = profile.user.email
    return data


def required(value, label):
    if not value:
        raise ValidationError(f"Champ obligatoire : {label}.")
    return value


def party(name, siren, siret, vat, street, extra, postcode, city, country, label):
    required(name, f"{label} raison sociale")
    siren = siren or siret[:9]
    if not re.fullmatch(r"\d{9}", siren or ""):
        raise ValidationError(f"{label} : SIREN de 9 chiffres requis.")
    if siret and (not re.fullmatch(r"\d{14}", siret) or not siret.startswith(siren)):
        raise ValidationError(f"{label} : SIRET incohérent.")
    country = {"France": "FR", "FRANCE": "FR"}.get(country, country.upper())
    if country != "FR":
        raise ValidationError("Cette intégration couvre les prestations B2B françaises uniquement.")
    result = {"name": name, "legal_registration_identifier": {"scheme": "0002", "value": siren},
              "electronic_address": {"scheme": "0225", "value": siren},
              "postal_address": {"address_line1": required(street, f"{label} adresse"),
                                 "address_line2": extra, "post_code": required(postcode, f"{label} code postal"),
                                 "city": required(city, f"{label} ville"), "country_code": country},
              "tax_registration_identifier": siren}
    if siret:
        result["identifiers"] = [{"scheme": "0009", "value": siret}]
    if vat:
        if not re.fullmatch(r"FR[A-Z0-9]{2}\d{9}", vat):
            raise ValidationError(f"{label} : numéro de TVA français invalide.")
        result["vat_identifier"] = vat
    return result


def invoice_to_superpdp_payload(invoice):
    # Only the sandbox management command writes this read-only snapshot. The
    # official generator uses sandbox routing identifiers instead of real SIRENs.
    if invoice.issuer_snapshot.get("sandbox_fixture"):
        payload = deepcopy(invoice.issuer_snapshot["sandbox_fixture"])
        if payload["number"] != invoice.numero or Decimal(payload["totals"]["total_without_vat"]) != Decimal(invoice.montant_ht) or Decimal(payload["totals"]["total_with_vat"]) != Decimal(invoice.montant_ttc):
            raise ValidationError("Facture sandbox incohérente avec son document officiel.")
        return payload
    issuer = invoice.issuer_snapshot or issuer_data(invoice.profile)
    seller = party(issuer["legal_name"], issuer["siren"], issuer["siret"], issuer["vat_number"],
                   issuer["address_line1"], issuer["address_line2"], issuer["postal_code"],
                   issuer["city"], issuer["country"], "Émetteur")
    seller["additional_legal_information"] = issuer["legal_status"]
    buyer = party(invoice.client_name, invoice.client_siren, invoice.client_siret, invoice.client_vat_number,
                  invoice.client_address_ligne1, invoice.client_address_ligne2, invoice.client_code_postal,
                  invoice.client_ville, invoice.client_pays, "Client")
    required(invoice.numero, "numéro")
    required(invoice.date_emission, "date d'émission")
    required(invoice.date_echeance, "échéance")
    required(invoice.conditions_paiement, "conditions de paiement")
    if invoice.date_echeance < invoice.date_emission:
        raise ValidationError("L'échéance précède la date d'émission.")
    if invoice.currency != "EUR":
        raise ValidationError("Seule la devise EUR est prise en charge actuellement.")
    raw_lines = list(invoice.lines.all())
    if not raw_lines:
        # Keep legacy V2 invoices usable without copying them to another domain.
        from types import SimpleNamespace
        raw_lines = [SimpleNamespace(description=invoice.description,
            quantity=invoice.hours or Decimal("1"), unit="HUR" if invoice.hours else "C62",
            unit_price_excl_tax=invoice.rate if invoice.hours and invoice.rate is not None else invoice.montant_ht,
            tax_rate=invoice.tva, total_excl_tax=invoice.montant_ht)]
    lines, groups = [], {}
    for index, line in enumerate(raw_lines, 1):
        quantity, price, rate = Decimal(line.quantity), Decimal(line.unit_price_excl_tax), Decimal(line.tax_rate)
        required(line.description.strip(), "description de ligne")
        if quantity <= 0 or price < 0 or not 0 <= rate <= 100:
            raise ValidationError("Quantité, prix ou taux de TVA invalide.")
        if line.unit not in {"HUR", "DAY", "C62"}:
            raise ValidationError("Unité autorisée : HUR, DAY ou C62.")
        net = money(quantity * price)
        if net != Decimal(line.total_excl_tax):
            raise ValidationError("Total de ligne incohérent.")
        category = "S" if rate else "E"
        vat_info = {"invoiced_item_vat_category_code": category, "invoiced_item_vat_rate": str(rate)}
        if category == "S" and not issuer["vat_number"]:
            raise ValidationError("Numéro de TVA émetteur requis pour une facture avec TVA.")
        if category == "E":
            required(invoice.mention_tva, "mention d'exonération TVA")
            if "293" not in invoice.mention_tva:
                raise ValidationError("Une ligne sans TVA exige la mention de franchise article 293 B.")
            vat_info["exemption_reason"] = invoice.mention_tva
        lines.append({"identifier": str(index), "invoiced_quantity": str(quantity),
                      "invoiced_quantity_code": line.unit, "net_amount": str(net),
                      "price_details": {"item_net_price": str(price)},
                      "item_information": {"name": line.description}, "vat_information": vat_info})
        key = (category, rate)
        groups[key] = groups.get(key, Decimal("0")) + net
    subtotal = sum(groups.values(), Decimal("0"))
    tax = sum((money(net * rate / 100) for (_, rate), net in groups.items()), Decimal("0"))
    if subtotal <= 0 or subtotal != Decimal(invoice.montant_ht) or subtotal + tax != Decimal(invoice.montant_ttc):
        raise ValidationError("Totaux HT/TVA/TTC incohérents avec les lignes.")
    breakdown = []
    for (category, rate), net in groups.items():
        row = {"vat_category_code": category, "vat_category_rate": str(rate),
               "vat_category_taxable_amount": str(net), "vat_category_tax_amount": str(money(net * rate / 100))}
        if category == "E":
            row["vat_exemption_reason"] = invoice.mention_tva
        breakdown.append(row)
    penalites = required(invoice.penalites_retard, "pénalités de retard")
    frais_recouvrement = required(invoice.indemnite_recouvrement, "indemnité de recouvrement")
    terms = "\n".join(filter(None, [invoice.conditions_paiement, invoice.escompte, penalites, frais_recouvrement]))
    return {"number": invoice.numero, "issue_date": invoice.date_emission.isoformat(),
            "payment_due_date": invoice.date_echeance.isoformat(), "type_code": 380,
            "currency_code": invoice.currency,
            "process_control": {"specification_identifier": "urn:cen.eu:en16931:2017", "business_process_type": "B1"},
            "seller": seller, "buyer": buyer, "payment_terms": terms,
            "notes": [{"subject_code": "AAB", "note": "Prestations de services"},
                      {"subject_code": "PMD", "note": penalites},
                      {"subject_code": "PMT", "note": frais_recouvrement}],
            "lines": lines, "vat_break_down": breakdown,
            "totals": {"sum_invoice_lines_amount": str(subtotal), "total_without_vat": str(subtotal),
                       "total_vat_amount": {"value": str(tax), "currency_code": invoice.currency},
                       "total_with_vat": str(subtotal + tax), "amount_due_for_payment": str(subtotal + tax)}}
