<script setup lang="ts">
import { fmtH, type Day, type GapChoice, type Override, type Plan } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { LINK_CHOICES, linkAutoLabel, SOURCE_LABELS } from '~/utils/labels';
import { crew, modeLabel, personName, placeName } from '~/utils/plan';

const props = defineProps<{ plan: Plan; days: readonly Day[]; group: string }>();
const emit = defineEmits<{ close: [] }>();
const store = useHouseholdStore();
const h = computed(() => store.household);

const trips = computed(() =>
  props.plan.trips.filter((t) => t.group === props.group).sort((a, b) => a.dep - b.dep),
);
const occurrences = computed(() => {
  const ids = new Set(trips.value.flatMap((t) => t.occurrences));
  ids.add(props.group.replace(/^occ:/, ''));
  return props.plan.events.filter((e) => ids.has(e.id));
});
const first = computed(() => trips.value[0]);
const title = computed(() => occurrences.value.map((e) => e.title).join(' + ') || 'Trajet');
const participants = computed(() =>
  [...new Set(occurrences.value.flatMap((e) => e.participants))]
    .map((p) => personName(h.value, p))
    .join(', '),
);
const why = computed(() => [...new Set(trips.value.flatMap((t) => t.why))].join(' '));
const conflicts = computed(() => props.plan.conflicts.filter((c) => c.group === props.group));
/** The stays and waits around this outing: its people, its day, its place. */
const related = computed(() => {
  const t = first.value;
  if (!t) return [];
  const people = new Set(trips.value.flatMap((x) => [x.driver, ...x.passengers]));
  const places = new Set(trips.value.flatMap((x) => [x.from, x.to]));
  return props.plan.links.filter(
    (l) => l.d === t.d && (people.has(l.person) || (l.place !== undefined && places.has(l.place))),
  );
});
const manual = computed(() => occurrences.value.filter((e) => e.manual && !e.charge));
const drivers = computed(() => Object.entries(h.value.people).filter(([, p]) => p.driver));

const current = store.overrides[props.group] ?? {};
const driver = ref(current.driver ?? '');
const mode = ref(current.mode ?? '');
const choices = ref<Record<string, GapChoice | ''>>(
  Object.fromEntries(related.value.map((l) => [l.id, store.gaps[l.id] ?? ''])),
);

function save() {
  const patch: Override = {
    ...(driver.value && { driver: driver.value }),
    ...(mode.value && { mode: mode.value }),
  };
  store.setOverride(props.group, patch);
  store.setGaps(choices.value);
  emit('close');
}
const removeStop = (id: string) => {
  store.removeEvent(id);
  emit('close');
};
</script>

<template>
  <AppModal
    :eyebrow="`${days[first?.d ?? occurrences[0]?.d ?? 0]?.label ?? ''}${first ? ` · ${SOURCE_LABELS[first.source]}` : ''}`"
    :title="title"
    @close="emit('close')"
    @save="save"
  >
    <p v-if="participants" class="hint">Participants : {{ participants }}</p>
    <ul class="legs">
      <li v-for="t in trips" :key="t.id">
        <span class="num">{{ fmtH(t.dep) }}</span> {{ placeName(h, t.from) }} →
        {{ placeName(h, t.to) }} · {{ modeLabel(h, t.mode) }} · {{ crew(h, t) || 'à vide' }}
        <span class="num">{{ Math.round(t.km) }} km</span>
      </li>
    </ul>
    <div class="why">{{ why }}</div>
    <p v-for="(c, i) in conflicts" :key="i" class="unsolved">{{ c.text }}</p>
    <fieldset v-if="related.length">
      <legend>Entre deux moments</legend>
      <label v-for="l in related" :key="l.id" :for="`l-${l.id}`"
        >{{ l.label }}
        <select :id="`l-${l.id}`" v-model="choices[l.id]">
          <option value="">{{ linkAutoLabel(l) }}</option>
          <option v-for="[value, label] in LINK_CHOICES[l.kind]" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
    </fieldset>
    <label for="f-driver"
      >Conducteur
      <select id="f-driver" v-model="driver">
        <option value="">Automatique</option>
        <option v-for="[id, p] in drivers" :key="id" :value="id">{{ p.name }}</option>
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
