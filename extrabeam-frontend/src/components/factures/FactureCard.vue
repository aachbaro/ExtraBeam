<!-- src/components/factures/FactureCard.vue -->
<!-- -------------------------------------------------------------
 Carte d’une facture (FactureCard)
 ---------------------------------------------------------------
 📌 Description :
 - Affiche les détails d’une facture (client, montant, statut, lien paiement)
 - Entreprise (readonly = false) → peut éditer, supprimer, générer lien
 - Client       (readonly = true) → lecture seule : PDF + payer
 ------------------------------------------------------------- -->

<template>
  <ExpandableCard v-model:expanded="expanded" class="p-4 hover:shadow-md">
    <template #header>
      <div
        class="grid grid-cols-3 items-center w-full text-center sm:text-left"
      >
        <!-- Gauche : numéro de facture -->
        <h3 class="font-semibold text-lg text-gray-900 truncate">
          📄 {{ facture.numero }}
        </h3>

        <!-- Centre : nom du restaurant / client -->
        <p
          class="text-sm bg-gray-100 px-2 py-1 rounded-full inline-flex justify-center w-full sm:w-auto mx-auto sm:mx-0"
        >
          <b class="truncate">{{ facture.client_name }}</b>
        </p>

        <!-- Droite : statut -->
        <span
          class="inline-flex items-center justify-center px-2 py-1 text-xs rounded-full w-max sm:justify-self-end mx-auto sm:mx-0"
          :class="statusClasses[facture.status]"
        >
          {{ statusLabels[facture.status] || facture.status }}
        </span>
      </div>
    </template>

    <template #indicator></template>

    <div class="mt-3 space-y-3 text-sm text-gray-700">
      <!-- Infos facture -->
      <div
        class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-sm font-semibold">
          TTC : {{ facture.montant_ttc.toFixed(2) }} €
        </p>
        <p class="text-sm text-gray-600">
          {{ formatDate(facture.date_emission) }}
        </p>
      </div>

      <!-- Paiement -->
      <div v-if="facture.payment_link" class="text-sm mt-2">
        <a
          :href="facture.payment_link"
          target="_blank"
          class="flex items-center gap-1 text-blue-600 hover:underline"
          @click.stop
        >
          <Icon name="link" class="w-4 h-4" />
          Accéder au paiement
        </a>
      </div>

      <!-- Actions -->
      <div class="flex justify-between gap-2 pt-3">
        <!-- Toujours disponible : PDF -->
        <button class="btn-primary p-1" @click.stop="downloadPdf">
          <Icon name="download" class="w-4 h-4" />
        </button>

        <!-- Actions réservées ENTREPRISE (readonly = false) -->
        <div v-if="!effectiveReadonly" class="flex gap-2">
          <!-- Générer / régénérer lien -->
          <button
            v-if="!facture.payment_link"
            class="btn-primary p-1 text-sm"
            @click.stop="onPaymentLink"
          >
            Générer lien
          </button>

          <button v-else class="btn-primary p-1" @click.stop="onPaymentLink">
            <Icon name="arrow-path" class="w-4 h-4" />
          </button>

          <!-- Edit -->
          <button class="btn-primary p-1" @click.stop="$emit('edit', facture)">
            <Icon name="pencil" class="w-4 h-4" />
          </button>

          <!-- Delete -->
          <button
            class="btn-primary hover:bg-red-700 p-1"
            @click.stop="onDelete"
          >
            <Icon name="trash" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </ExpandableCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FactureWithRelations } from "../../services/factures";
import { useFactures } from "../../composables/useFactures";
import { generateFacturePdf } from "../../utils/pdf/facturePdf";
import { generateFacturePaymentLink } from "../../services/factures";
import Icon from "../ui/Icon.vue";
import ExpandableCard from "@/components/ui/ExpandableCard.vue";
import { useExpandableCard } from "@/composables/ui/useExpandableCard";

const props = defineProps<{
  facture: FactureWithRelations;
  entreprise?: any;
  readonly?: boolean; // true = client → actions interdites
}>();

const emit = defineEmits(["edit", "deleted", "updated"]);

const { removeFacture } = useFactures();
const { expanded } = useExpandableCard();

const effectiveReadonly = computed(() => {
  // Si le parent force readonly → priorité
  if (props.readonly === true) return true;

  // Sinon on utilise la logique du parent (ex: isReadonly)
  return props.readonly ?? false;
});

// Labels & styles
const statusLabels: Record<string, string> = {
  pending_payment: "Paiement en attente",
  paid: "Payée",
  cancelled: "Annulée",
};

const statusClasses: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const entrepriseForPdf = computed(() => {
  return props.entreprise || props.facture.missions?.entreprise || {};
});

// Utils
function formatDate(date: string) {
  return new Date(date).toLocaleDateString("fr-FR");
}

function downloadPdf() {
  try {
    generateFacturePdf(props.facture, entrepriseForPdf.value);
  } catch (err) {
    console.error("❌ PDF error:", err);
    alert("Impossible de générer le PDF.");
  }
}

async function onPaymentLink() {
  if (props.readonly) return; // Client → interdit
  try {
    const { url } = await generateFacturePaymentLink(props.facture.id);
    emit("updated", { ...props.facture, payment_link: url });
    alert("✅ Lien de paiement généré !");
  } catch (err) {
    console.error("❌ Payment link error:", err);
    alert("Impossible de générer le lien de paiement");
  }
}

async function onDelete() {
  if (props.readonly) return;
  if (!confirm("Supprimer cette facture ?")) return;

  try {
    await removeFacture(props.facture.id);
    emit("deleted", props.facture.id);
  } catch (err) {
    console.error("❌ Delete error:", err);
    alert("Erreur lors de la suppression");
  }
}
</script>
