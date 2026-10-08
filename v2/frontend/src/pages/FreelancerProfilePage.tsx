/**
 * src/pages/FreelancerProfilePage.tsx
 * Route  : /extras/:slug
 * Owner  : AppShell avec onglets Profil / Agenda / Missions / Factures / Réglages
 *          + bascule "Vue client" depuis l'onglet Profil
 * Public : Layout simple (topbar + scroll) pour un visiteur externe
 */

import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

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
import PublicMissionProposalCard from "../components/recruitment/ProposalForm";
import RequestsSection from '../components/recruitment/RequestsSection';
import ProfileCard from "../components/ProfileCard";
import ProfileContactSection from "../components/ProfileContactSection";
import AccountSettingsSection from "../components/settings/AccountSettingsSection";
import Topbar from "../components/Topbar";
import SoftReveal from '../components/SoftReveal';
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

function requestedOwnerTab(search: string): OwnerTab {
  const tab = new URLSearchParams(search).get('tab');
  return tab === 'missions' || tab === 'factures' ? tab : 'profil';
}

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
  const revealId = useId();
  const hasExp = profile.experiences.length > 0 || isOwner;
  if (!hasExp) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={revealId}
        className="flex w-full items-center justify-between border-t border-eb-layout px-6 py-3 text-left transition-colors hover:bg-eb-page"
      >
        <span className="text-[12px] font-medium text-eb-secondary">
          {open
            ? "Masquer les expériences"
            : `Expériences${profile.experiences.length > 0 ? ` (${profile.experiences.length})` : ""}`}
        </span>
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="eb-disclosure-chevron h-3 w-3 shrink-0 text-eb-muted" style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)" }}>
          <polyline points="1,8 6,3 11,8" />
        </svg>
      </button>
      <SoftReveal open={open} id={revealId}>
        <ExperiencesSection key={isOwner ? "owner" : "public"} slug={slug} isOwner={isOwner} token={token} initialExperiences={profile.experiences} noCard />
      </SoftReveal>
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
  const [activeTab, setActiveTab] = useState<OwnerTab>(() => {
    return requestedOwnerTab(window.location.search);
  });
  const [isContact, setIsContact] = useState<boolean | null>(null);
  const [contactBusy, setContactBusy] = useState(false);

  const alreadyTriedRefresh = useRef(sessionStorage.getItem(REFRESH_KEY) === slug);
  const location = useLocation();

  useEffect(() => {
    setActiveTab(requestedOwnerTab(location.search));
    setPreviewPublic(false);
  }, [slug, location.search]);

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
        <div className="w-full max-w-md rounded-eb-card border border-eb-layout bg-[#fffdf7] p-8">
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
      <main className="rivebelle-public min-h-screen bg-[#f5efe4] text-[#352b1d]" style={{ animation: "ebFadeUp 0.4s ease both" }}>
        <style>{`@keyframes ebFadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
          .rivebelle-public .text-eb-primary { color: #956818; }
          .rivebelle-public h1 { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(32px, 6vw, 42px); font-weight: 400; color: #352b1d; }
          .rivebelle-public .eb-input { border-color: #decfb5; border-radius: 12px; background: #fffdf7; }
          .rivebelle-public .eb-input:focus { outline-color: #dba52a; }
          .rivebelle-public [class*="bg-eb-primary/"] { background-color: #f9e8ad; }
        `}</style>

        {/* Bannière sticky "aperçu" — visible uniquement pour l'owner en mode preview */}
        {isOwner && (
          <div
            className="sticky top-0 z-20 flex items-center justify-between px-5 py-2.5"
            style={{ background: "#f9e8ad", borderBottom: "1px solid #e0c46a" }}
          >
            <p className="text-[12px] font-medium" style={{ color: "#6b3d00" }}>
              Aperçu vue client — voici ce que voient les restaurateurs
            </p>
            <button
              type="button"
              onClick={() => setPreviewPublic(false)}
              className="inline-flex min-h-[30px] items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-opacity hover:opacity-80"
              style={{ background: "#352b1d", color: "#fdf8f1" }}
            >
              ← Retour au tableau de bord
            </button>
          </div>
        )}

        <div className="mx-auto max-w-[900px] px-4 py-6 space-y-4">
          <Topbar currentSlug={slug} warm />

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

          <section className="overflow-hidden rounded-[26px] border border-[#e0d4bf] bg-[#fffdf7] shadow-[0_10px_35px_-25px_#947239]">
            <div className="h-3 bg-[#f3c64c]" />
            <ProfileCard profile={profile} isOwner={false} noCard />
            <CollapsibleExperiences slug={slug} isOwner={false} profile={profile} />
          </section>

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

          <ProfileContactSection profile={profile} />

          <section className="rounded-[24px] border border-[#e0d4bf] bg-[#fffdf7] p-4" style={{ height: "70vh" }}>
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
      animateContent={false}
      contentClassName="mx-auto w-full max-w-[1100px]"
      showContentHeader
      headerActions={activeTab === "profil" ? (
        <button
          type="button"
          onClick={() => setPreviewPublic(true)}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium transition-opacity hover:opacity-80"
          style={{ background: "#f9e8ad", color: "#6b3d00" }}
        >
          Aperçu vue client →
        </button>
      ) : undefined}
    >
      <div key={activeTab} className="eb-owner-content">
      {/* ── Profil ── */}
      {activeTab === "profil" && (
        <div className="eb-content-stagger space-y-6">
          <AccountRoleCard slug={profile.slug} role={profile.role} token={token} onRoleChanged={handleProfileUpdated} />

          <section className="rounded-eb-card border border-eb-layout bg-[#fffdf7] overflow-hidden">
            <ProfileCard key="owner" profile={profile} isOwner onProfileUpdated={handleProfileUpdated} noCard />
            <CollapsibleExperiences slug={slug} isOwner token={token} profile={profile} />
          </section>

          <ProfileContactSection profile={profile} />

          {/* Restaurants — visible uniquement sur mobile (sidebar sur desktop) */}
          {myRestaurants.length > 0 && (
            <section className="sm:hidden rounded-eb-card border border-eb-layout bg-[#fffdf7] p-4">
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">Mes restaurants</p>
              <div className="mt-3 space-y-2">
                {myRestaurants.map((r) => (
                  <Link key={r.slug} to={`/resto/${r.slug}`} className="flex items-center justify-between rounded-eb border border-eb-layout bg-eb-page px-4 py-3 hover:bg-[#f0e8d8] transition-colors">
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
        <div className="eb-content-stagger space-y-6">
          <section className="rounded-eb-card border border-eb-layout bg-[#fffdf7] p-4" style={{ height: "68vh" }}>
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
        <div>
          {token && <RequestsSection token={token} />}
          <MissionsSection slug={slug} token={token} onMissionsChange={setMissions} />
        </div>
      )}

      {/* ── Factures ── */}
      {activeTab === "factures" && (
        <div>
          <FacturesSection slug={slug} token={token} missions={missions} profile={profile} />
        </div>
      )}

      {/* ── Contacts ── */}
      {activeTab === "contacts" && (
        <ContactsSection token={token} />
      )}

      {/* ── Réglages ── */}
      {activeTab === "reglages" && (
        <div>
          <AccountSettingsSection profile={profile} token={token} authProvider={user!.auth_provider} />
        </div>
      )}
      </div>
    </AppShell>
  );
}
