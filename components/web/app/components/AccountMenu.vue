<script setup lang="ts">
const { data: me, refresh } = await useMe();
const route = useRoute();
const failed = computed(() => route.query.connexion === 'echec');

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' });
  await refresh();
};
</script>

<template>
  <div class="account">
    <span v-if="failed" class="pill warn">La connexion a échoué, réessayez</span>
    <template v-if="me">
      <span class="pill">{{ me.name }} · {{ me.household.name }}</span>
      <span v-if="!me.calendarAccess" class="pill warn">Accès aux agendas refusé</span>
      <button type="button" class="b" @click="logout">Se déconnecter</button>
    </template>
    <a v-else class="b primary" href="/api/auth/google">Se connecter avec Google</a>
  </div>
</template>
