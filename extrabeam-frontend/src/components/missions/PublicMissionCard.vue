<template>
  <ExpandableCard
    v-model:expanded="expanded"
    class="p-4 hover:shadow-md w-full"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-semibold text-gray-900">
          📩 Proposer une mission
        </h3>
      </div>
    </template>

    <template #indicator></template>

    <div class="mt-4 space-y-4">
      <!-- Sélection du modèle -->
      <div v-if="templates.length" class="space-y-1">
        <label class="text-sm font-medium">Utiliser un modèle</label>
        <select
          v-model="selectedTemplateId"
          @change="applyTemplate"
          class="input"
        >
          <option value="">-- Aucun --</option>
          <option v-for="t in templates" :key="t.id" :value="t.id">
            {{ t.nom }}
          </option>
        </select>
      </div>

      <!-- Établissement -->
      <div>
        <label class="text-sm font-medium">Établissement</label>
        <input
          v-model="form.etablissement"
          type="text"
          :class="[
            'input',
            invalid && !form.etablissement ? 'border-red-500' : '',
          ]"
          placeholder="Nom de l’établissement"
        />
      </div>

      <!-- Adresse -->
      <div>
        <label class="text-sm font-medium">Adresse</label>
        <input
          v-model="form.adresseLigne1"
          :class="[
            'input',
            invalid && !form.adresseLigne1 ? 'border-red-500' : '',
          ]"
          placeholder="Adresse ligne 1"
        />
        <input
          v-model="form.adresseLigne2"
          class="input mt-2"
          placeholder="Adresse ligne 2 (optionnel)"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <input
          v-model="form.codePostal"
          :class="[
            'input',
            invalid && !form.codePostal ? 'border-red-500' : '',
          ]"
          placeholder="Code postal"
        />
        <input
          v-model="form.ville"
          :class="['input', invalid && !form.ville ? 'border-red-500' : '']"
          placeholder="Ville"
        />
      </div>

      <!-- Contact -->
      <div class="grid grid-cols-2 gap-3">
        <input
          v-model="form.contactPhone"
          type="tel"
          class="input"
          placeholder="Téléphone"
        />
        <input
          v-model="form.contactEmail"
          type="email"
          :class="[
            'input',
            invalid && !form.contactEmail ? 'border-red-500' : '',
          ]"
          placeholder="Email"
        />
      </div>

      <input
        v-model="form.contactName"
        class="input"
        placeholder="Nom du contact"
      />

      <!-- Instructions -->
      <textarea
        v-model="form.instructions"
        rows="3"
        class="input"
        placeholder="Informations sur la mission"
      ></textarea>

      <!-- Créneau unique (pour simplifier) -->
      <div class="border p-3 rounded-md space-y-2">
        <label class="text-sm font-medium">Créneau</label>

        <div class="grid grid-cols-2 gap-3">
          <input
            type="date"
            v-model="slot.startDate"
            :class="[
              'input',
              invalid && !slot.startDate ? 'border-red-500' : '',
            ]"
          />
          <input
            type="date"
            v-model="slot.endDate"
            :class="['input', invalid && !slot.endDate ? 'border-red-500' : '']"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <input
            type="time"
            v-model="slot.startTime"
            step="900"
            class="input"
          />
          <input type="time" v-model="slot.endTime" step="900" class="input" />
        </div>
      </div>

      <!-- Submit -->
      <button
        class="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50"
        :disabled="pending || invalid"
        @click="send"
      >
        {{ pending ? "Envoi..." : "Envoyer la mission" }}
      </button>
    </div>
  </ExpandableCard>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { createPublicMission } from "@/services/missions";
import { listTemplates, type MissionTemplate } from "@/services/templates";
import { useAuth } from "@/composables/useAuth";
import ExpandableCard from "../ui/ExpandableCard.vue";

const props = defineProps<{
  entrepriseSlug: string;
}>();

const emit = defineEmits(["created"]);

const { user, ready } = useAuth();

const expanded = ref(false);
const pending = ref(false);

const templates = ref<MissionTemplate[]>([]);
const selectedTemplateId = ref<number | "">("");

// ----- Formulaire -----
const initialFormState = {
  etablissement: "",
  adresseLigne1: "",
  adresseLigne2: "",
  codePostal: "",
  ville: "",
  pays: "France",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  instructions: "",
};

const form = ref({ ...initialFormState });

const initialSlotState = {
  startDate: "",
  endDate: "",
  startTime: "12:00",
  endTime: "14:00",
};

const slot = ref({ ...initialSlotState });

// Validation
const invalid = computed(() => {
  if (
    !form.value.etablissement ||
    !form.value.adresseLigne1 ||
    !form.value.codePostal ||
    !form.value.ville ||
    !form.value.contactEmail ||
    !slot.value.startDate ||
    !slot.value.endDate
  ) {
    return true;
  }
  return false;
});

watch(expanded, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
});

async function loadTemplates() {
  if (templates.value.length) return;
  await ready();

  if (user.value?.role !== "client") {
    console.warn("⚠️ Aucun template chargé : utilisateur non client ou non connecté");
    return;
  }

  try {
    const { templates: data } = await listTemplates();
    templates.value = data;

    if (!data.length) {
      console.warn("ℹ️ Aucun template trouvé pour ce client");
    }
  } catch (err) {
    console.error("❌ Erreur chargement templates:", err);
  }
}

onMounted(loadTemplates);
watch(user, (u) => {
  if (u?.role === "client" && !templates.value.length) {
    loadTemplates();
  }
});

function applyTemplate() {
  const t = templates.value.find((x) => x.id === selectedTemplateId.value);
  if (!t) return;

  form.value.etablissement = t.etablissement;
  form.value.adresseLigne1 = t.etablissement_adresse_ligne1 || "";
  form.value.adresseLigne2 = t.etablissement_adresse_ligne2 || "";
  form.value.codePostal = t.etablissement_code_postal || "";
  form.value.ville = t.etablissement_ville || "";
  form.value.pays = t.etablissement_pays || "";

  form.value.contactName = t.contact_name || "";
  form.value.contactEmail = t.contact_email || "";
  form.value.contactPhone = t.contact_phone || "";

  form.value.instructions = t.instructions || "";
}

// Envoi
async function send() {
  pending.value = true;
  try {
    const payload = {
      etablissement: form.value.etablissement,

      etablissement_adresse_ligne1: form.value.adresseLigne1,
      etablissement_adresse_ligne2: form.value.adresseLigne2 || null,
      etablissement_code_postal: form.value.codePostal,
      etablissement_ville: form.value.ville,
      etablissement_pays: form.value.pays,

      contact_name: form.value.contactName,
      contact_email: form.value.contactEmail,
      contact_phone: form.value.contactPhone,

      instructions: form.value.instructions || null,
      mode: "freelance",

      entreprise_ref: props.entrepriseSlug, // ✔ transformé automatiquement → entrepriseRef par DTO

      slots: [
        {
          start: new Date(
            `${slot.value.startDate}T${slot.value.startTime}`
          ).toISOString(),
          end: new Date(
            `${slot.value.endDate}T${slot.value.endTime}`
          ).toISOString(),
          title: null,
        },
      ],
    };

    const { mission } = await createPublicMission(payload);

    emit("created", mission);
    alert("Votre mission a bien été envoyée !");
    expanded.value = false;
    resetForm();
  } catch (err) {
    console.error("❌ Erreur création mission :", err);
    alert("Erreur lors de l’envoi.");
  } finally {
    pending.value = false;
  }
}

function resetForm() {
  form.value = { ...initialFormState };
  slot.value = { ...initialSlotState };
}
</script>

<style scoped>
.input {
  @apply w-full rounded-lg border border-gray-300 px-3 py-2;
}
</style>
