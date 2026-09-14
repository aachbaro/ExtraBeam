/**
 * src/pages/FreelancerProfilePage.tsx
 * Layer  : Frontend — pages
 * Role   : Page de profil d'un freelance (accessible par tout le monde via /p/:slug).
 *          Affiche la ProfileCard + Agenda + Missions + Indisponibilités (owner).
 *          Si l'utilisateur connecté consulte son propre slug et que le profil
 *          est introuvable (404), relance automatiquement le flux OIDC pour
 *          initialiser le profil en base (une seule tentative via sessionStorage).
 * Route  : /p/:slug
 * Data   : GET /api/profiles/:slug/ → ProfileOverview (profile + unavailabilities + mode)
 */

import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { fetchProfileOverview, fetchMyRestaurants, getDefaultAppPath, getOidcLoginUrl } from "../api";
import AccountRoleCard from "../components/AccountRoleCard";
import Agenda from "../components/agenda/Agenda";
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
import type { FreelancerProfile, Mission, ProfileOverview, Restaurant, Slot, Unavailability } from "../types";

const REFRESH_KEY = "eb_profile_refresh_attempted";

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
  const [experiencesOpen, setExperiencesOpen] = useState(false);
  const [myRestaurants, setMyRestaurants] = useState<Restaurant[]>([]);

  // Évite la boucle 404 → OIDC → 404 si le backend échoue quand même.
  const alreadyTriedRefresh = useRef(sessionStorage.getItem(REFRESH_KEY) === slug);

  useEffect(() => {
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

  function switchPreviewMode(nextPreviewPublic: boolean) {
    if (nextPreviewPublic === previewPublic) {
      return;
    }
    setLoading(true);
    setError(null);
    setPreviewPublic(nextPreviewPublic);
  }

  // --- Chargement ---
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-eb-page">
        <p className="text-[14px] text-eb-secondary">Chargement…</p>
      </main>
    );
  }

  if (profile?.role === "client" && isOwner) {
    return <Navigate to="/client" replace />;
  }

  function handleProfileUpdated(updated: FreelancerProfile) {
    setProfile((prev) => (prev ? { ...prev, ...updated } : prev));

    if (!user?.token) {
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

    if (updated.role !== user.role) {
      navigate(getDefaultAppPath(nextUser), { replace: true });
    }
  }

  // --- Profil introuvable ---
  if (error || !profile || !slug) {
    const isOwnBrokenProfile = !!user?.slug && user.slug === slug;

    if (isOwnBrokenProfile && !alreadyTriedRefresh.current) {
      sessionStorage.setItem(REFRESH_KEY, slug);
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
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(REFRESH_KEY);
                  clearUser();
                  window.location.href = getOidcLoginUrl();
                }}
                className="inline-flex min-h-[40px] items-center justify-center rounded-eb bg-eb-primary px-4 text-[14px] font-medium text-white"
              >
                Réessayer
              </button>
            ) : (
              <Link
                to="/"
                className="inline-flex min-h-[40px] items-center justify-center rounded-eb border border-eb-layout px-4 text-[14px] font-medium text-eb-text"
              >
                Retour à l'accueil
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  const canPreviewAsClient = Boolean(
    user?.token && user?.slug === slug && profile.role !== "client"
  );
  const displayAsOwner = isOwner && !previewPublic;
  const agendaMissions = displayAsOwner ? missions : [];
  const canReceivePublicMission =
    !displayAsOwner &&
    profile.role === "freelance" &&
    user?.slug !== slug &&
    (!user || user.role === "client");

  // --- Page profil ---
  return (
    <main className="min-h-screen bg-eb-page" style={{ animation: "ebFadeUp 0.4s ease both" }}>
      <style>{`
        @keyframes ebFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ebFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .eb-section-appear { animation: ebFadeUp 0.35s ease both; }
      `}</style>
      <div className="mx-auto max-w-[1200px] px-4 py-6 space-y-4">

        <Topbar currentSlug={slug} />

        {canPreviewAsClient && (
          <section className="rounded-eb-card border border-eb-layout bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
                  Aperçu du profil
                </p>
                <p className="mt-1 text-[13px] text-eb-secondary">
                  Bascule entre ta vue détenteur et la vue publique telle qu&apos;un client la verrait.
                </p>
              </div>

              <div className="inline-flex rounded-eb border border-eb-layout bg-eb-page p-1">
                <button
                  type="button"
                  onClick={() => switchPreviewMode(false)}
                  className={`rounded-eb px-3 py-2 text-[13px] font-medium transition-colors ${
                    !previewPublic
                      ? "bg-eb-primary text-white"
                      : "text-eb-secondary hover:text-eb-text"
                  }`}
                >
                  Vue détenteur
                </button>
                <button
                  type="button"
                  onClick={() => switchPreviewMode(true)}
                  className={`rounded-eb px-3 py-2 text-[13px] font-medium transition-colors ${
                    previewPublic
                      ? "bg-eb-primary text-white"
                      : "text-eb-secondary hover:text-eb-text"
                  }`}
                >
                  Vue client
                </button>
              </div>
            </div>
          </section>
        )}

        {displayAsOwner && user?.token && (
          <AccountRoleCard
            slug={profile.slug}
            role={profile.role}
            token={user.token}
            onRoleChanged={handleProfileUpdated}
          />
        )}

        {/* Bloc profil + expériences fusionnés */}
        {(() => {
          const hasExp = profile.experiences.length > 0 || displayAsOwner;
          return (
            <section className="rounded-eb-card border border-eb-layout bg-white overflow-hidden">
              <ProfileCard
                key={`profile-${displayAsOwner ? "owner" : "public"}`}
                profile={profile}
                isOwner={displayAsOwner}
                onProfileUpdated={handleProfileUpdated}
                noCard
              />
              {hasExp && (
                <>
                  <button
                    type="button"
                    onClick={() => setExperiencesOpen((o) => !o)}
                    className="flex w-full cursor-pointer items-center justify-between border-t border-eb-layout px-6 py-3 text-left transition-colors hover:bg-eb-page"
                  >
                    <span className="text-[12px] font-medium text-eb-secondary">
                      {experiencesOpen
                        ? "Masquer les expériences"
                        : `Expériences${profile.experiences.length > 0 ? ` (${profile.experiences.length})` : ""}`}
                    </span>
                    <svg
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3 shrink-0 text-eb-muted transition-transform duration-300"
                      style={{ transform: experiencesOpen ? "rotate(0deg)" : "rotate(180deg)" }}
                    >
                      <polyline points="1,8 6,3 11,8" />
                    </svg>
                  </button>
                  <div style={{ maxHeight: experiencesOpen ? "4000px" : "0px", overflow: "hidden", transition: "max-height 0.35s ease" }}>
                    <ExperiencesSection
                      key={`experiences-${displayAsOwner ? "owner" : "public"}`}
                      slug={slug}
                      isOwner={displayAsOwner}
                      token={user?.token}
                      initialExperiences={profile.experiences}
                      noCard
                    />
                  </div>
                </>
              )}
            </section>
          );
        })()}

        <ProfileContactSection profile={profile} />

        {canReceivePublicMission && (
          <div className="eb-proposal-anchor"><PublicMissionProposalCard
            slug={slug}
            unavailabilities={unavailabilities}
            extraName={profile.display_name || slug}
            hourlyRate={profile.hourly_rate ?? undefined}
            externalSlot={pendingSlot}
          /></div>
        )}

        {/* Agenda : hauteur fixe, passe les missions pour colorier les slots */}
        <section className="rounded-eb-card border border-eb-layout bg-white p-4" style={{ height: "70vh" }}>
          <Agenda
            key={`agenda-${displayAsOwner ? "owner" : "public"}`}
            slug={slug}
            isOwner={displayAsOwner}
            unavailabilities={unavailabilities}
            onUnavailabilitiesChange={setUnavailabilities}
            onSlotsChange={setPlanningSlots}
            missions={agendaMissions}
            onPublicCellClick={canReceivePublicMission ? (date, start, end) => {
              setPendingSlot({ date, start, end });
              setTimeout(() => {
                document.querySelector(".eb-proposal-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
            } : undefined}
          />
        </section>

        {/* Sections owner uniquement */}
        {displayAsOwner && user?.token && (
          <>
            <MissionsSection
              slug={slug}
              token={user.token}
              onMissionsChange={setMissions}
            />

            <UnavailabilitySection
              slug={slug}
              token={user.token}
              planningSlots={planningSlots}
              unavailabilities={unavailabilities}
              onUnavailabilitiesChange={setUnavailabilities}
            />

            <FacturesSection
              slug={slug}
              token={user.token}
              missions={missions}
              profile={profile}
            />

            {myRestaurants.length > 0 && (
              <section className="rounded-eb-card border border-eb-layout bg-white p-4">
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">Mes restaurants</p>
                <p className="mt-1 text-[13px] text-eb-secondary">Établissements auxquels votre compte est lié.</p>
                <div className="mt-4 space-y-2">
                  {myRestaurants.map((r) => (
                    <Link
                      key={r.slug}
                      to={`/resto/${r.slug}`}
                      className="flex items-center justify-between rounded-eb border border-eb-layout bg-eb-page px-4 py-3 hover:bg-white transition-colors"
                    >
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

            <AccountSettingsSection
              profile={profile}
              token={user.token}
              authProvider={user.auth_provider}
            />
          </>
        )}
      </div>
    </main>
  );
}
