<template>
  <slot />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useSubscriptionStore } from "@/stores/subscription.store";

const subscriptionStore = useSubscriptionStore();

onMounted(() => {
  void subscriptionStore.refresh();
});
</script>
