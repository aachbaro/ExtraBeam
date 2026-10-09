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
import NotificationBell from './recruitment/NotificationBell';

const SHELL_CSS = `
  @keyframes ebSlideRight {
    from { opacity: 0; transform: translateX(-14px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes ebFadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

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
  animateContent?: boolean;
  contentClassName?: string;
  headerActions?: ReactNode;
  showContentHeader?: boolean;
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
  animateContent = true,
  contentClassName = "",
  headerActions,
  showContentHeader = false,
}: AppShellProps) {
  const { user, clearUser } = useUserContext();

  async function handleLogout() {
    await clearUser();
    const isOidc = user?.auth_provider === "pascuans";
    if (isOidc) {
      window.location.href = getOidcLogoutUrl(`${window.location.origin}/`);
    } else {
      window.location.href = "/";
    }
  }

  const NavBtn = ({ item, index }: { item: NavItem; index: number }) => {
    const active = item.id === activeTab;
    const base = "w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors";
    const animStyle = {
      animation: "ebSlideRight 0.3s ease both",
      animationDelay: `${120 + index * 45}ms`,
    };

    if (item.href) {
      return (
        <Link
          to={item.href}
          className={`${base} flex items-center justify-between hover:bg-[#f0e8d8]`}
          style={{ color: "#6b5540", ...animStyle }}
        >
          <span className="truncate">{item.label}</span>
          <span className="ml-2 shrink-0 text-[10px]" style={{ color: "#b09070" }}>→</span>
        </Link>
      );
    }

    return (
      <button
        onClick={() => onTabChange(item.id)}
        className={`${base} text-left ${active ? "" : "hover:bg-[#f0e8d8]"}`}
        style={active
          ? { background: "#f9e8ad", color: "#6b3d00", ...animStyle }
          : { color: "#6b5540", ...animStyle }}
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
        className="flex-1 py-2 text-center text-[11px] font-medium transition-colors"
        style={{ color: active ? "#956818" : "#b09070" }}
      >
        <span
          className="mx-auto mb-0.5 block h-0.5 w-5 rounded-full transition-colors"
          style={{ background: active ? "#956818" : "transparent" }}
        />
        {item.mobileLabel ?? item.label}
      </button>
    );
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#f5efe4" }}>
      <style>{SHELL_CSS}</style>

      {/* ── Side nav (desktop) ── */}
      <aside
        className="hidden sm:flex flex-col w-56 shrink-0 sticky top-0 h-screen border-r"
        style={{ background: "#fdf8f1", borderColor: "#e0d4bf" }}
      >
        {/* Logo */}
        <div
          className="relative z-10 flex items-center justify-between px-4 pt-5 pb-3"
          style={{ animation: "ebSlideRight 0.3s ease both" }}
        >
          {!showContentHeader && <NotificationBell />}
          <Link
            to={backHref}
            className="font-logo text-[18px] leading-none transition-opacity hover:opacity-70"
            style={{ color: "#956818" }}
          >
            {backLabel}
          </Link>
        </div>

        {/* Context header (nom, logo, badge) */}
        <div
          className="px-4 pb-4 border-b"
          style={{ borderColor: "#e0d4bf", animation: "ebSlideRight 0.3s ease both", animationDelay: "60ms" }}
        >
          {logoUrl && (
            <img
              src={logoUrl}
              alt={title}
              className="h-9 w-9 rounded-full object-cover mb-2"
            />
          )}
          <p className="font-semibold text-[14px] leading-tight truncate" style={{ color: "#352b1d" }}>{title}</p>
          {subtitle && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: "#947239" }}>{subtitle}</p>
          )}
          {badge && (
            <span
              className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: "#f9e8ad", color: "#6b3d00" }}
            >
              {badge}
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex flex-col p-3 gap-0.5 flex-1 overflow-y-auto">
          {nav.map((item, i) => (
            <Fragment key={item.id}>
              {item.sectionLabel && (
                <div
                  className="mt-3 mb-1 px-1"
                  style={{ animation: "ebSlideRight 0.3s ease both", animationDelay: `${110 + i * 45}ms` }}
                >
                  <div className="border-t" style={{ borderColor: "#e0d4bf" }} />
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#b09070" }}>
                    {item.sectionLabel}
                  </p>
                </div>
              )}
              <NavBtn item={item} index={i} />
            </Fragment>
          ))}
        </nav>

        {/* User + logout */}
        {user && (
          <div
            className="border-t px-4 py-4"
            style={{
              borderColor: "#e0d4bf",
              animation: "ebSlideRight 0.3s ease both",
              animationDelay: `${120 + nav.length * 45}ms`,
            }}
          >
            <p className="text-[12px] font-medium truncate" style={{ color: "#352b1d" }}>{user.display_name}</p>
            <p className="text-[11px] capitalize" style={{ color: "#947239" }}>{user.role === "client" ? "Restaurateur" : user.role}</p>
            <button
              onClick={handleLogout}
              className="mt-2 text-[11px] transition-colors hover:opacity-70"
              style={{ color: "#b09070" }}
            >
              Se déconnecter
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header
          className="sm:hidden flex items-center gap-3 border-b px-4 py-3 sticky top-0 z-10"
          style={{ background: "#fdf8f1", borderColor: "#e0d4bf" }}
        >
          {logoUrl && (
            <img src={logoUrl} alt={title} className="h-7 w-7 rounded-full object-cover shrink-0" />
          )}
          <Link
            to={backHref}
            className="font-logo text-[16px] shrink-0"
            style={{ color: "#956818" }}
          >
            {backLabel}
          </Link>
          <span className="text-[13px]" style={{ color: "#b09070" }}>·</span>
          <p className="font-semibold text-[13px] flex-1 truncate" style={{ color: "#352b1d" }}>{title}</p>
          <NotificationBell align="right" />
          {user && (
            <button
              onClick={handleLogout}
              className="shrink-0 text-[11px] transition-colors hover:opacity-70"
              style={{ color: "#b09070" }}
            >
              ×
            </button>
          )}
        </header>

        {/* Content */}
        <main
          className="flex-1 px-4 sm:px-8 py-6"
          style={animateContent ? { animation: "ebFadeUp 0.35s ease both", animationDelay: "80ms" } : undefined}
        >
          <div className={contentClassName}>
            {showContentHeader && (
              <div className="mb-6 flex min-h-[36px] flex-wrap items-center justify-between gap-3">
                <h1 className="text-[22px] font-semibold" style={{ color: "#352b1d" }}>
                  {nav.find(item => item.id === activeTab)?.label ?? title}
                </h1>
                <div className="ml-auto flex items-center gap-3">
                  {headerActions}
                  <div className="hidden sm:block"><NotificationBell align="right" /></div>
                </div>
              </div>
            )}
            {children}
          </div>
        </main>

        {/* Mobile tab bar */}
        <nav
          className="sm:hidden sticky bottom-0 border-t flex"
          style={{ background: "#fdf8f1", borderColor: "#e0d4bf" }}
        >
          {nav.filter((item) => !item.href).map((item) => (
            <MobileTabBtn key={item.id} item={item} />
          ))}
        </nav>
      </div>
    </div>
  );
}
