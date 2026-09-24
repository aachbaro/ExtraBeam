/**
 * src/components/factures/FactureForm.tsx
 * Layer  : Frontend — composant UI
 * Role   : Formulaire modal de création / édition d'une facture manuelle.
 */

import { useState } from "react";

import type { FacturePayload } from "../../api";
import TimePicker from "../TimePicker";
import type {
  Facture,
  FactureStatus,
  FreelancerProfile,
  Mission,
} from "../../types";

const STATUS_LABELS: Record<FactureStatus, string> = {
  pending_payment: "En attente",
  paid: "Payée",
  canceled: "Annulée",
};

const STATUS_LIST: FactureStatus[] = ["pending_payment", "paid", "canceled"];
const DEFAULT_ESCOMPTE = "Escompte pour paiement anticipe : neant";
const DEFAULT_LATE_PENALTIES = "Taux BCE + 10 points";
const DEFAULT_RECOVERY_FEE =
  "Indemnite forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 EUR";
const LEGACY_COMBINED_LATE_PENALTIES =
  "Taux BCE + 10 pts, indemnite forfaitaire 40 EUR";

interface FormState {
  mission_id: string;
  numero: string;
  date_emission: string;
  date_echeance: string;
  status: FactureStatus;
  client_name: string;
  client_address_ligne1: string;
  client_address_ligne2: string;
  client_code_postal: string;
  client_ville: string;
  client_pays: string;
  client_siren: string;
  client_siret: string;
  client_vat_number: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  description: string;
  hours: string;
  rate: string;
  montant_ht: string;
  tva: string;
  montant_ttc: string;
  mention_tva: string;
  conditions_paiement: string;
  escompte: string;
  penalites_retard: string;
  indemnite_recouvrement: string;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function toFixedAmount(value: number): string {
  return value.toFixed(2);
}

function normalizeNumberInput(value: string): string {
  return value.replace(",", ".").trim();
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(normalizeNumberInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function computeTtc(ht: string, tva: string): string {
  const htValue = parseNumber(ht) ?? 0;
  const tvaValue = parseNumber(tva) ?? 0;
  return toFixedAmount(htValue * (1 + tvaValue / 100));
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function buildMissionDescription(mission: Mission): string {
  const period =
    mission.start_date && mission.end_date
      ? mission.start_date === mission.end_date
        ? `le ${formatDateLabel(mission.start_date)}`
        : `du ${formatDateLabel(mission.start_date)} au ${formatDateLabel(mission.end_date)}`
      : mission.start_date
        ? `le ${formatDateLabel(mission.start_date)}`
        : "";

  return [mission.title, period].filter(Boolean).join(", ");
}

function getLatePenaltiesDefault(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return DEFAULT_LATE_PENALTIES;
  if (normalized === LEGACY_COMBINED_LATE_PENALTIES) {
    return DEFAULT_LATE_PENALTIES;
  }
  return normalized;
}

function buildInitialForm(
  facture: Facture | undefined,
  profile: FreelancerProfile,
  suggestedNumero?: string,
): FormState {
  const dateEmission = facture?.date_emission ?? todayString();

  return {
    mission_id: facture?.mission_id ? String(facture.mission_id) : "",
    numero: facture?.numero ?? suggestedNumero ?? "",
    date_emission: dateEmission,
    date_echeance: facture?.date_echeance ?? dateEmission,
    status: facture?.status ?? "pending_payment",
    client_name: facture?.client_name ?? "",
    client_address_ligne1: facture?.client_address_ligne1 ?? "",
    client_address_ligne2: facture?.client_address_ligne2 ?? "",
    client_code_postal: facture?.client_code_postal ?? "",
    client_ville: facture?.client_ville ?? "",
    client_pays: facture?.client_pays ?? "France",
    client_siren: facture?.client_siren ?? "",
    client_siret: facture?.client_siret ?? "",
    client_vat_number: facture?.client_vat_number ?? "",
    contact_name: facture?.contact_name ?? "",
    contact_phone: facture?.contact_phone ?? "",
    contact_email: facture?.contact_email ?? "",
    description: facture?.description ?? "",
    hours: facture?.hours ?? "",
    rate: facture?.rate ?? "",
    montant_ht: facture?.montant_ht ?? "",
    tva: facture?.tva ?? "0.00",
    montant_ttc: facture?.montant_ttc ?? "",
    mention_tva: facture?.mention_tva ?? profile.vat_notice ?? "",
    conditions_paiement:
      facture?.conditions_paiement ?? profile.payment_terms ?? "",
    escompte: facture?.escompte ?? DEFAULT_ESCOMPTE,
    penalites_retard:
      facture?.penalites_retard ??
      getLatePenaltiesDefault(profile.late_penalties),
    indemnite_recouvrement:
      facture?.indemnite_recouvrement ?? DEFAULT_RECOVERY_FEE,
  };
}

function applyMissionDefaults(
  previous: FormState,
  mission: Mission | undefined,
): FormState {
  if (!mission) {
    return { ...previous, mission_id: "" };
  }

  const next = { ...previous, mission_id: String(mission.id) };
  next.client_name =
    mission.client_company || mission.client_name || next.client_name;
  next.contact_name = mission.client_name || next.contact_name;
  next.contact_email = mission.client_email || next.contact_email;
  next.contact_phone = mission.client_phone || next.contact_phone;
  next.description = next.description || buildMissionDescription(mission);

  if (!next.rate && mission.daily_rate) {
    next.rate = mission.daily_rate;
  }
  if (!next.montant_ht && mission.total_amount) {
    next.montant_ht = mission.total_amount;
    next.montant_ttc = computeTtc(next.montant_ht, next.tva);
  } else if (next.hours && next.rate) {
    const hours = parseNumber(next.hours);
    const rate = parseNumber(next.rate);
    if (hours !== null && rate !== null) {
      next.montant_ht = toFixedAmount(hours * rate);
      next.montant_ttc = computeTtc(next.montant_ht, next.tva);
    }
  }

  return next;
}

function buildComplianceWarnings(
  form: FormState,
  profile: FreelancerProfile,
): string[] {
  const warnings: string[] = [];

  if (!profile.display_name.trim()) {
    warnings.push("Ajoute ton nom ou ta raison sociale dans le profil.");
  }
  if (
    !profile.address_line1.trim() ||
    !profile.postal_code.trim() ||
    !profile.city.trim()
  ) {
    warnings.push("Complete ton adresse emetteur dans le profil pour le PDF.");
  }
  if (!profile.siret.trim()) {
    warnings.push("Ajoute ton SIRET dans le profil pour une facture complete.");
  }
  if (!form.client_name.trim()) {
    warnings.push("Renseigne le nom ou la raison sociale du client.");
  }
  if (
    !form.client_address_ligne1.trim() ||
    !form.client_code_postal.trim() ||
    !form.client_ville.trim()
  ) {
    warnings.push(
      "Complete l'adresse du client (ligne 1, code postal, ville).",
    );
  }
  if (!form.date_echeance.trim()) {
    warnings.push("Ajoute une date d'echeance de paiement.");
  }
  if (!form.conditions_paiement.trim()) {
    warnings.push("Ajoute les conditions de paiement.");
  }
  if (!form.escompte.trim()) {
    warnings.push("Ajoute la mention d'escompte.");
  }
  if (!form.penalites_retard.trim()) {
    warnings.push("Ajoute les penalites de retard.");
  }
  if (!form.indemnite_recouvrement.trim()) {
    warnings.push("Ajoute l'indemnite forfaitaire de recouvrement.");
  }
  if ((parseNumber(form.tva) ?? 0) === 0 && !form.mention_tva.trim()) {
    warnings.push("Ajoute une mention TVA si tu factures avec TVA a 0 %.");
  }

  return warnings;
}

function buildOptionalHints(form: FormState): string[] {
  const hints: string[] = [];

  if (!form.client_siren.trim() && !form.client_siret.trim()) {
    hints.push(
      "Tu peux garder le SIREN ou SIRET client pour tes prochaines factures.",
    );
  }
  if (!form.client_vat_number.trim()) {
    hints.push("Ajoute la TVA intracom client si tu l'as sous la main.");
  }
  if (!form.contact_email.trim() && !form.contact_phone.trim()) {
    hints.push(
      "Un email ou telephone de contact aide si le client a un service compta.",
    );
  }

  return hints;
}

interface Props {
  initial?: Facture;
  reuse?: Facture;
  previousFactures?: Facture[];
  missions: Mission[];
  profile: FreelancerProfile;
  suggestedNumero?: string;
  onSave: (data: FacturePayload) => Promise<void>;
  onClose: () => void;
}

export default function FactureForm({
  initial,
  reuse,
  previousFactures = [],
  missions,
  profile,
  suggestedNumero,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState<FormState>(() =>
    reuse
      ? {
          ...buildInitialForm(reuse, profile, suggestedNumero),
          numero: suggestedNumero ?? "",
          date_emission: todayString(),
          date_echeance: todayString(),
          status: "pending_payment",
          mission_id: "",
          hours: "",
          montant_ht: "",
          montant_ttc: "",
        }
      : buildInitialForm(initial, profile, suggestedNumero),
  );
  const [showRateDetail, setShowRateDetail] = useState(
    !!(initial?.hours || initial?.rate),
  );
  function toggleRateDetail() {
    setShowRateDetail((v) => {
      if (v) setForm((prev) => ({ ...prev, hours: "", rate: "" }));
      return !v;
    });
  }
  const [prestation, setPrestation] = useState({
    date: todayString(),
    start: "",
    end: "",
  });
  const clients = [
    ...new Map(
      [...previousFactures]
        .sort((a, b) => a.id - b.id)
        .filter((f) => f.client_name.trim())
        .map((f) => [
          (
            f.client_siret ||
            f.client_siren ||
            [f.client_name, f.client_code_postal, f.client_address_ligne1].join(
              "|",
            )
          )
            .trim()
            .toLowerCase(),
          f,
        ]),
    ).values(),
  ];
  function chooseClient(id: string) {
    const client = clients.find((f) => f.id === Number(id));
    if (!client) return;
    const source = buildInitialForm(client, profile);
    setForm((previous) => {
      const next = { ...previous };
      for (const k of Object.keys(next) as (keyof FormState)[]) {
        if (k.startsWith("client_") || k.startsWith("contact_"))
          (next as unknown as Record<string, string>)[k] = source[k];
      }
      return next;
    });
  }
  function applyPrestation() {
    if (!prestation.date || !prestation.start || !prestation.end) return;
    const mins = (t: string) =>
      Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const duration =
      (mins(prestation.end) - mins(prestation.start) + 1440) % 1440;
    if (!duration) {
      setError("Les horaires doivent définir une durée non nulle.");
      return;
    }
    setHours((duration / 60).toFixed(2));
    setField(
      "description",
      `Extra le ${formatDateLabel(prestation.date)}, de ${prestation.start} à ${prestation.end}${mins(prestation.end) < mins(prestation.start) ? " (lendemain)" : ""}`,
    );
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complianceWarnings = buildComplianceWarnings(form, profile);
  const optionalHints = buildOptionalHints(form);

  function setField(field: keyof FormState, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function setDateEmission(value: string) {
    setForm((previous) => ({
      ...previous,
      date_emission: value,
      date_echeance:
        !previous.date_echeance ||
        previous.date_echeance === previous.date_emission
          ? value
          : previous.date_echeance,
    }));
  }

  function setHours(value: string) {
    setForm((previous) => {
      const next = { ...previous, hours: value };
      const hours = parseNumber(value);
      const rate = parseNumber(previous.rate);
      if (hours !== null && rate !== null) {
        next.montant_ht = toFixedAmount(hours * rate);
        next.montant_ttc = computeTtc(next.montant_ht, previous.tva);
      }
      return next;
    });
  }

  function setRate(value: string) {
    setForm((previous) => {
      const next = { ...previous, rate: value };
      const hours = parseNumber(previous.hours);
      const rate = parseNumber(value);
      if (hours !== null && rate !== null) {
        next.montant_ht = toFixedAmount(hours * rate);
        next.montant_ttc = computeTtc(next.montant_ht, previous.tva);
      }
      return next;
    });
  }

  function setMontantHt(value: string) {
    setForm((previous) => ({
      ...previous,
      montant_ht: value,
      montant_ttc: computeTtc(value, previous.tva),
    }));
  }

  function setTva(value: string) {
    setForm((previous) => ({
      ...previous,
      tva: value,
      montant_ttc: computeTtc(previous.montant_ht, value),
      mention_tva:
        (parseNumber(value) ?? 0) > 0 &&
        previous.mention_tva === profile.vat_notice
          ? ""
          : previous.mention_tva,
    }));
  }

  function handleMissionChange(value: string) {
    const mission = missions.find((item) => item.id === Number(value));
    setForm((previous) => applyMissionDefaults(previous, mission));
  }

  function applyProfileDefaults() {
    setForm((previous) => ({
      ...previous,
      mention_tva: previous.mention_tva || profile.vat_notice || "",
      conditions_paiement:
        previous.conditions_paiement || profile.payment_terms || "",
      penalites_retard:
        previous.penalites_retard ||
        getLatePenaltiesDefault(profile.late_penalties),
      escompte: previous.escompte || DEFAULT_ESCOMPTE,
      indemnite_recouvrement:
        previous.indemnite_recouvrement || DEFAULT_RECOVERY_FEE,
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!/^\d{4}-\d{1,}$/.test(form.numero.trim())) {
      setError("Format invalide. Utiliser AAAA-NNNN (ex: 2026-0001).");
      return;
    }

    if (!form.client_name.trim()) {
      setError("Le nom du client est requis.");
      return;
    }

    const montantHt = parseNumber(form.montant_ht);
    if (montantHt === null || montantHt < 0) {
      setError("Le montant HT doit etre renseigne.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        mission_id: form.mission_id ? Number(form.mission_id) : null,
        numero: form.numero.trim(),
        date_emission: form.date_emission,
        date_echeance: form.date_echeance.trim() || null,
        status: form.status,
        client_name: form.client_name.trim(),
        client_address_ligne1: form.client_address_ligne1.trim(),
        client_address_ligne2: form.client_address_ligne2.trim(),
        client_code_postal: form.client_code_postal.trim(),
        client_ville: form.client_ville.trim(),
        client_pays: form.client_pays.trim(),
        client_siren: form.client_siren.trim(),
        client_siret: form.client_siret.trim(),
        client_vat_number: form.client_vat_number.trim(),
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        contact_email: form.contact_email.trim(),
        description: form.description.trim(),
        hours: form.hours.trim()
          ? toFixedAmount(parseNumber(form.hours) ?? 0)
          : null,
        rate: form.rate.trim()
          ? toFixedAmount(parseNumber(form.rate) ?? 0)
          : null,
        montant_ht: toFixedAmount(montantHt),
        tva: toFixedAmount(parseNumber(form.tva) ?? 0),
        montant_ttc: computeTtc(toFixedAmount(montantHt), form.tva),
        mention_tva: form.mention_tva.trim(),
        conditions_paiement: form.conditions_paiement.trim(),
        escompte: form.escompte.trim(),
        penalites_retard: form.penalites_retard.trim(),
        indemnite_recouvrement: form.indemnite_recouvrement.trim(),
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la sauvegarde.",
      );
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
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold text-eb-text">
              {initial ? "Modifier la facture" : "Nouvelle facture manuelle"}
            </h2>
            <p className="mt-1 text-[12px] text-eb-muted">
              Rivebelle reprend tes mentions depuis le profil, puis tu ajustes
              ce qui est propre a cette facture.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[20px] leading-none text-eb-muted hover:text-eb-text"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
          {reuse && (
            <p className="rounded border bg-amber-50 p-3 text-sm">
              Nouvelle facture à partir de {reuse.numero}. Client, tarif et
              mentions repris. Vérifiez la description et renseignez la durée ou
              le montant de cette prestation.
            </p>
          )}
          {clients.length > 0 && (
            <label className="block text-sm">
              Reprendre un client déjà facturé
              <select
                className="eb-input mt-1"
                defaultValue=""
                onChange={(e) => chooseClient(e.target.value)}
              >
                <option value="">Choisir un client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.client_name}
                    {c.client_ville ? " · " + c.client_ville : ""}
                    {c.client_siret ? " · " + c.client_siret : ""}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-eb-muted mt-1">
                Coordonnées conservées dans vos factures. Seules les
                informations du client sont reprises.
              </span>
            </label>
          )}
          <details className="border rounded p-3">
            <summary className="cursor-pointer text-sm">
              Renseigner une date et des horaires de prestation
            </summary>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <label className="text-xs">
                Date
                <input
                  aria-label="Date de prestation"
                  type="date"
                  className="eb-input"
                  value={prestation.date}
                  onChange={(e) =>
                    setPrestation((p) => ({ ...p, date: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs">
                Début
                <TimePicker
                  aria-label="Début de prestation"
                  className="eb-input"
                  value={prestation.start}
                  onChange={(v) => setPrestation((p) => ({ ...p, start: v }))}
                />
              </label>
              <label className="text-xs">
                Fin
                <TimePicker
                  aria-label="Fin de prestation"
                  className="eb-input"
                  value={prestation.end}
                  onChange={(v) => setPrestation((p) => ({ ...p, end: v }))}
                />
              </label>
            </div>
            <p className="text-xs my-2">
              Remplace la description et calcule la durée brute. Ajustez ensuite
              les heures si une pause doit être déduite.
            </p>
            <button
              type="button"
              disabled={!prestation.start || !prestation.end}
              className="border rounded px-3 py-2 text-sm"
              onClick={applyPrestation}
            >
              Appliquer à la description et aux heures
            </button>
          </details>
          <div className="rounded-eb border border-[#dbe7f3] bg-[#f8fbff] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
                  Raccourci
                </p>
                <p className="mt-1 text-[13px] text-eb-secondary">
                  Numero suggere :{" "}
                  <span className="font-semibold text-eb-text">
                    {suggestedNumero ?? form.numero ?? "-"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={applyProfileDefaults}
                className="inline-flex min-h-[34px] items-center justify-center rounded-eb border border-eb-layout px-3 text-[12px] font-medium text-eb-text transition-colors hover:bg-white"
              >
                Reprendre mes mentions du profil
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                Facture N° *
              </label>
              <input
                className="eb-input"
                value={form.numero}
                onChange={(event) => setField("numero", event.target.value)}
                placeholder={suggestedNumero ?? "2026-0001"}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                Date d'emission
              </label>
              <input
                type="date"
                className="eb-input"
                value={form.date_emission}
                onChange={(event) => setDateEmission(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                Date d'echeance
              </label>
              <input
                type="date"
                className="eb-input"
                value={form.date_echeance}
                onChange={(event) =>
                  setField("date_echeance", event.target.value)
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                Mission liee
              </label>
              <select
                className="eb-input"
                value={form.mission_id}
                onChange={(event) => handleMissionChange(event.target.value)}
              >
                <option value="">Aucune mission</option>
                {missions.map((mission) => (
                  <option key={mission.id} value={mission.id}>
                    {mission.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                Statut
              </label>
              <select
                className="eb-input"
                value={form.status}
                onChange={(event) =>
                  setField("status", event.target.value as FactureStatus)
                }
              >
                {STATUS_LIST.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-eb border border-[#f3e5c7] bg-[#fffaf0] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Controle rapide
            </p>
            {complianceWarnings.length > 0 ? (
              <ul className="mt-3 space-y-1 text-[13px] text-eb-secondary">
                {complianceWarnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] text-eb-secondary">
                Rien d'essentiel ne semble manquer pour une facture simple.
              </p>
            )}
            {optionalHints.length > 0 ? (
              <div className="mt-3 border-t border-[#f0e1bd] pt-3 text-[12px] text-eb-muted">
                {optionalHints.map((hint) => (
                  <p key={hint}>{hint}</p>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Client
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Nom / raison sociale *
                </label>
                <input
                  className="eb-input"
                  value={form.client_name}
                  onChange={(event) =>
                    setField("client_name", event.target.value)
                  }
                  placeholder="La raison sociale du client"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Adresse ligne 1
                </label>
                <input
                  className="eb-input"
                  value={form.client_address_ligne1}
                  onChange={(event) =>
                    setField("client_address_ligne1", event.target.value)
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Adresse ligne 2
                </label>
                <input
                  className="eb-input"
                  value={form.client_address_ligne2}
                  onChange={(event) =>
                    setField("client_address_ligne2", event.target.value)
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Code postal
                </label>
                <input
                  className="eb-input"
                  value={form.client_code_postal}
                  onChange={(event) =>
                    setField("client_code_postal", event.target.value)
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Ville
                </label>
                <input
                  className="eb-input"
                  value={form.client_ville}
                  onChange={(event) =>
                    setField("client_ville", event.target.value)
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Pays
                </label>
                <input
                  className="eb-input"
                  value={form.client_pays}
                  onChange={(event) =>
                    setField("client_pays", event.target.value)
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Infos legales client
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  SIREN
                </label>
                <input
                  className="eb-input"
                  value={form.client_siren}
                  onChange={(event) =>
                    setField("client_siren", event.target.value)
                  }
                  placeholder="942467069"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  SIRET
                </label>
                <input
                  className="eb-input"
                  value={form.client_siret}
                  onChange={(event) =>
                    setField("client_siret", event.target.value)
                  }
                  placeholder="94246706900012"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  TVA intracom
                </label>
                <input
                  className="eb-input"
                  value={form.client_vat_number}
                  onChange={(event) =>
                    setField("client_vat_number", event.target.value)
                  }
                  placeholder="FR17942467069"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Contact
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Nom
                </label>
                <input
                  className="eb-input"
                  value={form.contact_name}
                  onChange={(event) =>
                    setField("contact_name", event.target.value)
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Email
                </label>
                <input
                  type="email"
                  className="eb-input"
                  value={form.contact_email}
                  onChange={(event) =>
                    setField("contact_email", event.target.value)
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Telephone
                </label>
                <input
                  type="tel"
                  className="eb-input"
                  value={form.contact_phone}
                  onChange={(event) =>
                    setField("contact_phone", event.target.value)
                  }
                />
              </div>
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
              placeholder="Prestation, periode facturee, details utiles..."
            />
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Montants
            </p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-[12px] text-eb-muted">
                {showRateDetail ? "Qté × taux → montant HT calculé automatiquement." : "Prix forfaitaire, sans détail du taux horaire."}
              </p>
              <button
                type="button"
                onClick={toggleRateDetail}
                className="text-[12px] text-eb-secondary underline hover:text-eb-text transition-colors shrink-0 ml-3"
              >
                {showRateDetail ? "Masquer le détail" : "Ajouter heures × taux"}
              </button>
            </div>
            <div className={`mt-3 grid gap-3 ${showRateDetail ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
              {showRateDetail && (
                <>
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                      Quantite / heures
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      className="eb-input"
                      value={form.hours}
                      onChange={(event) => setHours(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                      Taux HT (€)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="eb-input"
                      value={form.rate}
                      onChange={(event) => setRate(event.target.value)}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  HT (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="eb-input"
                  value={form.montant_ht}
                  onChange={(event) => setMontantHt(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  TVA (%)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="eb-input"
                  value={form.tva}
                  onChange={(event) => setTva(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  TTC (€)
                </label>
                <input
                  className="eb-input bg-eb-page"
                  value={form.montant_ttc}
                  readOnly
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
              Reglement et mentions
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Mention TVA
                </label>
                <input
                  className="eb-input"
                  value={form.mention_tva}
                  onChange={(event) =>
                    setField("mention_tva", event.target.value)
                  }
                  placeholder="TVA non applicable, art. 293 B du CGI"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Conditions de paiement
                </label>
                <textarea
                  className="eb-input resize-none"
                  rows={2}
                  value={form.conditions_paiement}
                  onChange={(event) =>
                    setField("conditions_paiement", event.target.value)
                  }
                  placeholder="Paiement comptant a reception"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Escompte
                </label>
                <textarea
                  className="eb-input resize-none"
                  rows={2}
                  value={form.escompte}
                  onChange={(event) => setField("escompte", event.target.value)}
                  placeholder={DEFAULT_ESCOMPTE}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Penalites de retard
                </label>
                <textarea
                  className="eb-input resize-none"
                  rows={2}
                  value={form.penalites_retard}
                  onChange={(event) =>
                    setField("penalites_retard", event.target.value)
                  }
                  placeholder="Taux BCE + 10 points"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-eb-secondary">
                  Indemnite de recouvrement
                </label>
                <textarea
                  className="eb-input resize-none"
                  rows={2}
                  value={form.indemnite_recouvrement}
                  onChange={(event) =>
                    setField("indemnite_recouvrement", event.target.value)
                  }
                  placeholder={DEFAULT_RECOVERY_FEE}
                />
              </div>
            </div>
          </div>

          {error ? <p className="text-[13px] text-eb-google">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="eb-btn-ghost">
            Annuler
          </button>
          <button type="submit" disabled={saving} className="eb-btn-primary">
            {saving
              ? "Enregistrement..."
              : initial
                ? "Enregistrer"
                : "Creer la facture"}
          </button>
        </div>
      </form>
    </div>
  );
}
