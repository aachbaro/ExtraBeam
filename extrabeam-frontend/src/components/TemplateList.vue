<!-- src/components/TemplateList.vue -->
<!-- -------------------------------------------------------------
 Liste des modèles de mission (TemplateList)
---------------------------------------------------------------
📌 Description :
 - Liste tous les modèles du client connecté
 - Chaque modèle est affiché via TemplateCard.vue
 - Une carte spéciale "➕ Nouveau modèle" permet d’ajouter un template

🔒 Règles d’accès :
 - Accessible uniquement au client propriétaire
--------------------------------------------------------------- -->

<template>
  <div class="space-y-4">
    <!-- Liste des modèles -->
    <div v-if="templates.length" class="grid gap-4">
      <TemplateCard
        v-for="tpl in templates"
        :key="tpl.id"
        :template="tpl"
        @updated="handleUpdated"
        @deleted="handleDeleted"
      />
    </div>
    <p v-else class="text-gray-500">Aucun modèle enregistré pour le moment.</p>

    <!-- Carte "Nouveau modèle" -->
    <div
      class="border rounded-lg p-4 cursor-pointer hover:shadow-md transition bg-gray-50"
      @click="toggleForm"
    >
      <div class="flex justify-center items-center text-gray-600">
        <span v-if="!showForm" class="text-lg font-semibold">
          ➕ Nouveau modèle
        </span>
      </div>

      <transition name="fade">
        <div v-if="showForm" class="mt-4" @click.stop>
          <ClientTemplateForm @created="handleCreated" @cancel="toggleForm" />
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import TemplateCard from "./TemplateCard.vue";
import ClientTemplateForm from "./ClientTemplateForm.vue";
import { listTemplates, type MissionTemplate } from "../services/templates";
import { useAuth } from "../composables/useAuth";

const templates = ref<MissionTemplate[]>([]);
const showForm = ref(false);
const { user } = useAuth();

// ----------------------
// Lifecycle
// ----------------------
onMounted(async () => {
  await fetchTemplates();
});

async function fetchTemplates() {
  if (!user.value) return;
  try {
    const { templates: data } = await listTemplates();
    templates.value = data;
  } catch (err) {
    console.error("❌ Erreur récupération templates :", err);
  }
}

// ----------------------
// Actions
// ----------------------
function toggleForm() {
  showForm.value = !showForm.value;
}

function handleCreated(newTemplate: MissionTemplate) {
  templates.value.push(newTemplate);
  showForm.value = false;
}

function handleUpdated(updated: MissionTemplate) {
  const idx = templates.value.findIndex((t) => t.id === updated.id);
  if (idx !== -1) templates.value[idx] = updated;
}

function handleDeleted(id: number) {
  templates.value = templates.value.filter((t) => t.id !== id);
}
</script>
