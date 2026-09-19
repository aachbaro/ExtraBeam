import { useEffect, useMemo, useState } from "react";

import {
  createMission,
  fetchClientTemplates,
  type MissionPayload,
} from "../../api";
import { useUserContext } from "../../context/UserContext";
import type { MissionTemplate, MissionTemplateMode, Unavailability } from "../../types";
import TimePicker from "../TimePicker";

interface ProposalSlotState {
  title: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
}

interface FormState {
  title: string;
  establishment: string;
  establishment_address_line1: string;
  establishment_address_line2: string;
  establishment_postal_code: string;
  establishment_city: string;
  establishment_country: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  dress_code: string;
  instructions: string;
  mode: MissionTemplateMode;
  slots: ProposalSlotState[];
  rate_type: "none" | "hourly" | "fixed";
  rate_value: string;
}

interface Props {
  slug: string;
  unavailabilities?: Unavailability[];
  extraName?: string;
  hourlyRate?: string | null;
  externalSlot?: { date: string; start: string; end: string } | null;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function slotOverlapsUnavailability(slot: ProposalSlotState, u: Unavailability): boolean {
  if (!slot.start_date || !slot.start_time || !slot.end_date || !slot.end_time) return false;

  const slotStart = toMinutes(slot.start_time);
  const slotEnd = toMinutes(slot.end_time);
  const uStart = toMinutes(u.start_time);
  const uEnd = toMinutes(u.end_time);

  const timesOverlap = slotStart < uEnd && slotEnd > uStart;
  if (!timesOverlap) return false;

  if (u.recurrence_type === "weekly") {
    const d = new Date(slot.start_date);
    const weekday = d.getDay() === 0 ? 7 : d.getDay();
    if (weekday !== u.weekday) return false;
    if (u.start_date && slot.start_date < u.start_date) return false;
    if (u.recurrence_end && slot.start_date > u.recurrence_end) return false;
    return !u.exceptions.includes(slot.start_date);
  }

  const rangeStart = u.start_date ?? "";
  const rangeEnd = u.recurrence_end ?? rangeStart;
  return slot.start_date >= rangeStart && slot.start_date <= rangeEnd;
}

function checkSlotAvailability(
  slot: ProposalSlotState,
  unavailabilities: Unavailability[]
): "unknown" | "available" | "conflict" {
  if (!slot.start_date || !slot.start_time) return "unknown";
  const conflict = unavailabilities.some((u) => slotOverlapsUnavailability(slot, u));
  return conflict ? "conflict" : "available";
}

function emptySlot(): ProposalSlotState {
  return {
    title: "",
    start_date: "",
    start_time: "12:00",
    end_date: "",
    end_time: "14:00",
  };
}

function buildInitialForm(): FormState {
  return {
    title: "",
    establishment: "",
    establishment_address_line1: "",
    establishment_address_line2: "",
    establishment_postal_code: "",
    establishment_city: "",
    establishment_country: "France",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    dress_code: "",
    instructions: "",
    mode: "freelance",
    slots: [emptySlot()],
    rate_type: "none",
    rate_value: "",
  };
}

export default function PublicMissionProposalCard({ slug, unavailabilities = [], extraName, hourlyRate, externalSlot }: Props) {
  const { user } = useUserContext();
  const [expanded, setExpanded] = useState(false);
  const [templates, setTemplates] = useState<MissionTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [form, setForm] = useState<FormState>(buildInitialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || user?.role !== "client" || !user.token || templates.length > 0) {
      return;
    }

    setLoadingTemplates(true);
    fetchClientTemplates(user.token)
      .then((data) => setTemplates(data))
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => setLoadingTemplates(false));
  }, [expanded, templates.length, user?.role, user?.token]);

  useEffect(() => {
    if (!externalSlot) return;
    setExpanded(true);
    setForm((prev) => ({
      ...prev,
      slots: [
        {
          title: "",
          start_date: externalSlot.date,
          start_time: externalSlot.start,
          end_date: externalSlot.date,
          end_time: externalSlot.end,
        },
        ...prev.slots.slice(1),
      ],
    }));
  }, [externalSlot]);

  const canUseTemplates = user?.role === "client" && Boolean(user.token);
  const introLabel = useMemo(() => {
    if (user?.role === "client") {
      return "Depuis ton compte client, tu peux reutiliser un modele puis envoyer ta demande.";
    }
    return "Visiteur ou futur client : envoie une demande de mission directement depuis ce profil.";
  }, [user?.role]);

  function setField(field: keyof Omit<FormState, "slots">, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setSlotField(index: number, field: keyof ProposalSlotState, value: string) {
    setForm((prev) => ({
      ...prev,
      slots: prev.slots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, [field]: value } : slot
      ),
    }));
  }

  function addSlot() {
    setForm((prev) => ({ ...prev, slots: [...prev.slots, emptySlot()] }));
  }

  function removeSlot(index: number) {
    setForm((prev) => ({
      ...prev,
      slots: prev.slots.filter((_, slotIndex) => slotIndex !== index),
    }));
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((entry) => String(entry.id) === templateId);
    if (!template) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      establishment: template.establishment,
      establishment_address_line1: template.establishment_address_line1,
      establishment_address_line2: template.establishment_address_line2,
      establishment_postal_code: template.establishment_postal_code,
      establishment_city: template.establishment_city,
      establishment_country: template.establishment_country || "France",
      contact_name: template.contact_name,
      contact_email: template.contact_email,
      contact_phone: template.contact_phone,
      instructions: template.instructions,
      mode: template.mode,
      title: prev.title || template.name,
    }));
  }

  function resetForm() {
    setSelectedTemplateId("");
    setForm(buildInitialForm());
  }

  function buildPayload(): MissionPayload {
    if (!form.establishment.trim()) {
      throw new Error("L'etablissement est requis.");
    }
    if (!form.contact_email.trim()) {
      throw new Error("L'email de contact est requis.");
    }

    const slots = form.slots
      .map((slot) => {
        const hasAnyValue = Object.values(slot).some((value) => value.trim() !== "");
        if (!hasAnyValue) {
          return null;
        }
        if (!slot.start_date || !slot.start_time || !slot.end_date || !slot.end_time) {
          throw new Error("Chaque créneau doit avoir une date et une heure de debut et de fin.");
        }
        const start = `${slot.start_date}T${slot.start_time}:00`;
        const end = `${slot.end_date}T${slot.end_time}:00`;
        if (end <= start) {
          throw new Error("Chaque créneau doit se terminer après son debut.");
        }
        return {
          title: slot.title.trim(),
          start,
          end,
        };
      })
      .filter(Boolean);

    if (slots.length === 0) {
      throw new Error("Ajoute au moins un créneau.");
    }

    const rateNotes =
      form.rate_type === "hourly" && form.rate_value.trim()
        ? `Proposition taux horaire : ${form.rate_value.trim()} €/h`
        : form.rate_type === "none" && hourlyRate
          ? `Taux accepté : ${hourlyRate} €/h`
          : undefined;

    return {
      title: form.title.trim() || form.establishment.trim(),
      establishment: form.establishment.trim(),
      establishment_address_line1: form.establishment_address_line1.trim(),
      establishment_address_line2: form.establishment_address_line2.trim(),
      establishment_postal_code: form.establishment_postal_code.trim(),
      establishment_city: form.establishment_city.trim(),
      establishment_country: form.establishment_country.trim(),
      contact_name: form.contact_name.trim(),
      contact_email: form.contact_email.trim(),
      contact_phone: form.contact_phone.trim(),
      instructions: [
        form.dress_code.trim() ? `Tenue : ${form.dress_code.trim()}` : "",
        form.instructions.trim(),
        rateNotes,
      ].filter(Boolean).join("\n\n"),
      mode: form.mode,
      client_name: form.contact_name.trim(),
      client_email: form.contact_email.trim(),
      client_phone: form.contact_phone.trim(),
      client_company: form.establishment.trim(),
      slots: slots as NonNullable<MissionPayload["slots"]>,
      ...(form.rate_type === "fixed" && form.rate_value.trim()
        ? { total_amount: form.rate_value.trim() }
        : {}),
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = buildPayload();
      await createMission(slug, payload, user?.token);
      setSuccess("Ta mission a bien ete envoyee.");
      resetForm();
      setExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer la mission.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-eb-card border border-eb-layout bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
            Proposer une mission
          </p>
          <p className="mt-1 max-w-2xl text-[13px] leading-6 text-eb-secondary">
            {introLabel}
          </p>
          {hourlyRate && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-eb-page px-2.5 py-0.5 text-[11px] font-medium text-eb-text">
              <span className="text-eb-muted">Taux affiché</span>
              <span>{hourlyRate} €/h</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded((current) => !current);
            setError(null);
            setSuccess(null);
          }}
          className="eb-btn-primary shrink-0"
        >
          {expanded ? "Fermer" : "Ouvrir le formulaire"}
        </button>
      </div>

      {success ? <p className="mt-3 text-[13px] text-eb-success">{success}</p> : null}

      <div style={{ maxHeight: expanded ? "9999px" : "0px", overflow: "hidden", transition: "max-height 0.4s ease" }}>
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4">
          {canUseTemplates ? (
            <div className="rounded-eb border border-eb-layout bg-[#F8FAFF] p-4">
              <label className="mb-2 block text-[12px] font-medium text-eb-secondary">
                Modele client
              </label>
              <select
                className="eb-input"
                value={selectedTemplateId}
                onChange={(event) => applyTemplate(event.target.value)}
                disabled={loadingTemplates}
              >
                <option value="">Aucun modele</option>
                {templates.map((template) => (
                  <option key={template.id} value={String(template.id)}>
                    {template.name}
                  </option>
                ))}
              </select>
              {loadingTemplates ? (
                <p className="mt-2 text-[12px] text-eb-muted">Chargement des modeles...</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="eb-input"
              value={form.title}
              onChange={(event) => setField("title", event.target.value)}
              placeholder="Titre de mission (optionnel)"
            />
            <input
              className="eb-input"
              value={form.establishment}
              onChange={(event) => setField("establishment", event.target.value)}
              placeholder="Etablissement *"
            />
            <input
              className="eb-input"
              value={form.establishment_address_line1}
              onChange={(event) => setField("establishment_address_line1", event.target.value)}
              placeholder="Adresse"
            />
            <input
              className="eb-input"
              value={form.establishment_address_line2}
              onChange={(event) => setField("establishment_address_line2", event.target.value)}
              placeholder="Complement d'adresse"
            />
            <input
              className="eb-input"
              value={form.establishment_postal_code}
              onChange={(event) => setField("establishment_postal_code", event.target.value)}
              placeholder="Code postal"
            />
            <input
              className="eb-input"
              value={form.establishment_city}
              onChange={(event) => setField("establishment_city", event.target.value)}
              placeholder="Ville"
            />
            <input
              className="eb-input md:col-span-2"
              value={form.establishment_country}
              onChange={(event) => setField("establishment_country", event.target.value)}
              placeholder="Pays"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
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
              placeholder="Email de contact *"
            />
            <input
              className="eb-input"
              value={form.contact_phone}
              onChange={(event) => setField("contact_phone", event.target.value)}
              placeholder="Telephone"
            />
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-medium text-eb-secondary">
              Mode
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setField("mode", "freelance")}
                className={`eb-chip cursor-pointer transition-all ${
                  form.mode === "freelance" ? "bg-eb-primary text-white" : "hover:bg-[#e5e7eb]"
                }`}
              >
                Freelance
              </button>
              <button
                type="button"
                onClick={() => setField("mode", "salarie")}
                className={`eb-chip cursor-pointer transition-all ${
                  form.mode === "salarie" ? "bg-eb-primary text-white" : "hover:bg-[#e5e7eb]"
                }`}
              >
                Salarie
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-eb-secondary">
                Tenue demandée
              </label>
              <textarea
                className="eb-input resize-none"
                rows={3}
                value={form.dress_code}
                onChange={(event) => setField("dress_code", event.target.value)}
                placeholder="Ex : tablier noir, tenue sombre, uniforme fourni..."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-eb-secondary">
                Autres instructions
              </label>
              <textarea
                className="eb-input resize-none"
                rows={3}
                value={form.instructions}
                onChange={(event) => setField("instructions", event.target.value)}
                placeholder="Brief, contexte de service, consignes particulières..."
              />
            </div>
          </div>

          <div className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-eb-text">Créneaux demandés</p>
                <p className="mt-1 text-[13px] text-eb-secondary">
                  Ajoute les horaires utiles pour la mission.
                </p>
              </div>
              <button type="button" onClick={addSlot} className="eb-btn-ghost text-[13px]">
                + Ajouter
              </button>
            </div>

            <div className="space-y-3">
              {form.slots.map((slot, index) => {
                const avail = checkSlotAvailability(slot, unavailabilities);
                return (
                <div key={`${index}-${slot.start_date}-${slot.start_time}`} className="rounded-eb border border-eb-layout bg-white p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <input
                      className="eb-input flex-1"
                      value={slot.title}
                      onChange={(event) => setSlotField(index, "title", event.target.value)}
                      placeholder="Titre du créneau (optionnel)"
                    />
                    {form.slots.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeSlot(index)}
                        className="text-[13px] text-eb-google hover:underline"
                      >
                        Retirer
                      </button>
                    ) : null}
                  </div>
                  {avail !== "unknown" && (
                    <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      avail === "available"
                        ? "bg-green-50 text-green-700"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      {avail === "available" ? (
                        <>✓ {extraName ?? "L'extra"} est disponible sur ce créneau</>
                      ) : (
                        <>⚠ Créneau potentiellement indisponible — à confirmer</>
                      )}
                    </div>
                  )}
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
              );
              })}
            </div>
          </div>

          <div className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
            <p className="mb-3 text-[12px] font-medium text-eb-text">Proposition de tarif</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={() => setField("rate_type", "none")}
                className={`eb-chip cursor-pointer transition-all ${
                  form.rate_type === "none" ? "bg-eb-primary text-white" : "hover:bg-[#e5e7eb]"
                }`}
              >
                {hourlyRate ? `Taux affiché (${hourlyRate} €/h)` : "Sans proposition"}
              </button>
              <button
                type="button"
                onClick={() => setField("rate_type", "hourly")}
                className={`eb-chip cursor-pointer transition-all ${
                  form.rate_type === "hourly" ? "bg-eb-primary text-white" : "hover:bg-[#e5e7eb]"
                }`}
              >
                Contre-proposer un taux horaire
              </button>
              <button
                type="button"
                onClick={() => setField("rate_type", "fixed")}
                className={`eb-chip cursor-pointer transition-all ${
                  form.rate_type === "fixed" ? "bg-eb-primary text-white" : "hover:bg-[#e5e7eb]"
                }`}
              >
                Proposer un tarif fixe
              </button>
            </div>
            <div style={{ maxHeight: form.rate_type !== "none" ? "80px" : "0px", overflow: "hidden", transition: "max-height 0.25s ease" }}>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="eb-input w-36"
                  value={form.rate_value}
                  onChange={(event) => setField("rate_value", event.target.value)}
                  placeholder={form.rate_type === "hourly" ? "Ex : 25" : "Montant total"}
                />
                <span className="text-[13px] text-eb-secondary">
                  {form.rate_type === "hourly" ? "€/h" : "€ (total)"}
                </span>
              </div>
            </div>
            {form.rate_type === "none" && hourlyRate && (
              <p className="mt-1 text-[11px] text-eb-muted">
                En acceptant, vous confirmez le taux affiché de {hourlyRate} €/h.
              </p>
            )}
          </div>

          {error ? <p className="text-[13px] text-eb-google">{error}</p> : null}

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="eb-btn-primary">
              {saving ? "Envoi..." : "Envoyer la mission"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
