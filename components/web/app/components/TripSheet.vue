<script setup lang="ts">
import { fmtH, type Day, type GapChoice, type Override, type Plan } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { GAP_CHOICES, gapAutoLabel, SOURCE_LABELS } from '~/utils/labels';
import { firstDeparture } from '~/utils/plan';

const props = defineProps<{ plan: Plan; days: readonly Day[]; group: string }>();
const emit = defineEmits<{ close: [] }>();
const store = useHouseholdStore();
const h = computed(() => store.household);

const loops = computed(() =>
  props.plan.loops
    .filter((l) => l.group === props.group)
    .sort((a, b) => firstDeparture(a) - firstDeparture(b)),
);
const first = computed(() => loops.value[0]);
const legs = computed(() => loops.value.flatMap((l) => l.legs));
const why = computed(() => [...new Set(loops.value.flatMap((l) => l.why))].join(' '));
const related = computed(() => {
  const l = first.value;
  if (!l) return [];
  return props.plan.gaps.filter(
    (g) => g.d === l.d && (l.kind === 'self' ? g.who === l.who : g.place === l.place),
  );
});
const manual = computed(() => loops.value.flatMap((l) => l.manualEvents).filter((e) => !e.charge));
const adults = computed(() => Object.entries(h.value.people).filter(([, p]) => p.adult));

const current = store.overrides[props.group] ?? {};
const driver = ref(current.driver ?? '');
const mode = ref(current.mode ?? '');
const gapChoices = ref<Record<string, GapChoice | ''>>(
  Object.fromEntries(related.value.map((g) => [g.id, store.gaps[g.id] ?? ''])),
);

function save() {
  const patch: Override = {
    ...(driver.value && { driver: driver.value }),
    ...(mode.value && { mode: mode.value }),
  };
  store.setOverride(props.group, patch);
  store.setGaps(gapChoices.value);
  emit('close');
}
const removeStop = (id: string) => {
  store.removeEvent(id);
  emit('close');
};
</script>

<template>
  <AppModal
    v-if="first"
    :eyebrow="`${days[first.d]?.label ?? ''} · ${SOURCE_LABELS[first.source]}`"
    :title="first.groupTitle"
    @close="emit('close')"
    @save="save"
  >
    <ul class="legs">
      <li v-for="(g, i) in legs" :key="i">
        <span class="num">{{ fmtH(g.dep) }}</span> {{ h.places[g.from]?.name }} →
        {{ h.places[g.to]?.name }}
        <span class="num">{{ g.km }} km</span>
      </li>
    </ul>
    <div class="why">{{ why }}</div>
    <fieldset v-if="related.length">
      <legend>Entre deux arrêts</legend>
      <label v-for="g in related" :key="g.id" :for="`g-${g.id}`"
        >{{ g.label }}
        <select :id="`g-${g.id}`" v-model="gapChoices[g.id]">
          <option value="">{{ gapAutoLabel(g) }}</option>
          <option v-for="[value, label] in GAP_CHOICES[g.kind]" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
    </fieldset>
    <label v-if="first.kind === 'escort'" for="f-driver"
      >Accompagnateur
      <select id="f-driver" v-model="driver">
        <option value="">Automatique</option>
        <option v-for="[id, p] in adults" :key="id" :value="id">{{ p.name }}</option>
      </select>
    </label>
    <label for="f-mode"
      >Moyen de transport
      <select id="f-mode" v-model="mode">
        <option value="">Automatique</option>
        <option v-for="(m, id) in h.modes" :key="id" :value="id">{{ m.label }}</option>
      </select>
    </label>
    <button
      v-for="e in manual"
      :key="e.id"
      class="b danger"
      type="button"
      @click="removeStop(e.id)"
    >
      Supprimer l'arrêt « {{ e.title }} »
    </button>
  </AppModal>
</template>
