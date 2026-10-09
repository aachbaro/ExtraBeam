/**
 * src/components/Topbar.tsx
 * Layer  : Frontend — composant UI partagé
 * Role   : Barre de navigation commune aux pages publiques et authentifiées.
 *          Affiche le logo, puis soit les actions de session publique,
 *          soit les raccourcis du compte connecté + la déconnexion.
 * Deps   : UserContext, api (getOidcLogoutUrl)
 */

import { Link } from "react-router-dom";
import { getOidcLogoutUrl } from "../api";
import { useUserContext } from "../context/UserContext";
import MobileFullscreenButton from "./MobileFullscreenButton";
import NotificationBell from './recruitment/NotificationBell';

interface Props {
  /** Slug de la page courante — masque le lien "Mon profil" si identique */
  currentSlug?: string;
  /** Palette chaude (profil public / pages warm) */
  warm?: boolean;
}

export default function Topbar({ currentSlug, warm }: Props) {
  const { user, clearUser } = useUserContext();

  async function handleLogout() {
    await clearUser();
    window.location.href = getOidcLogoutUrl(`${window.location.origin}/`);
  }

  const logoStyle = warm ? { color: "#956818" } : undefined;
  const linkCls = warm
    ? "text-[13px] transition-opacity hover:opacity-70"
    : "eb-btn-ghost text-[13px]";
  const linkStyle = warm ? { color: "#6b5540" } : undefined;

  return (
    <>
      <MobileFullscreenButton />

      <div className="flex items-center justify-between">
        <Link to="/" className="font-logo text-[24px] leading-none select-none" style={logoStyle ?? { color: "var(--eb-text, #1a1a1a)" }}>
          Rivebelle
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <NotificationBell />
          {user ? (
            <>
              <span className="hidden text-[13px] text-eb-secondary sm:block">
                {user.display_name} · {user.role}
              </span>
              {user.role === "admin" && (
                <Link to="/admin" className={linkCls} style={linkStyle}>
                  Admin
                </Link>
              )}
              {user.role === "client" ? (
                <Link to="/restaurateur" className={linkCls} style={linkStyle}>
                  Mon espace
                </Link>
              ) : (
                user.slug && user.slug !== currentSlug && (
                  <Link to={`/extras/${user.slug}`} className={linkCls} style={linkStyle}>
                    Mon profil
                  </Link>
                )
              )}
              <button type="button" onClick={handleLogout} className={linkCls} style={linkStyle}>
                Se déconnecter
              </button>
            </>
          ) : (
            <>
              <Link to="/register" className={linkCls} style={linkStyle}>
                Créer un compte
              </Link>
              <Link to="/login" className={linkCls} style={linkStyle}>
                Se connecter
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
