/**
 * src/components/agenda/SlotModal.tsx
 * Layer  : Frontend — composants / agenda
 * Role   : Modal de création d'un créneau.
 *          Préremplie avec la plage issue du drag. Permet d'ajuster les
 *          heures, d'ajouter un titre et d'associer une mission.
 * Props  : date (YYYY-MM-DD), start/end (HH:MM), missions disponibles,
 *          onConfirm, onCancel
 * Used by: Agenda
 */

import { useState, type FormEvent } from "react";
import type { Mission } from "../../types";
import TimePicker from "../TimePicker";

interface Props {
  date: string;
  start: string;  // "HH:MM"
  end: string;
  missions: Mission[];
  onConfirm: (title: string, startIso: string, endIso: string, missionId: number | null) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function SlotModal({ date, start, end, missions, onConfirm, onCancel, saving }: Props) {
  const [title, setTitle]         = useState("");
  const [startTime, setStartTime] = useState(start);
  const [endTime, setEndTime]     = useState(end);
  const [missionId, setMissionId] = useState<number | null>(null);

  const label = new Date(`${date}T00:00`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  function handleConfirm(e: FormEvent) {
    e.preventDefault();
    onConfirm(title, `${date}T${startTime}:00`, `${date}T${endTime}:00`, missionId);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-eb-card border border-eb-layout bg-white p-6 shadow-lg">
        <h2 className="text-[16px] font-semibold text-eb-text">Nouveau créneau</h2>
        <p className="mt-0.5 text-[13px] text-eb-secondary capitalize">{label}</p>

        <form onSubmit={handleConfirm} className="mt-4 space-y-3">
          {/* Horaires */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[12px] font-medium text-eb-secondary">Début</label>
              <TimePicker className="eb-input mt-1" value={startTime}
                onChange={setStartTime} required />
            </div>
            <div className="flex-1">
              <label className="text-[12px] font-medium text-eb-secondary">Fin</label>
              <TimePicker className="eb-input mt-1" value={endTime}
                onChange={setEndTime} required />
            </div>
          </div>

          {/* Titre */}
          <div>
            <label className="text-[12px] font-medium text-eb-secondary">
              Titre <span className="font-normal opacity-60">(optionnel)</span>
            </label>
            <input type="text" className="eb-input mt-1" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Disponible, Réunion…" autoFocus />
          </div>

          {/* Mission */}
          {missions.length > 0 && (
            <div>
              <label className="text-[12px] font-medium text-eb-secondary">
                Mission <span className="font-normal opacity-60">(optionnel)</span>
              </label>
              <select
                className="eb-input mt-1"
                value={missionId ?? ""}
                onChange={(e) => setMissionId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Aucune mission —</option>
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" className="eb-btn-primary flex-1"
              disabled={saving || !startTime || !endTime}>
              {saving ? "Création…" : "Créer"}
            </button>
            <button type="button" className="eb-btn-ghost flex-1" onClick={onCancel}>
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
