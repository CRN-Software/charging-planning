<script setup lang="ts">
import { fuelEurPerKm, type ChargerSetup, type Equipment } from '@charging/contracts';
import { useHouseholdStore } from '~/stores/household';
import {
  asSupercharger,
  editable,
  newCharger,
  newVehicle,
  toggleDay,
  WEEKDAYS,
} from '~/utils/equipment';

const store = useHouseholdStore();
const form = ref<Equipment | null>(null);
const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const message = ref('');
const people = computed(() => store.remote?.settings.people ?? []);

watchEffect(() => {
  const stored = store.remote?.settings.equipment;
  if (stored && !form.value) form.value = editable(stored);
});

const removeCharger = (c: ChargerSetup) => {
  if (form.value) form.value.chargers = form.value.chargers.filter((x) => x !== c);
};
const setPricing = (c: ChargerSetup, tariffs: boolean) => {
  if (tariffs) {
    c.tariffs = [[0, c.price ?? 0.2]];
    delete c.price;
  } else {
    c.price = c.tariffs?.[0]?.[1] ?? 0;
    delete c.tariffs;
  }
};
const setWorkplace = (c: ChargerSetup, person: string) => {
  if (!person) delete c.workplace;
  else
    c.workplace = {
      days: c.workplace?.days ?? [0, 1, 2, 3, 4],
      start: c.workplace?.start ?? '8:30',
      end: c.workplace?.end ?? '17:30',
      person,
    };
};

async function save() {
  if (!form.value) return;
  status.value = 'saving';
  try {
    await store.saveEquipment(form.value);
    form.value = null;
    status.value = 'saved';
  } catch {
    status.value = 'error';
    message.value =
      'Enregistrement impossible : vérifiez les adresses des bornes et la voiture suivie.';
  }
}
</script>

<template>
  <section v-if="form" class="card setup">
    <div class="card-head">
      <h2>Véhicules et bornes</h2>
      <span class="eyebrow">partagés avec le foyer</span>
    </div>

    <h3>Véhicules</h3>
    <div v-for="v in form.vehicles" :key="v.id" class="equip resource">
      <input v-model="v.label" type="text" :aria-label="`Nom de ${v.label}`" />
      <label v-if="v.electric"
        ><input v-model="form.trackedVehicle" type="radio" :value="v.id" /> Batterie
        planifiée</label
      >
      <template v-if="v.electric">
        <label
          >Batterie
          <input v-model.number="v.batteryKwh" type="number" min="10" step="1" /> kWh</label
        >
        <label
          >Conso <input v-model.number="v.whPerKm" type="number" min="50" step="5" /> Wh/km</label
        >
      </template>
      <template v-else>
        <label
          >Conso
          <input v-model.number="v.litersPer100Km" type="number" min="1" step="0.1" /> l/100</label
        >
        <label
          >Carburant
          <input v-model.number="v.eurPerLiter" type="number" min="0.5" step="0.01" /> €/l</label
        >
        <span class="muted">{{ fuelEurPerKm(v).toFixed(2) }} €/km</span>
      </template>
      <button
        v-if="form.vehicles.length > 1"
        class="b"
        type="button"
        @click="form.vehicles = form.vehicles.filter((x) => x !== v)"
      >
        Retirer
      </button>
    </div>
    <div class="equip">
      <button class="b" type="button" @click="form.vehicles.push(newVehicle(form.vehicles, true))">
        + électrique
      </button>
      <button class="b" type="button" @click="form.vehicles.push(newVehicle(form.vehicles, false))">
        + thermique
      </button>
      <label
        >Réserve <input v-model.number="form.reserveKm" type="number" min="0" step="1" /> km jusqu'à
        la borne la plus proche</label
      >
    </div>

    <h3>Bornes</h3>
    <div v-for="c in form.chargers" :key="c.id" class="charger resource">
      <div class="equip">
        <input v-model="c.label" type="text" :aria-label="`Nom de ${c.label}`" />
        <input
          v-model="c.address"
          type="text"
          placeholder="Adresse"
          :aria-label="`Adresse de ${c.label}`"
          class="wide"
        />
      </div>
      <div class="equip">
        <label><input v-model.number="c.kw" type="number" min="1" step="1" /> kW</label>
        <label
          >jusqu'à
          <input v-model.number="c.limit" type="number" min="10" max="100" step="5" /> %</label
        >
        <label
          ><input
            type="checkbox"
            :checked="Boolean(c.tariffs)"
            @change="setPricing(c, ($event.target as HTMLInputElement).checked)"
          />
          tarifs par tranche</label
        >
        <label v-if="!c.tariffs"
          ><input v-model.number="c.price" type="number" min="0" step="0.01" /> €/kWh</label
        >
      </div>
      <TariffEditor
        v-if="c.tariffs"
        :tariffs="c.tariffs"
        @change="(t) => (c.tariffs = t.map(([hour, price]) => [hour, price]))"
      />
      <div class="equip">
        <span class="muted">Ouverte</span>
        <label v-for="(name, day) in WEEKDAYS" :key="day" class="day-box"
          ><input
            type="checkbox"
            :checked="(c.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).includes(day)"
            @change="c.weekdays = toggleDay(c.weekdays, day)"
          />{{ name }}</label
        >
      </div>
      <div class="equip">
        <label
          >Au travail de
          <select
            :value="c.workplace?.person ?? ''"
            @change="setWorkplace(c, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">personne (borne sur la route)</option>
            <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select></label
        >
        <template v-if="c.workplace">
          <label>de <input v-model="c.workplace.start" type="time" /></label>
          <label>à <input v-model="c.workplace.end" type="time" /></label>
          <label v-for="(name, day) in WEEKDAYS" :key="`w${day}`" class="day-box"
            ><input
              type="checkbox"
              :checked="c.workplace.days.includes(day)"
              @change="c.workplace.days = toggleDay(c.workplace.days, day)"
            />{{ name }}</label
          >
        </template>
        <label v-else
          >séance
          <input v-model.number="c.sessionH" type="number" min="0.25" step="0.25" /> h</label
        >
      </div>
      <div class="equip">
        <button class="b" type="button" @click="Object.assign(c, asSupercharger(c))">
          Préremplir en superchargeur
        </button>
        <button class="b" type="button" @click="removeCharger(c)">Retirer la borne</button>
      </div>
    </div>
    <button class="b" type="button" @click="form.chargers.push(newCharger(form.chargers))">
      + borne
    </button>

    <div class="equip">
      <button class="b primary" type="button" :disabled="status === 'saving'" @click="save">
        Enregistrer
      </button>
      <span v-if="status === 'saved'" class="pill">Enregistré</span>
      <span v-if="status === 'error'" class="pill warn">{{ message }}</span>
    </div>
  </section>
</template>
