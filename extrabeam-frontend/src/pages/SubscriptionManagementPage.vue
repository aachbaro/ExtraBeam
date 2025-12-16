<template>
  <div class="min-h-screen bg-gray-50 px-4 py-10">
    <div class="max-w-2xl mx-auto">
      <div
        v-if="loadingState"
        class="bg-white shadow-lg border border-gray-200 rounded-2xl p-8 animate-pulse"
      >
        <div class="flex justify-between items-center mb-6">
          <div>
            <div class="h-4 w-32 bg-gray-200 rounded mb-2" />
            <div class="h-6 w-48 bg-gray-200 rounded" />
          </div>
          <div class="h-8 w-24 bg-gray-200 rounded-full" />
        </div>
        <div class="space-y-3">
          <div class="h-4 w-full bg-gray-200 rounded" />
          <div class="h-4 w-5/6 bg-gray-200 rounded" />
          <div class="h-4 w-3/4 bg-gray-200 rounded" />
        </div>
        <div class="mt-8 space-y-3">
          <div class="h-4 w-40 bg-gray-200 rounded" />
          <div class="h-4 w-1/3 bg-gray-200 rounded" />
        </div>
        <div class="mt-8 h-11 bg-gray-200 rounded-lg" />
      </div>

      <div
        v-else
        class="bg-white shadow-lg border border-gray-200 rounded-2xl p-8 flex flex-col gap-6"
      >
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p class="text-sm text-gray-500">Gestion de l’abonnement</p>
            <h1 class="text-2xl font-semibold text-gray-900">Mon abonnement ExtraBeam</h1>
          </div>
          <span
            class="inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full border"
            :class="[statusClasses.bg, statusClasses.text, statusClasses.border]"
          >
            {{ statusLabel }}
          </span>
        </div>

        <p class="text-gray-700 leading-relaxed">{{ statusDescription }}</p>

        <div
          v-if="subscription.error"
          class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          Impossible de charger le statut d’abonnement : {{ subscription.error }}
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p class="text-sm text-gray-500">Formule</p>
            <p class="text-lg font-semibold text-gray-900">{{ planLabel }}</p>
          </div>

          <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p class="text-sm text-gray-500">Fin de période</p>
            <p class="text-lg font-semibold text-gray-900">
              {{ periodEndLabel }}
            </p>
          </div>
        </div>

        <div v-if="actionError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{{ actionError }}</p>
          <p v-if="isForbidden && slug" class="mt-2">
            <a
              class="font-semibold text-indigo-700 hover:text-indigo-800 underline"
              :href="`/entreprise/${slug}`"
            >
              Retourner à l’espace entreprise
            </a>
          </p>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="text-sm text-gray-500">
            Vous pouvez gérer votre abonnement à tout moment depuis cette page, même si votre
            accès est actuellement bloqué.
          </div>

          <button
            class="inline-flex items-center justify-center px-5 py-3 text-sm font-semibold rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            :class="actionButtonClasses"
            :disabled="actionDisabled"
            @click="redirectToCheckout"
          >
            <span v-if="actionLoading" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            {{ actionLabel }}
          </button>
        </div>

        <p class="text-xs text-gray-500 text-right">{{ actionHelperText }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { request, ApiError } from "@/services/api";
import { useSubscriptionStore } from "@/stores/subscription.store";

type CheckoutIntent = "subscribe" | "reactivate" | "change";

const route = useRoute();
const router = useRouter();
const subscription = useSubscriptionStore();

const actionLoading = ref(false);
const actionError = ref<string | null>(null);
const redirectLocked = ref(false);
const isForbidden = ref(false);

const slug = computed(() => route.params.slug as string | undefined);

const hasCheckoutParams = computed(() =>
  route.query.success === "1" || typeof route.query.session_id === "string",
);

const loadingState = computed(
  () => subscription.loading || (!subscription.hasLoadedOnce && !subscription.error),
);

function cleanStripeQueryParams() {
  const cleanedQuery = { ...route.query };
  delete cleanedQuery.success;
  delete cleanedQuery.session_id;
  router.replace({ path: route.path, query: cleanedQuery, params: route.params });
}

onMounted(async () => {
  // When returning from Stripe (success/session), force refresh to sync state then clean the URL
  if (hasCheckoutParams.value) {
    await refreshSubscription(true);
  } else if (!subscription.hasLoadedOnce) {
    await subscription.refresh();
  }
});

async function refreshSubscription(force = false) {
  await subscription.refresh({ force });

  if (force) {
    cleanStripeQueryParams();
  }
}

const checkoutIntent = computed<CheckoutIntent>(() => {
  switch (subscription.status) {
    case "active":
      return "change";
    case "past_due":
    case "canceled":
      return "reactivate";
    case "incomplete":
    case null:
    default:
      return "subscribe";
  }
});

const statusLabel = computed(() => {
  switch (subscription.status) {
    case "active":
      return "Actif";
    case "trialing":
      return "Période d’essai";
    case "past_due":
      return "Paiement en attente";
    case "canceled":
      return "Résilié";
    case "incomplete":
      return "Incomplet";
    default:
      return "Non défini";
  }
});

const statusDescription = computed(() => {
  switch (subscription.status) {
    case "active":
      return "Votre abonnement est actif. Vous bénéficiez de toutes les fonctionnalités ExtraBeam.";
    case "trialing":
      return "Votre période d’essai est en cours. Choisissez une formule pour continuer sans interruption.";
    case "past_due":
      return "Un paiement est en attente. Veuillez régulariser votre abonnement pour rétablir l’accès.";
    case "canceled":
      return "Votre abonnement est résilié. Vous pouvez le réactiver à tout moment.";
    case "incomplete":
      return "Votre abonnement n’a pas été finalisé. Une étape de paiement est requise.";
    default:
      return "Aucune information d’abonnement n’a été trouvée.";
  }
});

const statusClasses = computed(() => {
  switch (subscription.status) {
    case "active":
      return {
        bg: "bg-green-50",
        text: "text-green-800",
        border: "border-green-200",
      };
    case "trialing":
      return {
        bg: "bg-blue-50",
        text: "text-blue-800",
        border: "border-blue-200",
      };
    case "past_due":
      return {
        bg: "bg-amber-50",
        text: "text-amber-800",
        border: "border-amber-200",
      };
    case "canceled":
      return {
        bg: "bg-gray-50",
        text: "text-gray-800",
        border: "border-gray-200",
      };
    case "incomplete":
      return {
        bg: "bg-orange-50",
        text: "text-orange-800",
        border: "border-orange-200",
      };
    default:
      return {
        bg: "bg-gray-50",
        text: "text-gray-800",
        border: "border-gray-200",
      };
  }
});

const planLabel = computed(() => {
  switch (subscription.plan) {
    case "monthly":
      return "Mensuelle";
    case "annual":
      return "Annuelle";
    default:
      return "Non défini";
  }
});

const periodEndLabel = computed(() => {
  if (!subscription.periodEnd) return "—";
  const date = new Date(subscription.periodEnd);
  if (Number.isNaN(date.getTime())) return subscription.periodEnd;

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
});

const actionLabel = computed(() => {
  if (subscription.isActive) return "Changer de formule";
  if (subscription.status === "past_due" || subscription.status === "canceled") {
    return "Réactiver mon abonnement";
  }

  return "S’abonner";
});

const actionButtonClasses = computed(() => {
  const base = "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed";
  return base;
});

const actionHelperText = computed(() => {
  switch (checkoutIntent.value) {
    case "change":
      return "Vous serez redirigé vers Stripe pour ajuster votre formule.";
    case "reactivate":
      return "Vous serez redirigé vers Stripe pour réactiver votre abonnement.";
    default:
      return "Vous serez redirigé vers Stripe. Aucun paiement immédiat sans confirmation.";
  }
});

const actionDisabled = computed(
  () => actionLoading.value || redirectLocked.value || !slug.value,
);

async function redirectToCheckout() {
  if (actionDisabled.value) return;
  if (!slug.value) {
    actionError.value = "Impossible de récupérer le slug de l’entreprise.";
    return;
  }

  actionLoading.value = true;
  actionError.value = null;
  isForbidden.value = false;

  try {
    // Inform backend of the user’s intent (subscribe / reactivate / change)
    const data = await request<{ url: string }>(`/api/subscription/${slug.value}`, {
      method: "POST",
      body: JSON.stringify({ intent: checkoutIntent.value }),
    });

    if (!data.url) {
      throw new Error("Aucune URL de paiement n’a été retournée.");
    }

    redirectLocked.value = true;
    window.location.href = data.url;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        actionError.value =
          "Vous n’êtes pas autorisé à gérer cet abonnement. Retournez à votre espace entreprise.";
        isForbidden.value = true;
      } else {
        actionError.value =
          err.body?.message || err.body?.error || "Une erreur est survenue lors de la redirection.";
      }
    } else if (err instanceof Error) {
      actionError.value = err.message;
    } else {
      actionError.value = "Une erreur inattendue est survenue.";
    }
  } finally {
    if (!redirectLocked.value) {
      actionLoading.value = false;
    }
  }
}
</script>
