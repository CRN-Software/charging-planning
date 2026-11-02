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
      <a v-if="!me.calendarAccess" class="pill warn" href="/api/auth/google?consent=1"
        >Reconnecter les agendas</a
      >
      <button type="button" class="b" @click="logout">Se déconnecter</button>
    </template>
  </div>
</template>
