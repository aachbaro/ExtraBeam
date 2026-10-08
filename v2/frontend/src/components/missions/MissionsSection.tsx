/**
 * src/components/missions/MissionsSection.tsx
 * Layer  : Frontend — composant section
 * Role   : Section complète de gestion des missions (owner uniquement).
 *          - Charge la liste au montage, synchronise l'état parent via onMissionsChange
 *            (utilisé par l'Agenda pour colorier les slots par mission)
 *          - Filtre par statut (chips)
 *          - CRUD via MissionForm (modal) + MissionCard
 * Parent : FreelancerProfilePage
 * Deps   : api.fetchMissions, api.createMission, api.updateMission, api.deleteMission
 */

import { useEffect, useState } from "react";
import {
  createMission,
  deleteMission,
  fetchMissions,
  type MissionPayload,
  updateMission,
} from "../../api";
import type { Mission, MissionStatus } from "../../types";
import MissionCard from "./MissionCard";
import MissionForm from "./MissionForm";

const STATUS_FILTERS: { value: MissionStatus | null; label: string }[] = [
  { value: null,        label: "Toutes" },
  { value: "proposée",  label: "Proposées" },
  { value: "en_cours",  label: "En cours" },
  { value: "terminée",  label: "Terminées" },
  { value: "refusée",   label: "Refusées" },
];

const STATUS_COUNT_COLORS: Record<MissionStatus, string> = {
  proposée:  "bg-blue-50 text-blue-600",
  en_cours:  "bg-green-50 text-green-600",
  terminée:  "bg-gray-100 text-gray-500",
  refusée:   "bg-red-50 text-red-500",
};

interface Props {
  slug: string;
  token: string;
  /** Synchronise la liste de missions avec le parent (pour l'agenda) */
  onMissionsChange: (missions: Mission[]) => void;
}

export default function MissionsSection({ slug, token, onMissionsChange }: Props) {
  const [missions, setMissions]         = useState<Mission[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState<MissionStatus | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [editing, setEditing]           = useState<Mission | null>(null);

  function updateMissions(next: Mission[]) {
    setMissions(next);
    onMissionsChange(next);
  }

  // Chargement initial sans filtre (pour avoir toutes les missions dans l'agenda)
  useEffect(() => {
    setLoading(true);
    fetchMissions(slug, token)
      .then((all) => updateMissions(all))
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  async function handleCreate(data: MissionPayload) {
    const created = await createMission(slug, data, token);
    updateMissions([created, ...missions]);
  }

  async function handleUpdate(id: number, data: Partial<MissionPayload>) {
    const updated = await updateMission(slug, id, data, token);
    updateMissions(missions.map((m) => (m.id === id ? updated : m)));
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette mission ?")) return;
    await deleteMission(slug, id, token);
    updateMissions(missions.filter((m) => m.id !== id));
  }

  // Comptage par statut
  const counts = missions.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  const shown = statusFilter ? missions.filter((m) => m.status === statusFilter) : missions;

  return (
    <section className="eb-content-stagger rounded-eb-card border border-eb-layout bg-[#fffdf7] p-4">

      {/* En-tête */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
            Missions
          </p>
          {/* Compteurs par statut */}
          <div className="flex gap-1.5">
            {(["proposée", "en_cours", "terminée", "refusée"] as MissionStatus[])
              .filter((s) => counts[s])
              .map((s) => (
                <span
                  key={s}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COUNT_COLORS[s]}`}
                >
                  {counts[s]}
                </span>
              ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="eb-btn-primary text-[12px] px-3 py-1.5"
        >
          + Nouvelle mission
        </button>
      </div>

      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`eb-chip cursor-pointer transition-all ${
              statusFilter === value ? "bg-eb-primary text-white" : "hover:bg-[#e5e7eb]"
            }`}
          >
            {label}
            {value && counts[value] ? (
              <span className="ml-1 opacity-70">{counts[value]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <p className="py-4 text-center text-[13px] text-eb-muted">Chargement…</p>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-eb-muted">
          {statusFilter ? "Aucune mission dans ce statut." : "Aucune mission pour l'instant."}
        </p>
      ) : (
        <div className="eb-content-stagger space-y-3">
          {shown.map((m) => (
            <MissionCard
              key={m.id}
              mission={m}
              onClick={() => { setEditing(m); setShowForm(true); }}
              onDelete={() => handleDelete(m.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <MissionForm
          initial={editing ?? undefined}
          onSave={(data) => editing ? handleUpdate(editing.id, data) : handleCreate(data)}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </section>
  );
}
