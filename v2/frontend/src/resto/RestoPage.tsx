import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchRestaurant, fetchMembers } from "../api";
import AppShell, { type NavItem } from "../components/AppShell";
import { useUserContext } from "../context/UserContext";
import type { Restaurant, RestaurantMember } from "../types";
import EmployeeAccessSettings from "./EmployeeAccessSettings";
import MemberPlanningEditor from "./MemberPlanningEditor";
import MyAvailabilityBoard from "./MyAvailabilityBoard";
import RestoTeamSection from "./RestoTeamSection";
import ServicePlanner from "./ServicePlanner";

type RestoTab = "planning" | "mes-dispos" | "equipe";

const RESTO_NAV: NavItem[] = [
  { id: "planning", label: "Planning" },
  { id: "mes-dispos", label: "Mes disponibilités", mobileLabel: "Mes dispos" },
  { id: "equipe", label: "Équipe" },
];

export default function RestoPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useUserContext();
  const token = user?.token ?? null;
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [members, setMembers] = useState<RestaurantMember[]>([]);
  const [tab, setTab] = useState<RestoTab>("planning");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([fetchRestaurant(slug, token), fetchMembers(slug, token)])
      .then(([r, m]) => {
        if (alive) { setRestaurant(r); setMembers(m); }
      })
      .catch((e) => { if (alive) setError(String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug, token]);

  if (!token) {
    return (
      <main className="p-8 space-y-4">
        <h1 className="text-xl">Accès au restaurant</h1>
        <Link className="block underline" to={`/resto/${slug}/acces`}>Connexion employé par PIN</Link>
        <Link className="block underline" to="/login">Connexion responsable Rivebelle</Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-eb-page">
        <p className="text-[14px] text-eb-secondary">Chargement…</p>
      </main>
    );
  }

  if (error || !restaurant) {
    return (
      <p role="alert" className="p-8 text-red-700">{error || "Restaurant introuvable."}</p>
    );
  }

  const manager = !!restaurant.is_manager;

  const restoNav: NavItem[] = [
    ...RESTO_NAV,
    ...(user?.slug
      ? [{ id: "profil-extra", label: "Mon profil", href: `/extras/${user.slug}`, sectionLabel: "Compte" }]
      : []),
  ];

  return (
    <AppShell
      title={restaurant.name}
      subtitle={restaurant.city ?? undefined}
      badge={manager ? "Responsable" : undefined}
      logoUrl={restaurant.logo_url ?? undefined}
      nav={restoNav}
      activeTab={tab}
      onTabChange={(id) => setTab(id as RestoTab)}
      backHref="/resto"
      backLabel="Rivebelle"
    >
      {tab === "planning" && (
        <ServicePlanner
          restaurant={restaurant}
          members={members}
          token={token}
          onMembersChanged={setMembers}
        />
      )}

      {tab === "mes-dispos" && (
        <MyAvailabilityBoard slug={restaurant.slug} token={token} />
      )}

      {tab === "equipe" && (
        <div className="space-y-6">
          <Link className="text-sm underline text-eb-secondary" to={`/resto/${restaurant.slug}/acces`}>
            Connexion des employés par PIN
          </Link>
          {token && restaurant.is_owner && (
            <EmployeeAccessSettings slug={restaurant.slug} token={token} members={members} />
          )}
          <RestoTeamSection
            restaurantSlug={restaurant.slug}
            members={members}
            isManager={manager}
            token={token}
            onMembersChanged={setMembers}
          />
          {manager && token && (
            <MemberPlanningEditor members={members} slug={restaurant.slug} token={token} onChange={setMembers} />
          )}
        </div>
      )}
    </AppShell>
  );
}
