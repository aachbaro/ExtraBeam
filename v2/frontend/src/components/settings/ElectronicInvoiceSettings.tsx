import { useEffect, useState } from "react";
import { electronicAccount, connectElectronicAccount, syncElectronicAccount, createSandboxInvoice } from "../../api";
import { useNavigate } from "react-router-dom";
import type { FreelancerProfile } from "../../types";

export default function ElectronicInvoiceSettings({ token, profile }: { token: string; profile?: FreelancerProfile }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("disconnected");
  const [environment, setEnvironment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    electronicAccount(token).then((account) => {
      setStatus(account.connection_status); setEnvironment(account.environment);
    }).catch((err: Error) => setError(err.message));
  }, [token]);
  async function connect() {
    setBusy(true); setError("");
    try { window.location.assign((await connectElectronicAccount(token)).authorization_url); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }
  async function sync() {
    setBusy(true); setError("");
    try {
      const account = await syncElectronicAccount(token);
      setStatus(account.connection_status); setEnvironment(account.environment);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function createTest() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const invoice = await createSandboxInvoice(token);
      navigate(`/extras/${invoice.profile_slug}?tab=factures`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const missingBillingInfo = profile && (!profile.legal_name || !profile.siren || !profile.address_line1 || !profile.postal_code || !profile.city);
  return <section className="mt-4 rounded-eb border border-eb-layout p-4">
    <p className="font-semibold">Facturation électronique</p>
    {missingBillingInfo && (
      <p className="my-2 text-sm text-amber-700 bg-amber-50 rounded p-2">
        Pour envoyer des factures électroniquement, complète d'abord ton nom légal (ton nom complet si tu es auto-entrepreneur), ton SIREN et ton adresse dans ton profil (onglet Profil &gt; section Informations légales).
      </p>
    )}
    <p className="my-2 text-sm">{status === "connected" ? "Connectée" : status === "disconnected" ? "Non connectée" : "Vérification en attente"}{environment && ` · ${environment}`}</p>
    {environment === "sandbox" && <p className="mb-3 text-sm text-eb-secondary">Le bac à sable utilise des entreprises fictives et des factures de test dédiées. Les factures avec tes coordonnées habituelles seront envoyées après le passage en production.</p>}
    <button type="button" disabled={busy} onClick={connect} className="eb-btn-primary px-3 py-2">{busy ? "Chargement…" : status === "connected" ? "Renouveler la connexion SUPER PDP" : "Connecter SUPER PDP"}</button>
    <button type="button" disabled={busy || status === "disconnected"} onClick={sync} className="ml-2 rounded border px-3 py-2">Synchroniser</button>
    {environment === "sandbox" && status === "connected" && <button type="button" disabled={busy} onClick={createTest} className="mt-3 block rounded border px-3 py-2 text-sm">Créer une facture de test</button>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </section>;
}
