// src/services/auth.ts
// -------------------------------------------------------------
// Services liés à l’authentification (couche Supabase)
// -------------------------------------------------------------
//
// 📌 Description :
//   - Centralise tous les appels Supabase liés à l’authentification
//   - Fournit les helpers pour gérer la session et les actions (login, logout…)
//   - Supporte les modes : mot de passe, Magic Link, OAuth (Google)
//
// 🔒 Règles d’accès :
//   - Les vérifications de droits restent côté API (non ici)
//
// ⚠️ Remarques :
//   - Le stockage user/token est géré dans `useAuth.ts`
//   - Ici : uniquement les appels directs à Supabase / API
// -------------------------------------------------------------

import { request } from "./api";
import { supabase } from "./supabase";

// ----------------------
// Types
// ----------------------

export type UserRole = "freelance" | "client" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role?: UserRole;
  slug?: string; // slug entreprise si freelance
  nom?: string;
  prenom?: string;
}

// ----------------------
// Session helpers
// ----------------------

/**
 * 🔑 getSession()
 * Récupère la session active (token, infos, expiration…)
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * 👤 getCurrentUser()
 * Récupère l'utilisateur courant (métadonnées incluses)
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("❌ Erreur getUser:", error.message);
    return null;
  }
  if (!data.user) return null;

  const metadata = data.user.user_metadata;
  return {
    id: data.user.id,
    email: data.user.email!,
    role: metadata?.role,
    slug: metadata?.slug,
    nom: metadata?.nom,
    prenom: metadata?.prenom,
  };
}

// ----------------------
// Auth actions principales
// ----------------------

/**
 * 📝 register()
 * Inscription classique via backend custom
 * (utile si tu veux une API d’inscription spécifique)
 */
export interface RegisterResponse {
  entreprise?: { slug?: string | null } | null;
  [key: string]: any;
}

export async function register(payload: {
  email: string;
  password: string;
  role: UserRole;
  entreprise?: { nom: string; prenom: string };
}): Promise<RegisterResponse> {
  return request<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuth: true,
  });
}

/**
 * 🔑 login()
 * Connexion via email + mot de passe
 */
export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  const session = data.session;
  const token = session?.access_token;

  if (token) {
    localStorage.setItem("authToken", token);
  } else {
    console.warn("⚠️ Aucun access_token reçu de Supabase !");
  }

  return session;
}

/**
 * 🚪 logout()
 * Déconnexion complète côté Supabase
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ----------------------
// Auth avancée (OAuth / Magic Link)
// ----------------------

/**
 * 🔐 signInWithGoogle()
 * Connexion via Google OAuth (redirection automatique)
 * Redirige ensuite vers /auth/callback
 */
// export async function signInWithGoogle() {
//   const { error } = await supabase.auth.signInWithOAuth({
//     provider: "google",
//     options: {
//       redirectTo: `${window.location.origin}/auth/callback`,
//     },
//   });
//   if (error) throw error;
// }

export async function signInWithGoogle() {
  const redirect =
    import.meta.env.DEV
      ? "http://localhost:5173/auth/callback"
      : window.location.origin + "/auth/callback";

  console.log("🔗 Redirecting Google OAuth to:", redirect);

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirect },
  });

  if (error) throw error;
}

/**
 * ✉️ signInWithMagicLink()
 * Connexion / inscription via lien magique
 * Stocke les métadonnées (role, nom, prenom…) dans Supabase
 * Redirige ensuite vers /auth/callback
 */
export async function signInWithMagicLink(
  email: string,
  metadata?: Record<string, any>
) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: metadata,
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
}
