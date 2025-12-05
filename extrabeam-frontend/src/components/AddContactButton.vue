<!-- src/components/AddContactButton.vue -->
<!-- -------------------------------------------------------------
 Bouton "Ajouter en contact"
---------------------------------------------------------------
📌 Description :
 - Permet à un client d’ajouter une entreprise à sa liste de contacts
 - Vérifie si l’entreprise est déjà dans la liste → désactive le bouton

🔒 Règles d’accès :
 - Accessible uniquement aux utilisateurs role = client (auth requise)
--------------------------------------------------------------- -->

<template>
  <div class="w-full">
    <button
      class="w-full border border-black rounded-lg py-3 text-center text-lg font-medium hover:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-300 disabled:cursor-not-allowed"
      :disabled="loading || alreadyAdded"
      @click="handleAdd"
    >
      <span v-if="alreadyAdded">🤝 Déjà dans vos contacts</span>
      <span v-else-if="loading">⏳ Ajout en cours...</span>
      <span v-else>➕ Ajouter à mes contacts</span>
    </button>

    <p v-if="infoMessage" class="text-sm text-green-700 mt-2">{{ infoMessage }}</p>
    <p v-if="error" class="text-sm text-red-600 mt-2">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuth } from "../composables/useAuth";
import { addContact, listContacts } from "../services/contacts";

const props = defineProps<{
  entrepriseId: number;
}>();

const { user } = useAuth();

const loading = ref(false);
const alreadyAdded = ref(false);
const infoMessage = ref("");
const error = ref("");

onMounted(async () => {
  if (!user.value || user.value.role !== "client") return;
  try {
    const { contacts } = await listContacts();

    // Vérifie par rapport à l'id de l'entreprise liée
    alreadyAdded.value = contacts.some(
      (c) => c.entreprise?.id === props.entrepriseId
    );
    if (alreadyAdded.value) {
      infoMessage.value = "Cette entreprise est déjà dans vos contacts.";
    }
  } catch (err) {
    console.error("❌ Erreur chargement contacts:", err);
  }
});

async function handleAdd() {
  if (!user.value) {
    error.value = "Vous devez être connecté en tant que client.";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    // ✅ idem, on ne passe que l’entreprise
    const result = await addContact(props.entrepriseId);
    alreadyAdded.value = true;
    infoMessage.value =
      "message" in result
        ? `${result.message} ✉️ Un email de présentation a été envoyé.`
        : "Entreprise ajoutée à vos contacts. ✉️ Un email de présentation a été envoyé.";
  } catch (err: any) {
    console.error("❌ Erreur ajout contact:", err);
    error.value = err.message || "Erreur lors de l’ajout du contact.";
  } finally {
    loading.value = false;
  }
}
</script>
