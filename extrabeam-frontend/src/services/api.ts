// src/services/api.ts
// -------------------------------------------------------------
// Service utilitaire pour les appels API HTTP
// -------------------------------------------------------------
//
// 📌 Description :
//   - Centralise les appels HTTP vers les endpoints de l’application
//   - Gère automatiquement :
//     • Ajout du token JWT dans les headers (si présent)
//     • Parsing JSON + gestion d’erreurs enrichies
//     • Logs conditionnels en dev
//
// 📍 Fonctions :
//   - getAuthHeaders() : construit les headers d’authentification
//   - request<T>(url, options) : wrapper générique autour de fetch()
//
// 🔒 Règles d’accès :
//   - Le token est récupéré depuis localStorage (clé: "authToken")
//   - `skipAuth: true` permet d’appeler un endpoint public sans Authorization
//
// ⚠️ Remarques :
//   - Ce service est utilisé par tous les autres (entreprises, missions, factures, slots…)
//   - Bonne pratique : centraliser la logique API pour éviter la duplication
// -------------------------------------------------------------

// ----------------------
// Custom Error
// ----------------------

/**
 * Erreur enrichie pour les appels API.
 * Contient le code HTTP + le body de la réponse.
 */
export class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, body: any, message?: string) {
    super(message || body?.error || "API Error");
    this.status = status;
    this.body = body;
  }
}

// ----------------------
// Helpers
// ----------------------

console.log("VITE_API_URL =", import.meta.env.VITE_API_URL);
console.log("VITE_SUPABASE_URL =", import.meta.env.VITE_SUPABASE_URL);


const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const ABSOLUTE_URL_REGEX = /^https?:\/\//i;

/**
 * Construit les headers d’authentification pour les requêtes API.
 * Récupère le token stocké dans localStorage et l’ajoute en tant que Bearer.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Calcule l'URL finale en fonction de la configuration Vite.
 * - Supporte les URLs absolues (http/https)
 * - Si VITE_API_URL se termine par /api et que l'URL commence par /api,
 *   on évite le doublon en retirant le préfixe /api de l'URL relative.
 */
export function resolveApiUrl(path: string): string {
  if (ABSOLUTE_URL_REGEX.test(path)) {
    return path;
  }

  if (!API_BASE_URL) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (API_BASE_URL.endsWith("/api") && normalizedPath.startsWith("/api")) {
    const trimmed = normalizedPath.slice(4);
    return `${API_BASE_URL}${trimmed}`;
  }

  return `${API_BASE_URL}${normalizedPath}`;
}

// ----------------------
// Core Request
// ----------------------

/**
 * Wrapper générique autour de fetch() pour simplifier les appels API.
 *
 * @param url - l’URL de l’endpoint API
 * @param options - les options de la requête (méthode, headers, body, skipAuth…)
 * @returns La réponse parsée en JSON
 *
 * @example
 * const { entreprises } = await request<{ entreprises: Entreprise[] }>("/api/entreprises")
 */
export async function request<T>(
  url: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(options.skipAuth ? {} : getAuthHeaders()),
    ...(options.headers || {}),
  };

  const resolvedUrl = resolveApiUrl(url);

  if (import.meta.env.VITE_DEBUG_API) {
    console.log("🌍 Fetch:", resolvedUrl, options.method || "GET", { headers });
  }

  const res = await fetch(resolvedUrl, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("❌ API error:", res.status, body);
    throw new ApiError(res.status, body);
  }

  return res.json();
}
