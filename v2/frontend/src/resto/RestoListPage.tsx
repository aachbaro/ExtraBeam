import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createRestaurant, fetchMyRestaurants } from "../api";
import AppShell, { type NavItem } from "../components/AppShell";
import { useUserContext } from "../context/UserContext";
import type { Restaurant } from "../types";

const BASE_NAV: NavItem[] = [
  { id: "restaurants", label: "Restaurants" },
];

export default function RestoListPage() {
  const { user } = useUserContext();
  const token = user?.token ?? null;

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ slug: "", name: "", city: "", cuisine_type: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetchMyRestaurants(token)
      .then(setRestaurants)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [token]);

  function setF(field: string, value: string) {
    setCreateForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await createRestaurant({
        slug: createForm.slug.trim(),
        name: createForm.name.trim(),
        city: createForm.city.trim(),
        cuisine_type: createForm.cuisine_type.trim(),
      }, token);
      setRestaurants((prev) => [...prev, r]);
      setShowCreate(false);
      setCreateForm({ slug: "", name: "", city: "", cuisine_type: "" });
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-eb-page">
        <p className="text-eb-secondary text-sm">Connectez-vous pour accéder à vos restaurants.</p>
      </div>
    );
  }

  const nav: NavItem[] = [
    ...BASE_NAV,
    ...(user?.slug
      ? [{ id: "profil-extra", label: "Mon profil", href: `/extras/${user.slug}`, sectionLabel: "Compte" }]
      : []),
  ];

  return (
    <AppShell
      title="Restaurants"
      subtitle="Mes établissements"
      nav={nav}
      activeTab="restaurants"
      onTabChange={() => { /* single tab */ }}
    >
      <div className="space-y-4 max-w-[860px]">
        {/* Header de section */}
        <section className="rounded-eb-card border border-eb-layout bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">Espace restaurant</p>
              <h1 className="mt-2 text-[26px] font-semibold text-eb-text">Mes restaurants</h1>
              <p className="mt-2 text-[14px] leading-6 text-eb-secondary">
                Gérez le planning, les disponibilités et l'équipe de chaque établissement.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate((o) => !o)}
              className="shrink-0 rounded-eb bg-eb-primary px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
            >
              {showCreate ? "Annuler" : "+ Nouveau"}
            </button>
          </div>
        </section>

        {/* Formulaire de création */}
        {showCreate && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="rounded-eb-card border border-eb-layout bg-white p-6 space-y-4"
          >
            <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">Créer un restaurant</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-eb-secondary">Nom *</span>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setF("name", e.target.value)}
                  className="eb-input w-full"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-eb-secondary">Slug (URL) *</span>
                <input
                  type="text"
                  required
                  value={createForm.slug}
                  onChange={(e) => setF("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  placeholder="mon-restaurant"
                  className="eb-input w-full"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-eb-secondary">Ville</span>
                <input
                  type="text"
                  value={createForm.city}
                  onChange={(e) => setF("city", e.target.value)}
                  className="eb-input w-full"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] font-medium text-eb-secondary">Type de cuisine</span>
                <input
                  type="text"
                  value={createForm.cuisine_type}
                  onChange={(e) => setF("cuisine_type", e.target.value)}
                  placeholder="Français, Italien…"
                  className="eb-input w-full"
                />
              </label>
            </div>
            {error && <p className="text-[12px] text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-eb border border-eb-layout py-2 text-[13px] font-medium text-eb-secondary hover:bg-eb-page transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-eb bg-eb-primary py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {busy ? "Création…" : "Créer le restaurant"}
              </button>
            </div>
          </form>
        )}

        {/* Liste */}
        {loading ? (
          <p className="py-8 text-center text-[14px] text-eb-secondary">Chargement…</p>
        ) : restaurants.length === 0 ? (
          <section className="rounded-eb-card border border-eb-layout bg-white p-10 text-center">
            <p className="text-[15px] font-medium text-eb-text">Aucun restaurant pour le moment</p>
            <p className="mt-2 text-[13px] text-eb-secondary">Cliquez sur "+ Nouveau" pour créer votre premier établissement.</p>
          </section>
        ) : (
          <section className="rounded-eb-card border border-eb-layout bg-white overflow-hidden">
            <div className="divide-y divide-eb-layout">
              {restaurants.map((r) => (
                <Link
                  key={r.id}
                  to={`/resto/${r.slug}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-eb-page transition-colors"
                >
                  {r.logo_url ? (
                    <img src={r.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl">
                      🍽
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-eb-text">{r.name}</p>
                    <p className="mt-0.5 text-[12px] text-eb-muted">
                      {[r.city, r.cuisine_type].filter(Boolean).join(" · ") || "Aucune ville renseignée"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-medium text-eb-text">
                      {r.member_count} membre{r.member_count !== 1 ? "s" : ""}
                    </p>
                    {r.is_owner && (
                      <span className="text-[11px] font-medium text-eb-primary">Propriétaire</span>
                    )}
                    {!r.is_owner && r.is_manager && (
                      <span className="text-[11px] font-medium text-eb-secondary">Responsable</span>
                    )}
                  </div>
                  <span className="shrink-0 text-[12px] text-eb-muted">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
