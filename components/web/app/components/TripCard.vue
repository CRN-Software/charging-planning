<script setup lang="ts">
import { fmtH, kmPerPct, type Trip } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { BADGED_SOURCES, SOURCE_LABELS } from '~/utils/labels';
import { crew, modeLabel, personColor, placeName } from '~/utils/plan';

const props = defineProps<{ trip: Trip; pending: boolean }>();
defineEmits<{ open: [group: string] }>();
const store = useHouseholdStore();
const h = computed(() => store.household);

const tracked = computed(() => props.trip.mode === h.value.trackedMode);
const pct = computed(() => Math.round(props.trip.km / kmPerPct(store.settings)));
const badge = computed(() =>
  BADGED_SOURCES.includes(props.trip.source) ? SOURCE_LABELS[props.trip.source] : '',
);
</script>

<template>
  <button
    class="trip"
    :class="{
      tesla: tracked,
      guess: trip.source === 'inferred',
      alone: !trip.passengers.length && trip.purpose === 'escort',
    }"
    type="button"
    :style="{ '--who': personColor(h, trip.driver ?? trip.passengers[0]) }"
    @click="$emit('open', trip.group)"
  >
    <span class="trip-top">
      <span class="t">{{ fmtH(trip.dep) }}</span>
      <span v-if="pending" class="dot-q" title="À valider">?</span>
      <span class="mode">{{ modeLabel(h, trip.mode) }}</span>
    </span>
    <span class="trip-title">{{ crew(h, trip) || 'À vide' }}</span>
    <span class="trip-meta">
      <span class="muted"
        >{{ placeName(h, trip.from) }} → {{ placeName(h, trip.to) }} ·
        {{ Math.round(trip.km) }} km</span
      >
      <b v-if="tracked">−{{ pct }} %</b>
    </span>
    <span v-if="badge" class="tag">{{ badge }}</span>
  </button>
</template>
