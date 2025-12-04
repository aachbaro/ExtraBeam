<!-- src/components/MissionCard.vue -->
<!-- -------------------------------------------------------------
 Carte d’une mission (MissionCard)
 ---------------------------------------------------------------
 📌 Description :
 - Affiche les détails d’une mission (contact, slots, statut)
 - Permet d’accepter/refuser/mettre à jour le statut
 - Intègre la facturation inline :
   • Génération via FactureModal
   • Affichage FactureCard si facture existe

 🔒 Règles d’accès :
 - Affichage public si mission transmise
 - Actions réservées à l’owner entreprise

 ⚠️ Remarques :
 - Les créneaux sont affichés depuis mission.slots[]
 - Utilise directement les relations Supabase (mission.entreprise / mission.client)
 ------------------------------------------------------------- -->

<template>
  <ExpandableCard v-model:expanded="expanded" class="p-4 hover:shadow-md">
    <template #header>
      <div
        class="grid grid-cols-3 items-center w-full text-center sm:text-left"
      >
        <!-- Bloc gauche : nom de l'établissement -->
        <h3 class="font-bold text-lg text-gray-900 truncate sm:text-left">
          {{ mission.etablissement }}
        </h3>

        <!-- Bloc centre : premier créneau -->
        <p
          v-if="mission.slots?.length"
          class="text-sm bg-gray-100 px-2 py-1 rounded-full inline-flex justify-center w-full sm:w-auto mx-auto sm:mx-0"
        >
          {{ formatDate(mission.slots?.[0]?.start) }}
        </p>
        <p v-else></p>

        <!-- Bloc droite : statut -->
        <span
          class="inline-flex items-center justify-center px-2 py-1 text-xs rounded-full w-max sm:justify-self-end mx-auto sm:mx-0"
          :class="statusClasses[mission.status]"
        >
          {{ statusLabels[mission.status] || mission.status }}
        </span>
      </div>
    </template>

    <template #indicator></template>

    <div class="mt-3 space-y-3 text-sm text-gray-700">
      <!-- Adresse établissement -->
      <div
        v-if="
          mission.etablissement_adresse_ligne1 || mission.etablissement_ville
        "
        class="text-sm text-gray-600"
      >
        📍
        {{ mission.etablissement_adresse_ligne1 || "" }},
        <span v-if="mission.etablissement_adresse_ligne2">
          , {{ mission.etablissement_adresse_ligne2 }},
        </span>
        {{ mission.etablissement_code_postal || "" }},
        {{ mission.etablissement_ville || "" }}
        <span v-if="mission.etablissement_pays">
          ({{ mission.etablissement_pays }})
        </span>
      </div>

      <!-- Contact -->
      <p v-if="mission.contact_name" class="text-sm font-medium">
        👤 {{ mission.contact_name }}
      </p>
      <p v-if="mission.contact_phone" class="text-sm">
        📞
        <a
          :href="`tel:${mission.contact_phone.replace(/\s+/g, '')}`"
          class="text-blue-600 underline"
        >
          {{ mission.contact_phone }}
        </a>
      </p>
      <p v-if="mission.contact_email" class="text-sm">
        ✉️
        <a
          :href="`mailto:${mission.contact_email}`"
          class="text-blue-600 underline"
        >
          {{ mission.contact_email }}
        </a>
      </p>

      <!-- Créneaux -->
      <div v-if="mission.slots?.length" class="space-y-1 text-sm text-gray-600">
        <p
          v-for="slot in mission.slots"
          :key="
            slot.id ?? slot.start ?? slot.end ?? slot.title ?? slot.created_at
          "
        >
          📅 {{ formatDate(slot.start) }} → {{ formatDate(slot.end) }}
        </p>
      </div>

      <!-- Instructions -->
      <p v-if="mission.instructions" class="text-sm italic text-gray-700">
        {{ mission.instructions }}
      </p>

      <!-- Mode -->
      <p class="text-sm">
        Mode : <b>{{ mission.mode }}</b>
      </p>

      <!-- Actions -->
      <div v-if="!props.readonly" class="flex gap-2 mt-3 justify-center">
        <!-- Proposed -->
        <template v-if="mission.status === 'proposed'">
          <button
            class="btn-primary hover:bg-blue-700"
            @click.stop="acceptMission"
            :disabled="loading"
          >
            Accepter
          </button>
          <button
            class="btn-primary hover:bg-red-700"
            @click.stop="rejectMission"
            :disabled="loading"
          >
            Refuser
          </button>
        </template>

        <!-- Validated -->
        <template v-else-if="mission.status === 'validated'">
          <button
            class="btn-primary hover:bg-green-700"
            @click.stop="createDevis"
          >
            Devis
          </button>
          <button
            class="btn-primary hover:bg-gray-700"
            @click.stop="markRealized"
          >
            Marquer réalisée
          </button>
        </template>

        <!-- Pending payment -->
        <template v-else-if="mission.status === 'pending_payment'">
          <span class="text-sm text-yellow-600">Paiement en attente…</span>
          <button class="btn-primary hover:bg-green-700" @click.stop="markPaid">
            Marquer payé
          </button>
        </template>

        <!-- Paid -->
        <template v-else-if="mission.status === 'paid'">
          <span class="text-sm text-green-600">Mission payée ✅</span>
          <button
            class="btn-primary hover:bg-gray-700"
            @click.stop="closeMission"
          >
            Clore
          </button>
        </template>

        <!-- Refused -->
        <template v-else-if="mission.status === 'refused'">
          <span class="text-sm text-red-500">Mission refusée</span>
        </template>

        <!-- Closed -->
        <template v-else-if="mission.status === 'closed'">
          <span class="text-sm text-gray-500">Mission clôturée</span>
        </template>
      </div>

      <!-- Facturation -->
      <div v-if="mission.status === 'realized'" class="mt-4 border-t pt-3">
        <h4 class="text-md font-semibold mb-2">📑 Facturation</h4>

        <!-- Entreprise : générer ou gérer facture -->
        <template v-if="!props.readonly">
          <div v-if="!facture">
            <button
              class="btn-primary hover:bg-green-700"
              @click.stop="createFacture"
            >
              Générer une facture
            </button>
          </div>

          <FactureCard
            v-else
            :facture="facture"
            :entreprise="mission.entreprise"
            @deleted="handleFactureDeleted"
            @updated="handleFactureUpdated"
            @edit="handleFactureEdit"
          />
        </template>

        <!-- Client (readonly) : voir facture si elle existe -->
        <template v-else>
          <FactureCard v-if="facture" :facture="facture" readonly />
          <p v-else class="text-sm text-gray-500 italic">
            Aucune facture encore générée pour cette mission.
          </p>
        </template>
      </div>
    </div>
  </ExpandableCard>

  <!-- FactureModal -->
  <FactureModal
    v-if="showFactureModal"
    :open="showFactureModal"
    :mission="mission"
    :entreprise="mission.entreprise || {}"
    @close="showFactureModal = false"
    @generated="handleFactureGenerated"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { updateMission } from "../../services/missions";
import {
  listFacturesByMission,
  type FactureWithRelations,
} from "../../services/factures";
import FactureModal from "../factures/FactureModal.vue";
import FactureCard from "../factures/FactureCard.vue";
import type { MissionWithRelations } from "../../services/missions";
import ExpandableCard from "@/components/ui/ExpandableCard.vue";
import { useExpandableCard } from "@/composables/ui/useExpandableCard";

const props = defineProps<{
  mission: MissionWithRelations;
  readonly?: boolean;
}>();

console.log("🚀 MissionCard props.mission :", props.mission.slots);

const emit = defineEmits(["updated"]);
const loading = ref(false);
const showFactureModal = ref(false);
const { expanded } = useExpandableCard();
const facture = ref<FactureWithRelations | null>(null);

// ----------------------
// Status labels & styles
// ----------------------
const statusLabels: Record<string, string> = {
  proposed: "Proposée",
  validated: "Acceptée",
  realized: "Réalisée",
  pending_payment: "Paiement en attente",
  paid: "Payée",
  refused: "Refusée",
  closed: "Clôturée",
};

const statusClasses: Record<string, string> = {
  proposed: "bg-yellow-100 text-yellow-800",
  validated: "bg-green-100 text-green-800",
  realized: "bg-blue-100 text-blue-800",
  pending_payment: "bg-purple-100 text-purple-800",
  paid: "bg-indigo-100 text-indigo-800",
  refused: "bg-red-100 text-red-800",
  closed: "bg-gray-100 text-gray-800",
};

// ----------------------
// Lifecycle
// ----------------------
onMounted(async () => {
  try {
    const factures = await listFacturesByMission(props.mission.id);
    facture.value = factures.length ? factures[0] : null;
  } catch (err) {
    console.error("❌ Erreur récupération données :", err);
  }
});

// ----------------------
// Utils & actions
// ----------------------
function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function acceptMission() {
  await updateStatus("validated", "Impossible d'accepter la mission");
}
async function rejectMission() {
  await updateStatus("refused", "Impossible de refuser la mission");
}
async function markRealized() {
  await updateStatus(
    "realized",
    "Impossible de marquer la mission comme réalisée"
  );
}

async function updateStatus(
  status: MissionWithRelations["status"],
  errorMsg: string
) {
  loading.value = true;
  try {
    await updateMission(props.mission.id, { status });
    emit("updated");
  } catch (err) {
    console.error(errorMsg, err);
    alert("❌ " + errorMsg);
  } finally {
    loading.value = false;
  }
}

// ----------------------
// Facturation handlers
// ----------------------
function createDevis() {
  console.log("📝 Générer un devis pour mission", props.mission.id);
}
function createFacture() {
  showFactureModal.value = true;
}
function handleFactureGenerated(f: FactureWithRelations) {
  facture.value = f;
  showFactureModal.value = false;
}
function handleFactureDeleted() {
  facture.value = null;
}
function handleFactureUpdated(f: FactureWithRelations) {
  facture.value = f;
}
function handleFactureEdit(f: FactureWithRelations) {
  console.log("✏️ Edit facture :", f);
}
function markPaid() {
  console.log("💰 Marquer mission comme payée", props.mission.id);
}
function closeMission() {
  console.log("📦 Clore mission", props.mission.id);
}
</script>
