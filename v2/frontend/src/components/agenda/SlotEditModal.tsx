/**
 * src/components/agenda/SlotEditModal.tsx
 * Layer  : Frontend — composants / agenda
 * Role   : Modal d'édition d'un créneau existant.
 *          Permet de modifier le titre, les horaires, la mission associée
 *          et de supprimer le créneau.
 * Used by: Agenda (via click sur AgendaSlot)
 */

import { useState, type FormEvent } from "react";
import { localIsoToDate, localIsoToTime } from "../../lib/slotDateTime";
import type { Mission, Slot } from "../../types";
import TimePicker from "../TimePicker";

interface Props {
  slot: Slot;
  missions: Mission[];
  onSave: (id: number, data: { title: string; start: string; end: string; mission_id: number | null }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
}

export default function SlotEditModal({ slot, missions, onSave, onDelete, onClose }: Props) {
  const [title, setTitle]         = useState(slot.title);
  const [startTime, setStartTime] = useState(localIsoToTime(slot.start));
  const [endTime, setEndTime]     = useState(localIsoToTime(slot.end));
  const [missionId, setMissionId] = useState<number | null>(slot.mission_id);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const date = localIsoToDate(slot.start);
  const label = new Date(`${date}T00:00`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(slot.id, {
        title,
        start: `${date}T${startTime}:00`,
        end:   `${date}T${endTime}:00`,
        mission_id: missionId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Supprimer ce créneau ?")) return;
    setSaving(true);
    try {
      await onDelete(slot.id);
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-eb-card border border-eb-layout bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[16px] font-semibold text-eb-text">Modifier le créneau</h2>
          <button type="button" onClick={onClose}
            className="text-[20px] leading-none text-eb-muted hover:text-eb-text">×</button>
        </div>
        <p className="text-[13px] text-eb-secondary capitalize mb-4">{label}</p>

        <form onSubmit={handleSave} className="space-y-3">
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

          <div>
            <label className="text-[12px] font-medium text-eb-secondary">Titre</label>
            <input type="text" className="eb-input mt-1" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Disponible, Réunion…" autoFocus />
          </div>

          {missions.length > 0 && (
            <div>
              <label className="text-[12px] font-medium text-eb-secondary">Mission associée</label>
              <select className="eb-input mt-1"
                value={missionId ?? ""}
                onChange={(e) => setMissionId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Aucune mission —</option>
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-[13px] text-eb-google">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={handleDelete} disabled={saving}
              className="text-[13px] text-eb-google hover:underline disabled:opacity-50">
              Supprimer
            </button>
            <div className="flex gap-2">
              <button type="button" className="eb-btn-ghost" onClick={onClose}>Annuler</button>
              <button type="submit" className="eb-btn-primary" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
