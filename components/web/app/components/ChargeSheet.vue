<script setup lang="ts">
import { fmtH, maxPctFor, priceAt, toH, type Day } from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';
import type { Slot } from '~/utils/calendar';
import { fmtRate, timeValue } from '~/utils/format';

const DEFAULT_SLOT: Slot = { d: 0, start: 22, end: 22.5 };

const props = defineProps<{ days: readonly Day[]; initial?: Slot | undefined }>();
const emit = defineEmits<{ close: [] }>();
const store = useHouseholdStore();
const chargers = computed(() => store.household.chargers);
const slot = props.initial ?? DEFAULT_SLOT;

const firstPublic =
  Object.entries(store.household.chargers).find(([, c]) => !c.workplace)?.[0] ?? '';
const form = reactive({
  charger: firstPublic,
  d: slot.d,
  start: timeValue(slot.start),
  end: timeValue(slot.end),
});
const error = ref('');

const preview = computed<{ text: string; ok: boolean }>(() => {
  const c = chargers.value[form.charger];
  const day = props.days[form.d];
  if (!c || !day) return { text: 'Choisissez une borne et un jour.', ok: false };
  if (c.weekdays && !c.weekdays.includes(day.wd))
    return { text: `${c.label} : du lundi au vendredi uniquement.`, ok: false };
  if (!form.start || !form.end || toH(form.end) <= toH(form.start))
    return { text: 'La fin doit suivre le début.', ok: false };
  const hours = toH(form.end) - toH(form.start);
  const pct = Math.min(maxPctFor(c, hours, store.settings), c.limit);
  return {
    ok: true,
    text: `${fmtH(hours)} à ${c.kw} kW : jusqu'à +${Math.round(pct)} % (limite ${c.limit} %) · ${fmtRate(priceAt(c, toH(form.start)))}`,
  };
});

function save() {
  if (!preview.value.ok) {
    error.value = preview.value.text;
    return;
  }
  const wd = props.days[form.d]?.wd ?? 0;
  store.addCharge({
    id: `${Date.now()}`,
    charger: form.charger,
    wd,
    start: form.start,
    end: form.end,
  });
  emit('close');
}
</script>

<template>
  <AppModal
    eyebrow="Recharge manuelle"
    title="Ajouter une recharge"
    :error="error"
    @close="emit('close')"
    @save="save"
  >
    <label for="c-charger"
      >Borne
      <select id="c-charger" v-model="form.charger">
        <option v-for="(c, id) in chargers" :key="id" :value="id">{{ c.label }}</option>
      </select>
    </label>
    <label for="c-day"
      >Jour
      <select id="c-day" v-model.number="form.d">
        <option v-for="day in days" :key="day.d" :value="day.d">{{ day.label }}</option>
      </select>
    </label>
    <div class="two">
      <label for="c-start">Début<input id="c-start" v-model="form.start" type="time" /></label>
      <label for="c-end">Fin<input id="c-end" v-model="form.end" type="time" /></label>
    </div>
    <p class="preview" :class="{ error: !preview.ok }">{{ preview.text }}</p>
  </AppModal>
</template>
