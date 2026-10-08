<script setup lang="ts">
import { fmtH, timelineOf, type Day, type Plan, type Segment } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { crew, modeLabel, personColor, placeName } from '~/utils/plan';

const props = defineProps<{ plan: Plan; days: readonly Day[] }>();
defineEmits<{ open: [group: string] }>();
const store = useHouseholdStore();
const h = computed(() => store.household);
const day = ref(props.days[0]?.d ?? 0);
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

interface Row {
  id: string;
  label: string;
  color: string;
  segments: Segment[];
  charges: { from: number; to: number; title: string }[];
}

/** One row per person, then one per household vehicle: the state machine of the day. */
const rows = computed<Row[]>(() => {
  const people = Object.entries(h.value.people).filter(([, p]) => !p.external);
  const vehicles = h.value.autoModes.filter((m) => h.value.modes[m]?.vehicle);
  const charges = props.plan.sim.applied
    .filter((c) => c.d === day.value && c.amount > 0.5)
    .map((c) => ({
      from: c.t % 24,
      to: (c.t % 24) + c.duration,
      title: `En charge · ${c.label} · +${Math.round(c.amount)} %`,
    }));
  return [
    ...people.map(([id, p]) => ({
      id,
      label: p.name,
      color: p.color,
      segments: timelineOf(props.plan, h.value, id, day.value),
      charges: [],
    })),
    ...vehicles.map((m) => ({
      id: m,
      label: modeLabel(h.value, m),
      color: 'var(--ink)',
      segments: timelineOf(props.plan, h.value, m, day.value),
      charges: m === h.value.trackedMode ? charges : [],
    })),
  ];
});

const STATE_LABELS: Record<Segment['kind'], string> = {
  home: 'À la maison',
  away: 'Sur place',
  event: 'Événement',
  trip: 'En trajet',
  wait: 'Attend',
  parked: 'Stationnée',
};
const at = (from: number, to: number) => ({
  left: `${(from / 24) * 100}%`,
  width: `${((to - from) / 24) * 100}%`,
});
const title = (s: Segment) => {
  const what = s.trip
    ? `${crew(h.value, s.trip)} · ${placeName(h.value, s.trip.from)} → ${placeName(h.value, s.trip.to)}`
    : `${STATE_LABELS[s.kind]} · ${s.label}`;
  return `${fmtH(s.from)}–${fmtH(s.to)} · ${what}`;
};
</script>

<template>
  <div class="tl">
    <div class="seg" role="group" aria-label="Jour">
      <button
        v-for="d in days"
        :key="d.d"
        class="b"
        :class="{ sel: day === d.d }"
        type="button"
        @click="day = d.d"
      >
        {{ d.label }}
      </button>
    </div>
    <div class="tl-scroll">
      <div class="tl-grid">
        <div class="tl-axis">
          <span v-for="hour in HOURS" :key="hour" :style="{ left: `${(hour / 24) * 100}%` }"
            >{{ hour }}h</span
          >
        </div>
        <div v-for="row in rows" :key="row.id" class="tl-row">
          <span class="tl-label" :style="{ '--who': row.color }">{{ row.label }}</span>
          <div class="tl-bar">
            <span
              v-for="(s, i) in row.segments"
              :key="i"
              class="tl-seg"
              :class="`tl-${s.kind}`"
              :style="{
                ...at(s.from, s.to),
                '--who': s.kind === 'event' ? personColor(h, row.id) : undefined,
              }"
              :title="title(s)"
              @click="s.trip && $emit('open', s.trip.group)"
              ><em v-if="s.to - s.from > 1.5 && s.kind !== 'home'">{{
                s.kind === 'trip' ? '' : s.label
              }}</em></span
            >
            <span
              v-for="(c, i) in row.charges"
              :key="`c${i}`"
              class="tl-seg tl-charge"
              :style="at(c.from, c.to)"
              :title="c.title"
            />
          </div>
        </div>
      </div>
    </div>
    <div class="legend">
      <span class="key tl-key tl-home">À la maison</span>
      <span class="key tl-key tl-event">Événement</span>
      <span class="key tl-key tl-trip">En trajet</span>
      <span class="key tl-key tl-wait">Attend</span>
      <span class="key tl-key tl-parked">Stationnée / sur place</span>
      <span class="key tl-key tl-charge">En charge</span>
    </div>
  </div>
</template>
