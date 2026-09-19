/**
 * src/components/missions/MissionForm.tsx
 * Layer  : Frontend — composant UI
 * Role   : Formulaire owner complet pour créer / éditer une mission,
 *          avec details client, etablissement et créneaux associés.
 */

import { useState } from "react";

import type { MissionPayload } from "../../api";
import TimePicker from "../TimePicker";
import { localIsoToDate, localIsoToTime } from "../../lib/slotDateTime";
import type { Mission, MissionMode, MissionStatus } from "../../types";

const STATUS_LABELS: Record<MissionStatus, string> = {
  proposée: "Proposée",
  en_cours: "En cours",
  terminée: "Terminée",
  refusée: "Refusée",
};

const STATUS_LIST: MissionStatus[] = ["proposée", "en_cours", "terminée", "refusée"];
const MODE_OPTIONS: { value: MissionMode; label: string }[] = [
  { value: "freelance", label: "Freelance" },
  { value: "salarie", label: "Salarie" },
];

interface FormSlotState {
  title: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
}

interface FormState {
  title: string;
  description: string;
  status: MissionStatus;
  notes: string;
  establishment: string;
  establishment_address_line1: string;
  establishment_address_line2: string;
  establishment_postal_code: string;
  establishment_city: string;
  establishment_country: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  instructions: string;
  mode: MissionMode;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_company: string;
  daily_rate: string;
  total_amount: string;
  start_date: string;
  end_date: string;
  slots: FormSlotState[];
}

function emptySlot(): FormSlotState {
  return {
    title: "",
    start_date: "",
    start_time: "12:00",
    end_date: "",
    end_time: "14:00",
  };
}

function slotToForm(slot?: Mission["slots"][number]): FormSlotState {
  if (!slot) return emptySlot();
  return {
    title: slot.title ?? "",
    start_date: localIsoToDate(slot.start),
    start_time: localIsoToTime(slot.start),
    end_date: localIsoToDate(slot.end),
    end_time: localIsoToTime(slot.end),
  };
}

function missionToForm(m?: Mission): FormState {
  return {
    title: m?.title ?? "",
    description: m?.description ?? "",
    status: m?.status ?? "proposée",
    notes: m?.notes ?? "",
    establishment: m?.establishment ?? "",
    establishment_address_line1: m?.establishment_address_line1 ?? "",
    establishment_address_line2: m?.establishment_address_line2 ?? "",
    establishment_postal_code: m?.establishment_postal_code ?? "",
    establishment_city: m?.establishment_city ?? "",
    establishment_country: m?.establishment_country ?? "France",
    contact_name: m?.contact_name ?? "",
    contact_email: m?.contact_email ?? "",
    contact_phone: m?.contact_phone ?? "",
    instructions: m?.instructions ?? "",
    mode: m?.mode ?? "freelance",
    client_name: m?.client_name ?? "",
    client_email: m?.client_email ?? "",
    client_phone: m?.client_phone ?? "",
    client_company: m?.client_company ?? "",
    daily_rate: m?.daily_rate ?? "",
    total_amount: m?.total_amount ?? "",
    start_date: m?.start_date ?? "",
    end_date: m?.end_date ?? "",
    slots: m?.slots?.length ? m.slots.map((slot) => slotToForm(slot)) : [],
  };
}

interface Props {
  initial?: Mission;
  onSave: (data: MissionPayload) => Promise<void>;
  onClose: () => void;
}

export default function MissionForm({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState<FormState>(missionToForm(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof Omit<FormState, "slots">, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setSlotField(index: number, field: keyof FormSlotState, value: string) {
    setForm((prev) => ({
      ...prev,
      slots: prev.slots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, [field]: value } : slot
      ),
    }));
  }

  function addSlotRow() {
    setForm((prev) => ({ ...prev, slots: [...prev.slots, emptySlot()] }));
  }

  function removeSlotRow(index: number) {
    setForm((prev) => ({
      ...prev,
      slots: prev.slots.filter((_, slotIndex) => slotIndex !== index),
    }));
  }

  function normalizeSlots(): MissionPayload["slots"] {
    const normalized: NonNullable<MissionPayload["slots"]> = [];

    for (const slot of form.slots) {
      const hasAnyValue = Object.values(slot).some((value) => value.trim() !== "");
      if (!hasAnyValue) {
        continue;
      }

      if (!slot.start_date || !slot.start_time || !slot.end_date || !slot.end_time) {
        throw new Error("Chaque créneau renseigné doit avoir une date et une heure de début et de fin.");
      }

      const start = `${slot.start_date}T${slot.start_time}:00`;
      const end = `${slot.end_date}T${slot.end_time}:00`;

      if (end <= start) {
        throw new Error("Chaque créneau doit se terminer après son début.");
      }

      normalized.push({
        title: slot.title.trim(),
        start,
        end,
      });
    }

    return normalized;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.title.trim() && !form.establishment.trim()) {
      setError("Renseigne au moins un titre ou un établissement.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const slots = normalizeSlots();

      await onSave({
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        notes: form.notes.trim(),
        establishment: form.establishment.trim(),
        establishment_address_line1: form.establishment_address_line1.trim(),
        establishment_address_line2: form.establishment_address_line2.trim(),
        establishment_postal_code: form.establishment_postal_code.trim(),
        establishment_city: form.establishment_city.trim(),
        establishment_country: form.establishment_country.trim(),
        contact_name: form.contact_name.trim(),
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone.trim(),
        instructions: form.instructions.trim(),
        mode: form.mode,
        client_name: form.client_name.trim(),
        client_email: form.client_email.trim(),
        client_phone: form.client_phone.trim(),
        client_company: form.client_company.trim(),
        daily_rate: form.daily_rate || null,
        total_amount: form.total_amount || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        slots,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-4xl rounded-eb-card border border-eb-layout bg-white p-6 shadow-lg"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-eb-text">
            {initial ? "Modifier la mission" : "Nouvelle mission"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[20px] leading-none text-eb-muted hover:text-eb-text"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                Titre
              </label>
              <input
                className="eb-input"
                value={form.title}
                onChange={(event) => setField("title", event.target.value)}
                placeholder="Service du soir, renfort traiteur..."
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                Statut
              </label>
              <select
                className="eb-input"
                value={form.status}
                onChange={(event) => setField("status", event.target.value)}
              >
                {STATUS_LIST.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
              Description
            </label>
            <textarea
              className="eb-input resize-none"
              rows={3}
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              placeholder="Contexte, brief rapide, particularités de la mission..."
            />
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-medium text-eb-secondary">
              Mode
            </label>
            <div className="flex flex-wrap gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setField("mode", option.value)}
                  className={`eb-chip cursor-pointer transition-all ${
                    form.mode === option.value ? "bg-eb-primary text-white" : "hover:bg-[#e5e7eb]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Etablissement
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Nom
                </label>
                <input
                  className="eb-input"
                  value={form.establishment}
                  onChange={(event) => setField("establishment", event.target.value)}
                  placeholder="Bistrot Central"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Adresse
                </label>
                <input
                  className="eb-input"
                  value={form.establishment_address_line1}
                  onChange={(event) => setField("establishment_address_line1", event.target.value)}
                  placeholder="12 rue des Halles"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Complement
                </label>
                <input
                  className="eb-input"
                  value={form.establishment_address_line2}
                  onChange={(event) => setField("establishment_address_line2", event.target.value)}
                  placeholder="Batiment, etage..."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  className="eb-input sm:col-span-1"
                  value={form.establishment_postal_code}
                  onChange={(event) => setField("establishment_postal_code", event.target.value)}
                  placeholder="59000"
                />
                <input
                  className="eb-input sm:col-span-1"
                  value={form.establishment_city}
                  onChange={(event) => setField("establishment_city", event.target.value)}
                  placeholder="Lille"
                />
                <input
                  className="eb-input sm:col-span-1"
                  value={form.establishment_country}
                  onChange={(event) => setField("establishment_country", event.target.value)}
                  placeholder="France"
                />
              </div>
            </div>
          </div>

          <div className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Contact sur place
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <input
                className="eb-input"
                value={form.contact_name}
                onChange={(event) => setField("contact_name", event.target.value)}
                placeholder="Nom du contact"
              />
              <input
                type="email"
                className="eb-input"
                value={form.contact_email}
                onChange={(event) => setField("contact_email", event.target.value)}
                placeholder="contact@etablissement.fr"
              />
              <input
                className="eb-input"
                value={form.contact_phone}
                onChange={(event) => setField("contact_phone", event.target.value)}
                placeholder="0601020304"
              />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                Instructions
              </label>
              <textarea
                className="eb-input resize-none"
                rows={3}
                value={form.instructions}
                onChange={(event) => setField("instructions", event.target.value)}
                placeholder="Brief, tenue, contexte de service..."
              />
            </div>
          </div>

          <div className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Client et contrat
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                className="eb-input"
                value={form.client_name}
                onChange={(event) => setField("client_name", event.target.value)}
                placeholder="Nom du client"
              />
              <input
                className="eb-input"
                value={form.client_company}
                onChange={(event) => setField("client_company", event.target.value)}
                placeholder="Societe / enseigne"
              />
              <input
                type="email"
                className="eb-input"
                value={form.client_email}
                onChange={(event) => setField("client_email", event.target.value)}
                placeholder="Email client"
              />
              <input
                className="eb-input"
                value={form.client_phone}
                onChange={(event) => setField("client_phone", event.target.value)}
                placeholder="Telephone client"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                className="eb-input"
                value={form.daily_rate}
                onChange={(event) => setField("daily_rate", event.target.value)}
                placeholder="TJM (€)"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                className="eb-input"
                value={form.total_amount}
                onChange={(event) => setField("total_amount", event.target.value)}
                placeholder="Montant total (€)"
              />
              <input
                type="date"
                className="eb-input"
                value={form.start_date}
                onChange={(event) => setField("start_date", event.target.value)}
              />
              <input
                type="date"
                className="eb-input"
                value={form.end_date}
                onChange={(event) => setField("end_date", event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-eb border border-eb-layout bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
                  Créneaux liés
                </p>
                <p className="mt-1 text-[13px] text-eb-secondary">
                  Optionnel, mais utile pour colorer l'agenda et fixer le planning de mission.
                </p>
              </div>
              <button type="button" onClick={addSlotRow} className="eb-btn-ghost text-[13px]">
                + Ajouter un créneau
              </button>
            </div>

            {form.slots.length > 0 ? (
              <div className="space-y-3">
                {form.slots.map((slot, index) => (
                  <div key={`${index}-${slot.start_date}-${slot.start_time}`} className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <input
                        className="eb-input flex-1"
                        value={slot.title}
                        onChange={(event) => setSlotField(index, "title", event.target.value)}
                        placeholder="Titre du créneau (optionnel)"
                      />
                      <button
                        type="button"
                        onClick={() => removeSlotRow(index)}
                        className="text-[13px] text-eb-google hover:underline"
                      >
                        Retirer
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="date"
                          className="eb-input"
                          value={slot.start_date}
                          onChange={(event) => setSlotField(index, "start_date", event.target.value)}
                        />
                        <TimePicker
                          className="eb-input"
                          value={slot.start_time}
                          onChange={(v) => setSlotField(index, "start_time", v)}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="date"
                          className="eb-input"
                          value={slot.end_date}
                          onChange={(event) => setSlotField(index, "end_date", event.target.value)}
                        />
                        <TimePicker
                          className="eb-input"
                          value={slot.end_time}
                          onChange={(v) => setSlotField(index, "end_time", v)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-eb border border-dashed border-eb-layout bg-[#FBFDFF] px-4 py-5 text-center text-[13px] text-eb-muted">
                Aucun créneau lié pour l'instant.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
              Notes internes
            </label>
            <textarea
              className="eb-input resize-none"
              rows={2}
              value={form.notes}
              onChange={(event) => setField("notes", event.target.value)}
              placeholder="Remarques internes, points de suivi..."
            />
          </div>

          {error ? <p className="text-[13px] text-eb-google">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="eb-btn-ghost">
            Annuler
          </button>
          <button type="submit" disabled={saving} className="eb-btn-primary">
            {saving ? "Enregistrement..." : initial ? "Enregistrer" : "Créer la mission"}
          </button>
        </div>
      </form>
    </div>
  );
}
