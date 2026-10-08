<script setup lang="ts">
const { data: me, refresh } = await useMe();

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' });
  await refresh();
};
</script>

<template>
  <div class="account">
    <template v-if="me">
      <span class="pill">{{ me.name }} · {{ me.household.name }}</span>
      <span v-if="!me.calendarAccess" class="pill warn">Accès aux agendas refusé</span>
      <button type="button" class="b" @click="logout">Se déconnecter</button>
    </template>
  </div>
</template>
