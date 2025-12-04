<!-- src/pages/EntreprisePage.vue -->
<!-- -------------------------------------------------------------
 Page de détail d’une entreprise
 ---------------------------------------------------------------
 Affiche :
 - Infos de l’entreprise (nom, prénom, infos publiques ou privées)
 - Agenda (slots)
 - Missions (selon droits)
 - Factures (owner uniquement)

 ⚠️ Règles :
 - Côté frontend → toujours passer le slug
 - Côté backend → décide si infos sensibles (owner/admin) ou publiques
--------------------------------------------------------------- -->

<template>
  <div class="w-full flex flex-col items-center justify-center px-4 pb-5">
    <!-- Bloc CV -->
    <div v-if="entrepriseSlug" class="max-w-[1200px] w-full mb-6">
      <CvCard
        :entreprise="entreprise"
        :entreprise-ref="entrepriseSlug"
        :is-owner="isOwner"
      />
    </div>

    <!-- Section Proposer mission (visiteurs uniquement) -->
    <div
      v-if="entreprise && !isOwner"
      class="max-w-[1200px] w-full mb-6"
    >
      <PublicMissionCard :entrepriseSlug="entreprise.slug" @created="onMissionCreated" />
    </div>

    <!-- Header infos entreprise -->
    <div class="max-w-[1200px] w-full mb-6 hidden">
      <div v-if="loading" class="text-gray-500 mt-2">Chargement...</div>
      <div v-else-if="!entreprise" class="text-red-600 mt-2">
        ❌ Entreprise introuvable
      </div>

      <!-- Infos entreprise -->
      <EntrepriseInfos
        v-else
        :entreprise="entreprise"
        :is-owner="isOwner"
        @updated="onEntrepriseUpdated"
      />

      <!-- Bouton ajouter en contact (si client et pas owner) -->
      <div
        v-if="user?.role === 'client' && !isOwner && entreprise"
        class="mt-4"
      >
        <AddContactButton :entreprise-id="entreprise.id" />
      </div>
    </div>

    <!-- Agenda -->
    <div
      class="h-[70vh] max-w-[1200px] w-full flex items-center border border-black p-3 rounded-lg"
    >
      <Agenda
        v-if="entreprise"
        :slug="entreprise.slug"
        :is-admin="isOwner"
        :slots="overview?.slots"
        :unavailabilities="overview?.unavailabilities"
      />
    </div>

    <!-- Missions -->
    <div
      v-if="entreprise && isOwner"
      class="max-w-[1200px] w-full mt-4 border border-black p-3 rounded-lg"
    >
      <MissionList
        v-if="entreprise"
        :is-owner="isOwner"
        :missions="overview?.missions"
      />
    </div>

    <!-- Factures -->
    <div
      v-if="entreprise && isOwner"
      class="max-w-[1200px] w-full mt-4 border border-black p-3 rounded-lg"
    >
      <FactureList
        :entreprise="entreprise"
        :factures="overview?.factures"
        @edit="onEditFacture"
        @deleted="onDeletedFacture"
        @updated="onFactureUpdated"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { getEntrepriseOverview } from "../services/entreprises";

import Agenda from "../components/agenda/Agenda.vue";
import MissionList from "../components/missions/MissionList.vue";
import EntrepriseInfos from "../components/EntrepriseInfos.vue";
import FactureList from "../components/factures/FactureList.vue";
import AddContactButton from "../components/AddContactButton.vue";
import CvCard from "../components/cv/CvCard.vue";
import PublicMissionCard from "../components/missions/PublicMissionCard.vue";

const route = useRoute();
const overview = ref<any>(null);
const entreprise = computed(() => overview.value?.entreprise ?? null);
const isOwner = computed(() =>
  ["owner", "admin"].includes(overview.value?.mode ?? "")
);
const entrepriseSlug = computed(() => {
  const slugFromOverview = entreprise.value?.slug;
  const slugFromRoute = route.params.slug as string | undefined;
  return slugFromOverview ?? slugFromRoute ?? "";
});
const loading = ref(true);

const { user, ready } = useAuth();

async function fetchEntrepriseData(slug: string) {
  if (!slug) {
    console.warn("⚠️ Slug manquant, requête annulée");
    return;
  }

  try {
    loading.value = true;
    const data = await getEntrepriseOverview(slug, { forceAuth: true });
    overview.value = data;
  } catch (err) {
    console.error("❌ Erreur chargement entreprise:", err);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await ready();

  const slug = route.params.slug as string | undefined;
  if (!slug) {
    console.warn("⚠️ Aucun slug dans l’URL → fetch annulé");
    loading.value = false;
    return;
  }

  await fetchEntrepriseData(slug);

  watch([() => user.value, () => route.params.slug], ([, newSlug]) => {
    if (typeof newSlug === "string") {
      fetchEntrepriseData(newSlug);
    }
  });
});

function onEntrepriseUpdated(updated: any) {
  if (!overview.value) return;
  overview.value = {
    ...overview.value,
    entreprise: updated,
  };
}

function onEditFacture(facture: any) {
  console.log("✏️ Éditer facture", facture);
}

function onFactureUpdated(facture: any) {
  if (!overview.value) return;
  const current = overview.value.factures ?? [];
  const exists = current.some((f: any) => f.id === facture.id);
  const nextFactures = exists
    ? current.map((f: any) => (f.id === facture.id ? facture : f))
    : [facture, ...current];
  overview.value = {
    ...overview.value,
    factures: nextFactures,
  };
}

function onDeletedFacture(id: number) {
  if (overview.value?.factures) {
    overview.value = {
      ...overview.value,
      factures: overview.value.factures.filter((f: any) => f.id !== id),
    };
  }
  console.log("🗑️ Facture supprimée", id);
}

function onMissionCreated(mission: any) {
  console.log("📨 Mission envoyée :", mission);
}
</script>
