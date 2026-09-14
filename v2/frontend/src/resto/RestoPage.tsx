import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchRestaurant, fetchMembers } from "../api";
import { useUserContext } from "../context/UserContext";
import type { Restaurant, RestaurantMember } from "../types";
import RestoTeamSection from "./RestoTeamSection";
import MemberPlanningEditor from "./MemberPlanningEditor";
import ServicePlanner from "./ServicePlanner";
import EmployeeAccessSettings from "./EmployeeAccessSettings";
import MyAvailabilityBoard from "./MyAvailabilityBoard";
import { Link } from "react-router-dom";

export default function RestoPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useUserContext();
  const token = user?.token ?? null;
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [members, setMembers] = useState<RestaurantMember[]>([]);
  const [tab, setTab] = useState<"planning" | "equipe" | "mes-dispos">("planning");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([fetchRestaurant(slug, token), fetchMembers(slug, token)])
      .then(([r, m]) => {
        if (alive) {
          setRestaurant(r);
          setMembers(m);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, token]);
  if (!token)
    return (
      <main className="p-8 space-y-4">
        <h1 className="text-xl">Accès au restaurant</h1>
        <Link className="block underline" to={`/resto/${slug}/acces`}>
          Connexion employé par PIN
        </Link>
        <Link className="block underline" to="/login">
          Connexion responsable Rivebelle
        </Link>
      </main>
    );
  if (loading) return <p className="p-8">Chargement…</p>;
  if (error || !restaurant)
    return (
      <p role="alert" className="p-8 text-red-700">
        {error || "Restaurant introuvable."}
      </p>
    );
  const manager = !!restaurant.is_manager;

  const navItems = [
    { id: "planning" as const, label: "Planning" },
    { id: "mes-dispos" as const, label: "Mes disponibilités" },
    { id: "equipe" as const, label: "Équipe" },
  ];

  const NavButton = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        tab === id
          ? "bg-eb-primary/10 text-eb-primary"
          : "text-eb-secondary hover:text-eb-text hover:bg-eb-page"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex bg-eb-page">
      {/* ── Side nav (desktop) ── */}
      <aside className="hidden sm:flex flex-col w-56 shrink-0 bg-white border-r border-eb-layout sticky top-0 h-screen">
        <div className="px-5 py-6 border-b border-eb-layout">
          {restaurant.logo_url && (
            <img
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="h-10 w-10 rounded-full object-cover mb-3"
            />
          )}
          <h1 className="font-semibold text-eb-text leading-tight">{restaurant.name}</h1>
          {restaurant.city && <p className="text-xs text-eb-muted mt-0.5">{restaurant.city}</p>}
          {manager && (
            <span className="inline-block mt-2 text-[11px] bg-eb-primary/10 text-eb-primary px-2 py-0.5 rounded-full">
              Responsable
            </span>
          )}
        </div>
        <nav className="flex flex-col p-3 gap-0.5 flex-1">
          {navItems.map((item) => <NavButton key={item.id} {...item} />)}
        </nav>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="sm:hidden flex items-center gap-3 bg-white border-b px-4 py-3">
          {restaurant.logo_url && (
            <img src={restaurant.logo_url} alt={restaurant.name} className="h-8 w-8 rounded-full object-cover" />
          )}
          <h1 className="font-semibold text-eb-text flex-1 truncate">{restaurant.name}</h1>
          {manager && <span className="text-xs text-eb-secondary shrink-0">Responsable</span>}
        </header>

        {/* Mobile tab bar */}
        <nav className="sm:hidden flex border-b bg-white px-2">
          {navItems.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                tab === id ? "border-eb-primary text-eb-primary" : "border-transparent text-eb-secondary"
              }`}
            >
              {label === "Mes disponibilités" ? "Mes dispos" : label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 px-4 sm:px-8 py-6 space-y-0">
          {tab === "mes-dispos" && token && (
            <MyAvailabilityBoard slug={restaurant.slug} token={token} />
          )}
          {tab === "planning" && token && (
            <ServicePlanner
              restaurant={restaurant}
              members={members}
              token={token}
              onMembersChanged={setMembers}
            />
          )}
          {tab === "equipe" && (
            <div className="space-y-6">
              <Link
                className="text-sm underline text-eb-secondary"
                to={`/resto/${restaurant.slug}/acces`}
              >
                Connexion des employés par PIN
              </Link>
              {token && restaurant.is_owner && (
                <EmployeeAccessSettings
                  slug={restaurant.slug}
                  token={token}
                  members={members}
                />
              )}
              <RestoTeamSection
                restaurantSlug={restaurant.slug}
                members={members}
                isManager={manager}
                token={token}
                onMembersChanged={setMembers}
              />
              {manager && token && (
                <MemberPlanningEditor
                  members={members}
                  slug={restaurant.slug}
                  token={token}
                  onChange={setMembers}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
