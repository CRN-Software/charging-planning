<script setup lang="ts">
import { fmtH, type Day, type Plan } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import {
  activities,
  boxStyle,
  chargeSegments,
  dragRange,
  hourAt,
  TESLA_LANE_PX,
  vehicleSegments,
  yOf,
  type Segment,
  type Slot,
  type Activity,
  type SlotKind,
} from '~/utils/calendar';
import { groupOfEvent, modeLabel, personColor, personName, placeName } from '~/utils/plan';

const props = defineProps<{ plan: Plan; day: Day; startH: number; pending: ReadonlySet<string> }>();
const emit = defineEmits<{ open: [group: string]; create: [kind: SlotKind, slot: Slot] }>();
const store = useHouseholdStore();
const h = computed(() => store.household);

const otherMode = computed(() => h.value.autoModes.find((m) => m !== h.value.trackedMode));
const lanes = computed(() => [
  {
    mode: h.value.trackedMode,
    cls: 'lane-tesla',
    segments: [
      ...vehicleSegments(props.plan, h.value, h.value.trackedMode, props.day.d),
      ...chargeSegments(props.plan, props.day.d),
    ],
  },
  {
    mode: otherMode.value ?? '',
    cls: 'lane-clio',
    segments: otherMode.value
      ? vehicleSegments(props.plan, h.value, otherMode.value, props.day.d)
      : [],
  },
]);
const items = computed(() => activities(props.plan, props.day, store.unlocated));
const ghost = ref<{ kind: SlotKind; range: [number, number] } | null>(null);

const openSegment = (s: Segment) => {
  if (s.group) emit('open', s.group);
};
const offsetOf = (col: HTMLElement, clientY: number) => clientY - col.getBoundingClientRect().top;

function startDrag(e: PointerEvent) {
  const col = e.currentTarget as HTMLElement;
  const from = hourAt(offsetOf(col, e.clientY));
  if (e.target !== col || (props.day.d === 0 && from < props.startH)) return;
  const kind: SlotKind =
    e.clientX - col.getBoundingClientRect().left < TESLA_LANE_PX ? 'charge' : 'event';
  ghost.value = { kind, range: dragRange(kind, from, from) };
  try {
    col.setPointerCapture(e.pointerId);
  } catch {
    /* synthetic pointer */
  }
  const move = (ev: PointerEvent) => {
    if (ghost.value) ghost.value.range = dragRange(kind, from, hourAt(offsetOf(col, ev.clientY)));
  };
  const finish = (ev: PointerEvent) => {
    col.removeEventListener('pointermove', move);
    const range = ghost.value?.range;
    ghost.value = null;
    if (ev.type === 'pointerup' && range)
      emit('create', kind, {
        d: props.day.d,
        start: range[0],
        end: Math.min(range[1], 24 - 1 / 60),
      });
  };
  col.addEventListener('pointermove', move);
  col.addEventListener('pointerup', finish, { once: true });
  col.addEventListener('pointercancel', finish, { once: true });
}

const activityStyle = (p: (typeof items.value)[number]) => ({
  ...boxStyle(p.start, p.end, 16),
  '--who': personColor(h.value, p.item.event.participants[0]),
  left: `calc(var(--lane) + (100% - var(--lane)) * ${p.col} / ${p.cols})`,
  width: `calc((100% - var(--lane)) / ${p.cols} - 2px)`,
});
const who = (a: Activity) => a.event.participants.map((p) => personName(h.value, p)).join(', ');
const where = (a: Activity) =>
  a.kind === 'event'
    ? placeName(h.value, a.event.place)
    : a.event.reason === 'online'
      ? 'en visio'
      : 'sans adresse';
const describe = (p: (typeof items.value)[number]) =>
  `${who(p.item)} · ${p.item.event.title} · ${where(p.item)} ${p.item.event.start}–${p.item.event.end}`;
const open = (a: Activity) => {
  if (a.kind === 'event') emit('open', groupOfEvent(a.event.id));
};
</script>

<template>
  <div class="cal-day" :class="{ we: day.weekend }" @pointerdown="startDrag">
    <template v-if="day.d === 0">
      <div class="cal-past" :style="{ height: `${yOf(startH)}px` }" />
      <div class="cal-now" :style="{ top: `${yOf(startH)}px` }" />
    </template>
    <template v-for="lane in lanes" :key="lane.cls">
      <div
        v-for="(s, i) in lane.segments"
        :key="`${lane.cls}-${i}`"
        class="veh"
        :class="[lane.cls, s.kind]"
        :style="boxStyle(s.start, s.end)"
        :title="`${modeLabel(h, lane.mode)} · ${s.title}`"
        @click="openSegment(s)"
      >
        <span v-if="s.label">{{ s.label }}</span>
      </div>
    </template>
    <div
      v-for="p in items"
      :key="p.item.kind + p.item.event.id"
      class="act"
      :class="{
        unlocated: p.item.kind === 'unlocated',
        suggested: p.item.kind === 'event' && p.item.event.suggested,
        manual: p.item.kind === 'event' && p.item.event.manual,
      }"
      :style="activityStyle(p)"
      :title="describe(p)"
      @click="open(p.item)"
    >
      <i v-if="p.item.kind === 'event' && pending.has(groupOfEvent(p.item.event.id))" class="dot-q"
        >?</i
      >
      <b>{{ p.item.event.title }}</b>
      <span>{{ who(p.item) }} · {{ where(p.item) }}</span>
    </div>
    <div
      v-if="ghost"
      class="ghost"
      :class="`ghost-${ghost.kind}`"
      :style="boxStyle(ghost.range[0], ghost.range[1])"
    >
      {{ fmtH(ghost.range[0]) }}–{{ fmtH(ghost.range[1]) }}
    </div>
  </div>
</template>
