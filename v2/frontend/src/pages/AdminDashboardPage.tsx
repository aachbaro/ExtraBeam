import { useDeferredValue, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { fetchAdminOverview } from "../api";
import AppShell, { type NavItem } from "../components/AppShell";
import { useUserContext } from "../context/UserContext";
import type { AccountRole, AdminAccountSummary, AdminOverviewResponse } from "../types";

const ADMIN_NAV: NavItem[] = [
  { id: "comptes", label: "Comptes" },
];

const roleLabels: Record<AccountRole, string> = {
  freelance: "Freelance",
  client: "Restaurateur",
  admin: "Admin",
};

const authProviderLabels: Record<string, string> = {
  local: "Local",
  google: "Google",
  pascuans: "Pascuans",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

function getRoleBadgeClass(role: AccountRole): string {
  if (role === "admin") return "bg-eb-text text-white";
  if (role === "client") return "bg-[#ECFDF3] text-[#166534]";
  return "bg-[#EFF6FF] text-[#1D4ED8]";
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <article className="rounded-eb-card border border-eb-layout bg-white p-5">
      <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">{label}</p>
      <p className={`mt-4 text-[28px] font-semibold ${tone}`}>{value}</p>
    </article>
  );
}

function AccountCard({ account }: { account: AdminAccountSummary }) {
  const avatarLabel = (account.display_name || account.email || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <article className="rounded-eb-card border border-eb-layout bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-eb-primary/10">
            {account.avatar_url ? (
              <img
                src={account.avatar_url}
                alt={account.display_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[18px] font-semibold text-eb-primary">{avatarLabel}</span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[18px] font-semibold text-eb-text">
                {account.display_name || "Compte sans nom"}
              </h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClass(account.role)}`}>
                {roleLabels[account.role]}
              </span>
            </div>
            <p className="mt-1 truncate text-[14px] text-eb-secondary">{account.email}</p>
            <p className="mt-2 text-[13px] text-eb-muted">
              {authProviderLabels[account.auth_provider] ?? account.auth_provider}
              {account.slug ? ` · /extras/${account.slug}` : ""}
            </p>
          </div>
        </div>

        <Link
          to={`/admin/accounts/${account.id}`}
          className="eb-btn-primary shrink-0"
        >
          Ouvrir
        </Link>
      </div>

      {(account.job_title || account.location) && (
        <p className="mt-4 text-[14px] leading-6 text-eb-secondary">
          {[account.job_title, account.location].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-eb border border-eb-layout bg-eb-page px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Skills</p>
          <p className="mt-1 text-[18px] font-semibold text-eb-text">{account.skill_count}</p>
        </div>
        <div className="rounded-eb border border-eb-layout bg-eb-page px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Missions</p>
          <p className="mt-1 text-[18px] font-semibold text-eb-text">{account.mission_count}</p>
        </div>
        <div className="rounded-eb border border-eb-layout bg-eb-page px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Slots</p>
          <p className="mt-1 text-[18px] font-semibold text-eb-text">{account.slot_count}</p>
        </div>
        <div className="rounded-eb border border-eb-layout bg-eb-page px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">Indispos</p>
          <p className="mt-1 text-[18px] font-semibold text-eb-text">{account.unavailability_count}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-eb-muted">
        <span>Créé le {formatDate(account.created_at)}</span>
        {account.slug && account.role !== "client" ? (
          <Link to={`/extras/${account.slug}`} className="font-medium text-eb-primary">
            Voir la page publique
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export default function AdminDashboardPage() {
  const { user } = useUserContext();
  const [query, setQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<AccountRole | "">("");
  const deferredQuery = useDeferredValue(query.trim());
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.token || user.role !== "admin") return;

    setLoading(true);
    setError(null);

    fetchAdminOverview(user.token, {
      q: deferredQuery || undefined,
      role: selectedRole || undefined,
    })
      .then(setOverview)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deferredQuery, selectedRole, user?.role, user?.token]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/profile" replace />;
  }

  const summary = overview?.summary;

  return (
    <AppShell
      title="Admin"
      subtitle="Pilotage Rivebelle"
      nav={ADMIN_NAV}
      activeTab="comptes"
      onTabChange={() => { /* single tab */ }}
    >
      <div className="space-y-4 max-w-[1200px]">
        <section className="rounded-eb-card border border-eb-layout bg-white p-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
            Espace admin
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold text-eb-text">Pilotage Rivebelle</h1>
              <p className="mt-3 max-w-3xl text-[14px] leading-6 text-eb-secondary">
                Vue globale des comptes, des missions et de l&apos;activité produit avec un accès rapide
                aux fiches détaillées de chaque profil.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-eb-muted">Recherche</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nom, email, slug, localisation..."
                  className="eb-input min-w-[240px]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-eb-muted">Role</span>
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value as AccountRole | "")}
                  className="eb-input min-w-[180px]"
                >
                  <option value="">Tous les comptes</option>
                  <option value="freelance">Freelances</option>
                  <option value="client">Restaurateurs</option>
                  <option value="admin">Admins</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        {summary ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Comptes" value={summary.total_accounts} tone="text-eb-text" />
            <StatCard label="Freelances" value={summary.freelance_accounts} tone="text-eb-primary" />
            <StatCard label="Restaurateurs" value={summary.client_accounts} tone="text-eb-success" />
            <StatCard label="Admins" value={summary.admin_accounts} tone="text-eb-text" />
            <StatCard label="Skills" value={summary.total_skills} tone="text-eb-text" />
            <StatCard label="Missions" value={summary.total_missions} tone="text-eb-text" />
            <StatCard label="Slots" value={summary.total_slots} tone="text-eb-text" />
            <StatCard label="Indispos" value={summary.total_unavailabilities} tone="text-eb-text" />
          </section>
        ) : null}

        <section className="rounded-eb-card border border-eb-layout bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
                Comptes
              </p>
              <h2 className="mt-2 text-[22px] font-semibold text-eb-text">
                {overview ? `${overview.accounts.length} résultat${overview.accounts.length > 1 ? "s" : ""}` : "Chargement"}
              </h2>
            </div>
            {(query || selectedRole) && (
              <button
                type="button"
                className="eb-btn-ghost"
                onClick={() => {
                  setQuery("");
                  setSelectedRole("");
                }}
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>

          {loading ? (
            <p className="mt-6 text-[14px] text-eb-secondary">Chargement des données admin…</p>
          ) : error ? (
            <p className="mt-6 text-[14px] text-eb-google">{error}</p>
          ) : overview && overview.accounts.length > 0 ? (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {overview.accounts.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          ) : (
            <p className="mt-6 text-[14px] leading-6 text-eb-secondary">
              Aucun compte ne correspond aux filtres courants.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
