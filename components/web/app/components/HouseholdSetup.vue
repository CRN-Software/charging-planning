<script setup lang="ts">
import type { Calendar, HouseholdSettings } from '@charging/contracts';
import { calendarRows, toSetup, type CalendarRow } from '~/utils/household-setup';

const props = defineProps<{ myName: string }>();
const emit = defineEmits<{ saved: [] }>();
const address = ref('');
const rows = ref<CalendarRow[]>([]);
const status = ref<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
const message = ref('');

onMounted(async () => {
  try {
    const [settings, calendars] = await Promise.all([
      $fetch<HouseholdSettings>('/api/household'),
      $fetch<Calendar[]>('/api/household/calendars'),
    ]);
    address.value = settings.homeAddress ?? '';
    rows.value = calendarRows(calendars, settings, props.myName);
    status.value = 'ready';
  } catch {
    status.value = 'error';
    message.value = 'Impossible de lire vos agendas Google.';
  }
});

const save = async () => {
  status.value = 'saving';
  try {
    await $fetch('/api/household', { method: 'PUT', body: toSetup(address.value, rows.value) });
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
      <span class="eyebrow">agendas Google</span>
    </div>
    <p v-if="status === 'loading'" class="hint">Lecture de vos agendas…</p>
    <template v-else-if="rows.length">
      <label class="setup-field" for="home-address">
        Adresse du domicile
        <input id="home-address" v-model="address" type="text" autocomplete="street-address" />
      </label>
      <table class="setup-calendars">
        <thead>
          <tr>
            <th>Agenda</th>
            <th>Utiliser</th>
            <th>Personne</th>
            <th>Adulte</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.calendar.accountId}/${row.calendar.calendarId}`">
            <td>{{ row.calendar.name }}</td>
            <td>
              <input
                v-model="row.use"
                type="checkbox"
                :aria-label="`Utiliser ${row.calendar.name}`"
              />
            </td>
            <td>
              <input
                v-model="row.name"
                type="text"
                :disabled="!row.use"
                :aria-label="`Personne de ${row.calendar.name}`"
              />
            </td>
            <td>
              <input
                v-model="row.adult"
                type="checkbox"
                :disabled="!row.use"
                :aria-label="`${row.name} est adulte`"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p class="hint">
        Un même nom regroupe plusieurs agendas. Seuls les événements avec une adresse deviennent des
        trajets.
      </p>
      <button class="b primary" type="button" :disabled="status === 'saving'" @click="save">
        Enregistrer
      </button>
      <span v-if="status === 'saved'" class="pill">Enregistré</span>
    </template>
    <p v-if="status === 'error'" class="pill warn">{{ message }}</p>
  </section>
</template>
