<script setup lang="ts">
const route = useRoute();
const failed = computed(() => route.query.connexion === 'echec');
</script>

<template>
  <main class="login">
    <div class="eyebrow">Semaine de charge</div>
    <h1>Planifiez la recharge de votre voiture électrique à partir des agendas du foyer.</h1>
    <p class="muted">
      Qui se déplace, quand, avec quel véhicule, et où recharger au meilleur prix sans jamais tomber
      en panne.
    </p>
    <a class="b primary" href="/api/auth/google">Se connecter avec Google</a>
    <p v-if="failed" class="pill warn">La connexion a échoué, réessayez.</p>
  </main>
</template>
