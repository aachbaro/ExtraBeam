<template>
  <ExpandableCard
    v-model:expanded="expanded"
    class="mt-6 p-6"
    :collapsible="hasDetails"
  >
    <template #header>
      <div>
        <div v-if="loading" class="text-sm text-gray-500 animate-pulse">
          Chargement du CV...
        </div>

        <template v-else>
          <CvProfile
            :profile="profile"
            :entreprise="entrepriseCv"
            :is-owner="isOwner"
            @updated="refresh"
          />
        </template>
      </div>
    </template>

    <template #indicator></template>

    <div v-if="!loading && hasDetails" class="space-y-8 mt-6">
      <div
        v-for="(section, index) in visibleSections"
        :key="section.key"
        class="fade-in"
        :style="{ animationDelay: `${index * delayStepInSeconds}s` }"
      >
        <component
          :is="section.component"
          v-bind="section.props"
          :entreprise-slug="entrepriseSlug"
          :is-owner="isOwner"
          @updated="refresh"
        />
      </div>
    </div>
  </ExpandableCard>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRefs, watch, type Component } from "vue";
import ExpandableCard from "@/components/ui/ExpandableCard.vue";
import { useExpandableCard } from "@/composables/ui/useExpandableCard";
import { useCv } from "./useCv";
import CvProfile from "./CvProfile.vue";
import CvSkills from "./CvSkills.vue";
import CvExperiences from "./CvExperiences.vue";
import CvEducation from "./CvEducation.vue";
import type { CvEntreprise } from "@/services/cv";

const props = defineProps<{
  entrepriseRef: string;
  entreprise: CvEntreprise | null;
  isOwner: boolean;
}>();

const { isOwner } = toRefs(props);
const { expanded, close } = useExpandableCard();
const loading = ref(false);

const { entreprise, profile, skills, experiences, education, fetchCv } =
  useCv();

const entrepriseCv = computed(
  () => props.entreprise ?? entreprise.value
);

const entrepriseSlug = computed(() =>
  entrepriseCv.value?.slug ?? props.entrepriseRef
);

type SectionKey = "skills" | "experiences" | "education";

interface SectionConfig {
  key: SectionKey;
  component: Component;
  props: Record<string, unknown>;
  visible: boolean;
}

const delayStepInSeconds = 0.2;

const sections = computed<SectionConfig[]>(() => [
  {
    key: "skills",
    component: CvSkills,
    props: { skills: skills.value },
    visible: (skills.value?.length ?? 0) > 0 || isOwner.value,
  },
  {
    key: "experiences",
    component: CvExperiences,
    props: { experiences: experiences.value },
    visible: (experiences.value?.length ?? 0) > 0 || isOwner.value,
  },
  {
    key: "education",
    component: CvEducation,
    props: { education: education.value },
    visible: (education.value?.length ?? 0) > 0 || isOwner.value,
  },
]);

const visibleSections = computed(() => sections.value.filter((s) => s.visible));
const hasDetails = computed(() => visibleSections.value.length > 0);

async function refresh() {
  if (!props.entrepriseRef) return;

  try {
    loading.value = true;
    await fetchCv(props.entrepriseRef);
  } catch (error) {
    console.error("Erreur lors du chargement du CV", error);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.entrepriseRef,
  (nextRef, prevRef) => {
    if (nextRef && nextRef !== prevRef) {
      close();
      refresh();
    }
  }
);

watch(hasDetails, (value) => {
  if (!value) close();
});

onMounted(refresh);
</script>
