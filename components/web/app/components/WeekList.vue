<script setup lang="ts">
import type { UnlocatedEvent } from '@charging/contracts';
import {
  fmtH,
  pctToKwh,
  toH,
  type AppliedCharge,
  type Conflict,
  type Day,
  type Link,
  type Plan,
  type Trip,
} from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { fmtEur } from '~/utils/format';

const props = defineProps<{ plan: Plan; days: readonly Day[]; pending: ReadonlySet<string> }>();
defineEmits<{ open: [group: string] }>();
const store = useHouseholdStore();

type Item = { t: number; key: string } & (
  | { trip: Trip }
  | { charge: AppliedCharge }
  | { link: Link }
  | { conflict: Conflict }
  | { unlocated: UnlocatedEvent }
);

/** The day in time order: trips, charges, the states in between, and what does not fit. */
function itemsOf(d: number): Item[] {
  const { plan } = props;
  return [
    ...plan.trips
      .filter((t) => t.d === d)
      .map((trip) => ({ t: trip.dep, key: `t-${trip.id}`, trip })),
    ...plan.sim.applied
      .filter((c) => c.d === d && c.amount > 0.5)
      .map((charge) => ({ t: charge.t % 24, key: `c-${charge.id}`, charge })),
    ...plan.links
      .filter((l) => l.d === d)
      .map((link) => ({ t: link.from, key: `l-${link.id}`, link })),
    ...plan.conflicts
      .filter((c) => c.d === d)
      .map((conflict, i) => ({ t: conflict.t, key: `x-${i}`, conflict })),
    ...store.unlocated
      .filter((u) => u.date === props.days[d]?.iso)
      .map((unlocated) => ({ t: toH(unlocated.start), key: `u-${unlocated.id}`, unlocated })),
  ].sort((a, b) => a.t - b.t);
}

const names = (ids: readonly string[]) =>
  ids.map((p) => store.household.people[p]?.name ?? p).join(', ');

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
            v-if="'trip' in item"
            :trip="item.trip"
            :pending="pending.has(item.trip.group)"
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
          <LinkRow v-else-if="'link' in item" :link="item.link" />
          <div v-else-if="'unlocated' in item" class="unlocated-row" :title="item.unlocated.title">
            <span class="t">{{ item.unlocated.start }}</span>
            {{ item.unlocated.title }}
            <span class="muted"
              >· {{ names(item.unlocated.participants) }} ·
              {{ item.unlocated.reason === 'online' ? 'en visio' : 'sans adresse' }}</span
            >
          </div>
          <div v-else class="unsolved">{{ item.conflict.text }}</div>
        </template>
        <div v-if="plan.sim.violation?.trip?.d === day.d" class="unsolved">
          Batterie insuffisante à {{ fmtH(plan.sim.violation.trip.dep) }}
        </div>
        <div v-if="!itemsOf(day.d).length" class="empty">Rien de prévu</div>
      </div>
    </div>
  </div>
</template>
