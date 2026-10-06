<script setup lang="ts">
import { useHouseholdStore } from '~/stores/household';
import type { Slot, SlotKind } from '~/utils/calendar';
import { modeLabel } from '~/utils/plan';

const store = useHouseholdStore();
onMounted(() => store.hydrate());
const { week, plan, baseline, questions, pending } = usePlan();
const vehicle = computed(() => modeLabel(store.household, store.household.trackedMode));

type Sheet =
  | { kind: 'trip'; group: string }
  | { kind: 'add-trip' | 'add-charge'; slot?: Slot | undefined }
  | null;
const sheet = ref<Sheet>(null);
const close = () => {
  sheet.value = null;
};
const onCreate = (kind: SlotKind, slot: Slot) => {
  sheet.value = { kind: kind === 'charge' ? 'add-charge' : 'add-trip', slot };
};
</script>

<template>
  <div class="wrap">
    <AppHeader :label="week?.label ?? ''" :vehicle="vehicle" />
    <template v-if="week && plan && baseline">
      <StatTiles :plan="plan" :questions-count="questions.length" />
      <div class="overview">
        <BatteryChart :plan="plan" :baseline="baseline" :days="week.days" :vehicle="vehicle" />
        <ChargePlan :plan="plan" :days="week.days" @add="sheet = { kind: 'add-charge' }" />
      </div>
      <WeekSection
        :plan="plan"
        :week="week"
        :pending="pending"
        @open="(group) => (sheet = { kind: 'trip', group })"
        @create="onCreate"
        @add="sheet = { kind: 'add-trip' }"
      />
      <div class="config">
        <QuestionList :questions="questions" :days="week.days" />
        <TeslaSettings />
        <ChargerSettings />
        <PlaceSettings />
      </div>
      <TripSheet
        v-if="sheet?.kind === 'trip'"
        :plan="plan"
        :days="week.days"
        :group="sheet.group"
        @close="close"
      />
      <AddTripSheet
        v-else-if="sheet?.kind === 'add-trip'"
        :days="week.days"
        :initial="sheet.slot"
        @close="close"
      />
      <ChargeSheet
        v-else-if="sheet?.kind === 'add-charge'"
        :days="week.days"
        :initial="sheet.slot"
        @close="close"
      />
    </template>
    <p v-else class="card skeleton">Calcul du planning de la semaine…</p>
  </div>
</template>
