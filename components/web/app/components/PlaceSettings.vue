<script setup lang="ts">
import { distance, HOME } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';

const store = useHouseholdStore();
const places = computed(() => Object.entries(store.household.places).filter(([id]) => id !== HOME));
</script>

<template>
  <section class="card">
    <div class="card-head">
      <h2>Lieux</h2>
      <span class="eyebrow">km du domicile</span>
    </div>
    <div class="fields">
      <NumberField
        v-for="[id, p] in places"
        :id="`p-${id}`"
        :key="id"
        :label="p.name"
        unit="km"
        :tag="p.charger ? 'borne' : undefined"
        :value="distance(store.household.places, HOME, id)"
        @change="(v) => store.setPlaceKm(id, v)"
      />
    </div>
    <p class="hint">Corrections gardées dans ce navigateur.</p>
    <button class="b" type="button" @click="store.reset()">Tout réinitialiser</button>
  </section>
</template>
