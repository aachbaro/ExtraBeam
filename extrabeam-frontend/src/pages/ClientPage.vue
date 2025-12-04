<!-- src/pages/ClientPage.vue -->
<!-- -------------------------------------------------------------
 Page Client
---------------------------------------------------------------
📌 Description :
 - Espace personnel pour un utilisateur de type "client"
 - Contient :
   • Infos basiques
   • Gestion des modèles de mission (TemplateList)
   • Gestion des contacts (ContactList)
   • Liste des missions du client
   • Liste des factures du client (readonly)
   • Agenda (placeholder)

🔒 Règles d’accès :
 - Accessible uniquement aux utilisateurs avec role = client
--------------------------------------------------------------- -->

<template>
  <div class="max-w-5xl mx-auto p-6 space-y-12">

    <section class="text-center space-y-6">
      <h1 class="text-4xl font-bold text-gray-900">
        Page en construction 🚧
      </h1>
    </section>
    <!-- Infos -->
    <section>
      <h2 class="text-xl font-bold mb-2">📋 Mes informations</h2>
      <div class="p-4 border rounded bg-gray-50">
        <p>Email : {{ user?.email }}</p>
        <p>Role : {{ user?.role }}</p>
      </div>
    </section>

    <!-- Modèles de mission -->
    <section>
      <h2 class="text-xl font-bold mb-4">📑 Mes modèles de mission</h2>
      <TemplateList />
    </section>

    <!-- Contacts -->
    <section>
      <h2 class="text-xl font-bold mb-4">📇 Mes contacts</h2>
      <ContactList />
    </section>

    <!-- Missions -->
    <section>
      <h2 class="text-xl font-bold mb-2">📂 Mes missions</h2>
      <div v-if="loadingMissions" class="text-gray-500">Chargement...</div>
      <div v-else-if="missions.length === 0" class="text-gray-500">
        Aucune mission pour le moment.
      </div>
      <div v-else class="grid gap-4">
        <MissionCard
          v-for="mission in missions"
          :key="mission.id"
          :mission="mission"
          readonly
        />
      </div>
    </section>

    <!-- Factures -->
    <section>
      <!-- Ici on passe readonly -->
      <FactureList :entreprise="{}" readonly />
    </section>

    <!-- Agenda -->
    <section>
      <h2 class="text-xl font-bold mb-2">📅 Mon agenda</h2>
      <div class="p-4 border rounded bg-gray-50">
        <p class="text-gray-500">Agenda en cours de développement…</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuth } from "../composables/useAuth";
import TemplateList from "../components/TemplateList.vue";
import ContactList from "../components/ContactList.vue";
import MissionCard from "../components/missions/MissionCard.vue";
import FactureList from "../components/factures/FactureList.vue";

import { listMissions, type MissionWithRelations } from "../services/missions";

const { user } = useAuth();

const missions = ref<MissionWithRelations[]>([]);
const loadingMissions = ref(false);

async function fetchMissions() {
  if (user.value?.role !== "client") return;
  loadingMissions.value = true;
  try {
    const { missions: data } = await listMissions();
    missions.value = data;
  } catch (err) {
    console.error("❌ Erreur récupération missions client:", err);
  } finally {
    loadingMissions.value = false;
  }
}

onMounted(() => {
  if (user.value?.role === "client") {
    fetchMissions();
  }
});
</script>
