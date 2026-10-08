import { useState } from "react";

import type { Experience } from "../../types";

interface Props {
  initial?: Experience;
  onSave: (data: {
    title: string;
    company: string | null;
    start_date: string | null;
    end_date: string | null;
    description: string | null;
    is_current: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

interface FormState {
  title: string;
  company: string;
  start_month: string;
  end_month: string;
  description: string;
  is_current: boolean;
}

function monthValue(date: string | null): string {
  return date ? date.slice(0, 7) : "";
}

function buildInitialState(initial?: Experience): FormState {
  return {
    title: initial?.title ?? "",
    company: initial?.company ?? "",
    start_month: monthValue(initial?.start_date ?? null),
    end_month: monthValue(initial?.end_date ?? null),
    description: initial?.description ?? "",
    is_current: initial?.is_current ?? false,
  };
}

function toApiDate(value: string): string | null {
  return value ? `${value}-01` : null;
}

export default function ExperienceForm({ initial, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<FormState>(buildInitialState(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setError("Le titre est requis.");
      return;
    }

    if (
      form.start_month
      && form.end_month
      && !form.is_current
      && form.end_month < form.start_month
    ) {
      setError("La date de fin doit être postérieure à la date de début.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        title,
        company: form.company.trim() || null,
        start_date: toApiDate(form.start_month),
        end_date: form.is_current ? null : toApiDate(form.end_month),
        description: form.description.trim() || null,
        is_current: form.is_current,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer l'expérience.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !window.confirm("Supprimer cette expérience ?")) return;

    setSaving(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de supprimer l'expérience.");
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
        className="relative w-full max-w-2xl rounded-eb-card border border-eb-layout bg-[#fffdf7] p-6 shadow-lg"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-eb-text">
            {initial ? "Modifier l'expérience" : "Nouvelle expérience"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[20px] leading-none text-eb-muted hover:text-eb-text"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
              Poste
            </label>
            <input
              className="eb-input"
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="Ex : Chef de rang"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
              Entreprise / établissement
            </label>
            <input
              className="eb-input"
              value={form.company}
              onChange={(event) => set("company", event.target.value)}
              placeholder="Ex : Brasserie du Centre"
            />
          </div>

          <div className="rounded-eb border border-eb-layout bg-[#F8FAFF] px-4 py-3">
            <label className="flex items-center gap-2 text-[13px] text-eb-text">
              <input
                type="checkbox"
                checked={form.is_current}
                onChange={(event) => {
                  set("is_current", event.target.checked);
                  if (event.target.checked) set("end_month", "");
                }}
              />
              <span>Expérience en cours</span>
            </label>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
              Début
            </label>
            <input
              type="month"
              className="eb-input"
              value={form.start_month}
              onChange={(event) => set("start_month", event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
              Fin
            </label>
            <input
              type="month"
              className="eb-input"
              value={form.end_month}
              onChange={(event) => set("end_month", event.target.value)}
              disabled={form.is_current}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
              Description
            </label>
            <textarea
              className="eb-input min-h-[120px] resize-y"
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Quelques lignes sur le poste, les responsabilités, le type de service..."
            />
          </div>
        </div>

        {error && <p className="mt-4 text-[13px] text-eb-google">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {initial && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="text-[13px] text-eb-google hover:underline disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="eb-btn-ghost" disabled={saving}>
              Annuler
            </button>
            <button type="submit" disabled={saving} className="eb-btn-primary">
              {saving ? "Enregistrement…" : initial ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
