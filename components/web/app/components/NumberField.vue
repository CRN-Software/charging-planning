<script setup lang="ts">
defineProps<{
  id: string;
  label: string;
  value: number;
  unit: string;
  step?: number;
  tag?: string;
}>();
const emit = defineEmits<{ change: [value: number] }>();
const onChange = (e: Event) => {
  const value = Number((e.target as HTMLInputElement).value);
  emit('change', Math.max(0, Number.isFinite(value) ? value : 0));
};
</script>

<template>
  <label class="place" :for="id">
    <span
      >{{ label }}<em v-if="tag">{{ tag }}</em></span
    >
    <span class="km"
      ><input :id="id" type="number" min="0" :step="step ?? 1" :value="value" @change="onChange" />
      {{ unit }}</span
    >
  </label>
</template>
