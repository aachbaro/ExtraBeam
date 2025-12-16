import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ApiError, request } from "@/services/api";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";
export type SubscriptionPlan = "monthly" | "annual";

interface SubscriptionStatusResponse {
  status: SubscriptionStatus | null;
  plan: SubscriptionPlan | null;
  periodEnd: string | null;
  isTrial: boolean;
  isActive: boolean;
}

export const useSubscriptionStore = defineStore("subscription", () => {
  const status = ref<SubscriptionStatus | null>(null);
  const plan = ref<SubscriptionPlan | null>(null);
  const periodEnd = ref<string | null>(null);
  const isTrial = ref<boolean>(false);
  const isActive = ref<boolean>(false);
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);
  const hasLoadedOnce = ref<boolean>(false);

  const resetState = () => {
    status.value = null;
    plan.value = null;
    periodEnd.value = null;
    isTrial.value = false;
    isActive.value = false;
    error.value = null;
  };

  const refresh = async ({ force = false }: { force?: boolean } = {}) => {
    if (hasLoadedOnce.value && !force) return;

    if (force) {
      hasLoadedOnce.value = false;
    }

    loading.value = true;
    error.value = null;

    try {
      const data = await request<SubscriptionStatusResponse>("/api/subscription/status");
      status.value = data.status;
      plan.value = data.plan;
      periodEnd.value = data.periodEnd;
      isTrial.value = data.isTrial;
      isActive.value = data.isActive;
      hasLoadedOnce.value = true;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        resetState();
        hasLoadedOnce.value = true;
        return;
      }

      error.value = err instanceof Error ? err.message : "Unknown error";
    } finally {
      loading.value = false;
    }
  };

  const reset = () => {
    resetState();
    loading.value = false;
    hasLoadedOnce.value = false;
  };

  const hasAccess = computed(() => isActive.value === true);

  return {
    status,
    plan,
    periodEnd,
    isTrial,
    isActive,
    loading,
    error,
    hasLoadedOnce,
    hasAccess,
    refresh,
    reset,
  };
});
