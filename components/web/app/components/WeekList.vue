<script setup lang="ts">
import {
  fmtH,
  pctToKwh,
  type AppliedCharge,
  type Day,
  type Gap,
  type Loop,
  type Plan,
} from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { fmtEur } from '~/utils/format';
import { firstDeparture } from '~/utils/plan';

const props = defineProps<{ plan: Plan; days: readonly Day[]; pending: ReadonlySet<string> }>();
defineEmits<{ open: [group: string] }>();
const store = useHouseholdStore();

type Item = { t: number; key: string } & (
  { loop: Loop } | { charge: AppliedCharge } | { gap: Gap }
);

function itemsOf(d: number): Item[] {
  const { plan } = props;
  return [
    ...plan.loops
      .filter((l) => l.d === d)
      .map((loop) => ({
        t: firstDeparture(loop),
        key: `l-${loop.group}-${firstDeparture(loop)}`,
        loop,
      })),
    ...plan.sim.applied
      .filter((c) => c.d === d && c.amount > 0.5)
      .map((charge) => ({ t: charge.t % 24, key: `c-${charge.id}`, charge })),
    ...plan.gaps.filter((g) => g.d === d).map((gap) => ({ t: gap.from, key: `g-${gap.id}`, gap })),
  ].sort((a, b) => a.t - b.t);
}

const chargeLine = (c: AppliedCharge) => {
  const kwh = pctToKwh(c.amount, store.settings);
  return `${Math.round(kwh)} kWh · ${fmtEur(kwh * c.price)}`;
};
</script>

<template>
  <div class="board-scroll">
    <div class="board">
      <div v-for="day in days" :key="day.d" class="day">
        <DayHead :plan="plan" :day="day" />
        <template v-for="item in itemsOf(day.d)" :key="item.key">
          <TripCard
            v-if="'loop' in item"
            :loop="item.loop"
            :pending="pending.has(item.loop.group)"
            @open="(g) => $emit('open', g)"
          />
          <div
            v-else-if="'charge' in item"
            class="charge"
            :class="{ routine: item.charge.kind === 'routine' }"
          >
            <span class="trip-top">
              <span class="t">{{ fmtH(item.charge.t % 24) }}</span>
              <strong class="num">+{{ Math.round(item.charge.amount) }} %</strong>
            </span>
            <span class="trip-title">{{ item.charge.label }}</span>
            <span class="trip-meta"
              ><span>{{ chargeLine(item.charge) }}</span></span
            >
          </div>
          <GapRow v-else :gap="item.gap" />
        </template>
        <div v-if="plan.sim.violation?.loop?.d === day.d" class="unsolved">
          Batterie insuffisante avant « {{ plan.sim.violation.loop.title }} »
        </div>
        <div v-if="!itemsOf(day.d).length" class="empty">Rien de prévu</div>
      </div>
    </div>
  </div>
</template>
