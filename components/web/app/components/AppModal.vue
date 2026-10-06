<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; error?: string }>();
const emit = defineEmits<{ close: []; save: [] }>();
const sheet = ref<HTMLElement | null>(null);
onMounted(() => sheet.value?.querySelector<HTMLElement>('select, input')?.focus());
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div ref="sheet" class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <div>
        <span class="eyebrow">{{ eyebrow }}</span>
        <h2>{{ title }}</h2>
      </div>
      <slot />
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button class="b" type="button" @click="emit('close')">Annuler</button>
        <button class="b primary" type="button" @click="emit('save')">Enregistrer</button>
      </div>
    </div>
  </div>
</template>
