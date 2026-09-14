/**
 * src/pages/AuthCallbackPage.tsx
 * Layer  : Frontend — pages
 * Role   : Reçoit le redirect post-OIDC de social_frontend_bridge.
 *          Parse les query params (id, slug, email, display_name, token…),
 *          hydrate le UserContext et redirige vers le profil.
 * Route  : /auth/callback
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getDefaultAppPath, getOidcLoginUrl } from "../api";
import { useUserContext } from "../context/UserContext";
import type { AuthUser } from "../types";

const OIDC_ERROR_LABELS: Record<string, string> = {
  access_denied: "Accès refusé. La connexion centralisée a été annulée.",
  temporarily_unavailable: "Le service d'authentification est temporairement indisponible.",
};

function getOidcErrorLabel(error: string): string {
  return OIDC_ERROR_LABELS[error] ?? `Erreur de connexion (${error}).`;
}

function parseUserFromParams(params: URLSearchParams): AuthUser | null {
  const id = params.get("id");
  const email = params.get("email");
  const display_name = params.get("display_name");

  if (!id || !email || !display_name) return null;

  return {
    id,
    slug: params.get("slug") || null,
    email,
    display_name,
    avatar_url: params.get("avatar_url") || null,
    role: (params.get("role") as AuthUser["role"]) || "freelance",
    auth_provider: params.get("auth_provider") || undefined,
    oidc_sub: params.get("oidc_sub") || null,
    token: params.get("token") || null,
  };
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setUser } = useUserContext();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (error) {
      setErrorMessage(getOidcErrorLabel(error));
      return;
    }

    const parsed = parseUserFromParams(params);
    if (!parsed) {
      setErrorMessage("Le callback OIDC n'a pas retourné de profil exploitable.");
      return;
    }

    setUser(parsed);
    const target = getDefaultAppPath(parsed);
    navigate(target, { replace: true });
  }, [navigate, setUser]);

  if (errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-eb-page px-6 py-8 text-eb-text">
        <div className="w-full max-w-lg rounded-eb-card border border-eb-layout bg-white p-8">
          <p className="font-logo text-[28px] text-eb-text">Rivebelle</p>
          <h1 className="mt-6 text-[22px] font-semibold text-eb-text">Connexion impossible</h1>
          <p className="mt-3 text-[14px] leading-6 text-eb-secondary">{errorMessage}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={getOidcLoginUrl()}
              className="eb-focus-ring inline-flex min-h-[44px] items-center justify-center rounded-eb bg-eb-primary px-4 text-[14px] font-medium text-white"
            >
              Réessayer
            </a>
            <Link
              to="/login"
              className="eb-focus-ring inline-flex min-h-[44px] items-center justify-center rounded-eb border border-eb-layout px-4 text-[14px] font-medium text-eb-text"
            >
              Retour à la page de connexion
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-eb-page px-6 py-8 text-eb-text">
      <div className="w-full max-w-lg rounded-eb-card border border-eb-layout bg-white p-8">
        <p className="font-logo text-[28px] text-eb-text">Rivebelle</p>
        <h1 className="mt-6 text-[22px] font-semibold text-eb-text">Connexion en cours</h1>
        <p className="mt-3 text-[14px] leading-6 text-eb-secondary">
          Récupération de votre compte depuis pascuans.dev…
        </p>
      </div>
    </main>
  );
}
