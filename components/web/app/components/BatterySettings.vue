<script setup lang="ts">
import { placeName, type Day, type Plan } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import { modeLabel } from '~/utils/plan';
import { whereabouts } from '~/utils/vehicle';

const props = defineProps<{ plan: Plan; days: readonly Day[] }>();
const store = useHouseholdStore();
const route = useRoute();
const LINK_RESULTS: Record<string, string> = {
  ok: 'Voiture reliée.',
  echec: 'La liaison avec Tesla a échoué.',
  indisponible: "Tesla n'est pas configuré sur ce serveur.",
};
const linkResult = computed(() => LINK_RESULTS[String(route.query.tesla ?? '')] ?? '');

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    : '';
const car = computed(() => store.vehicle?.snapshot ?? null);
const where = computed(
  () => car.value && whereabouts(props.plan, store.household, props.days, car.value),
);
const name = (id: string | null) => (id ? placeName(store.household, id) : 'ailleurs');
const onSoc = (e: Event) => store.setSoc(Number((e.target as HTMLInputElement).value));
</script>

<template>
  <section class="card">
    <h2>Batterie {{ modeLabel(store.household, store.household.trackedMode) }}</h2>
    <label class="setting" for="s-soc">
      Niveau actuel<span class="num">{{ store.battery.soc }} %</span>
      <input id="s-soc" type="range" min="5" max="100" :value="store.battery.soc" @input="onSoc" />
    </label>
    <p class="hint">
      <template v-if="store.battery.source === 'car'"
        >Lu sur la voiture {{ when(store.battery.at) }}.</template
      >
      <template v-else-if="store.battery.at">Saisi {{ when(store.battery.at) }}.</template>
      <template v-else>À relever sur la voiture.</template>
      Partagé avec tout le foyer.
    </p>

    <template v-if="store.vehicle?.linked">
      <p v-if="car" class="hint">
        Limite de charge {{ car.limit }} %<template v-if="store.vehicle.asleep">
          · la voiture dort : dernières données conservées, elle n'est jamais réveillée</template
        >.
      </p>
      <p v-if="where" class="pill" :class="{ warn: !where.matches }">
        <template v-if="where.matches">À {{ name(where.actual) }}, comme prévu.</template>
        <template v-else>
          Signalée {{ name(where.actual) }}, le planning la prévoyait à {{ name(where.expected) }}.
        </template>
      </p>
      <p v-if="store.vehicle.broken" class="pill warn">
        Tesla ne répond plus pour ce compte : reliez la voiture à nouveau.
      </p>
      <div class="equip">
        <a v-if="store.vehicle.broken" class="b primary" href="/api/tesla/link">Relier à nouveau</a>
        <button class="b" type="button" @click="store.unlinkVehicle()">
          Délier {{ store.vehicle.name ?? 'la voiture' }}
        </button>
      </div>
    </template>
    <div v-else-if="store.vehicle?.available" class="equip">
      <a class="b primary" href="/api/tesla/link">Relier la Tesla</a>
      <span class="muted">Batterie et position lues sans jamais réveiller la voiture.</span>
    </div>
    <p v-if="linkResult" class="pill">{{ linkResult }}</p>
  </section>
</template>
