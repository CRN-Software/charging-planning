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

const STORAGE_KEY = 'charging-planning.v3';

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
});

function readSaved(): Partial<UserState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<UserState>;
  } catch {
    return {};
  }
}

function mergePlaces(state: UserState): Record<string, Place> {
  const all = { ...DEMO_HOUSEHOLD.places, ...state.customPlaces };
  return Object.fromEntries(
    Object.entries(all).map(([id, p]) => {
      const km = state.placeKm[id];
      return [id, km === undefined ? p : { ...p, km }];
    }),
  );
}

const mergeChargers = (state: UserState): Record<string, Charger> =>
  Object.fromEntries(
    Object.entries(DEMO_HOUSEHOLD.chargers).map(([id, c]) => [id, { ...c, ...state.chargers[id] }]),
  );

export const useHouseholdStore = defineStore('household', {
  state: initialState,
  getters: {
    household: (state): Household => ({
      ...DEMO_HOUSEHOLD,
      places: mergePlaces(state),
      chargers: mergeChargers(state),
    }),
    events: (state): EventTemplate[] => [...DEMO_EVENTS, ...state.extraEvents],
  },
  actions: {
    /** Browser only: reload what the user changed and save every later change. */
    hydrate() {
      const saved = readSaved();
      this.$patch({ ...saved, settings: { ...DEMO_SETTINGS, ...saved.settings } });
      this.$subscribe((_mutation, state) => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
          /* storage unavailable */
        }
      });
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
