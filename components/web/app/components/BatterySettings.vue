<script setup lang="ts">
import { useHouseholdStore } from '~/stores/household';
import { modeLabel } from '~/utils/plan';

const store = useHouseholdStore();
const read = computed(() =>
  store.socAt
    ? new Date(store.socAt).toLocaleString('fr-FR', {
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
);
const onSoc = (e: Event) => store.setSoc(Number((e.target as HTMLInputElement).value));
</script>

<template>
  <section class="card">
    <h2>Batterie {{ modeLabel(store.household, store.household.trackedMode) }}</h2>
    <label class="setting" for="s-soc">
      Niveau actuel<span class="num">{{ store.soc }} %</span>
      <input id="s-soc" type="range" min="5" max="100" :value="store.soc" @input="onSoc" />
    </label>
    <p class="hint">
      {{ read ? `Lu ${read}.` : 'À relever sur la voiture.' }} Partagé avec tout le foyer.
    </p>
  </section>
</template>
