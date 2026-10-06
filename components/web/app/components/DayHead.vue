<script setup lang="ts">
import { reservePct, type Day, type Plan } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { clamp } from '~/utils/format';
import { socAt } from '~/utils/plan';

const props = defineProps<{ plan: Plan; day: Day }>();
const store = useHouseholdStore();
const night = computed(() => socAt(props.plan, (props.day.d + 1) * 24, store.settings.soc));
</script>

<template>
  <div class="day-head" :class="{ we: day.weekend }">
    <h3>{{ day.label }}</h3>
    <span class="soc" :class="{ low: night < reservePct(store.settings) }" title="Batterie le soir">
      <i :style="{ width: `${clamp(night, 0, 100)}%` }" />
      <span class="num">{{ Math.round(night) }} %</span>
    </span>
  </div>
</template>
