/**
 * src/components/missions/MissionCard.tsx
 * Layer  : Frontend — composant UI
 * Role   : Carte résumé d'une mission. Cliquable pour ouvrir le détail / l'édition.
 *          Affiche statut (chip coloré), client, dates, montant.
 * Parent : MissionsSection
 * Deps   : types.Mission
 */

import type { Mission, MissionStatus } from "../../types";

const STATUS_STYLE: Record<MissionStatus, { label: string; bg: string; color: string }> = {
  proposée:  { label: "Proposée",  bg: "#eff6ff", color: "#2563eb" },
  en_cours:  { label: "En cours",  bg: "#f0fdf4", color: "#16a34a" },
  terminée:  { label: "Terminée",  bg: "#f9fafb", color: "#6b7280" },
  refusée:   { label: "Refusée",   bg: "#fef2f2", color: "#ef4444" },
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  const [year, month, day] = d.split("-");
  return `${day}/${month}/${year}`;
}

function formatAmount(v: string | null): string {
  if (!v) return "";
  const n = parseFloat(v);
  return isNaN(n) ? "" : `${n.toLocaleString("fr-FR")} €`;
}

interface Props {
  mission: Mission;
  onClick: () => void;
  onDelete: () => void;
}

export default function MissionCard({ mission, onClick, onDelete }: Props) {
  const style = STATUS_STYLE[mission.status];

  return (
    <div
      className="group relative rounded-eb border border-eb-layout bg-[#fffdf7] p-4 cursor-pointer hover:border-[#c6a84b] transition-colors"
      onClick={onClick}
    >
      {/* Header : titre + statut */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold text-eb-text leading-snug flex-1">
          {mission.title}
        </p>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{ background: style.bg, color: style.color }}
        >
          {style.label}
        </span>
      </div>

      {/* Client */}
      {(mission.establishment || mission.client_company || mission.client_name) && (
        <p className="mt-1.5 text-[13px] text-eb-secondary">
          {[mission.establishment, mission.client_company, mission.client_name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {(mission.contact_name || mission.contact_email) && (
        <p className="mt-1 text-[12px] text-eb-muted">
          {[mission.contact_name, mission.contact_email].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Dates + montant + créneaux */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-eb-muted">
        {(mission.start_date || mission.end_date) && (
          <span>{formatDate(mission.start_date)} → {formatDate(mission.end_date)}</span>
        )}
        {mission.total_amount && (
          <span className="font-medium text-eb-text">{formatAmount(mission.total_amount)}</span>
        )}
        {mission.daily_rate && !mission.total_amount && (
          <span>{formatAmount(mission.daily_rate)} / jour</span>
        )}
        {mission.slot_count > 0 && (
          <span className="inline-flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="1" y1="3.5" x2="9" y2="3.5" stroke="currentColor" strokeWidth="1"/>
            </svg>
            {mission.slot_count} créneau{mission.slot_count > 1 ? "x" : ""}
          </span>
        )}
      </div>

      {/* Bouton supprimer (owner only, visible au hover) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-3 right-10 hidden group-hover:flex items-center justify-center w-6 h-6 rounded text-eb-muted hover:text-eb-google hover:bg-red-50 transition-colors text-[16px]"
        aria-label="Supprimer la mission"
      >
        ×
      </button>
    </div>
  );
}
