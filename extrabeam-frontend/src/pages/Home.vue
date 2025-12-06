<!-- src/pages/Home.vue -->
<!-- -------------------------------------------------------------
 Page d’accueil (Home)
---------------------------------------------------------------
📌 Description :
 - Page publique d’entrée sur la plateforme
 - Présente le concept, les profils cibles et les CTA principaux

🔒 Règles d’accès :
 - Accessible à tous (aucune auth requise)

⚠️ Remarques :
 - CTA “Je cherche un extra” → redirige vers inscription restaurateur
 - CTA “Je suis extra” → redirige vers inscription freelance
--------------------------------------------------------------- -->

<template>
  <div class="max-w-5xl mx-auto p-6 space-y-16">
    <!-- Hero Section -->
    <section class="text-center space-y-6">
      <h1 class="text-4xl font-bold text-gray-900">Site en construction 🚧</h1>
      <p class="text-lg text-gray-600">
        Futur site de gestion d'emploi du temps et missions pour extras
      </p>
    </section>

    <section>
      <EntrepriseSearch />
    </section>

    <!-- Fonctionnement -->
    <section>
      <h2 class="text-2xl font-bold mb-6 text-center">Comment ça marche ?</h2>
      <div class="grid md:grid-cols-4 gap-6 text-center">
        <div>
          <div class="text-4xl mb-2">📅</div>
          <p>L’extra publie ses disponibilités</p>
        </div>
        <div>
          <div class="text-4xl mb-2">📩</div>
          <p>Le restaurateur envoie une proposition de mission</p>
        </div>
        <div>
          <div class="text-4xl mb-2">✅</div>
          <p>L’extra accepte ou refuse</p>
        </div>
        <div>
          <div class="text-4xl mb-2">🧾</div>
          <p>Facture généré automatiquement</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import EntrepriseSearch from "../components/EntrepriseSearch.vue";

const router = useRouter();

function goToRegister(role) {
  router.push(`/register?role=${role}`);
}

console.log("VITE_API_URL =", import.meta.env.VITE_API_URL);
console.log("VITE_SUPABASE_URL =", import.meta.env.VITE_SUPABASE_URL);
</script>
