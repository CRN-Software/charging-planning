<script setup lang="ts">
import type { Agenda } from '@charging/contracts';

const props = defineProps<{ myId: string; expired: Agenda['expiredAccess'] }>();
const mine = computed(() => props.expired.some((a) => a.accountId === props.myId));
const others = computed(() => props.expired.filter((a) => a.accountId !== props.myId));
</script>

<template>
  <section v-if="expired.length" class="card reconnect">
    <p v-if="mine">
      L'accès à vos agendas Google a expiré : le planning est incomplet tant que vous ne vous
      reconnectez pas.
    </p>
    <p v-for="a in others" :key="a.accountId">
      L'accès Google de <strong>{{ a.name || a.email }}</strong> a expiré : ses agendas manquent
      jusqu'à sa prochaine connexion.
    </p>
    <a v-if="mine" class="b primary" href="/api/auth/google?consent=1"
      >Se reconnecter avec Google</a
    >
  </section>
</template>
