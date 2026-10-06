<script setup lang="ts">
import { kmPerPct, pctToKwh, reservePct, type Plan } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { fmtEur } from '~/utils/format';
import { modeLabel, sumKm, trackedLoops } from '~/utils/plan';

const props = defineProps<{ plan: Plan; questionsCount: number }>();
const store = useHouseholdStore();

interface Tile {
  key: string;
  value: string;
  detail: string;
  alert?: boolean;
}

const tiles = computed<Tile[]>(() => {
  const { plan } = props;
  const s = store.settings;
  const h = store.household;
  const tracked = trackedLoops(plan, h);
  const charges = plan.sim.applied.filter((c) => c.amount > 0.5);
  const kwh = charges.reduce((sum, c) => sum + pctToKwh(c.amount, s), 0);
  const reserve = reservePct(s);
  const ev = modeLabel(h, h.trackedMode);
  const other = modeLabel(h, h.autoModes.find((m) => m !== h.trackedMode) ?? '');
  return [
    {
      key: 'Batterie maintenant',
      value: `${s.soc} %`,
      detail: `≈ ${Math.round(s.soc * kmPerPct(s))} km · saisie manuelle`,
    },
    {
      key: `${ev} sur 7 jours`,
      value: `${sumKm(tracked)} km`,
      detail: `≈ ${Math.round((sumKm(tracked) * s.whPerKm) / 1000)} kWh · ${tracked.length} trajets`,
    },
    {
      key: 'Recharges',
      value: `${charges.length}`,
      detail: `${Math.round(kwh)} kWh · ${fmtEur(plan.chargeEur)}`,
    },
    {
      key: 'Point bas',
      value: `${Math.round(plan.sim.minSoc)} %`,
      detail: `réserve ${s.reserveKm} km (${Math.round(reserve)} %)`,
      alert: plan.sim.minSoc < reserve,
    },
    {
      key: `${other} sur 7 jours`,
      value: `${plan.otherCarKm} km`,
      detail: `≈ ${fmtEur(plan.otherCarEur)} de carburant`,
    },
    {
      key: 'À valider',
      value: `${props.questionsCount}`,
      detail: 'questions qui changent le plan',
      alert: props.questionsCount > 0,
    },
  ];
});
</script>

<template>
  <section class="stats">
    <div v-for="tile in tiles" :key="tile.key" class="stat" :class="{ alert: tile.alert }">
      <span class="eyebrow">{{ tile.key }}</span>
      <b>{{ tile.value }}</b>
      <small>{{ tile.detail }}</small>
    </div>
  </section>
</template>
