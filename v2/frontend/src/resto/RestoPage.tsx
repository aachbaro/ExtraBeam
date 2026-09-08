import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchRestaurant, fetchMembers, fetchShifts,
} from "../api";
import { useUserContext } from "../context/UserContext";
import type { Restaurant, RestaurantMember, RestaurantShift } from "../types";
import RestoShiftGrid from "./RestoShiftGrid";
import RestoTeamSection from "./RestoTeamSection";
import RestoShiftForm from "./RestoShiftForm";

type Tab = "planning" | "equipe";

function weekBounds(offset = 0): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(monday), to: fmt(sunday) };
}

export default function RestoPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useUserContext();
  const token = user?.token ?? null;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [members, setMembers] = useState<RestaurantMember[]>([]);
  const [shifts, setShifts] = useState<RestaurantShift[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [tab, setTab] = useState<Tab>("planning");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);

  const isManager = restaurant?.is_manager ?? false;
  const week = weekBounds(weekOffset);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    fetchRestaurant(slug, token)
      .then(setRestaurant)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [slug, token]);

  useEffect(() => {
    if (!slug) return;
    fetchMembers(slug, token).then(setMembers).catch(() => undefined);
  }, [slug, token]);

  useEffect(() => {
    if (!slug) return;
    fetchShifts(slug, token, week).then(setShifts).catch(() => undefined);
  }, [slug, token, week.from, week.to]);

  function handleShiftCreated(shift: RestaurantShift) {
    setShifts((prev) => [...prev, shift].sort((a, b) =>
      a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
    ));
    setShowShiftForm(false);
  }

  function handleShiftUpdated(shift: RestaurantShift) {
    setShifts((prev) => prev.map((s) => (s.id === shift.id ? shift : s)));
  }

  function handleShiftDeleted(shiftId: number) {
    setShifts((prev) => prev.filter((s) => s.id !== shiftId));
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-eb-page">
        <p className="text-eb-secondary text-sm">Chargement…</p>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-eb-page">
        <p className="text-red-500 text-sm">{error ?? "Restaurant introuvable."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-eb-page">
      {/* Header */}
      <header className="border-b border-eb-layout bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center gap-4">
          {restaurant.logo_url && (
            <img
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          )}
          <div>
            <h1 className="text-lg font-semibold text-eb-primary">{restaurant.name}</h1>
            {restaurant.city && (
              <p className="text-[12px] text-eb-secondary">{restaurant.city}</p>
            )}
          </div>
          {isManager && (
            <span className="ml-auto rounded-full bg-eb-primary/10 px-3 py-1 text-[11px] font-medium text-eb-primary">
              Manager
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-eb-layout bg-white">
        <div className="mx-auto max-w-5xl flex gap-0">
          {(["planning", "equipe"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-6 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-eb-primary text-eb-primary"
                  : "border-transparent text-eb-secondary hover:text-eb-primary"
              }`}
            >
              {t === "planning" ? "Planning" : "Équipe"}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === "planning" && (
          <>
            {/* Week nav */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  className="rounded-lg border border-eb-layout bg-white px-3 py-1.5 text-[13px] hover:bg-eb-page transition-colors"
                >
                  ← Préc.
                </button>
                <span className="text-[13px] font-medium text-eb-primary">
                  {week.from} → {week.to}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  className="rounded-lg border border-eb-layout bg-white px-3 py-1.5 text-[13px] hover:bg-eb-page transition-colors"
                >
                  Suiv. →
                </button>
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="text-[12px] text-eb-secondary hover:text-eb-primary underline"
                  >
                    Aujourd'hui
                  </button>
                )}
              </div>
              {isManager && (
                <button
                  type="button"
                  onClick={() => setShowShiftForm(true)}
                  className="rounded-lg bg-eb-primary px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
                >
                  + Nouveau shift
                </button>
              )}
            </div>

            <RestoShiftGrid
              shifts={shifts}
              members={members}
              week={week}
              isManager={isManager}
              myMemberId={restaurant.my_member_id ?? null}
              token={token}
              restaurantSlug={restaurant.slug}
              onShiftUpdated={handleShiftUpdated}
              onShiftDeleted={handleShiftDeleted}
            />
          </>
        )}

        {tab === "equipe" && (
          <RestoTeamSection
            restaurantSlug={restaurant.slug}
            members={members}
            isManager={isManager}
            token={token}
            onMembersChanged={setMembers}
          />
        )}
      </main>

      {/* New shift dialog */}
      {showShiftForm && isManager && (
        <RestoShiftForm
          restaurantSlug={restaurant.slug}
          token={token!}
          onCreated={handleShiftCreated}
          onClose={() => setShowShiftForm(false)}
        />
      )}
    </div>
  );
}
