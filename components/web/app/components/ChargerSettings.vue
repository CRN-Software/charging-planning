<script setup lang="ts">
import type { Charger } from '@charging/planner';
import { useHouseholdStore, type ChargerPatch } from '~/stores/household';

const store = useHouseholdStore();
type Field = {
  key: keyof ChargerPatch & ('kw' | 'price' | 'limit');
  label: string;
  unit: string;
  step?: number;
};
const FIELDS: readonly Field[] = [
  { key: 'kw', label: 'Puissance', unit: 'kW' },
  { key: 'price', label: 'Prix', unit: '€/kWh', step: 0.01 },
  { key: 'limit', label: 'Limite de charge', unit: '%' },
];
const fieldsFor = (c: Charger) => FIELDS.filter((f) => f.key !== 'price' || !c.tariffs?.length);
</script>

<template>
  <section class="card">
    <h2>Bornes</h2>
    <div class="chargers">
      <div v-for="(c, id) in store.household.chargers" :key="id" class="charger">
        <span class="eyebrow">{{ c.label }}</span>
        <NumberField
          v-for="f in fieldsFor(c)"
          :id="`c-${id}-${f.key}`"
          :key="f.key"
          :label="f.label"
          :unit="f.unit"
          :step="f.step"
          :value="c[f.key] ?? 0"
          @change="(v) => store.patchCharger(String(id), { [f.key]: v })"
        />
        <TariffEditor
          v-if="c.tariffs?.length"
          :tariffs="c.tariffs"
          @change="(t) => store.patchCharger(String(id), { tariffs: t })"
        />
      </div>
    </div>
  </section>
</template>
