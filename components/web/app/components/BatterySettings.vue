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
const name = (id: string) => placeName(store.household, id);
/** A known place by its name, otherwise the address the position was found at. */
const here = computed(() => {
  if (where.value?.actual) return name(where.value.actual);
  return (
    car.value?.address ?? (car.value?.lat == null ? 'position non communiquée' : 'adresse inconnue')
  );
});
const refreshing = ref(false);
const refresh = async () => {
  refreshing.value = true;
  try {
    await store.refreshVehicle();
  } finally {
    refreshing.value = false;
  }
};
const onSoc = (e: Event) => store.setSoc(Number((e.target as HTMLInputElement).value));
</script>

<template>
  <section class="card">
    <h2>Batterie {{ modeLabel(store.household, store.household.trackedMode) }}</h2>
    <template v-if="store.battery.source === 'car'">
      <p class="setting">
        Niveau actuel<span class="num">{{ store.battery.soc }} %</span>
      </p>
      <p class="hint">Lu sur la voiture {{ when(store.battery.at) }}.</p>
    </template>
    <template v-else>
      <label class="setting" for="s-soc">
        Niveau actuel<span class="num">{{ store.battery.soc }} %</span>
        <input
          id="s-soc"
          type="range"
          min="5"
          max="100"
          :value="store.battery.soc"
          @input="onSoc"
        />
      </label>
      <p class="hint">
        {{ store.battery.at ? `Saisi ${when(store.battery.at)}.` : 'À relever sur la voiture.' }}
        Partagé avec tout le foyer.
      </p>
    </template>

    <template v-if="store.vehicle?.linked">
      <p v-if="store.vehicle.asleep" class="hint">
        La voiture dort : dernières données conservées. « Actualiser maintenant » la réveille.
      </p>
      <p v-if="car" class="hint">
        Actuellement : <strong>{{ here }}</strong
        ><template v-if="where && !where.matches">
          · le planning la prévoyait à {{ name(where.expected) }}</template
        >.
      </p>
      <p v-if="store.vehicle.broken" class="pill warn">
        Tesla ne répond plus pour ce compte : reliez la voiture à nouveau.
      </p>
      <div class="equip">
        <button class="b" type="button" :disabled="refreshing" @click="refresh">
          {{ refreshing ? 'Réveil de la voiture…' : 'Actualiser maintenant' }}
        </button>
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
