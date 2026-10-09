import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import ElectronicInvoiceSettings from "./ElectronicInvoiceSettings";
import { electronicAccount, connectElectronicAccount, createSandboxInvoice } from "../../api";
import type { Facture } from "../../types";

vi.mock("../../api", () => ({ electronicAccount: vi.fn(), connectElectronicAccount: vi.fn(), syncElectronicAccount: vi.fn(), createSandboxInvoice: vi.fn() }));
function Location() { const location = useLocation(); return <p data-testid="location">{location.pathname}{location.search}</p>; }
function render(node: ReactNode) { return rtlRender(<MemoryRouter>{node}<Location /></MemoryRouter>); }
afterEach(cleanup);
it("présente la connexion et affiche ses erreurs", async () => {
  vi.mocked(electronicAccount).mockResolvedValue({ provider: "superpdp", connection_status: "disconnected", environment: "sandbox" });
  vi.mocked(connectElectronicAccount).mockRejectedValue(new Error("Identifiants OAuth manquants"));
  render(<ElectronicInvoiceSettings token="owner-token" />);
  await waitFor(() => expect(screen.getByText("Non connectée · sandbox")).toBeTruthy());
  fireEvent.click(screen.getByText("Connecter SUPER PDP"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("OAuth manquants"));
  expect(connectElectronicAccount).toHaveBeenCalledWith("owner-token");
});
it("affiche une connexion vérifiée", async () => {
  vi.mocked(electronicAccount).mockResolvedValue({ provider: "superpdp", connection_status: "connected", environment: "sandbox" });
  render(<ElectronicInvoiceSettings token="owner-token" />);
  await waitFor(() => expect(screen.getByText("Connectée · sandbox")).toBeTruthy());
});
it("crée une facture sandbox et ouvre les factures sans envoi automatique", async () => {
  vi.mocked(electronicAccount).mockResolvedValue({ provider: "superpdp", connection_status: "connected", environment: "sandbox" });
  vi.mocked(createSandboxInvoice).mockResolvedValue({ id: 19, profile_slug: 'adam' } as Facture);
  render(<ElectronicInvoiceSettings token="owner-token" />);
  fireEvent.click(await screen.findByText('Créer une facture de test'));
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/extras/adam?tab=factures'));
  expect(createSandboxInvoice).toHaveBeenCalledWith('owner-token');
});
it("masque la génération de test en production", async () => {
  vi.mocked(electronicAccount).mockResolvedValue({ provider: "superpdp", connection_status: "connected", environment: "production" });
  render(<ElectronicInvoiceSettings token="owner-token" />);
  await screen.findByText('Connectée · production');
  expect(screen.queryByText('Créer une facture de test')).toBeNull();
});
