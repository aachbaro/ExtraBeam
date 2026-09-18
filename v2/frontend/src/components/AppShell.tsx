/**
 * src/components/AppShell.tsx
 * Shell de layout commun à toutes les pages authentifiées.
 * Desktop : sidebar 240px sticky + contenu.
 * Mobile  : header top + tab bar bottom.
 */

import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getOidcLogoutUrl } from "../api";
import { useUserContext } from "../context/UserContext";

export interface NavItem {
  id: string;
  label: string;
  mobileLabel?: string;
  /** Si défini : rend un lien de navigation vers cette route au lieu d'un onglet. */
  href?: string;
  /** Si défini : affiche un séparateur avec ce libellé avant l'item (desktop seulement). */
  sectionLabel?: string;
}

interface AppShellProps {
  /** Titre affiché en haut de la sidebar (ex: nom du restaurant, nom de l'user) */
  title: string;
  subtitle?: string;
  /** Badge optionnel sous le titre (ex: "Responsable") */
  badge?: string;
  /** Image optionnelle (logo restaurant, avatar) */
  logoUrl?: string | null;
  nav: NavItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
  /** Lien "retour" affiché en haut de la sidebar */
  backHref?: string;
  backLabel?: string;
}

export default function AppShell({
  title,
  subtitle,
  badge,
  logoUrl,
  nav,
  activeTab,
  onTabChange,
  children,
  backHref = "/",
  backLabel = "Rivebelle",
}: AppShellProps) {
  const { user, clearUser } = useUserContext();

  function handleLogout() {
    clearUser();
    const isOidc = user?.auth_provider === "pascuans";
    if (isOidc) {
      window.location.href = getOidcLogoutUrl(`${window.location.origin}/`);
    } else {
      window.location.href = "/";
    }
  }

  const NavBtn = ({ item }: { item: NavItem }) => {
    const active = item.id === activeTab;
    const base = "w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors";

    if (item.href) {
      return (
        <Link
          to={item.href}
          className={`${base} flex items-center justify-between text-eb-secondary hover:text-eb-text hover:bg-eb-page`}
        >
          <span className="truncate">{item.label}</span>
          <span className="ml-2 shrink-0 text-[10px] text-eb-muted">→</span>
        </Link>
      );
    }

    return (
      <button
        onClick={() => onTabChange(item.id)}
        className={`${base} ${
          active
            ? "bg-eb-primary/10 text-eb-primary"
            : "text-eb-secondary hover:text-eb-text hover:bg-eb-page"
        }`}
      >
        {item.label}
      </button>
    );
  };

  const MobileTabBtn = ({ item }: { item: NavItem }) => {
    const active = item.id === activeTab;
    return (
      <button
        onClick={() => onTabChange(item.id)}
        className={`flex-1 py-2 text-center text-[11px] font-medium transition-colors ${
          active ? "text-eb-primary" : "text-eb-muted"
        }`}
      >
        <span
          className={`mx-auto mb-0.5 block h-0.5 w-5 rounded-full transition-colors ${
            active ? "bg-eb-primary" : "bg-transparent"
          }`}
        />
        {item.mobileLabel ?? item.label}
      </button>
    );
  };

  return (
    <div className="min-h-screen flex bg-eb-page">
      {/* ── Side nav (desktop) ── */}
      <aside className="hidden sm:flex flex-col w-56 shrink-0 bg-white border-r border-eb-layout sticky top-0 h-screen">
        {/* Logo / back link */}
        <div className="px-4 pt-5 pb-3">
          <Link
            to={backHref}
            className="font-logo text-[18px] leading-none text-eb-text hover:text-eb-primary transition-colors"
          >
            {backLabel}
          </Link>
        </div>

        {/* Context header (nom, logo, badge) */}
        <div className="px-4 pb-4 border-b border-eb-layout">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={title}
              className="h-9 w-9 rounded-full object-cover mb-2"
            />
          )}
          <p className="font-semibold text-[14px] text-eb-text leading-tight truncate">{title}</p>
          {subtitle && (
            <p className="text-[11px] text-eb-muted mt-0.5 truncate">{subtitle}</p>
          )}
          {badge && (
            <span className="inline-block mt-1.5 text-[10px] bg-eb-primary/10 text-eb-primary px-2 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex flex-col p-3 gap-0.5 flex-1 overflow-y-auto">
          {nav.map((item) => (
            <Fragment key={item.id}>
              {item.sectionLabel && (
                <div className="mt-3 mb-1 px-1">
                  <div className="border-t border-eb-layout" />
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-eb-muted">
                    {item.sectionLabel}
                  </p>
                </div>
              )}
              <NavBtn item={item} />
            </Fragment>
          ))}
        </nav>

        {/* User + logout */}
        {user && (
          <div className="border-t border-eb-layout px-4 py-4">
            <p className="text-[12px] font-medium text-eb-text truncate">{user.display_name}</p>
            <p className="text-[11px] text-eb-muted capitalize">{user.role}</p>
            <button
              onClick={handleLogout}
              className="mt-2 text-[11px] text-eb-muted hover:text-eb-text transition-colors"
            >
              Se déconnecter
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="sm:hidden flex items-center gap-3 bg-white border-b border-eb-layout px-4 py-3 sticky top-0 z-10">
          {logoUrl && (
            <img src={logoUrl} alt={title} className="h-7 w-7 rounded-full object-cover shrink-0" />
          )}
          <Link
            to={backHref}
            className="font-logo text-[16px] text-eb-text shrink-0"
          >
            {backLabel}
          </Link>
          <span className="text-eb-muted text-[13px]">·</span>
          <p className="font-semibold text-[13px] text-eb-text flex-1 truncate">{title}</p>
          {user && (
            <button
              onClick={handleLogout}
              className="shrink-0 text-[11px] text-eb-muted hover:text-eb-text transition-colors"
            >
              ×
            </button>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 px-4 sm:px-8 py-6">
          {children}
        </main>

        {/* Mobile tab bar — liens cross-espace exclus (href), uniquement les onglets */}
        <nav className="sm:hidden sticky bottom-0 bg-white border-t border-eb-layout flex">
          {nav.filter((item) => !item.href).map((item) => (
            <MobileTabBtn key={item.id} item={item} />
          ))}
        </nav>
      </div>
    </div>
  );
}
