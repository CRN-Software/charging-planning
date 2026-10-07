import { defineStore } from 'pinia';
import {
  DEMO_EVENTS,
  DEMO_HOUSEHOLD,
  DEMO_SETTINGS,
  type Charger,
  type EventTemplate,
  type GapChoice,
  type Household,
  type ManualCharge,
  type ModeId,
  type Override,
  type Place,
  type Settings,
  type Tariff,
} from '@charging/planner';
import type { Agenda, HouseholdSettings } from '@charging/contracts';
import { agendaEvents, connectedHousehold, isConfigured } from '~/utils/connected-household';

const STORAGE_KEY = 'charging-planning.v3';
/** Demo and each household keep their own corrections: their places and people differ. */
let storageKey = STORAGE_KEY;

/** What the API knows about a signed-in household: never saved in the browser. */
export interface Remote {
  settings: HouseholdSettings;
  agenda: Agenda | null;
}

export type View = 'calendar' | 'list';
export type ChargerPatch = Partial<Pick<Charger, 'kw' | 'price' | 'limit'>> & {
  tariffs?: Tariff[];
};

/** Everything the user changes; today kept in the browser, later stored by the API per household. */
export interface UserState {
  settings: Settings;
  overrides: Record<string, Override>;
  gaps: Record<string, GapChoice>;
  extraEvents: EventTemplate[];
  placeKm: Record<string, number>;
  customPlaces: Record<string, Place>;
  chargers: Record<string, ChargerPatch>;
  manualCharges: ManualCharge[];
  accepted: string[];
  view: View;
  remote: Remote | null;
}

const initialState = (): UserState => ({
  settings: { ...DEMO_SETTINGS },
  overrides: {},
  gaps: {},
  extraEvents: [],
  placeKm: {},
  customPlaces: {},
  chargers: {},
  manualCharges: [],
  accepted: [],
  view: 'calendar',
  remote: null,
});

function readSaved(): Partial<UserState> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<UserState>;
  } catch {
    return {};
  }
}

function mergePlaces(base: Household, state: UserState): Record<string, Place> {
  const all = { ...base.places, ...state.customPlaces };
  return Object.fromEntries(
    Object.entries(all).map(([id, p]) => {
      const km = state.placeKm[id];
      return [id, km === undefined ? p : { ...p, km }];
    }),
  );
}

const mergeChargers = (base: Household, state: UserState): Record<string, Charger> =>
  Object.fromEntries(
    Object.entries(base.chargers).map(([id, c]) => [id, { ...c, ...state.chargers[id] }]),
  );

const connectedRemote = (state: UserState) => {
  const settings = state.remote?.settings ?? null;
  return isConfigured(settings) && state.remote?.agenda
    ? { settings, agenda: state.remote.agenda }
    : null;
};

const baseHousehold = (state: UserState): Household => {
  const remote = connectedRemote(state);
  return remote ? connectedHousehold(remote.settings, remote.agenda) : DEMO_HOUSEHOLD;
};

export const useHouseholdStore = defineStore('household', {
  state: initialState,
  getters: {
    connected: (state): boolean => connectedRemote(state) !== null,
    household: (state): Household => {
      const base = baseHousehold(state);
      return { ...base, places: mergePlaces(base, state), chargers: mergeChargers(base, state) };
    },
    events: (state): EventTemplate[] => {
      const remote = connectedRemote(state);
      return [...(remote ? agendaEvents(remote.agenda) : DEMO_EVENTS), ...state.extraEvents];
    },
  },
  actions: {
    /** Browser only: reload what the user changed and save every later change. */
    hydrate(householdId?: string) {
      storageKey = householdId ? `${STORAGE_KEY}.${householdId}` : STORAGE_KEY;
      const { remote: _ignored, ...saved } = readSaved();
      this.$patch({ ...saved, settings: { ...DEMO_SETTINGS, ...saved.settings } });
      this.$subscribe((_mutation, state) => {
        const { remote: _remote, ...corrections } = state;
        try {
          localStorage.setItem(storageKey, JSON.stringify(corrections));
        } catch {
          /* storage unavailable */
        }
      });
    },
    /** The signed-in household's setup and the events of its calendars. */
    async loadRemote() {
      const settings = await $fetch<HouseholdSettings>('/api/household');
      const agenda = isConfigured(settings) ? await $fetch<Agenda>('/api/household/agenda') : null;
      this.remote = { settings, agenda };
    },
    setSetting(key: keyof Settings, value: number) {
      this.settings = { ...this.settings, [key]: value };
    },
    setOverride(group: string, patch: Override) {
      const { [group]: _previous, ...rest } = this.overrides;
      this.overrides = Object.keys(patch).length ? { ...rest, [group]: patch } : rest;
    },
    setMode(group: string, mode: ModeId) {
      this.overrides = { ...this.overrides, [group]: { ...this.overrides[group], mode } };
    },
    setGaps(choices: Record<string, GapChoice | ''>) {
      const merged = { ...this.gaps, ...choices };
      this.gaps = Object.fromEntries(
        Object.entries(merged).filter((e): e is [string, GapChoice] => e[1] !== ''),
      );
    },
    toggleGap(id: string, stay: boolean) {
      this.gaps = { ...this.gaps, [id]: stay ? 'home' : 'stay' };
    },
    addEvent(event: EventTemplate, newPlace?: [string, Place]) {
      this.extraEvents = [...this.extraEvents, event];
      if (newPlace) this.customPlaces = { ...this.customPlaces, [newPlace[0]]: newPlace[1] };
    },
    removeEvent(id: string) {
      this.extraEvents = this.extraEvents.filter((e) => e.id !== id);
    },
    addCharge(charge: ManualCharge) {
      this.manualCharges = [...this.manualCharges, charge];
    },
    removeCharge(id: string) {
      this.manualCharges = this.manualCharges.filter((m) => m.id !== id);
    },
    toggleAccepted(id: string) {
      this.accepted = this.accepted.includes(id)
        ? this.accepted.filter((a) => a !== id)
        : [...this.accepted, id];
    },
    patchCharger(id: string, patch: ChargerPatch) {
      this.chargers = { ...this.chargers, [id]: { ...this.chargers[id], ...patch } };
    },
    setPlaceKm(id: string, km: number) {
      this.placeKm = { ...this.placeKm, [id]: km };
    },
    setView(view: View) {
      this.view = view;
    },
    reset() {
      this.$patch(initialState());
    },
  },
});
