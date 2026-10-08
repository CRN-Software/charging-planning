<script setup lang="ts">
import { useHouseholdStore } from '~/stores/household';
import type { Slot, SlotKind } from '~/utils/calendar';
import { modeLabel } from '~/utils/plan';

const store = useHouseholdStore();
const { data: me } = await useMe();
onMounted(async () => {
  store.hydrate();
  if (me.value) await store.loadRemote();
});
const unresolved = computed(() => store.remote?.agenda?.unresolved ?? []);
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
  <LoginScreen v-if="!me" />
  <div v-else class="wrap">
    <AppHeader :label="week?.label ?? ''" :vehicle="vehicle" />
    <HouseholdSetup
      v-if="store.remote && !store.connected"
      :my-name="me.name"
      @saved="store.loadRemote()"
    />
    <p v-if="unresolved.length" class="card unresolved">
      Adresses introuvables, événements ignorés :
      <span v-for="u in unresolved" :key="`${u.date}-${u.title}`" class="pill warn"
        >{{ u.title }} ({{ u.location }})</span
      >
    </p>
    <template v-if="store.connected && week && plan && baseline">
      <StatTiles :plan="plan" :questions-count="questions.length" />
      <section v-if="plan.conflicts.length" class="card unresolved">
        <h2>Incohérences</h2>
        <p v-for="(c, i) in plan.conflicts" :key="i">{{ week.days[c.d]?.label }} · {{ c.text }}</p>
      </section>
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
        <BatterySettings :plan="plan" :days="week.days" />
        <EquipmentSettings />
        <HouseholdSetup :my-name="me.name" @saved="store.loadRemote()" />
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
    <p v-else-if="!store.remote || store.connected" class="card skeleton">
      Calcul du planning de la semaine…
    </p>
  </div>
</template>
