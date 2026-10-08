/**
 * src/components/unavailabilities/UnavailabilitySection.tsx
 * Layer  : Frontend — composant section
 * Role   : Section de gestion des indisponibilités (owner uniquement).
 *          Liste les règles récurrentes et ponctuelles, et remonte aussi
 *          les prochains créneaux déjà posés dans le planning.
 * Parent : FreelancerProfilePage
 * Deps   : api.createUnavailability, api.updateUnavailability, api.deleteUnavailability
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  createUnavailability,
  deleteUnavailability,
  fetchSlots,
  updateUnavailability,
} from "../../api";
import {
  formatUnavailabilityRuleLabel,
  formatUnavailabilityTimeRange,
} from "../../lib/unavailability";
import type { Slot, Unavailability } from "../../types";
import UnavailabilityForm from "./UnavailabilityForm";

interface Props {
  slug: string;
  token: string;
  planningSlots: Slot[];
  unavailabilities: Unavailability[];
  onUnavailabilitiesChange: Dispatch<SetStateAction<Unavailability[]>>;
}

export default function UnavailabilitySection({
  slug,
  token,
  planningSlots,
  unavailabilities,
  onUnavailabilitiesChange,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Unavailability | null>(null);
  const [upcomingSlots, setUpcomingSlots] = useState<Slot[]>([]);
  const list = unavailabilities;

  useEffect(() => {
    const today = new Date();
    const from = today.toLocaleDateString("fr-CA");
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() + 60);
    const to = toDate.toLocaleDateString("fr-CA");

    fetchSlots(slug, from, to, token)
      .then((slots) => {
        const now = new Date();
        const nextSlots = slots
          .filter((slot) => new Date(slot.end) >= now)
          .sort((a, b) => a.start.localeCompare(b.start))
          .slice(0, 8);
        setUpcomingSlots(nextSlots);
      })
      .catch((err) => {
        console.error("Erreur chargement des créneaux du planning :", err);
      });
  }, [slug, token, planningSlots]);

  async function handleCreate(data: Partial<Omit<Unavailability, "id" | "exceptions">>) {
    const created = await createUnavailability(slug, data, token);
    onUnavailabilitiesChange((current) => [...current, created]);
  }

  async function handleEdit(data: Partial<Omit<Unavailability, "id" | "exceptions">>) {
    if (!editing) return;
    const updated = await updateUnavailability(slug, editing.id, data, token);
    onUnavailabilitiesChange((current) =>
      current.map((u) => (u.id === editing.id ? updated : u))
    );
  }

  async function handleDelete() {
    if (!editing) return;
    await deleteUnavailability(slug, editing.id, token);
    onUnavailabilitiesChange((current) => current.filter((u) => u.id !== editing.id));
  }

  // Séparer récurrentes et ponctuelles
  const weekly = list.filter((u) => u.recurrence_type === "weekly");
  const once   = list.filter((u) => u.recurrence_type === "once");

  return (
    <section className="rounded-eb-card border border-eb-layout bg-[#fffdf7] p-4">
      {/* En-tête */}
      <div className="mb-4 flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
            Indisponibilités
          </p>
          <p className="mt-1 text-[13px] text-eb-secondary">
            Gère tes règles récurrentes et tes longues plages d'absence depuis un seul endroit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="eb-btn-primary px-3 py-1.5 text-[12px]"
        >
          + Ajouter
        </button>
      </div>

      {list.length === 0 && upcomingSlots.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-eb-muted">
          Aucune indisponibilité définie.
        </p>
      ) : (
        <div className="space-y-4">
          {upcomingSlots.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
                Créneaux du planning à venir
              </p>
              <div className="space-y-2">
                {upcomingSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex w-full flex-col items-center justify-between gap-2 rounded-eb border border-eb-layout bg-[#FBFDFF] px-4 py-3 text-center sm:flex-row sm:text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-eb-text">
                        {new Date(slot.start).toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </p>
                      <p className="mt-1 text-[12px] text-eb-muted">
                        {slot.start.slice(11, 16)} → {slot.end.slice(11, 16)}
                        {slot.title
                          ? ` · ${slot.title}`
                          : slot.mission_title
                            ? ` · ${slot.mission_title}`
                            : " · Créneau du planning"}
                      </p>
                    </div>
                    <span className="text-[12px] text-eb-muted">
                      Visible dans le planning
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Récurrentes */}
          {weekly.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
                Récurrentes
              </p>
              <div className="space-y-2">
                {weekly.map((u) => (
                  <UnavailabilityRow
                    key={u.id}
                    unavailability={u}
                    label={formatUnavailabilityRuleLabel(u)}
                    onClick={() => { setEditing(u); setShowForm(true); }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Ponctuelles */}
          {once.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
                Ponctuelles
              </p>
              <div className="space-y-2">
                {once.map((u) => (
                  <UnavailabilityRow
                    key={u.id}
                    unavailability={u}
                    label={formatUnavailabilityRuleLabel(u)}
                    onClick={() => { setEditing(u); setShowForm(true); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <UnavailabilityForm
          initial={editing ?? undefined}
          onSave={editing ? handleEdit : handleCreate}
          onDelete={editing ? handleDelete : undefined}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </section>
  );
}

// --- Ligne de liste ---
function UnavailabilityRow({
  unavailability: u,
  label,
  onClick,
}: {
  unavailability: Unavailability;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-center justify-between gap-2 rounded-eb border border-eb-layout bg-[#fffdf7] px-4 py-3 text-center transition-colors hover:border-[#93c5fd] sm:flex-row sm:text-left"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-eb-text">{label}</p>
        <p className="text-[12px] text-eb-muted">
          {formatUnavailabilityTimeRange(u)}
        </p>
      </div>
      <span className="text-[12px] text-eb-muted group-hover:text-eb-text transition-colors">
        Modifier →
      </span>
    </button>
  );
}
