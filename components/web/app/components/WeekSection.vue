<script setup lang="ts">
import type { Plan, Week } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import type { Slot, SlotKind } from '~/utils/calendar';
import { modeLabel } from '~/utils/plan';

defineProps<{ plan: Plan; week: Week; pending: ReadonlySet<string> }>();
defineEmits<{ open: [group: string]; create: [kind: SlotKind, slot: Slot]; add: [] }>();
const store = useHouseholdStore();
const ev = computed(() => modeLabel(store.household, store.household.trackedMode));
const other = computed(() =>
  modeLabel(
    store.household,
    store.household.autoModes.find((m) => m !== store.household.trackedMode) ?? '',
  ),
);
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div class="title-row">
        <h2>Semaine</h2>
        <div class="seg" role="group" aria-label="Affichage">
          <button
            class="b"
            :class="{ sel: store.view === 'calendar' }"
            type="button"
            @click="store.setView('calendar')"
          >
            Calendrier
          </button>
          <button
            class="b"
            :class="{ sel: store.view === 'list' }"
            type="button"
            @click="store.setView('list')"
          >
            Liste
          </button>
        </div>
        <button class="b primary" type="button" @click="$emit('add')">
          Ajouter un déplacement
        </button>
      </div>
    </div>
    <div v-if="store.view === 'calendar'" class="view">
      <div class="legend">
        <span class="key key-drive">{{ ev }} roule</span>
        <span class="key key-parked">{{ ev }} garée ailleurs</span>
        <span class="key key-charge">{{ ev }} en charge</span>
        <span class="key key-home">{{ ev }} à la maison</span>
        <span class="key key-clio">{{ other }} roule</span>
        <span><span class="dot-q">?</span> à valider</span>
      </div>
      <p class="hint">
        Glissez dans la bande {{ ev }} pour ajouter une recharge, ou à côté pour ajouter un
        déplacement.
      </p>
      <WeekCalendar
        :plan="plan"
        :days="week.days"
        :start-h="week.startH"
        :pending="pending"
        @open="(g) => $emit('open', g)"
        @create="(k, s) => $emit('create', k, s)"
      />
    </div>
    <div v-else class="view">
      <div class="legend">
        <span class="key key-tesla">{{ ev }} : consomme la batterie</span>
        <span class="key key-other">Autre moyen</span>
        <span class="key key-guess">Accompagnateur supposé</span>
      </div>
      <WeekList :plan="plan" :days="week.days" :pending="pending" @open="(g) => $emit('open', g)" />
    </div>
  </section>
</template>
