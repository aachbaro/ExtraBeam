import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lookupCompany, type CompanyIdentity } from "../../api";
import CompanyLookup from "./CompanyLookup";

vi.mock("../../api", () => ({ lookupCompany: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const company: CompanyIdentity = { legal_name: "DINUM", siren: "130025265", siret: "13002526500013",
  address_line1: "20 AVENUE DE SEGUR", address_line2: "", postal_code: "75007", city: "PARIS",
  country: "FR", status: "active", source: "recherche-entreprises.api.gouv.fr" };

describe("Recherche SIRET", () => {
  it("attend la confirmation avant de remplir le client et invalide un ancien résultat", async () => {
    const select = vi.fn();
    vi.mocked(lookupCompany).mockResolvedValue(company);
    render(<CompanyLookup token="token" onSelect={select} />);
    fireEvent.change(screen.getByLabelText("Trouver l’entreprise à facturer"), { target: { value: "130 025 265 00013" } });
    fireEvent.click(screen.getByText("Rechercher"));
    await screen.findByText("DINUM");
    expect(lookupCompany).toHaveBeenCalledWith(company.siret, "token");
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Utiliser cette entreprise"));
    expect(select).toHaveBeenCalledWith(company);
    fireEvent.change(screen.getByLabelText("Trouver l’entreprise à facturer"), { target: { value: "35600000000048" } });
    expect(screen.queryByText("DINUM")).toBeNull();
  });
  it("refuse un SIRET incomplet et présente les erreurs du fournisseur", async () => {
    render(<CompanyLookup token="token" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText("Rechercher"));
    expect(lookupCompany).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("14 chiffres");
    vi.mocked(lookupCompany).mockRejectedValue(new Error("Annuaire indisponible. Saisie manuelle possible."));
    fireEvent.change(screen.getByLabelText("Trouver l’entreprise à facturer"), { target: { value: company.siret } });
    fireEvent.click(screen.getByText("Rechercher"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Saisie manuelle"));
  });
  it("Entrée lance la recherche sans soumettre la facture et signale un établissement fermé", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    vi.mocked(lookupCompany).mockResolvedValue({ ...company, status: "closed" });
    render(<form onSubmit={submit}><CompanyLookup token="token" initialSiret={company.siret} onSelect={vi.fn()} /></form>);
    fireEvent.keyDown(screen.getByLabelText("Trouver l’entreprise à facturer"), { key: "Enter" });
    await screen.findByText(/Établissement fermé/);
    expect(submit).not.toHaveBeenCalled();
  });
});
