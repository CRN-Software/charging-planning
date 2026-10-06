<script setup lang="ts">
import { fmtH, pctToKwh, type AppliedCharge, type Day, type Plan } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { fmtEur } from '~/utils/format';
import { chargeHow, chargeWhy } from '~/utils/labels';

const props = defineProps<{ plan: Plan; days: readonly Day[] }>();
defineEmits<{ add: [] }>();
const store = useHouseholdStore();

const charges = computed(() =>
  props.plan.sim.applied.filter((c) => c.amount > 0.5 || c.kind === 'manual'),
);
const kwh = (c: AppliedCharge) => pctToKwh(c.amount, store.settings);
const line = (c: AppliedCharge) => `${Math.round(kwh(c))} kWh · ${fmtEur(kwh(c) * c.price)}`;
const why = (c: AppliedCharge) => chargeWhy(c, props.days, store.settings.reserveKm);
</script>

<template>
  <section class="card">
    <div class="card-head">
      <h2>Recharges à prévoir</h2>
      <button class="b" type="button" @click="$emit('add')">Ajouter une recharge</button>
    </div>
    <div class="plan">
      <div
        v-for="c in charges"
        :key="c.id"
        class="plan-item"
        :class="{ routine: c.kind === 'routine' }"
      >
        <div class="plan-when">
          <b>{{ days[c.d]?.label }}</b>
          <span class="t">{{ fmtH(c.t % 24) }}</span>
        </div>
        <div class="plan-body">
          <div class="plan-head">
            <span>{{ c.label }}</span>
            <strong class="num">+{{ Math.round(c.amount) }} %</strong>
          </div>
          <div class="muted">{{ chargeHow(c) }} · {{ line(c) }}</div>
          <div v-if="why(c)" class="plan-why">{{ why(c) }}</div>
          <button
            v-if="c.kind === 'manual'"
            class="b danger"
            type="button"
            @click="store.removeCharge(c.manualId ?? '')"
          >
            Supprimer
          </button>
          <button
            v-else-if="c.kind !== 'routine'"
            class="b"
            :class="{ primary: !store.accepted.includes(c.id) }"
            type="button"
            @click="store.toggleAccepted(c.id)"
          >
            {{ store.accepted.includes(c.id) ? 'Prévu ✓' : 'Je le prévois' }}
          </button>
        </div>
      </div>
      <p v-if="!charges.length" class="empty">
        Aucune recharge nécessaire sur les 7 prochains jours.
      </p>
    </div>
  </section>
</template>
