import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ElectronicInvoiceSettings from "./ElectronicInvoiceSettings";
import { electronicAccount, connectElectronicAccount } from "../../api";

vi.mock("../../api", () => ({ electronicAccount: vi.fn(), connectElectronicAccount: vi.fn(), syncElectronicAccount: vi.fn() }));
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
