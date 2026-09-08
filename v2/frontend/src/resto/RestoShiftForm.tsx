import { useState } from "react";
import { createShift } from "../api";
import type { RestaurantShift } from "../types";

const POSITIONS = [
  { value: "serveur", label: "Serveur·se" },
  { value: "chef_de_rang", label: "Chef de rang" },
  { value: "barman", label: "Barman / Barmaid" },
  { value: "sommelier", label: "Sommelier·e" },
  { value: "hote_accueil", label: "Hôte·sse d'accueil" },
  { value: "chef_cuisine", label: "Chef de cuisine" },
  { value: "cuisinier", label: "Cuisinier·e" },
  { value: "plongeur", label: "Plongeur·se" },
  { value: "manager", label: "Manager" },
  { value: "autre", label: "Autre" },
];

const SERVICES = [
  { value: "midi", label: "Midi" },
  { value: "soir", label: "Soir" },
  { value: "journee", label: "Journée" },
  { value: "autre", label: "Autre" },
];

interface Props {
  restaurantSlug: string;
  token: string;
  onCreated: (shift: RestaurantShift) => void;
  onClose: () => void;
}

export default function RestoShiftForm({ restaurantSlug, token, onCreated, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    start_time: "11:00",
    end_time: "15:00",
    service: "midi",
    position: "serveur",
    positions_needed: "1",
    title: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const shift = await createShift(restaurantSlug, {
        ...form,
        positions_needed: parseInt(form.positions_needed, 10) || 1,
      }, token);
      onCreated(shift);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-eb-card border border-eb-layout bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-eb-primary">Nouveau shift</h2>
          <button type="button" onClick={onClose} className="text-eb-secondary hover:text-eb-primary">✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-eb-secondary mb-1">Date</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-eb-secondary mb-1">Début</label>
              <input
                type="time"
                required
                value={form.start_time}
                onChange={(e) => set("start_time", e.target.value)}
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-eb-secondary mb-1">Fin</label>
              <input
                type="time"
                required
                value={form.end_time}
                onChange={(e) => set("end_time", e.target.value)}
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-eb-secondary mb-1">Service</label>
              <select
                value={form.service}
                onChange={(e) => set("service", e.target.value)}
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              >
                {SERVICES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-eb-secondary mb-1">Poste</label>
              <select
                value={form.position}
                onChange={(e) => set("position", e.target.value)}
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-eb-secondary mb-1">Nb. postes</label>
              <input
                type="number"
                min="1"
                max="20"
                value={form.positions_needed}
                onChange={(e) => set("positions_needed", e.target.value)}
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-eb-secondary mb-1">Titre (opt.)</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Ex : Fermeture"
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-eb-secondary mb-1">Notes (opt.)</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30 resize-none"
            />
          </div>

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-eb-layout py-2 text-sm text-eb-secondary hover:bg-eb-page transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-eb-primary py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {busy ? "Création…" : "Créer le shift"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
