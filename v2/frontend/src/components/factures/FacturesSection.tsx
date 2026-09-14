/**
 * src/components/factures/FacturesSection.tsx
 * Layer  : Frontend — composant section
 * Role   : Section complète de gestion des factures manuelles (owner uniquement).
 */

import { useEffect, useState } from "react";

import {
  createFacture,
  deleteFacture,
  fetchFactures,
  updateFacture,
  type FacturePayload,
} from "../../api";
import { downloadFacturePdf } from "../../lib/facturePdf";
import type {
  Facture,
  FactureStatus,
  FreelancerProfile,
  Mission,
} from "../../types";
import FactureCard from "./FactureCard";
import FactureForm from "./FactureForm";

const STATUS_FILTERS: { value: FactureStatus | null; label: string }[] = [
  { value: null, label: "Toutes" },
  { value: "pending_payment", label: "En attente" },
  { value: "paid", label: "Payées" },
  { value: "canceled", label: "Annulées" },
];

const STATUS_COUNT_COLORS: Record<FactureStatus, string> = {
  pending_payment: "bg-amber-50 text-amber-700",
  paid: "bg-green-50 text-green-600",
  canceled: "bg-red-50 text-red-500",
};

function buildSuggestedNumero(factures: Facture[]): string {
  const currentYear = new Date().getFullYear();
  let highest = 0;

  for (const facture of factures) {
    const match = facture.numero.match(/^(\d{4})-(\d+)$/);
    if (!match) continue;
    const year = Number(match[1]);
    const sequence = Number(match[2]);
    if (year === currentYear && Number.isFinite(sequence)) {
      highest = Math.max(highest, sequence);
    }
  }

  return `${currentYear}-${String(highest + 1).padStart(4, "0")}`;
}

interface Props {
  slug: string;
  token: string;
  missions: Mission[];
  profile: FreelancerProfile;
}

export default function FacturesSection({
  slug,
  token,
  missions,
  profile,
}: Props) {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FactureStatus | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [reusing, setReusing] = useState<Facture | undefined>();
  const [editing, setEditing] = useState<Facture | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchFactures(slug, token)
      .then((all) => setFactures(all))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, token]);

  async function handleCreate(data: FacturePayload) {
    const created = await createFacture(slug, data, token);
    setFactures((previous) => [created, ...previous]);
  }

  async function handleUpdate(factureId: number, data: FacturePayload) {
    const updated = await updateFacture(slug, factureId, data, token);
    setFactures((previous) =>
      previous.map((facture) => (facture.id === factureId ? updated : facture)),
    );
  }

  async function handleDelete(factureId: number) {
    if (!window.confirm("Supprimer cette facture ?")) return;
    await deleteFacture(slug, factureId, token);
    setFactures((previous) =>
      previous.filter((facture) => facture.id !== factureId),
    );
  }

  async function handleMarkPaid(factureId: number) {
    const updated = await updateFacture(
      slug,
      factureId,
      { status: "paid" },
      token,
    );
    setFactures((previous) =>
      previous.map((facture) => (facture.id === factureId ? updated : facture)),
    );
  }

  const counts = factures.reduce<Record<string, number>>(
    (accumulator, facture) => {
      accumulator[facture.status] = (accumulator[facture.status] ?? 0) + 1;
      return accumulator;
    },
    {},
  );

  const shown = statusFilter
    ? factures.filter((facture) => facture.status === statusFilter)
    : factures;
  const suggestedNumero = buildSuggestedNumero(factures);

  return (
    <section className="rounded-eb-card border border-eb-layout bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
            Factures
          </p>
          <div className="flex gap-1.5">
            {(Object.keys(STATUS_COUNT_COLORS) as FactureStatus[])
              .filter((status) => counts[status])
              .map((status) => (
                <span
                  key={status}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COUNT_COLORS[status]}`}
                >
                  {counts[status]}
                </span>
              ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setReusing(undefined);
            setShowForm(true);
          }}
          className="eb-btn-primary px-3 py-1.5 text-[12px]"
        >
          + Nouvelle facture
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`eb-chip cursor-pointer transition-all ${
              statusFilter === value
                ? "bg-eb-primary text-white"
                : "hover:bg-[#e5e7eb]"
            }`}
          >
            {label}
            {value && counts[value] ? (
              <span className="ml-1 opacity-70">{counts[value]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-4 text-center text-[13px] text-eb-muted">
          Chargement...
        </p>
      ) : error ? (
        <p className="py-4 text-center text-[13px] text-eb-google">{error}</p>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-eb-muted">
          {statusFilter
            ? "Aucune facture dans ce statut."
            : "Aucune facture pour l'instant."}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((facture) => (
            <FactureCard
              key={facture.id}
              facture={facture}
              onClick={() => {
                setEditing(facture);
                setReusing(undefined);
                setShowForm(true);
              }}
              onReuse={() => {
                setEditing(null);
                setReusing(facture);
                setShowForm(true);
              }}
              onDelete={() => handleDelete(facture.id)}
              onDownload={() => downloadFacturePdf(facture, profile)}
              onMarkPaid={() => handleMarkPaid(facture.id)}
            />
          ))}
        </div>
      )}

      {showForm ? (
        <FactureForm
          initial={editing ?? undefined}
          reuse={reusing}
          previousFactures={factures}
          missions={missions}
          profile={profile}
          suggestedNumero={editing ? undefined : suggestedNumero}
          onSave={(data) =>
            editing ? handleUpdate(editing.id, data) : handleCreate(data)
          }
          onClose={() => {
            setShowForm(false);
            setEditing(null);
            setReusing(undefined);
          }}
        />
      ) : null}
    </section>
  );
}
