<script setup lang="ts">
import { HOME, toH, type Day } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import type { Slot } from '~/utils/calendar';
import { timeValue } from '~/utils/format';

const DEFAULT_SLOT: Slot = { d: 1, start: 15.75, end: 16.5 };

const props = defineProps<{ days: readonly Day[]; initial?: Slot | undefined }>();
const emit = defineEmits<{ close: [] }>();
const store = useHouseholdStore();
const h = computed(() => store.household);
const slot = props.initial ?? DEFAULT_SLOT;

const people = computed(() => Object.entries(h.value.people).filter(([, p]) => !p.external));
const known = computed(() =>
  Object.entries(h.value.places).filter(([id, p]) => id !== HOME && !p.unknown),
);
const form = reactive({
  who: people.value[0]?.[0] ?? '',
  d: slot.d,
  start: timeValue(slot.start),
  end: timeValue(slot.end),
  title: '',
  place: known.value[0]?.[0] ?? '',
});
const error = ref('');

function validate(): string {
  if (!form.start || !form.end || toH(form.end) <= toH(form.start))
    return "L'heure de départ doit suivre l'heure d'arrivée.";
  if (!form.place) return 'Choisissez un lieu.';
  return '';
}

function save() {
  error.value = validate();
  if (error.value) return;
  const id = `m-${Date.now()}`;
  const wd = props.days[form.d]?.wd ?? 0;
  const event = {
    id,
    participants: [form.who],
    wd,
    start: form.start,
    end: form.end,
    title: form.title.trim() || 'Arrêt',
    place: form.place,
    manual: true,
  };
  store.addEvent(event);
  emit('close');
}
</script>

<template>
  <AppModal
    eyebrow="Hors agenda"
    title="Ajouter un déplacement"
    :error="error"
    @close="emit('close')"
    @save="save"
  >
    <p class="hint">
      Un arrêt proche d'un autre (même personne, même jour) est enchaîné sans repasser par la
      maison.
    </p>
    <label for="a-who"
      >Qui
      <select id="a-who" v-model="form.who">
        <option v-for="[id, p] in people" :key="id" :value="id">{{ p.name }}</option>
      </select>
    </label>
    <label for="a-day"
      >Jour
      <select id="a-day" v-model.number="form.d">
        <option v-for="day in days" :key="day.d" :value="day.d">{{ day.label }}</option>
      </select>
    </label>
    <p class="hint">L'arrêt est répété chaque semaine, le même jour.</p>
    <div class="two">
      <label for="a-start">Arrivée<input id="a-start" v-model="form.start" type="time" /></label>
      <label for="a-end">Départ<input id="a-end" v-model="form.end" type="time" /></label>
    </div>
    <label for="a-title"
      >Motif<input id="a-title" v-model="form.title" type="text" placeholder="Courses, visite…"
    /></label>
    <label for="a-place"
      >Lieu
      <select id="a-place" v-model="form.place">
        <option v-for="[id, p] in known" :key="id" :value="id">{{ p.name }}</option>
      </select>
    </label>
    <p class="hint">
      Un nouveau lieu s'ajoute avec son adresse dans Google Agenda : son trajet est alors calculé.
    </p>
  </AppModal>
</template>
