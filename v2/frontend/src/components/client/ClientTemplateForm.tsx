import { useState } from "react";

import type { MissionTemplatePayload } from "../../api";
import type { MissionTemplate, MissionTemplateMode } from "../../types";

const MODE_OPTIONS: { value: MissionTemplateMode; label: string }[] = [
  { value: "freelance", label: "Freelance" },
  { value: "salarie", label: "Salarie" },
];

interface FormState {
  name: string;
  establishment: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  instructions: string;
  establishment_address_line1: string;
  establishment_address_line2: string;
  establishment_postal_code: string;
  establishment_city: string;
  establishment_country: string;
  mode: MissionTemplateMode;
}

function templateToForm(template?: MissionTemplate): FormState {
  return {
    name: template?.name ?? "",
    establishment: template?.establishment ?? "",
    contact_name: template?.contact_name ?? "",
    contact_email: template?.contact_email ?? "",
    contact_phone: template?.contact_phone ?? "",
    instructions: template?.instructions ?? "",
    establishment_address_line1: template?.establishment_address_line1 ?? "",
    establishment_address_line2: template?.establishment_address_line2 ?? "",
    establishment_postal_code: template?.establishment_postal_code ?? "",
    establishment_city: template?.establishment_city ?? "",
    establishment_country: template?.establishment_country ?? "France",
    mode: template?.mode ?? "freelance",
  };
}

interface Props {
  initial?: MissionTemplate;
  onSave: (data: MissionTemplatePayload) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function ClientTemplateForm({ initial, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => templateToForm(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof FormState, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom du modele est requis.");
      return;
    }
    if (!form.establishment.trim()) {
      setError("L'etablissement est requis.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        name: form.name.trim(),
        establishment: form.establishment.trim(),
        contact_name: form.contact_name.trim(),
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone.trim(),
        instructions: form.instructions.trim(),
        establishment_address_line1: form.establishment_address_line1.trim(),
        establishment_address_line2: form.establishment_address_line2.trim(),
        establishment_postal_code: form.establishment_postal_code.trim(),
        establishment_city: form.establishment_city.trim(),
        establishment_country: form.establishment_country.trim(),
        mode: form.mode,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !window.confirm("Supprimer ce modele de mission ?")) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression.");
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
        className="relative w-full max-w-3xl rounded-eb-card border border-eb-layout bg-[#fffdf7] p-6 shadow-lg"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-eb-text">
            {initial ? "Modifier le modele" : "Nouveau modele de mission"}
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

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Nom du modele *</label>
              <input
                className="eb-input"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="Service soir"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Etablissement *</label>
              <input
                className="eb-input"
                value={form.establishment}
                onChange={(event) => setField("establishment", event.target.value)}
                placeholder="Bistrot Central"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Mode</label>
            <div className="flex gap-2">
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

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Contact</label>
              <input
                className="eb-input"
                value={form.contact_name}
                onChange={(event) => setField("contact_name", event.target.value)}
                placeholder="Lea"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Email</label>
              <input
                type="email"
                className="eb-input"
                value={form.contact_email}
                onChange={(event) => setField("contact_email", event.target.value)}
                placeholder="contact@bistrot.fr"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Telephone</label>
              <input
                className="eb-input"
                value={form.contact_phone}
                onChange={(event) => setField("contact_phone", event.target.value)}
                placeholder="0601020304"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Adresse</label>
              <input
                className="eb-input"
                value={form.establishment_address_line1}
                onChange={(event) => setField("establishment_address_line1", event.target.value)}
                placeholder="12 rue des Halles"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Complement</label>
              <input
                className="eb-input"
                value={form.establishment_address_line2}
                onChange={(event) => setField("establishment_address_line2", event.target.value)}
                placeholder="Etage, batiment..."
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Code postal</label>
              <input
                className="eb-input"
                value={form.establishment_postal_code}
                onChange={(event) => setField("establishment_postal_code", event.target.value)}
                placeholder="59000"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Ville</label>
              <input
                className="eb-input"
                value={form.establishment_city}
                onChange={(event) => setField("establishment_city", event.target.value)}
                placeholder="Lille"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Pays</label>
            <input
              className="eb-input"
              value={form.establishment_country}
              onChange={(event) => setField("establishment_country", event.target.value)}
              placeholder="France"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-eb-secondary">Instructions</label>
            <textarea
              className="eb-input resize-none"
              rows={4}
              value={form.instructions}
              onChange={(event) => setField("instructions", event.target.value)}
              placeholder="Brief service, tenue attendue, contexte..."
            />
          </div>

          {error ? <p className="text-[13px] text-eb-google">{error}</p> : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {initial && onDelete ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving}
                className="text-[13px] text-eb-google hover:underline disabled:opacity-50"
              >
                Supprimer
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="eb-btn-ghost">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="eb-btn-primary">
              {saving ? "Enregistrement..." : initial ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
