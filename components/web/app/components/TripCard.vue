<script setup lang="ts">
import { fmtH, kmPerPct, type Loop } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { BADGED_SOURCES, SOURCE_LABELS } from '~/utils/labels';
import { firstDeparture, modeLabel, personColor } from '~/utils/plan';

const props = defineProps<{ loop: Loop; pending: boolean }>();
defineEmits<{ open: [group: string] }>();
const store = useHouseholdStore();
const h = computed(() => store.household);

const tracked = computed(() => props.loop.mode === h.value.trackedMode);
const owner = computed(() => (props.loop.kind === 'self' ? props.loop.who : props.loop.kids[0]));
const who = computed(() =>
  props.loop.kind === 'self' ? (h.value.people[props.loop.who]?.name ?? '') : props.loop.title,
);
const place = computed(() =>
  props.loop.kind === 'self' ? props.loop.placeLabel : `· ${props.loop.placeLabel}`,
);
const pct = computed(() => Math.round(props.loop.km / kmPerPct(store.settings)));
const badge = computed(() =>
  BADGED_SOURCES.includes(props.loop.source) ? SOURCE_LABELS[props.loop.source] : '',
);
</script>

<template>
  <button
    class="trip"
    :class="{ tesla: tracked, guess: loop.source === 'inferred' }"
    type="button"
    :style="{ '--who': personColor(h, owner) }"
    @click="$emit('open', loop.group)"
  >
    <span class="trip-top">
      <span class="t">{{ fmtH(firstDeparture(loop)) }}</span>
      <span v-if="pending" class="dot-q" title="À valider">?</span>
      <span class="mode">{{ modeLabel(h, loop.mode) }}</span>
    </span>
    <span class="trip-title"
      >{{ who }} <span class="muted">{{ place }}</span></span
    >
    <span v-if="tracked" class="trip-meta">
      <span>{{ loop.km }} km{{ loop.kind === 'escort' ? ` · ${loop.driverName}` : '' }}</span>
      <b>−{{ pct }} %</b>
    </span>
    <span v-if="badge" class="tag">{{ badge }}</span>
  </button>
</template>
