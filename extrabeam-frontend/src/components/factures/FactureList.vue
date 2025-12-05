<!-- src/components/factures/FactureList.vue -->
<!-- -------------------------------------------------------------
 Liste des factures (FactureList)
---------------------------------------------------------------

📌 Description :
 - Affiche les factures d’une entreprise OU d’un client
 - Client → lecture seule
 - Entreprise owner/Admin → accès complet

--------------------------------------------------------------- -->

<template>
  <div class="space-y-4 mt-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold text-gray-800">📑 Factures</h2>

      <!-- Bouton + (ajout facture manuelle) -->
      <div class="flex items-center" v-if="canAddFacture">
        <button
          @click="openModal = true"
          class="p-2 rounded-full hover:bg-back-100 transition"
          aria-label="Ajouter une facture"
        >
          <svg
            class="w-6 h-6 text-back-600"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-gray-500 italic">
      Chargement des factures...
    </div>

    <!-- Vide -->
    <div v-else-if="factures.length === 0" class="text-gray-500 italic">
      Aucune facture pour le moment.
    </div>

    <!-- Liste -->
    <div v-else class="grid gap-3">
      <FactureCard
        v-for="f in factures"
        :key="f.id"
        :facture="f"
        :entreprise="entreprise"
        :readonly="props.readonly ?? isReadonly"
        @edit="onEdit"
        @deleted="onDeleted"
        @updated="onUpdated"
      />
    </div>

    <!-- Modal : création de facture sans mission -->
    <FactureModal
      v-if="openModal"
      :open="openModal"
      :entreprise="entreprise"
      :mission="null"
      @close="openModal = false"
      @created="onFactureCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useFactures } from "../../composables/useFactures";
import { useAuth } from "../../composables/useAuth";
import FactureCard from "./FactureCard.vue";
import FactureModal from "./FactureModal.vue";
import type { FactureWithRelations } from "../../services/factures";

// ----------------------
// Props & Emits
// ----------------------
const props = defineProps<{
  entreprise?: any; // Possibly undefined when we are on client page
  readonly?: boolean;
  factures?: FactureWithRelations[];
}>();

const emit = defineEmits(["edit", "deleted", "updated"]);

// ----------------------
// Composables
// ----------------------
const { user } = useAuth();
const {
  factures: storeFactures,
  loading: storeLoading,
  fetchFactures,
} = useFactures();

const hasExternalFactures = computed(() => props.factures !== undefined);
const externalFactures = ref<FactureWithRelations[]>([]);

watch(
  () => props.factures,
  (value) => {
    externalFactures.value = value ? [...value] : [];
  },
  { immediate: true, deep: true }
);

const factures = computed(() =>
  hasExternalFactures.value ? externalFactures.value : storeFactures.value
);
const loading = computed(() =>
  hasExternalFactures.value ? false : storeLoading.value
);

// ----------------------
// State
// ----------------------
const openModal = ref(false);

// ----------------------
// Access Control
// ----------------------
/**
 * canAddFacture → vrai si user est admin OU owner de l'entreprise.
 */
const canAddFacture = computed(() => {
  if (!user.value || !props.entreprise) return false;

  // Admin → accès total
  if (user.value.role === "admin") return true;

  // Owner entreprise → accès complet
  return user.value.entreprise_id === props.entreprise.id;
});

/**
 * isReadonly = true lorsque l'utilisateur ne peut PAS modifier les factures.
 * → utilisé pour configurer FactureCard
 */
const isReadonly = computed(() => !canAddFacture.value);

// ----------------------
// Lifecycle
// ----------------------
onMounted(() => {
  if (!hasExternalFactures.value) {
    fetchFactures();
  }
});

// ----------------------
// Handlers
// ----------------------
function onEdit(facture: any) {
  emit("edit", facture);
}

function onDeleted(id: number) {
  if (hasExternalFactures.value) {
    externalFactures.value = externalFactures.value.filter((f) => f.id !== id);
  }
  emit("deleted", id);
}

function onUpdated(facture: FactureWithRelations) {
  if (hasExternalFactures.value) {
    externalFactures.value = externalFactures.value.map((f) =>
      f.id === facture.id ? facture : f
    );
  }
  emit("updated", facture);
}

async function onFactureCreated(facture: FactureWithRelations) {
  openModal.value = false;
  if (hasExternalFactures.value) {
    externalFactures.value = [facture, ...externalFactures.value];
    emit("updated", facture);
    return;
  }
  await fetchFactures();
}
</script>
