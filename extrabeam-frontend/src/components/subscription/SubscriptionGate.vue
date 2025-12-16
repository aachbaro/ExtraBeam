<template>
  <div
    v-if="isLoading"
    class="min-h-[60vh] w-full flex items-center justify-center bg-gray-50 px-4 py-10"
  >
    <div
      class="max-w-2xl w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-8"
    >
      <div class="animate-pulse space-y-4">
        <div class="h-3 w-28 bg-gray-200 rounded" />
        <div class="h-6 w-2/3 bg-gray-200 rounded" />
        <div class="h-4 w-full bg-gray-200 rounded" />
        <div class="h-4 w-5/6 bg-gray-200 rounded" />
        <div class="flex gap-3">
          <div class="h-10 flex-1 bg-gray-200 rounded" />
          <div class="h-10 flex-1 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  </div>

  <slot v-else-if="showContent" :locked="isLocked" />

  <div
    v-else
    class="min-h-[60vh] w-full flex items-center justify-center bg-gray-50 px-4 py-10"
  >
    <div
      class="max-w-2xl w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6"
    >
      <div class="space-y-2 text-center">
        <p class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Accès réservé aux abonnés
        </p>
        <h2 class="text-2xl font-bold text-gray-900">
          Activez ExtraBeam pour continuer
        </h2>
        <p class="text-gray-600 leading-relaxed">
          {{ statusDescription }}
        </p>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 items-center justify-center text-sm">
        <span
          v-if="statusLabel"
          class="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-gray-700"
        >
          <span class="h-2 w-2 rounded-full bg-emerald-500" />
          {{ statusLabel }}
        </span>
        <span v-if="subscription.periodEnd" class="text-gray-500">
          Accès valable jusqu'au {{ formattedPeriodEnd }}
        </span>
      </div>

      <div class="grid gap-2 text-sm text-gray-600">
        <div class="flex items-center gap-2">
          <span class="text-emerald-500">✔</span>
          <span>Planning, missions et factures accessibles sans interruption.</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-emerald-500">✔</span>
          <span>Synchronisation sécurisée de vos données entreprise.</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-emerald-500">✔</span>
          <span>Support prioritaire ExtraBeam.</span>
        </div>
      </div>

      <div class="space-y-3">
        <button
          type="button"
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-white font-semibold shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          :disabled="isCheckoutDisabled"
          @click="startCheckout"
        >
          <span
            v-if="checkoutLoading"
            class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
          />
          <span>{{ checkoutLoading ? "Redirection..." : "S'abonner" }}</span>
        </button>

        <p v-if="!entrepriseSlug" class="text-sm text-red-600 text-center">
          Impossible d'identifier l'entreprise courante.
        </p>
        <p v-if="errorMessage" class="text-sm text-red-600 text-center">
          {{ errorMessage }}
        </p>
      </div>

      <p class="text-xs text-center text-gray-500">
        Aucun prélèvement sans confirmation. Vous serez redirigé vers une page de paiement sécurisée.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { ApiError, request } from "@/services/api";
import { useSubscriptionStore } from "@/stores/subscription.store";

const props = defineProps<{ slug?: string; mode?: "hard" | "soft" }>();

const route = useRoute();
const subscription = useSubscriptionStore();

const checkoutLoading = ref(false);
const checkoutLocked = ref(false);
const errorMessage = ref<string | null>(null);

const entrepriseSlug = computed(() => {
  const propSlug = props.slug?.trim();
  const routeSlug = route.params.slug as string | undefined;
  const refSlug = route.params.ref as string | undefined;
  return propSlug || routeSlug || refSlug || "";
});

const isLoading = computed(() => subscription.loading || !subscription.hasLoadedOnce);
const isLocked = computed(() => !subscription.hasAccess);
const showContent = computed(() => props.mode === "soft" || subscription.hasAccess);
const isCheckoutDisabled = computed(
  () =>
    checkoutLoading.value ||
    checkoutLocked.value ||
    !entrepriseSlug.value ||
    subscription.loading
);

const statusLabel = computed(() => {
  if (subscription.status === "trialing" || subscription.isTrial) {
    return "Période d'essai en cours";
  }

  if (subscription.status === "past_due") {
    return "Paiement en attente";
  }

  if (subscription.status === "incomplete") {
    return "Paiement incomplet";
  }

  if (subscription.status === "canceled") {
    return "Abonnement expiré";
  }

  return null;
});

const statusDescription = computed(() => {
  if (subscription.status === "trialing" || subscription.isTrial) {
    return "Votre période d'essai est active. Souscrivez dès maintenant pour conserver vos accès sans interruption.";
  }

  switch (subscription.status) {
    case "past_due":
      return "Votre dernier paiement n'a pas abouti. Finalisez l'abonnement pour réactiver vos outils.";
    case "incomplete":
      return "Une étape de paiement reste à valider avant d'accéder à l'espace entreprise.";
    case "canceled":
      return "Votre abonnement est résilié. Réactivez-le pour débloquer toutes les fonctionnalités.";
    default:
      return "L'espace entreprise est réservé aux comptes abonnés. Choisissez une formule pour continuer.";
  }
});

const formattedPeriodEnd = computed(() => {
  if (!subscription.periodEnd) return "";
  try {
    return new Date(subscription.periodEnd).toLocaleDateString();
  } catch (err) {
    console.error("Unable to parse periodEnd", err);
    return subscription.periodEnd;
  }
});

const startCheckout = async () => {
  if (checkoutLoading.value || checkoutLocked.value) return;

  if (!entrepriseSlug.value) {
    errorMessage.value = "Impossible de déterminer l'entreprise à abonner.";
    return;
  }

  checkoutLoading.value = true;
  errorMessage.value = null;

  try {
    const { url } = await request<{ url: string; sessionId: string }>(
      `/api/subscription/${entrepriseSlug.value}`,
      { method: "POST" }
    );

    if (url) {
      checkoutLocked.value = true;
      window.location.href = url;
      return;
    }

    errorMessage.value = "Aucune URL de paiement reçue.";
  } catch (err) {
    console.error("Erreur lors de l'initialisation du checkout", err);
    if (err instanceof ApiError && err.body?.error) {
      errorMessage.value = err.body.error;
    } else {
      errorMessage.value =
        err instanceof Error
          ? err.message
          : "Impossible d'initialiser la page de paiement.";
    }
  } finally {
    checkoutLoading.value = false;
  }
};
</script>
