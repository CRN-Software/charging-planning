<script setup lang="ts">
import { fmtH, type Gap } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { gapText } from '~/utils/labels';

const props = defineProps<{ gap: Gap }>();
const store = useHouseholdStore();
const text = computed(() => gapText(props.gap));
</script>

<template>
  <button
    class="gap"
    :class="gap.stay ? 'stay' : 'home'"
    type="button"
    :title="gap.label"
    @click="store.toggleGap(gap.id, gap.stay)"
  >
    <span
      >{{ text.text
      }}<span class="muted"> {{ fmtH(gap.from) }}–{{ fmtH(gap.to) }}{{ text.origin }}</span></span
    >
    <span class="gap-action">{{ text.action }}</span>
  </button>
</template>
