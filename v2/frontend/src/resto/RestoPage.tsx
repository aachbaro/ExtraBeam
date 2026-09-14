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
  return (
    <div className="min-h-screen bg-eb-page">
      <header className="border-b bg-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          {restaurant.logo_url && (
            <img
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          )}
          <div>
            <h1 className="text-lg font-semibold text-eb-primary">
              {restaurant.name}
            </h1>
            <p className="text-sm text-eb-secondary">{restaurant.city}</p>
          </div>
          {manager && <span className="ml-auto text-xs">Responsable</span>}
        </div>
      </header>
      <nav className="border-b bg-white">
        <div className="max-w-6xl mx-auto flex gap-4 px-4">
          {(["planning", "mes-dispos", "equipe"] as const).map((t) => (
            <button
              key={t}
              className={`py-3 border-b-2 ${tab === t ? "border-eb-primary font-medium" : "border-transparent"}`}
              onClick={() => setTab(t)}
            >
              {t === "planning" ? "Planning" : t === "mes-dispos" ? "Mes disponibilités" : "Équipe"}
            </button>
          ))}
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-6">
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
        {tab === "equipe" && token && restaurant.is_owner && (
          <EmployeeAccessSettings
            slug={restaurant.slug}
            token={token}
            members={members}
          />
        )}
        {tab === "equipe" && (
          <Link
            className="text-sm underline"
            to={`/resto/${restaurant.slug}/acces`}
          >
            Connexion des employés par PIN
          </Link>
        )}
        {tab === "equipe" && (
          <>
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
          </>
        )}
      </main>
    </div>
  );
}
