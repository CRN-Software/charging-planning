<script setup lang="ts">
defineProps<{ label: string; vehicle: string }>();
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
      <span class="pill warn">Démo : agendas d'exemple</span>
      <span class="pill">Pas de borne au domicile</span>
    </div>
  </header>
</template>
