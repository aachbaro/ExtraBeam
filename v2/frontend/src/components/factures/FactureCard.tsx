/**
 * src/components/factures/FactureCard.tsx
 * Layer  : Frontend — composant UI
 * Role   : Carte résumé d'une facture. Cliquable pour ouvrir l'édition.
 */

import type { Facture, FactureStatus } from "../../types";
import { useState } from "react";
import { electronicAccount, finalizeFacture, fetchFacture, submitElectronicFacture, syncElectronicAccount, updateFacture } from "../../api";

const STATUS_STYLE: Record<
  FactureStatus,
  { label: string; bg: string; color: string }
> = {
  pending_payment: { label: "En attente", bg: "#fef3c7", color: "#b45309" },
  paid: { label: "Payée", bg: "#dcfce7", color: "#166534" },
  canceled: { label: "Annulée", bg: "#fee2e2", color: "#b91c1c" },
};

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatAmount(value: string): string {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return value;
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

interface Props {
  facture: Facture;
  onClick: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onMarkPaid?: () => void | Promise<void>;
  onReuse?: () => void;
  token: string;
  onElectronicUpdated: (invoice: Facture) => void;
}

export default function FactureCard({
  facture,
  onClick,
  onDelete,
  onDownload,
  onMarkPaid,
  onReuse,
  token,
  onElectronicUpdated,
}: Props) {
  const style = STATUS_STYLE[facture.status];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function markPaid() {
    if (busy || !onMarkPaid) return;
    setBusy(true); setError("");
    try { await onMarkPaid(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  async function electronicAction() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (facture.electronic) {
        await syncElectronicAccount(token);
        onElectronicUpdated(await fetchFacture(facture.profile_slug!, facture.id, token));
      } else if (!facture.finalized_at) {
        onElectronicUpdated(await finalizeFacture(facture.id, token));
      } else {
        if ((await electronicAccount(token)).connection_status !== "connected") throw new Error("Connecter SUPER PDP dans les paramètres du compte.");
        onElectronicUpdated(await submitElectronicFacture(facture.id, token));
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function cancelInvoice() {
    if (busy) return;
    if (!window.confirm("Annuler définitivement cette facture ?")) return;
    setBusy(true); setError("");
    try {
      const updated = await updateFacture(facture.profile_slug!, facture.id, { status: "canceled" }, token);
      onElectronicUpdated(updated);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <article className="rounded-xl border border-eb-layout bg-[#fffdf7] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-base text-eb-text">{facture.client_name}</h3>
          <p className="text-xs text-eb-secondary mt-1">{facture.numero} · {formatDate(facture.date_emission)}{facture.date_echeance ? ` · Échéance ${formatDate(facture.date_echeance)}` : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-eb-text">{formatAmount(facture.montant_ttc)}</p>
          <span className="inline-block rounded-full px-2 py-0.5 text-xs" style={{ background: style.bg, color: style.color }}>{facture.finalized_at ? style.label : "Brouillon"}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-eb-secondary">{facture.electronic?.label ?? (facture.finalized_at ? "Finalisée · non envoyée électroniquement" : "À compléter et finaliser")}</p>
        <div className="flex items-center gap-2">
          {!facture.finalized_at ? <button className="eb-btn-ghost text-xs" onClick={onClick}>Modifier</button>
            : <button className="eb-btn-ghost text-xs" onClick={onDownload}>Télécharger le PDF</button>}
          <details className="relative">
            <summary aria-label={`Actions de la facture ${facture.numero}`} className="cursor-pointer list-none rounded-lg border border-eb-layout px-3 py-2">•••</summary>
            <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-eb-layout bg-white p-2 shadow-lg flex flex-col items-stretch gap-1 text-sm">
              {facture.status === "pending_payment" && onMarkPaid && <button disabled={busy} className="text-left rounded p-2 hover:bg-eb-page" onClick={() => void markPaid()}>Marquer réglée</button>}
              {facture.status !== "canceled" && <button disabled={busy} className="text-left rounded p-2 hover:bg-eb-page" onClick={() => void electronicAction()}>{busy ? "Chargement…" : facture.electronic ? "Synchroniser le statut" : facture.finalized_at ? "Envoyer électroniquement" : "Finaliser la facture"}</button>}
              {onReuse && <button className="text-left rounded p-2 hover:bg-eb-page" onClick={onReuse}>Réutiliser</button>}
              <button className="text-left rounded p-2 hover:bg-eb-page" onClick={onDownload}>Télécharger le PDF</button>
              {facture.finalized_at && facture.status !== "canceled" && (!facture.electronic || facture.electronic.status === "failed") && <button disabled={busy} className="text-left rounded p-2 text-red-700 hover:bg-red-50" onClick={() => void cancelInvoice()}>Annuler</button>}
              {!facture.finalized_at && <button className="text-left rounded p-2 text-red-700 hover:bg-red-50" onClick={onDelete}>Supprimer la facture</button>}
            </div>
          </details>
        </div>
      </div>
      {facture.description && <details className="mt-2 text-xs text-eb-secondary"><summary className="cursor-pointer">Détail de la prestation</summary><p className="mt-2 whitespace-pre-wrap">{facture.description}</p></details>}
      {facture.electronic?.payment_report_status && <p className="mt-1 text-xs">Déclaration d’encaissement : {facture.electronic.payment_report_status}</p>}
      {(error || facture.electronic?.last_error) && <p role="alert" className="mt-2 text-xs text-red-700">{error || facture.electronic?.last_error}</p>}
    </article>
  );
}
