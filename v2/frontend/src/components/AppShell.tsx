/**
 * src/components/AppShell.tsx
 * Shell de layout commun à toutes les pages authentifiées.
 * Desktop : sidebar 240px sticky + contenu.
 * Mobile  : header top + tab bar bottom.
 */

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getOidcLogoutUrl } from "../api";
import { useUserContext } from "../context/UserContext";
import NotificationBell from './recruitment/NotificationBell';

// Shared across dashboard routes; a full page reload enables the entrance again.
let dashboardEntered = false;

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

function NavIcon({ label }: { label: string }) {
  const key = label.toLowerCase();
  const path = /équipe|contact/.test(key) ? "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87"
    : /planning|agenda|disponib/.test(key) ? "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M8 14h2M14 14h2M8 18h2"
    : /factur/.test(key) ? "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6"
    : /réglage|paramètre/.test(key) ? "M4 7h16M4 17h16M8 4v6M16 14v6"
    : /profil|compte/.test(key) ? "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"
    : "M4 5h16v16H4V5ZM8 5V3h8v2M8 10h8M8 15h5";
  return <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("rivebelle-sidebar-collapsed") === "true");
  const [entrance, setEntrance] = useState(() => ({ enabled: !dashboardEntered, tab: activeTab }));
  const entering = entrance.enabled && entrance.tab === activeTab;
  useEffect(() => {
    dashboardEntered = true;
    const timer = window.setTimeout(() => setEntrance(value => ({ ...value, enabled: false })), 1300);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (activeTab !== entrance.tab) setEntrance(value => ({ ...value, enabled: false }));
  }, [activeTab, entrance.tab]);
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
    const base = `w-full flex items-center gap-3 ${collapsed ? "justify-center px-2" : "px-3"} py-2.5 rounded-xl text-[13px] font-medium transition-colors`;
    const animStyle = {
      animation: "ebSlideRight 0.3s ease both",
      animationDelay: `${120 + index * 45}ms`,
    };

    if (item.href) {
      return (
        <Link
          to={item.href}
          title={collapsed ? item.label : undefined}
          aria-label={item.label}
          className={`${base} flex items-center justify-between hover:bg-[#f0e8d8]`}
          style={{ color: "#6b5540", ...animStyle }}
        >
          <NavIcon label={item.label} />
          {!collapsed && <><span className="truncate">{item.label}</span><span className="ml-auto shrink-0 text-[10px]" style={{ color: "#76624e" }}>→</span></>}
        </Link>
      );
    }

    return (
      <button
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        onClick={() => onTabChange(item.id)}
        className={`${base} text-left ${active ? "" : "hover:bg-[#f0e8d8]"}`}
        style={active
          ? { background: "#f9e8ad", color: "#6b3d00", ...animStyle }
          : { color: "#6b5540", ...animStyle }}
      >
        <NavIcon label={item.label} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  const MobileTabBtn = ({ item }: { item: NavItem }) => {
    const active = item.id === activeTab;
    return (
      <button
        onClick={() => onTabChange(item.id)}
        className="flex-1 py-2 text-center text-[11px] font-medium transition-colors"
        style={{ color: active ? "#956818" : "#76624e" }}
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
    <div className={`eb-app-shell min-h-screen flex ${entering ? "eb-shell-enter" : ""}`} style={{ background: "#f5efe4" }}>
      <style>{SHELL_CSS}</style>

      {/* ── Side nav (desktop) ── */}
      <aside
        className={`hidden sm:flex flex-col ${collapsed ? "w-16" : "w-56"} shrink-0 sticky top-0 h-screen border-r transition-[width] duration-200 motion-reduce:transition-none`}
        style={{ background: "#fdf8f1", borderColor: "#e0d4bf" }}
      >
        {/* Logo */}
        <div
          className={`relative z-10 flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-4"} pt-5 pb-3`}
          style={{ animation: "ebSlideRight 0.3s ease both" }}
        >
          {!collapsed && <Link
            to={backHref}
            className="font-logo text-[18px] leading-none transition-opacity hover:opacity-70"
            style={{ color: "#956818" }}
          >
            {backLabel}
          </Link>}
          <button type="button" aria-label={collapsed ? "Développer la navigation" : "Réduire la navigation"} title={collapsed ? "Développer la navigation" : "Réduire la navigation"} aria-expanded={!collapsed} onClick={() => { setCollapsed(!collapsed); localStorage.setItem("rivebelle-sidebar-collapsed", String(!collapsed)); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-eb-secondary transition-colors hover:bg-[#f0e8d8]">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"}/></svg>
          </button>
        </div>
        {!showContentHeader && <div className={`relative z-10 pb-2 ${collapsed ? "px-3" : "px-4"}`}><NotificationBell /></div>}

        {/* Context header (nom, logo, badge) */}
        {!collapsed && <div
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
        </div>}

        {/* Nav items */}
        <nav className={`flex flex-col ${collapsed ? "p-2" : "p-3"} gap-0.5 flex-1 overflow-y-auto`}>
          {nav.map((item, i) => (
            <Fragment key={item.id}>
              {item.sectionLabel && (
                <div
                  className="mt-3 mb-1 px-1"
                  style={{ animation: "ebSlideRight 0.3s ease both", animationDelay: `${110 + i * 45}ms` }}
                >
                  <div className="border-t" style={{ borderColor: "#e0d4bf" }} />
                  {!collapsed && <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#76624e" }}>
                    {item.sectionLabel}
                  </p>}
                </div>
              )}
              <NavBtn item={item} index={i} />
            </Fragment>
          ))}
        </nav>

        {/* User + logout */}
        {user && !collapsed && (
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
              style={{ color: "#76624e" }}
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
          <span className="text-[13px]" style={{ color: "#76624e" }}>·</span>
          <p className="font-semibold text-[13px] flex-1 truncate" style={{ color: "#352b1d" }}>{title}</p>
          <NotificationBell align="right" />
          {user && (
            <button
              onClick={handleLogout}
              className="shrink-0 text-[11px] transition-colors hover:opacity-70"
              style={{ color: "#76624e" }}
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
