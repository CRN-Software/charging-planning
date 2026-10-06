<script setup lang="ts">
import { reservePct, WINDOW_END_T, type Day, type Plan, type SocPoint } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { clamp } from '~/utils/format';

const props = defineProps<{ plan: Plan; baseline: Plan; days: readonly Day[]; vehicle: string }>();
const store = useHouseholdStore();

const W = 1000;
const H = 230;
const L = 40;
const R = 12;
const TOP = 14;
const B = 30;
const GRID = [0, 20, 40, 60, 80, 100];

const x = (t: number) => L + (t / WINDOW_END_T) * (W - L - R);
const y = (soc: number) => TOP + (1 - clamp(soc, -10, 100) / 100) * (H - TOP - B);
const path = (points: readonly SocPoint[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.soc).toFixed(1)}`).join('');

const points = computed(() => props.plan.sim.points);
const first = computed(() => points.value[0] ?? { t: 0, soc: 0 });
const last = computed(() => points.value.at(-1) ?? first.value);
const area = computed(
  () => `${path(points.value)}L${x(last.value.t)},${y(0)}L${x(first.value.t)},${y(0)}Z`,
);
const reserveY = computed(() => y(reservePct(store.settings)));
const chargeDots = computed(() => points.value.filter((p) => p.charge));
</script>

<template>
  <section class="card">
    <div class="card-head">
      <h2>Batterie de la {{ vehicle }}</h2>
      <div class="legend">
        <span><i style="border-color: var(--charge)" />Avec le plan</span>
        <span
          ><i style="border-color: var(--muted); border-top-style: dashed" />Routines seules</span
        >
        <span><i style="border-color: var(--crit); border-top-style: dotted" />Réserve</span>
      </div>
    </div>
    <div class="chart-scroll">
      <svg
        id="chart"
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        aria-label="Niveau de batterie prévu sur les 7 prochains jours"
      >
        <rect
          v-for="day in days.filter((d) => d.weekend)"
          :key="`we-${day.d}`"
          :x="x(day.d * 24)"
          :y="TOP"
          :width="x(24) - x(0)"
          :height="H - TOP - B"
          fill="var(--weekend)"
        />
        <g v-for="s in GRID" :key="`g-${s}`">
          <line :x1="L" :x2="W - R" :y1="y(s)" :y2="y(s)" stroke="var(--line)" />
          <text :x="L - 6" :y="y(s) + 4" text-anchor="end">{{ s }}%</text>
        </g>
        <g v-for="day in days" :key="`d-${day.d}`">
          <line
            :x1="x(day.d * 24)"
            :x2="x(day.d * 24)"
            :y1="TOP"
            :y2="H - B"
            stroke="var(--line)"
          />
          <text :x="x(day.d * 24 + 12)" :y="H - 10" text-anchor="middle">{{ day.label }}</text>
        </g>
        <line
          :x1="L"
          :x2="W - R"
          :y1="reserveY"
          :y2="reserveY"
          stroke="var(--crit)"
          stroke-dasharray="2 4"
          stroke-width="1.5"
        />
        <path
          :d="path(baseline.sim.points)"
          fill="none"
          stroke="var(--muted)"
          stroke-dasharray="5 5"
          stroke-width="1.5"
        />
        <path :d="area" fill="var(--charge)" opacity=".12" />
        <path
          :d="path(points)"
          fill="none"
          stroke="var(--charge)"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <circle
          v-for="(p, i) in chargeDots"
          :key="`c-${i}`"
          :cx="x(p.t)"
          :cy="y(p.soc)"
          r="4.5"
          fill="var(--charge)"
          stroke="var(--surface)"
          stroke-width="2"
        />
        <text :x="x(last.t) - 4" :y="y(last.soc) - 9" text-anchor="end" class="end-label">
          {{ Math.round(last.soc) }} % dans 7 jours
        </text>
      </svg>
    </div>
  </section>
</template>
