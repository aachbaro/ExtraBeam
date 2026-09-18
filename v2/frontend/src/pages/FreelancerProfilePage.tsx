/**
 * src/pages/FreelancerProfilePage.tsx
 * Route  : /extras/:slug
 * Owner  : AppShell avec onglets Profil / Agenda / Missions / Factures / Réglages
 *          + bascule "Vue client" depuis l'onglet Profil
 * Public : Layout simple (topbar + scroll) pour un visiteur externe
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  addContact,
  fetchContactStatus,
  fetchMyRestaurants,
  fetchProfileOverview,
  getDefaultAppPath,
  getOidcLoginUrl,
  removeContact,
} from "../api";
import AccountRoleCard from "../components/AccountRoleCard";
import Agenda from "../components/agenda/Agenda";
import AppShell, { type NavItem } from "../components/AppShell";
import ContactsSection from "../components/contacts/ContactsSection";
import ExperiencesSection from "../components/experiences/ExperiencesSection";
import FacturesSection from "../components/factures/FacturesSection";
import MissionsSection from "../components/missions/MissionsSection";
import PublicMissionProposalCard from "../components/missions/PublicMissionProposalCard";
import ProfileCard from "../components/ProfileCard";
import ProfileContactSection from "../components/ProfileContactSection";
import AccountSettingsSection from "../components/settings/AccountSettingsSection";
import Topbar from "../components/Topbar";
import UnavailabilitySection from "../components/unavailabilities/UnavailabilitySection";
import { useUserContext } from "../context/UserContext";
import type {
  FreelancerProfile,
  Mission,
  ProfileOverview,
  Restaurant,
  Slot,
  Unavailability,
} from "../types";

type OwnerTab = "profil" | "agenda" | "missions" | "factures" | "contacts" | "reglages";

const BASE_OWNER_NAV: NavItem[] = [
  { id: "profil", label: "Profil" },
  { id: "agenda", label: "Agenda" },
  { id: "missions", label: "Missions" },
  { id: "factures", label: "Factures" },
  { id: "contacts", label: "Contacts" },
  { id: "reglages", label: "Réglages" },
];

const REFRESH_KEY = "eb_profile_refresh_attempted";

// ── Composant partagé : expériences dépliables ─────────────────────────────
function CollapsibleExperiences({
  slug,
  isOwner,
  token,
  profile,
}: {
  slug: string;
  isOwner: boolean;
  token?: string;
  profile: FreelancerProfile;
}) {
  const [open, setOpen] = useState(false);
  const hasExp = profile.experiences.length > 0 || isOwner;
  if (!hasExp) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-t border-eb-layout px-6 py-3 text-left transition-colors hover:bg-eb-page"
      >
        <span className="text-[12px] font-medium text-eb-secondary">
          {open
            ? "Masquer les expériences"
            : `Expériences${profile.experiences.length > 0 ? ` (${profile.experiences.length})` : ""}`}
        </span>
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 text-eb-muted transition-transform duration-300" style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)" }}>
          <polyline points="1,8 6,3 11,8" />
        </svg>
      </button>
      <div style={{ maxHeight: open ? "4000px" : "0px", overflow: "hidden", transition: "max-height 0.35s ease" }}>
        <ExperiencesSection key={isOwner ? "owner" : "public"} slug={slug} isOwner={isOwner} token={token} initialExperiences={profile.experiences} noCard />
      </div>
    </>
  );
}

export default function FreelancerProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, clearUser, setUser } = useUserContext();

  const [profile, setProfile] = useState<FreelancerProfile | null>(null);
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [planningSlots, setPlanningSlots] = useState<Slot[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [previewPublic, setPreviewPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<{ date: string; start: string; end: string } | null>(null);
  const [myRestaurants, setMyRestaurants] = useState<Restaurant[]>([]);
  const [activeTab, setActiveTab] = useState<OwnerTab>("profil");
  const [isContact, setIsContact] = useState<boolean | null>(null);
  const [contactBusy, setContactBusy] = useState(false);

  const alreadyTriedRefresh = useRef(sessionStorage.getItem(REFRESH_KEY) === slug);

  useEffect(() => {
    setActiveTab("profil");
    setPreviewPublic(false);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setPlanningSlots([]);

    fetchProfileOverview(slug, previewPublic ? undefined : user?.token)
      .then((overview: ProfileOverview) => {
        sessionStorage.removeItem(REFRESH_KEY);
        setProfile(overview.profile);
        setUnavailabilities(overview.unavailabilities);
        setIsOwner(overview.mode === "owner");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, user?.token, previewPublic]);

  useEffect(() => {
    if (!user?.token || !isOwner) return;
    fetchMyRestaurants(user.token)
      .then(setMyRestaurants)
      .catch(() => { /* silent */ });
  }, [user?.token, isOwner]);

  useEffect(() => {
    if (!user?.token || !slug || isOwner) return;
    fetchContactStatus(slug, user.token)
      .then(setIsContact)
      .catch(() => setIsContact(false));
  }, [user?.token, slug, isOwner]);

  async function handleToggleContact() {
    if (!user?.token || !slug) return;
    setContactBusy(true);
    try {
      if (isContact) {
        await removeContact(slug, user.token);
        setIsContact(false);
      } else {
        await addContact(slug, user.token);
        setIsContact(true);
      }
    } catch {
      // silent
    } finally {
      setContactBusy(false);
    }
  }

  function handleProfileUpdated(updated: FreelancerProfile) {
    setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
    if (!user?.token) return;
    const nextUser = {
      ...user,
      slug: updated.slug,
      display_name: updated.display_name,
      avatar_url: updated.avatar_url,
      role: updated.role,
    };
    setUser(nextUser);
    if (updated.role !== user.role) {
      navigate(getDefaultAppPath(nextUser), { replace: true });
    }
  }

  // --- Loading ---
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-eb-page">
        <p className="text-[14px] text-eb-secondary">Chargement…</p>
      </main>
    );
  }

  // --- Profil introuvable ---
  if (error || !profile || !slug) {
    const isOwnBrokenProfile = !!user?.slug && user.slug === slug;
    if (isOwnBrokenProfile && !alreadyTriedRefresh.current && user?.auth_provider === "pascuans") {
      sessionStorage.setItem(REFRESH_KEY, slug!);
      clearUser();
      window.location.href = getOidcLoginUrl();
      return null;
    }
    return (
      <main className="flex min-h-screen items-center justify-center bg-eb-page px-6">
        <div className="w-full max-w-md rounded-eb-card border border-eb-layout bg-white p-8">
          <p className="font-logo text-[28px] text-eb-text">Rivebelle</p>
          <h1 className="mt-6 text-[22px] font-semibold text-eb-text">Profil introuvable</h1>
          <p className="mt-3 text-[14px] leading-6 text-eb-secondary">
            {isOwnBrokenProfile
              ? "La reconnexion n'a pas pu initialiser ton profil. Réessaie ou contacte le support."
              : (error ?? "Ce profil n'existe pas ou a été supprimé.")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {isOwnBrokenProfile ? (
              <button type="button" onClick={() => { sessionStorage.removeItem(REFRESH_KEY); clearUser(); window.location.href = getOidcLoginUrl(); }} className="inline-flex min-h-[40px] items-center justify-center rounded-eb bg-eb-primary px-4 text-[14px] font-medium text-white">
                Réessayer
              </button>
            ) : (
              <Link to="/" className="inline-flex min-h-[40px] items-center justify-center rounded-eb border border-eb-layout px-4 text-[14px] font-medium text-eb-text">
                Retour à l'accueil
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  const canReceivePublicMission =
    profile.role === "freelance" &&
    user?.slug !== slug &&
    (!user || user.role === "client");

  // ── VUE PUBLIC ou previewPublic ─────────────────────────────────────────────
  const showPublicLayout = !isOwner || previewPublic;
  if (showPublicLayout) {
    return (
      <main className="min-h-screen bg-eb-page" style={{ animation: "ebFadeUp 0.4s ease both" }}>
        <style>{`@keyframes ebFadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
        <div className="mx-auto max-w-[900px] px-4 py-6 space-y-4">
          <Topbar currentSlug={slug} />

          {/* Bouton contact (visiteur connecté sur un profil tiers) */}
          {!isOwner && user && isContact !== null && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleToggleContact()}
                disabled={contactBusy}
                className={`inline-flex items-center gap-1.5 rounded-eb px-4 py-2 text-[13px] font-medium transition-all disabled:opacity-60 ${
                  isContact
                    ? "border border-eb-layout text-eb-secondary hover:border-red-300 hover:text-red-600"
                    : "bg-eb-primary text-white hover:opacity-90"
                }`}
              >
                {contactBusy ? "…" : isContact ? "Contact ✓  Retirer" : "+ Ajouter aux contacts"}
              </button>
            </div>
          )}

          {/* Bascule vue détenteur / vue client (owner only) */}
          {isOwner && (
            <section className="rounded-eb-card border border-eb-layout bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">Aperçu du profil</p>
                  <p className="mt-1 text-[13px] text-eb-secondary">Tu vois ton profil tel qu'un client le verrait.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewPublic(false)}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-eb bg-eb-primary px-4 text-[13px] font-medium text-white"
                >
                  ← Vue détenteur
                </button>
              </div>
            </section>
          )}

          <section className="rounded-eb-card border border-eb-layout bg-white overflow-hidden">
            <ProfileCard profile={profile} isOwner={false} noCard />
            <CollapsibleExperiences slug={slug} isOwner={false} profile={profile} />
          </section>

          <ProfileContactSection profile={profile} />

          {canReceivePublicMission && (
            <div className="eb-proposal-anchor">
              <PublicMissionProposalCard
                slug={slug}
                unavailabilities={unavailabilities}
                extraName={profile.display_name || slug}
                hourlyRate={profile.hourly_rate ?? undefined}
                externalSlot={pendingSlot}
              />
            </div>
          )}

          <section className="rounded-eb-card border border-eb-layout bg-white p-4" style={{ height: "70vh" }}>
            <Agenda
              key="public"
              slug={slug}
              isOwner={false}
              unavailabilities={unavailabilities}
              onUnavailabilitiesChange={setUnavailabilities}
              onSlotsChange={setPlanningSlots}
              missions={[]}
              onPublicCellClick={canReceivePublicMission ? (date, start, end) => {
                setPendingSlot({ date, start, end });
                setTimeout(() => {
                  document.querySelector(".eb-proposal-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 50);
              } : undefined}
            />
          </section>
        </div>
      </main>
    );
  }

  // ── VUE OWNER (extra connecté sur son propre profil) ───────────────────────
  const token = user!.token!;

  const ownerNav: NavItem[] = [
    ...BASE_OWNER_NAV,
    ...myRestaurants.map((r, i) => ({
      id: `resto-${r.slug}`,
      label: r.name,
      href: `/resto/${r.slug}`,
      ...(i === 0 ? { sectionLabel: "Restaurants" } : {}),
    })),
  ];

  return (
    <AppShell
      title={profile.display_name || slug}
      subtitle={profile.job_title || undefined}
      nav={ownerNav}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as OwnerTab)}
    >
      {/* ── Profil ── */}
      {activeTab === "profil" && (
        <div className="space-y-4 max-w-[860px]">
          {/* Bascule vue client */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPreviewPublic(true)}
              className="text-[12px] text-eb-secondary hover:text-eb-text transition-colors border border-eb-layout rounded-eb px-3 py-1.5"
            >
              Aperçu vue client →
            </button>
          </div>

          <AccountRoleCard slug={profile.slug} role={profile.role} token={token} onRoleChanged={handleProfileUpdated} />

          <section className="rounded-eb-card border border-eb-layout bg-white overflow-hidden">
            <ProfileCard key="owner" profile={profile} isOwner onProfileUpdated={handleProfileUpdated} noCard />
            <CollapsibleExperiences slug={slug} isOwner token={token} profile={profile} />
          </section>

          <ProfileContactSection profile={profile} />

          {/* Restaurants — visible uniquement sur mobile (sidebar sur desktop) */}
          {myRestaurants.length > 0 && (
            <section className="sm:hidden rounded-eb-card border border-eb-layout bg-white p-4">
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">Mes restaurants</p>
              <div className="mt-3 space-y-2">
                {myRestaurants.map((r) => (
                  <Link key={r.slug} to={`/resto/${r.slug}`} className="flex items-center justify-between rounded-eb border border-eb-layout bg-eb-page px-4 py-3 hover:bg-white transition-colors">
                    <div>
                      <p className="text-[14px] font-medium text-eb-text">{r.name}</p>
                      {r.city && <p className="text-[12px] text-eb-muted">{r.city}</p>}
                    </div>
                    <span className="text-[12px] text-eb-primary">→</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Agenda ── */}
      {activeTab === "agenda" && (
        <div className="space-y-4 max-w-[1000px]">
          <section className="rounded-eb-card border border-eb-layout bg-white p-4" style={{ height: "68vh" }}>
            <Agenda
              key="owner"
              slug={slug}
              isOwner
              unavailabilities={unavailabilities}
              onUnavailabilitiesChange={setUnavailabilities}
              onSlotsChange={setPlanningSlots}
              missions={missions}
            />
          </section>
          <UnavailabilitySection
            slug={slug}
            token={token}
            planningSlots={planningSlots}
            unavailabilities={unavailabilities}
            onUnavailabilitiesChange={setUnavailabilities}
          />
        </div>
      )}

      {/* ── Missions ── */}
      {activeTab === "missions" && (
        <div className="max-w-[860px]">
          <MissionsSection slug={slug} token={token} onMissionsChange={setMissions} />
        </div>
      )}

      {/* ── Factures ── */}
      {activeTab === "factures" && (
        <div className="max-w-[860px]">
          <FacturesSection slug={slug} token={token} missions={missions} profile={profile} />
        </div>
      )}

      {/* ── Contacts ── */}
      {activeTab === "contacts" && (
        <ContactsSection token={token} />
      )}

      {/* ── Réglages ── */}
      {activeTab === "reglages" && (
        <div className="max-w-[640px]">
          <AccountSettingsSection profile={profile} token={token} authProvider={user!.auth_provider} />
        </div>
      )}
    </AppShell>
  );
}
