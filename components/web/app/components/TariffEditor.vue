<script setup lang="ts">
import type { Tariff } from '@charging/planner';

const props = defineProps<{ tariffs: readonly Tariff[] }>();
const emit = defineEmits<{ change: [tariffs: Tariff[]] }>();
const NEW_TRANCHE_HOUR = 12;

const sorted = computed<Tariff[]>(() => [...props.tariffs].sort((a, b) => a[0] - b[0]));
const numberOf = (e: Event) => Number((e.target as HTMLInputElement).value);

const update = (i: number, field: 0 | 1, value: number) =>
  emit(
    'change',
    sorted.value.map((row, j): Tariff =>
      j !== i ? row : field === 0 ? [value, row[1]] : [row[0], value],
    ),
  );
const remove = (i: number) => {
  if (sorted.value.length > 1)
    emit(
      'change',
      sorted.value.filter((_, j) => j !== i),
    );
};
const add = () =>
  emit('change', [...sorted.value, [NEW_TRANCHE_HOUR, sorted.value.at(-1)?.[1] ?? 0]]);
</script>

<template>
  <div class="tariffs">
    <span class="tariff-title">Tarifs par tranche (jusqu'à la suivante)</span>
    <div v-for="(row, i) in sorted" :key="`${i}-${row[0]}`" class="tariff">
      <label
        >dès
        <input
          type="number"
          min="0"
          max="23"
          :value="row[0]"
          aria-label="Heure"
          @change="(e) => update(i, 0, numberOf(e))"
        />
        h</label
      >
      <label
        ><input
          type="number"
          min="0"
          step="0.01"
          :value="row[1]"
          aria-label="Prix"
          @change="(e) => update(i, 1, numberOf(e))"
        />
        €/kWh</label
      >
      <button class="b" type="button" aria-label="Supprimer la tranche" @click="remove(i)">
        ×
      </button>
    </div>
    <button class="b" type="button" @click="add">+ tranche</button>
  </div>
</template>
