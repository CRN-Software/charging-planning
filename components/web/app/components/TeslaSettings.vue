<script setup lang="ts">
import type { Settings } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { modeLabel } from '~/utils/plan';

const store = useHouseholdStore();
const FIELDS: readonly { key: keyof Settings; label: string; unit: string }[] = [
  { key: 'reserveKm', label: 'Réserve : km jusqu’à la borne la plus proche', unit: 'km' },
  { key: 'batteryKwh', label: 'Batterie utile', unit: 'kWh' },
  { key: 'whPerKm', label: 'Consommation', unit: 'Wh/km' },
];
const onSoc = (e: Event) => store.setSetting('soc', Number((e.target as HTMLInputElement).value));
</script>

<template>
  <section class="card">
    <h2>{{ modeLabel(store.household, store.household.trackedMode) }}</h2>
    <div class="fields">
      <label class="setting" for="s-soc">
        Batterie actuelle<span class="num">{{ store.settings.soc }} %</span>
        <input
          id="s-soc"
          type="range"
          min="5"
          max="100"
          :value="store.settings.soc"
          @input="onSoc"
        />
      </label>
      <NumberField
        v-for="f in FIELDS"
        :id="`v-${f.key}`"
        :key="f.key"
        :label="f.label"
        :unit="f.unit"
        :value="store.settings[f.key]"
        @change="(v) => store.setSetting(f.key, v)"
      />
    </div>
  </section>
</template>
