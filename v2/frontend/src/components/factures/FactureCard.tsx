/**
 * src/components/factures/FactureCard.tsx
 * Layer  : Frontend — composant UI
 * Role   : Carte résumé d'une facture. Cliquable pour ouvrir l'édition.
 */

import type { Facture, FactureStatus } from "../../types";

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
  onMarkPaid?: () => void;
  onReuse?: () => void;
}

export default function FactureCard({
  facture,
  onClick,
  onDelete,
  onDownload,
  onMarkPaid,
  onReuse,
}: Props) {
  const style = STATUS_STYLE[facture.status];

  return (
    <div
      className="group relative cursor-pointer rounded-eb border border-eb-layout bg-white p-4 transition-colors hover:border-[#f59e0b]"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-snug text-eb-text">
            {facture.numero}
          </p>
          <p className="mt-1.5 truncate text-[13px] text-eb-secondary">
            {facture.client_name}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{ background: style.bg, color: style.color }}
        >
          {style.label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-eb-muted">
        <span>{formatDate(facture.date_emission)}</span>
        {facture.date_echeance ? (
          <span>Échéance : {formatDate(facture.date_echeance)}</span>
        ) : null}
        <span className="font-medium text-eb-text">
          {formatAmount(facture.montant_ttc)}
        </span>
        {facture.mission_title ? (
          <span>Mission : {facture.mission_title}</span>
        ) : (
          <span>Facture manuelle</span>
        )}
      </div>

      {facture.description ? (
        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-eb-secondary">
          {facture.description}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onReuse && (
          <button
            type="button"
            className="border rounded px-3 py-2 text-xs hover:bg-eb-page"
            onClick={(e) => {
              e.stopPropagation();
              onReuse();
            }}
          >
            Réutiliser
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDownload();
          }}
          className="inline-flex min-h-[32px] items-center justify-center rounded-eb border border-eb-layout px-3 text-[12px] font-medium text-eb-text transition-colors hover:bg-eb-page"
        >
          Télécharger le PDF
        </button>
        {facture.status === "pending_payment" && onMarkPaid && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMarkPaid();
            }}
            className="inline-flex min-h-[32px] items-center justify-center rounded-eb border border-green-200 bg-green-50 px-3 text-[12px] font-medium text-green-700 transition-colors hover:bg-green-100"
          >
            ✓ Marquer réglée
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="absolute right-3 top-3 hidden h-6 w-6 items-center justify-center rounded text-[16px] text-eb-muted transition-colors hover:bg-red-50 hover:text-eb-google group-hover:flex"
        aria-label="Supprimer la facture"
      >
        ×
      </button>
    </div>
  );
}
