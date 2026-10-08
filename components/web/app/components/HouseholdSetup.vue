<script setup lang="ts">
import type { Calendar, HouseholdPerson, HouseholdSettings } from '@charging/contracts';
import {
  addPerson,
  calendarRows,
  initialPeople,
  toSetup,
  type CalendarRow,
} from '~/utils/household-setup';

const props = defineProps<{ myName: string }>();
const emit = defineEmits<{ saved: [] }>();
const address = ref('');
const people = ref<HouseholdPerson[]>([]);
const rows = ref<CalendarRow[]>([]);
const newName = ref('');
const status = ref<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
const message = ref('');

onMounted(async () => {
  try {
    const [settings, calendars] = await Promise.all([
      $fetch<HouseholdSettings>('/api/household'),
      $fetch<Calendar[]>('/api/household/calendars'),
    ]);
    address.value = settings.homeAddress ?? '';
    people.value = initialPeople(settings, props.myName);
    rows.value = calendarRows(calendars, settings, people.value);
    status.value = 'ready';
  } catch {
    status.value = 'error';
    message.value = 'Impossible de lire vos agendas Google.';
  }
});

const add = () => {
  if (!newName.value.trim()) return;
  people.value = addPerson(people.value, newName.value);
  newName.value = '';
};
const remove = (id: string) => {
  people.value = people.value.filter((p) => p.id !== id);
  rows.value = rows.value.map((r) => ({ ...r, people: r.people.filter((p) => p !== id) }));
};
const toggle = (row: CalendarRow, id: string) => {
  row.people = row.people.includes(id) ? row.people.filter((p) => p !== id) : [...row.people, id];
};

const save = async () => {
  status.value = 'saving';
  try {
    await $fetch('/api/household', {
      method: 'PUT',
      body: toSetup(address.value, people.value, rows.value),
    });
    status.value = 'saved';
    emit('saved');
  } catch {
    status.value = 'error';
    message.value = 'Enregistrement impossible : vérifiez l’adresse du domicile.';
  }
};
</script>

<template>
  <section class="card setup">
    <div class="card-head">
      <h2>Mon foyer</h2>
      <span class="eyebrow">personnes et agendas</span>
    </div>
    <p v-if="status === 'loading'" class="hint">Lecture de vos agendas…</p>
    <template v-else-if="rows.length">
      <label class="setup-field" for="home-address">
        Adresse du domicile
        <input id="home-address" v-model="address" type="text" autocomplete="street-address" />
      </label>

      <h3>Personnes</h3>
      <div v-for="p in people" :key="p.id" class="setup-person">
        <input v-model="p.name" type="text" :aria-label="`Nom de ${p.name}`" />
        <label><input v-model="p.driver" type="checkbox" /> Conducteur</label>
        <button class="b" type="button" :aria-label="`Retirer ${p.name}`" @click="remove(p.id)">
          Retirer
        </button>
      </div>
      <form class="setup-person" @submit.prevent="add">
        <input
          v-model="newName"
          type="text"
          placeholder="Ajouter une personne"
          aria-label="Nom de la personne"
        />
        <button class="b" type="submit">Ajouter</button>
      </form>

      <h3>Agendas</h3>
      <p class="hint">
        Cochez les personnes que les événements de chaque agenda concernent : un agenda « Famille »
        peut concerner tout le monde, un agenda « Enfants » seulement les enfants. Un événement
        présent dans plusieurs agendas reste un seul événement.
      </p>
      <div class="setup-scroll">
        <table class="setup-calendars">
          <thead>
            <tr>
              <th>Agenda</th>
              <th v-for="p in people" :key="p.id">{{ p.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.calendar.accountId}/${row.calendar.calendarId}`">
              <td>{{ row.calendar.name }}</td>
              <td v-for="p in people" :key="p.id">
                <input
                  type="checkbox"
                  :checked="row.people.includes(p.id)"
                  :aria-label="`${row.calendar.name} concerne ${p.name}`"
                  @change="toggle(row, p.id)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint">Seuls les événements avec une adresse deviennent des trajets.</p>
      <button class="b primary" type="button" :disabled="status === 'saving'" @click="save">
        Enregistrer
      </button>
      <span v-if="status === 'saved'" class="pill">Enregistré</span>
    </template>
    <p v-if="status === 'error'" class="pill warn">{{ message }}</p>
  </section>
</template>
