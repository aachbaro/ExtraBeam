import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMyRestaurants, createRestaurant } from "../api";
import { useUserContext } from "../context/UserContext";
import type { Restaurant } from "../types";

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

  return (
    <div className="min-h-screen bg-eb-page">
      <header className="border-b border-eb-layout bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <h1 className="text-lg font-semibold text-eb-primary">Mes restaurants</h1>
          <button
            type="button"
            onClick={() => setShowCreate((o) => !o)}
            className="rounded-lg bg-eb-primary px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
          >
            {showCreate ? "Annuler" : "+ Nouveau"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        {showCreate && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="rounded-eb-card border border-eb-layout bg-white p-5 space-y-3"
          >
            <h2 className="text-[13px] font-medium text-eb-primary">Créer un restaurant</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-eb-secondary mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setF("name", e.target.value)}
                  className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
                />
              </div>
              <div>
                <label className="block text-[12px] text-eb-secondary mb-1">Slug (URL) *</label>
                <input
                  type="text"
                  required
                  value={createForm.slug}
                  onChange={(e) => setF("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  placeholder="mon-restaurant"
                  className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-eb-secondary mb-1">Ville</label>
                <input
                  type="text"
                  value={createForm.city}
                  onChange={(e) => setF("city", e.target.value)}
                  className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
                />
              </div>
              <div>
                <label className="block text-[12px] text-eb-secondary mb-1">Type de cuisine</label>
                <input
                  type="text"
                  value={createForm.cuisine_type}
                  onChange={(e) => setF("cuisine_type", e.target.value)}
                  placeholder="Français, Italien…"
                  className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
                />
              </div>
            </div>
            {error && <p className="text-[12px] text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-lg border border-eb-layout py-2 text-sm text-eb-secondary hover:bg-eb-page transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-eb-primary py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {busy ? "Création…" : "Créer"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-center text-sm text-eb-secondary">Chargement…</p>
        ) : restaurants.length === 0 ? (
          <div className="rounded-eb-card border border-eb-layout bg-white p-8 text-center">
            <p className="text-eb-secondary text-sm">Vous n'avez pas encore de restaurant.</p>
            <p className="mt-1 text-[12px] text-eb-secondary">Cliquez sur "+ Nouveau" pour en créer un.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {restaurants.map((r) => (
              <Link
                key={r.id}
                to={`/resto/${r.slug}`}
                className="block rounded-eb-card border border-eb-layout bg-white p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-3">
                  {r.logo_url ? (
                    <img src={r.logo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-eb-layout flex items-center justify-center text-lg">
                      🍽
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-eb-primary">{r.name}</p>
                    <p className="text-[12px] text-eb-secondary">
                      {r.city}{r.city && r.cuisine_type ? " · " : ""}{r.cuisine_type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] text-eb-secondary">{r.member_count} membre{r.member_count !== 1 ? "s" : ""}</p>
                    {r.is_owner && (
                      <span className="text-[10px] text-eb-primary font-medium">Propriétaire</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
