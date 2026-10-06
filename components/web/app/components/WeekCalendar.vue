<script setup lang="ts">
import type { Day, Plan } from '@charging/planner';
import {
  END_H,
  INITIAL_SCROLL_H,
  PX_PER_H,
  START_H,
  yOf,
  type Slot,
  type SlotKind,
} from '~/utils/calendar';

defineProps<{ plan: Plan; days: readonly Day[]; startH: number; pending: ReadonlySet<string> }>();
defineEmits<{ open: [group: string]; create: [kind: SlotKind, slot: Slot] }>();

const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
const scroller = ref<HTMLElement | null>(null);
onMounted(() => {
  if (scroller.value) scroller.value.scrollTop = yOf(INITIAL_SCROLL_H);
});
</script>

<template>
  <div id="calendar" ref="scroller" class="board-scroll">
    <div class="cal">
      <div class="cal-grid cal-head">
        <div />
        <DayHead v-for="day in days" :key="day.d" :plan="plan" :day="day" />
      </div>
      <div
        class="cal-grid cal-body"
        :style="{ height: `${yOf(END_H)}px`, '--hour': `${PX_PER_H}px` }"
      >
        <div class="cal-hours">
          <span v-for="hour in hours" :key="hour" :style="{ top: `${yOf(hour)}px` }"
            >{{ hour }}:00</span
          >
        </div>
        <CalendarDay
          v-for="day in days"
          :key="day.d"
          :plan="plan"
          :day="day"
          :start-h="startH"
          :pending="pending"
          @open="(g) => $emit('open', g)"
          @create="(k, s) => $emit('create', k, s)"
        />
      </div>
    </div>
  </div>
</template>
