/**
 * src/pages/ProfilePage.tsx
 * Layer  : Frontend — pages
 * Role   : Redirige l'utilisateur connecté vers son profil (/p/:slug).
 *          Si le slug n'est pas encore connu (ex: login local sans slug assigné),
 *          affiche une page de fallback minimaliste avec les données brutes.
 * Route  : /profile
 */

import { Navigate } from "react-router-dom";
import { useUserContext } from "../context/UserContext";
import { getOidcLogoutUrl } from "../api";

export default function ProfilePage() {
  const { user, clearUser } = useUserContext();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (user.role === "client") {
    return <Navigate to="/client" replace />;
  }

  // Cas normal : rediriger vers la page profil canonique
  if (user.slug) {
    return <Navigate to={`/extras/${user.slug}`} replace />;
  }

  // Fallback : slug pas encore assigné (compte tout neuf ou login local sans rechargement)
  return (
    <main className="min-h-screen bg-eb-page px-6 py-8 text-eb-text">
      <div className="mx-auto w-full max-w-lg rounded-eb-card border border-eb-layout bg-white p-6">
        <p className="font-logo text-[28px] text-eb-text">Rivebelle</p>
        <h1 className="mt-4 text-[20px] font-semibold text-eb-text">
          Profil non résolu
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-eb-secondary">
          Ton compte est bien connecté mais aucun slug n'est encore associé.
          Reconnecte-toi via le compte pascuans pour que le profil soit initialisé.
        </p>
        <button
          type="button"
          className="mt-5 inline-flex min-h-[40px] items-center justify-center rounded-eb border border-eb-layout px-4 text-[14px] font-medium text-eb-text"
          onClick={() => {
            clearUser();
            window.location.href = getOidcLogoutUrl(`${window.location.origin}/login`);
          }}
        >
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
