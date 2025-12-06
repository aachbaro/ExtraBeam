// src/services/supabase.ts
// -------------------------------------------------------------
// Client Supabase côté frontend
// -------------------------------------------------------------
//
// 📌 Description :
//   - Initialise le client Supabase pour le navigateur
//   - Utilise la clé publique (ANON) et l’URL fournis par Vite
//
// 🔒 Règles d’accès :
//   - Clé ANON uniquement (jamais de clé SERVICE côté frontend)
//   - Auth sécurisée via Supabase Auth
//
// ⚠️ Remarques :
//   - Les variables doivent être définies dans .env avec le préfixe VITE_
//   - Lève une erreur claire si l’URL ou la clé est manquante
//
// -------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

// ----------------------
// Config
// ----------------------

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url) throw new Error("[supabase] VITE_SUPABASE_URL manquant");
if (!anon) throw new Error("[supabase] VITE_SUPABASE_ANON_KEY manquant");

// ----------------------
// Client
// ----------------------

export const supabase = createClient(url, anon);

