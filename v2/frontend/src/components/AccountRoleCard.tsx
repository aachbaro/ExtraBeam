import { useState } from "react";

import { updateProfile } from "../api";
import type { AccountRole, FreelancerProfile } from "../types";

const ROLE_CARDS: { value: Extract<AccountRole, "freelance" | "client">; label: string; description: string }[] = [
  {
    value: "freelance",
    label: "Compte freelance",
    description: "Profil public, disponibilités, missions et factures.",
  },
  {
    value: "client",
    label: "Compte restaurateur",
    description: "Restaurants, modèles de service, équipe et suivi des demandes.",
  },
];

interface Props {
  slug: string;
  role: AccountRole;
  token: string;
  onRoleChanged: (updated: FreelancerProfile) => void;
}

export default function AccountRoleCard({ slug, role, token, onRoleChanged }: Props) {
  const [savingRole, setSavingRole] = useState<Extract<AccountRole, "freelance" | "client"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRoleChange(nextRole: Extract<AccountRole, "freelance" | "client">) {
    if (nextRole === role || savingRole) {
      return;
    }

    setSavingRole(nextRole);
    setError(null);

    try {
      const updated = await updateProfile(slug, { role: nextRole }, token);
      onRoleChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de changer de role pour le moment.");
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <section className="rounded-eb-card border border-eb-layout bg-[#fffdf7] p-4">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
            Type de compte
          </p>
          <p className="mt-1 text-[13px] text-eb-secondary">
            Choisissez l’espace adapté à votre activité. Vous pourrez changer ce choix ultérieurement.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {ROLE_CARDS.map((card) => {
            const active = role === card.value;
            const loading = savingRole === card.value;

            return (
              <button
                key={card.value}
                type="button"
                disabled={Boolean(savingRole)}
                onClick={() => void handleRoleChange(card.value)}
                className={`rounded-eb border p-4 text-left transition-colors ${
                  active
                    ? "border-eb-primary bg-green-50"
                    : "border-eb-layout bg-[#fffdf7] hover:border-eb-primary"
                } ${savingRole ? "disabled:cursor-not-allowed disabled:opacity-70" : ""}`}
              >
                <p className={`text-[14px] font-semibold ${active ? "text-eb-primary" : "text-eb-text"}`}>
                  {card.label}
                </p>
                <p className="mt-2 text-[13px] leading-6 text-eb-secondary">
                  {card.description}
                </p>
                <p className="mt-3 text-[12px] font-medium text-eb-muted">
                  {active ? "Compte actuel" : loading ? "Changement..." : "Basculer sur ce mode"}
                </p>
              </button>
            );
          })}
        </div>

        {error ? <p className="text-[13px] text-eb-google">{error}</p> : null}
      </div>
    </section>
  );
}
