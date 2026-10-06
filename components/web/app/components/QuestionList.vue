<script setup lang="ts">
import type { Day } from '@charging/planner';
import type { RelevantQuestion } from '~/composables/use-plan';
import { useHouseholdStore } from '~/stores/household';
import { impact } from '~/utils/labels';
import { modeLabel } from '~/utils/plan';

defineProps<{ questions: readonly RelevantQuestion[]; days: readonly Day[] }>();
const store = useHouseholdStore();
</script>

<template>
  <section class="card">
    <h2>
      À valider<span v-if="questions.length" class="count">{{ questions.length }}</span>
    </h2>
    <div>
      <div v-for="q in questions" :key="q.group" class="q">
        <span class="eyebrow">{{ days[q.d]?.label }}</span>
        <b>{{ q.title }}</b>
        <p>{{ q.text }}</p>
        <div class="opts">
          <button
            v-for="r in q.results"
            :key="r.mode"
            class="opt"
            type="button"
            @click="store.setMode(q.group, r.mode)"
          >
            <span
              >{{ modeLabel(store.household, r.mode)
              }}<em v-if="r.mode === q.current"> supposé</em></span
            >
            <small>{{ impact(r.plan) }}</small>
          </button>
        </div>
      </div>
      <p v-if="!questions.length" class="empty">
        Rien qui change le plan de recharge. Touchez un trajet pour le corriger.
      </p>
    </div>
  </section>
</template>
