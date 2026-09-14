import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import {
  fetchClientDashboard,
  getDefaultAppPath,
} from "../api";
import AccountRoleCard from "../components/AccountRoleCard";
import ClientContactsSection from "../components/client/ClientContactsSection";
import ClientTemplatesSection from "../components/client/ClientTemplatesSection";
import AccountSettingsSection from "../components/settings/AccountSettingsSection";
import Topbar from "../components/Topbar";
import { useUserContext } from "../context/UserContext";
import type { ClientDashboardResponse, Facture, FreelancerProfile, Mission } from "../types";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatAmount(value: string | null): string {
  if (!value) return "";
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return value;
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function MissionList({ missions }: { missions: Mission[] }) {
  return (
    <section className="rounded-eb-card border border-eb-layout bg-white p-4">
      <div className="mb-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
          Missions
        </p>
        <p className="mt-1 text-[13px] text-eb-secondary">
          Missions associees a ton email client dans Rivebelle.
        </p>
      </div>

      {missions.length > 0 ? (
        <div className="space-y-3">
          {missions.map((mission) => (
            <article key={mission.id} className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-eb-text">{mission.title}</h3>
                    {mission.profile_slug ? (
                      <Link
                        to={`/extras/${mission.profile_slug}`}
                        className="text-[12px] font-medium text-eb-primary hover:underline"
                      >
                        {mission.profile_display_name}
                      </Link>
                    ) : (
                      <span className="text-[12px] font-medium text-eb-muted">
                        {mission.profile_display_name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] uppercase tracking-[0.08em] text-eb-muted">
                    {mission.status} · {formatDate(mission.start_date)} → {formatDate(mission.end_date)}
                  </p>
                </div>
                {mission.total_amount ? (
                  <span className="text-[13px] font-semibold text-eb-text">
                    {formatAmount(mission.total_amount)}
                  </span>
                ) : null}
              </div>

              {(mission.establishment || mission.client_name || mission.client_company) ? (
                <p className="mt-2 text-[13px] text-eb-secondary">
                  {[mission.establishment, mission.client_name, mission.client_company]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}

              {mission.slots.length > 0 ? (
                <p className="mt-2 text-[12px] text-eb-muted">
                  {mission.slots.length} créneau{mission.slots.length > 1 ? "x" : ""} lié
                  {mission.slots.length > 1 ? "s" : ""}
                </p>
              ) : null}

              {mission.description ? (
                <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-eb-text">
                  {mission.description}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-[13px] text-eb-muted">
          Aucune mission liee a ce compte pour le moment.
        </p>
      )}
    </section>
  );
}

function FactureList({ factures }: { factures: Facture[] }) {
  return (
    <section className="rounded-eb-card border border-eb-layout bg-white p-4">
      <div className="mb-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
          Factures recues
        </p>
        <p className="mt-1 text-[13px] text-eb-secondary">
          Lecture seule des factures ou ton email apparait comme contact client.
        </p>
      </div>

      {factures.length > 0 ? (
        <div className="space-y-3">
          {factures.map((facture) => (
            <article key={facture.id} className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-eb-text">{facture.numero}</h3>
                    {facture.profile_slug ? (
                      <Link
                        to={`/extras/${facture.profile_slug}`}
                        className="text-[12px] font-medium text-eb-primary hover:underline"
                      >
                        {facture.profile_display_name}
                      </Link>
                    ) : (
                      <span className="text-[12px] font-medium text-eb-muted">
                        {facture.profile_display_name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] uppercase tracking-[0.08em] text-eb-muted">
                    {formatDate(facture.date_emission)} · {facture.status}
                  </p>
                </div>
                <span className="text-[13px] font-semibold text-eb-text">
                  {formatAmount(facture.montant_ttc)}
                </span>
              </div>

              <p className="mt-2 text-[13px] text-eb-secondary">
                {facture.client_name}
                {facture.mission_title ? ` · ${facture.mission_title}` : ""}
              </p>

              {facture.description ? (
                <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-eb-text">
                  {facture.description}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-[13px] text-eb-muted">
          Aucune facture retrouvee pour ce compte.
        </p>
      )}
    </section>
  );
}

function ClientIdentityCard({ profile }: { profile: FreelancerProfile }) {
  return (
    <section className="rounded-eb-card border border-eb-layout bg-white p-4">
      <div className="mb-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
          Mes informations
        </p>
        <p className="mt-1 text-[13px] text-eb-secondary">
          Resume du compte client actuellement connecte.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-eb border border-eb-layout bg-[#FBFDFF] px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.08em] text-eb-muted">Email</p>
          <p className="mt-1 text-[14px] font-medium text-eb-text">{profile.email}</p>
        </div>
        <div className="rounded-eb border border-eb-layout bg-[#FBFDFF] px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.08em] text-eb-muted">Role</p>
          <p className="mt-1 text-[14px] font-medium capitalize text-eb-text">{profile.role}</p>
        </div>
      </div>
    </section>
  );
}

function ClientAgendaPlaceholder() {
  return (
    <section className="rounded-eb-card border border-eb-layout bg-white p-4">
      <div className="mb-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
          Agenda
        </p>
        <p className="mt-1 text-[13px] text-eb-secondary">
          Placeholder conserve pour rester aligne avec la v1.
        </p>
      </div>

      <div className="rounded-eb border border-dashed border-eb-layout bg-[#FBFDFF] px-4 py-6 text-center">
        <p className="text-[14px] font-medium text-eb-text">Agenda client en cours de finition</p>
        <p className="mt-2 text-[13px] leading-6 text-eb-secondary">
          Les missions et factures sont deja visibles ici. L'affichage agenda dedie pourra se
          brancher ensuite sans changer la structure de la page.
        </p>
      </div>
    </section>
  );
}

export default function ClientDashboardPage() {
  const navigate = useNavigate();
  const { user, setUser } = useUserContext();
  const [dashboard, setDashboard] = useState<ClientDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.token || user.role !== "client") {
      return;
    }

    setLoading(true);
    setError(null);

    fetchClientDashboard(user.token)
      .then((data) => {
        setDashboard(data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user?.role, user?.token]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "client") {
    return <Navigate to="/profile" replace />;
  }

  function handleRoleChanged(updated: FreelancerProfile) {
    if (!user) {
      return;
    }

    const nextUser = {
      ...user,
      slug: updated.slug,
      display_name: updated.display_name,
      avatar_url: updated.avatar_url,
      role: updated.role,
    };
    setUser(nextUser);
    setDashboard((previous) => (previous ? { ...previous, profile: updated } : previous));
    navigate(getDefaultAppPath(nextUser), { replace: true });
  }

  return (
    <main className="min-h-screen bg-eb-page">
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-6">
        <Topbar />

        {loading ? (
          <section className="rounded-eb-card border border-eb-layout bg-white p-6">
            <p className="text-[14px] text-eb-secondary">Chargement de l'espace client...</p>
          </section>
        ) : error || !dashboard ? (
          <section className="rounded-eb-card border border-eb-layout bg-white p-6">
            <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
              Espace client
            </p>
            <h1 className="mt-3 text-[28px] font-semibold text-eb-text">
              Bonjour {user.display_name}
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-eb-google">
              {error ?? "Impossible de charger le compte client pour le moment."}
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-eb-card border border-eb-layout bg-white p-6">
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
                Espace client
              </p>
              <h1 className="mt-3 text-[28px] font-semibold text-eb-text">
                Bonjour {dashboard.profile.display_name}
              </h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-6 text-eb-secondary">
                Tu retrouves ici tes contacts freelance, tes modeles de mission et le suivi lecture seule des missions et factures deja rattachees a ton email.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-eb-muted">Contacts</p>
                  <p className="mt-1 text-[20px] font-semibold text-eb-text">{dashboard.contacts.length}</p>
                </div>
                <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-eb-muted">Modeles</p>
                  <p className="mt-1 text-[20px] font-semibold text-eb-text">{dashboard.templates.length}</p>
                </div>
                <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-eb-muted">Missions</p>
                  <p className="mt-1 text-[20px] font-semibold text-eb-text">{dashboard.missions.length}</p>
                </div>
                <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-eb-muted">Factures</p>
                  <p className="mt-1 text-[20px] font-semibold text-eb-text">{dashboard.factures.length}</p>
                </div>
              </div>
            </section>

            {dashboard.profile.slug ? (
              <AccountRoleCard
                slug={dashboard.profile.slug}
                role={dashboard.profile.role}
                token={user.token ?? ""}
                onRoleChanged={handleRoleChanged}
              />
            ) : null}

            <ClientIdentityCard profile={dashboard.profile} />

            <div className="grid gap-4 xl:grid-cols-2">
              <ClientTemplatesSection
                token={user.token ?? ""}
                initialTemplates={dashboard.templates}
              />
              <ClientContactsSection
                token={user.token ?? ""}
                initialContacts={dashboard.contacts}
              />
            </div>

            <MissionList missions={dashboard.missions} />
            <FactureList factures={dashboard.factures} />
            <ClientAgendaPlaceholder />

            <AccountSettingsSection
              profile={dashboard.profile}
              token={user.token ?? ""}
              authProvider={user.auth_provider}
            />
          </>
        )}
      </div>
    </main>
  );
}
