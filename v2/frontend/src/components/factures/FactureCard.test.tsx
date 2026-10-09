import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Facture } from "../../types";
import FactureCard from "./FactureCard";
import { electronicAccount, finalizeFacture, submitElectronicFacture } from "../../api";

vi.mock("../../api", () => ({ electronicAccount: vi.fn(), finalizeFacture: vi.fn(), submitElectronicFacture: vi.fn(), syncElectronicAccount: vi.fn(), fetchFacture: vi.fn(), invoiceCheckout: vi.fn() }));
afterEach(cleanup);
const invoice = { id: 1, numero: "2026-0001", date_emission: "2026-10-01", status: "pending_payment", montant_ttc: "100", client_name: "Test" } as Facture;
const props = { token: "token", onElectronicUpdated: vi.fn(), onClick: vi.fn(), onDelete: vi.fn(), onDownload: vi.fn() };

describe("Facture électronique", () => {
  it("affiche le brouillon et finalise", async () => {
    vi.mocked(finalizeFacture).mockResolvedValue({ ...invoice, finalized_at: "2026-10-01" });
    render(<FactureCard {...props} facture={invoice} />);
    expect(screen.getByText(/Brouillon · Électronique : Non envoyée/)).toBeTruthy();
    fireEvent.click(screen.getByText("Finaliser la facture"));
    await waitFor(() => expect(finalizeFacture).toHaveBeenCalledWith(1, "token"));
  });
  it("bloque le bouton pendant l'envoi et présente une erreur exploitable", async () => {
    vi.mocked(electronicAccount).mockResolvedValue({ connection_status: "connected", environment: "sandbox", provider: "superpdp" });
    let reject!: (error: Error) => void;
    vi.mocked(submitElectronicFacture).mockReturnValue(new Promise((_, failure) => { reject = failure; }));
    render(<FactureCard {...props} facture={{ ...invoice, finalized_at: "2026-10-01" }} />);
    fireEvent.click(screen.getByText("Envoyer électroniquement"));
    expect(screen.queryByText("Copier le lien Stripe")).toBeNull();
    await waitFor(() => expect(submitElectronicFacture).toHaveBeenCalledOnce());
    expect((screen.getByText("Chargement…") as HTMLButtonElement).disabled).toBe(true);
    reject(new Error("Client : SIREN requis"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("SIREN requis"));
  });
  it("affiche le statut reçu et propose la synchronisation", () => {
    render(<FactureCard {...props} facture={{ ...invoice, finalized_at: "2026-10-01", electronic: { status: "accepted", label: "Approuvée", provider_invoice_id: "99", last_error: "", payment_report_status: "" } }} />);
    expect(screen.getByText(/Électronique : Approuvée/)).toBeTruthy();
    expect(screen.queryByText("Envoyer électroniquement")).toBeNull();
    expect(screen.getByText("Synchroniser le statut")).toBeTruthy();
  });
});
