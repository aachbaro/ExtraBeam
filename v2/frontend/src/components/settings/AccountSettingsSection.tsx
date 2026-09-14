import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { deleteAccount } from "../../api";
import { useUserContext } from "../../context/UserContext";
import type { FreelancerProfile } from "../../types";

interface Props {
  profile: FreelancerProfile;
  token: string;
  authProvider?: string | null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatStatus(status: string): string {
  switch (status) {
    case "active":
      return "Actif";
    case "trialing":
      return "Essai en cours";
    case "past_due":
      return "Paiement en retard";
    case "canceled":
      return "Résilié";
    case "incomplete":
      return "Incomplet";
    default:
      return "Aucun abonnement";
  }
}

function formatProvider(value?: string | null): string {
  switch (value) {
    case "pascuans":
      return "Compte pascuans";
    case "google":
      return "Google";
    case "local":
      return "Compte local";
    default:
      return "Inconnu";
  }
}

function getFutureSubscriptionMessage(profile: FreelancerProfile): string {
  if (!profile.subscription_status) {
    return "Aucun abonnement Rivebelle n'est configuré pour ce compte aujourd'hui.";
  }

  if (profile.subscription_cancel_at_period_end && profile.subscription_period_end) {
    return `Résiliation programmée le ${formatDateTime(profile.subscription_period_end)}.`;
  }

  if (
    ["active", "trialing"].includes(profile.subscription_status) &&
    profile.subscription_period_end
  ) {
    return `Renouvellement prévu le ${formatDateTime(profile.subscription_period_end)}.`;
  }

  if (profile.subscription_status === "canceled") {
    return "Aucun renouvellement n'est prévu : l'abonnement est déjà résilié.";
  }

  return "Aucun changement d'abonnement n'est programmé pour le moment.";
}

export default function AccountSettingsSection({ profile, token, authProvider }: Props) {
  const navigate = useNavigate();
  const { clearUser } = useUserContext();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmation.trim().toUpperCase() !== "SUPPRIMER") {
      setError("Tape SUPPRIMER pour confirmer la suppression du compte.");
      return;
    }
    if (!window.confirm("Supprimer définitivement ce compte Rivebelle ?")) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(profile.slug, confirmation.trim(), token);
      clearUser();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de supprimer le compte.");
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-eb-card border border-eb-layout bg-white p-4">
      <div className="mb-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
          Paramètres
        </p>
        <p className="mt-1 text-[13px] text-eb-secondary">
          Gère ton compte Rivebelle, le statut de ton abonnement et les actions sensibles.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
          <p className="text-[14px] font-semibold text-eb-text">Compte</p>
          <div className="mt-3 space-y-2 text-[13px] text-eb-secondary">
            <p>Email: {profile.email}</p>
            <p>Type de compte: {profile.role}</p>
            <p>Connexion: {formatProvider(authProvider)}</p>
          </div>
        </section>

        <section className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
          <p className="text-[14px] font-semibold text-eb-text">Abonnement</p>
          <div className="mt-3 space-y-2 text-[13px] text-eb-secondary">
            <p>Statut actuel: {formatStatus(profile.subscription_status)}</p>
            <p>Formule: {profile.subscription_plan || "Aucune"}</p>
            <p>Fin de période: {formatDateTime(profile.subscription_period_end)}</p>
            <p>{getFutureSubscriptionMessage(profile)}</p>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-eb border border-red-200 bg-red-50 p-4">
        <p className="text-[14px] font-semibold text-red-800">Zone sensible</p>
        <p className="mt-2 text-[13px] leading-6 text-red-900/85">
          La suppression efface ce compte Rivebelle, son profil, ses créneaux, missions,
          factures et données liées. Le compte pascuans central n&apos;est pas supprimé ici.
        </p>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            className="eb-input flex-1 border-red-200 bg-white"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="Tape SUPPRIMER pour confirmer"
          />
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="eb-focus-ring inline-flex min-h-[42px] items-center justify-center rounded-eb bg-red-600 px-4 text-[14px] font-medium text-white disabled:opacity-60"
          >
            {deleting ? "Suppression..." : "Supprimer le compte"}
          </button>
        </div>

        {error ? <p className="mt-3 text-[13px] text-red-700">{error}</p> : null}
      </section>
    </section>
  );
}
