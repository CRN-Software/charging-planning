<script setup lang="ts">
import { fmtH, type Link } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { linkText } from '~/utils/labels';

const props = defineProps<{ link: Link }>();
const store = useHouseholdStore();
const text = computed(() => linkText(props.link, store.household));
</script>

<template>
  <button
    class="gap"
    :class="link.stay ? 'stay' : 'home'"
    type="button"
    :title="link.label"
    @click="store.toggleGap(link.id, link.stay)"
  >
    <span
      ><span aria-hidden="true">{{ text.icon }} </span>{{ text.text
      }}<span class="muted"> {{ fmtH(link.from) }}–{{ fmtH(link.to) }}{{ text.origin }}</span></span
    >
    <span class="gap-action">{{ text.action }}</span>
  </button>
</template>
