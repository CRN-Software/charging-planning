<script setup lang="ts">
import { useHouseholdStore } from '~/stores/household';

defineProps<{ label: string; vehicle: string }>();
const store = useHouseholdStore();
</script>

<template>
  <header>
    <div>
      <div class="eyebrow">{{ label }} · {{ vehicle }}</div>
      <h1>Semaine de charge</h1>
    </div>
    <AccountMenu />
    <div class="pills">
      <span class="pill warn">Démo : batterie saisie à la main</span>
      <span v-if="store.connected" class="pill">Agendas Google</span>
      <span v-else class="pill warn">Démo : agendas d'exemple</span>
      <span v-if="store.connected" class="pill warn">Bornes : superchargeurs par défaut</span>
      <span class="pill">Pas de borne au domicile</span>
    </div>
  </header>
</template>
