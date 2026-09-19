import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { fetchAdminAccountDetail } from "../api";
import Topbar from "../components/Topbar";
import { useUserContext } from "../context/UserContext";
import { localIsoToDate, localIsoToTime } from "../lib/slotDateTime";
import type { AdminAccountDetailResponse, Mission, Slot, Unavailability } from "../types";

const roleLabels = {
  freelance: "Freelance",
  client: "Restaurateur",
  admin: "Admin",
} as const;

const authProviderLabels: Record<string, string> = {
  local: "Local",
  google: "Google",
  pascuans: "Pascuans",
};

const missionStatusLabels: Record<Mission["status"], string> = {
  proposée: "Proposée",
  en_cours: "En cours",
  terminée: "Terminée",
  refusée: "Refusée",
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

function formatSlot(slot: Slot): string {
  return `${formatDate(localIsoToDate(slot.start))} · ${localIsoToTime(slot.start)}-${localIsoToTime(slot.end)}`;
}

function formatUnavailabilityLabel(item: Unavailability): string {
  if (item.recurrence_type === "weekly") {
    const weekdays = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    return `Chaque ${weekdays[item.weekday ?? 0] || "jour"} · ${item.start_time.slice(0, 5)}-${item.end_time.slice(0, 5)}`;
  }
  return `${formatDate(item.start_date)} · ${item.start_time.slice(0, 5)}-${item.end_time.slice(0, 5)}`;
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">{label}</p>
      <p className="mt-2 text-[22px] font-semibold text-eb-text">{value}</p>
    </div>
  );
}

export default function AdminAccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { user } = useUserContext();
  const [payload, setPayload] = useState<AdminAccountDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.token || user.role !== "admin" || !accountId) return;

    setLoading(true);
    setError(null);

    fetchAdminAccountDetail(accountId, user.token)
      .then(setPayload)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accountId, user?.role, user?.token]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/profile" replace />;
  }

  if (!accountId) {
    return <Navigate to="/admin" replace />;
  }

  const account = payload?.account;
  const stats = payload?.stats;
  const avatarLabel = (account?.display_name || account?.email || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <main className="min-h-screen bg-eb-page">
      <div className="mx-auto max-w-[1280px] px-4 py-6 space-y-4">
        <Topbar currentSlug={account?.slug ?? undefined} />

        <section className="rounded-eb-card border border-eb-layout bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link to="/admin" className="text-[13px] font-medium text-eb-primary">
                ← Retour au dashboard admin
              </Link>
              <h1 className="mt-3 text-[30px] font-semibold text-eb-text">
                {account ? account.display_name || account.email : "Fiche compte"}
              </h1>
              <p className="mt-3 max-w-3xl text-[14px] leading-6 text-eb-secondary">
                Vue complète du compte avec identité, auth, missions, agenda et indisponibilités.
              </p>
            </div>

            {account?.slug && account.role !== "client" ? (
              <Link to={`/extras/${account.slug}`} className="eb-btn-primary">
                Ouvrir le profil public
              </Link>
            ) : null}
          </div>
        </section>

        {loading ? (
          <section className="rounded-eb-card border border-eb-layout bg-white p-6">
            <p className="text-[14px] text-eb-secondary">Chargement du compte…</p>
          </section>
        ) : error ? (
          <section className="rounded-eb-card border border-eb-layout bg-white p-6">
            <p className="text-[14px] text-eb-google">{error}</p>
          </section>
        ) : account && payload && stats ? (
          <>
            <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <article className="rounded-eb-card border border-eb-layout bg-white p-6">
                <div className="flex items-start gap-5">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-eb-primary/10">
                    {account.avatar_url ? (
                      <img
                        src={account.avatar_url}
                        alt={account.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[28px] font-semibold text-eb-primary">{avatarLabel}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[24px] font-semibold text-eb-text">
                        {account.display_name || "Compte sans nom"}
                      </h2>
                      <span className="rounded-full bg-eb-text px-2.5 py-1 text-[11px] font-medium text-white">
                        {roleLabels[account.role]}
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] text-eb-secondary">{account.email}</p>
                    <p className="mt-2 text-[14px] text-eb-muted">
                      {authProviderLabels[account.auth_provider] ?? account.auth_provider}
                      {account.slug ? ` · /extras/${account.slug}` : ""}
                    </p>

                    {(account.job_title || account.location) && (
                      <p className="mt-4 text-[14px] leading-6 text-eb-secondary">
                        {[account.job_title, account.location].filter(Boolean).join(" · ")}
                      </p>
                    )}

                    {account.bio && (
                      <p className="mt-4 whitespace-pre-line text-[14px] leading-6 text-eb-text">
                        {account.bio}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Téléphone</p>
                    <p className="mt-2 text-[14px] text-eb-text">{account.phone || "—"}</p>
                  </div>
                  <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Création</p>
                    <p className="mt-2 text-[14px] text-eb-text">{formatDateTime(account.created_at)}</p>
                  </div>
                  <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Dernière mise à jour</p>
                    <p className="mt-2 text-[14px] text-eb-text">{formatDateTime(account.updated_at)}</p>
                  </div>
                  <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Join key OIDC</p>
                    <p className="mt-2 break-all text-[14px] text-eb-text">{account.oidc_sub || "—"}</p>
                  </div>
                  <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3 md:col-span-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Google sub</p>
                    <p className="mt-2 break-all text-[14px] text-eb-text">{account.google_sub || "—"}</p>
                  </div>
                </div>
              </article>

              <aside className="rounded-eb-card border border-eb-layout bg-white p-6">
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
                  Volumétrie
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <StatBlock label="Skills" value={stats.skill_count} />
                  <StatBlock label="Missions" value={stats.mission_count} />
                  <StatBlock label="Slots" value={stats.slot_count} />
                  <StatBlock label="Indispos" value={stats.unavailability_count} />
                </div>
              </aside>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-eb-card border border-eb-layout bg-white p-6">
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
                  Skills
                </p>
                {payload.skills.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {payload.skills.map((skill) => (
                      <span key={skill.id} className="eb-chip">
                        {skill.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-[14px] text-eb-secondary">Aucune compétence enregistrée.</p>
                )}
              </article>

              <article className="rounded-eb-card border border-eb-layout bg-white p-6">
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
                  Indisponibilités
                </p>
                {payload.unavailabilities.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {payload.unavailabilities.map((item) => (
                      <div key={item.id} className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                        <p className="text-[14px] font-medium text-eb-text">
                          {formatUnavailabilityLabel(item)}
                        </p>
                        <p className="mt-1 text-[13px] text-eb-muted">
                          {item.exceptions.length > 0
                            ? `${item.exceptions.length} exception${item.exceptions.length > 1 ? "s" : ""}`
                            : "Aucune exception"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-[14px] text-eb-secondary">Aucune indisponibilité enregistrée.</p>
                )}
              </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-eb-card border border-eb-layout bg-white p-6">
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
                  Missions
                </p>
                {payload.missions.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {payload.missions.map((mission) => (
                      <div key={mission.id} className="rounded-eb border border-eb-layout bg-eb-page px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-[16px] font-semibold text-eb-text">{mission.title}</h3>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-eb-text border border-eb-layout">
                            {missionStatusLabels[mission.status]}
                          </span>
                        </div>
                        {(mission.client_name || mission.client_company) && (
                          <p className="mt-2 text-[14px] text-eb-secondary">
                            {[mission.client_name, mission.client_company].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {(mission.start_date || mission.end_date) && (
                          <p className="mt-2 text-[13px] text-eb-muted">
                            {formatDate(mission.start_date)} → {formatDate(mission.end_date)}
                          </p>
                        )}
                        {mission.description && (
                          <p className="mt-3 text-[14px] leading-6 text-eb-text">{mission.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-[14px] text-eb-secondary">Aucune mission enregistrée.</p>
                )}
              </article>

              <article className="rounded-eb-card border border-eb-layout bg-white p-6">
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
                  Slots
                </p>
                {payload.slots.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {payload.slots.map((slot) => (
                      <div key={slot.id} className="rounded-eb border border-eb-layout bg-eb-page px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-[15px] font-semibold text-eb-text">
                            {slot.title || "Créneau sans titre"}
                          </h3>
                          {slot.mission_title ? (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-eb-text border border-eb-layout">
                              {slot.mission_title}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[14px] text-eb-secondary">{formatSlot(slot)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-[14px] text-eb-secondary">Aucun créneau enregistré.</p>
                )}
              </article>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
