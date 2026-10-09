import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lookupCompany } from "../../api";
import type { Facture, FreelancerProfile } from "../../types";
import FactureForm from "./FactureForm";

vi.mock("../../api", () => ({ lookupCompany: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const invoice = { id: 1, numero: "2026-0001", client_name: "Ancien client", client_siret: "35600000000048",
  client_vat_number: "FR-old", contact_email: "old@example.com", description: "Service en salle",
  montant_ht: "100.00", tva: "0.00", date_emission: "2026-10-09", date_echeance: "2026-11-09" } as Facture;
const identity = { legal_name: "DINUM", siren: "130025265", siret: "13002526500013",
  address_line1: "20 AVENUE DE SEGUR", address_line2: "", postal_code: "75007", city: "PARIS",
  country: "FR", status: "active" as const, source: "recherche-entreprises.api.gouv.fr" };
const profile = { display_name: "Extra", address_line1: "1 rue Test", postal_code: "75001", city: "Paris", siret: "12345678900012" } as FreelancerProfile;

it("enregistre les coordonnées confirmées, garde la prestation et retire les anciens contacts", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  vi.mocked(lookupCompany).mockResolvedValue(identity);
  render(<FactureForm token="token" initial={invoice} missions={[]} profile={profile} onSave={save} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Trouver l’entreprise à facturer"), { target: { value: identity.siret } });
  fireEvent.click(screen.getByText("Rechercher"));
  await screen.findByText("Utiliser cette entreprise");
  expect(screen.getByDisplayValue("Ancien client")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Utiliser cette entreprise"));
  expect(screen.getByDisplayValue("20 AVENUE DE SEGUR")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
    client_name: identity.legal_name, client_siren: identity.siren, client_siret: identity.siret,
    client_address_ligne1: identity.address_line1, client_code_postal: identity.postal_code,
    client_ville: identity.city, client_pays: "FR", client_vat_number: "", contact_email: "",
    description: invoice.description, montant_ht: "100.00", date_echeance: invoice.date_echeance,
  })));
});

it("reprend toujours un client déjà facturé sans appeler l’annuaire", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const previous = { ...invoice, id: 2, client_name: "Client conservé", client_siret: identity.siret };
  render(<FactureForm token="token" initial={invoice} previousFactures={[previous]} missions={[]} profile={profile} onSave={save} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/Reprendre un client déjà facturé/), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ client_name: "Client conservé", contact_email: invoice.contact_email })));
  expect(lookupCompany).not.toHaveBeenCalled();
});
