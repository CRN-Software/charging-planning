import { defineStore } from 'pinia';
import type {
  EventTemplate,
  GapChoice,
  Household,
  ManualCharge,
  ModeId,
  Override,
  Settings,
} from '@charging/planner';
import {
  EMPTY_PLANNING,
  type Agenda,
  type Equipment,
  type HouseholdSettings,
  type Planning,
  type UnlocatedEvent,
  type VehicleStatus,
} from '@charging/contracts';
import { latestBattery, type Battery } from '~/utils/vehicle';
import {
  agendaEvents,
  batterySettings,
  connectedHousehold,
  isConfigured,
} from '~/utils/connected-household';

const VIEW_KEY = 'charging-planning.view';
/** Corrections are saved shortly after the last change, not on every keystroke. */
const SAVE_DELAY_MS = 600;

/** What the API knows about a signed-in household. */
export interface Remote {
  settings: HouseholdSettings;
  agenda: Agenda | null;
}

export type View = 'calendar' | 'list' | 'timeline';

/** The household's week (shared by its members, stored by the API) and the browser's view. */
export interface HouseholdState extends Planning {
  view: View;
  remote: Remote | null;
  vehicle: VehicleStatus | null;
  planningLoaded: boolean;
}

const initialState = (): HouseholdState => ({
  ...EMPTY_PLANNING,
  view: 'calendar',
  remote: null,
  vehicle: null,
  planningLoaded: false,
});

const planningOf = (s: HouseholdState): Planning => ({
  soc: s.soc,
  socAt: s.socAt,
  overrides: s.overrides,
  gaps: s.gaps,
  extraEvents: s.extraEvents,
  manualCharges: s.manualCharges,
  accepted: s.accepted,
});

const connectedRemote = (state: HouseholdState) => {
  const settings = state.remote?.settings ?? null;
  return isConfigured(settings) && state.remote?.agenda
    ? { settings, agenda: state.remote.agenda }
    : null;
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useHouseholdStore = defineStore('household', {
  state: initialState,
  getters: {
    connected: (state): boolean => connectedRemote(state) !== null,
    /** Timed events without an address: shown so a forgotten one shows up, never planned. */
    unlocated: (state): UnlocatedEvent[] => state.remote?.agenda?.unlocated ?? [],
    household: (state): Household => {
      const remote = connectedRemote(state);
      return remote
        ? connectedHousehold(remote.settings, remote.agenda)
        : connectedHousehold(
            {
              homeAddress: null,
              home: { lat: 0, lon: 0 },
              people: [],
              calendars: [],
              equipment: {
                vehicles: [{ id: 'tesla', label: 'Tesla', electric: true }],
                trackedVehicle: 'tesla',
                chargers: [],
                reserveKm: 0,
              },
            },
            {
              events: [],
              places: {},
              unlocated: [],
              unresolved: [],
              ignored: { noLocation: 0, allDay: 0, online: 0, cancelled: 0 },
            },
          );
    },
    battery: (state): Battery => latestBattery(state, state.vehicle),
    settings(): Settings {
      return batterySettings(this.remote?.settings ?? null, this.battery.soc);
    },
    events: (state): EventTemplate[] => {
      const remote = connectedRemote(state);
      return remote ? [...agendaEvents(remote.agenda), ...state.extraEvents] : [];
    },
  },
  actions: {
    /** Browser only: the remembered view, and saving every later change of the week. */
    hydrate() {
      try {
        const view = localStorage.getItem(VIEW_KEY);
        if (view === 'calendar' || view === 'list' || view === 'timeline') this.view = view;
      } catch {
        /* storage unavailable */
      }
      this.$subscribe((_mutation, state) => {
        try {
          localStorage.setItem(VIEW_KEY, state.view);
        } catch {
          /* storage unavailable */
        }
        if (!state.planningLoaded) return;
        clearTimeout(saveTimer);
        const body = planningOf(state);
        saveTimer = setTimeout(
          () => void $fetch('/api/household/planning', { method: 'PUT', body }),
          SAVE_DELAY_MS,
        );
      });
    },
    /** The signed-in household's setup, the events of its calendars and its week. */
    async loadRemote() {
      const [settings, planning, vehicle] = await Promise.all([
        $fetch<HouseholdSettings>('/api/household'),
        $fetch<Planning>('/api/household/planning'),
        $fetch<VehicleStatus>('/api/tesla/vehicle').catch(() => null),
      ]);
      const agenda = isConfigured(settings) ? await $fetch<Agenda>('/api/household/agenda') : null;
      this.$patch({ ...planning, remote: { settings, agenda }, vehicle, planningLoaded: true });
    },
    /** Wakes the car if needed and reads it now (explicit request only). */
    async refreshVehicle() {
      this.vehicle = await $fetch<VehicleStatus>('/api/tesla/vehicle/refresh', { method: 'POST' });
    },
    async unlinkVehicle() {
      await $fetch('/api/tesla/vehicle', { method: 'DELETE' });
      this.vehicle = await $fetch<VehicleStatus>('/api/tesla/vehicle');
    },
    async saveEquipment(equipment: Equipment) {
      await $fetch('/api/household/equipment', { method: 'PUT', body: equipment });
      await this.loadRemote();
    },
    /** Battery level read on the car. */
    setSoc(value: number) {
      this.soc = value;
      this.socAt = new Date().toISOString();
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
    addEvent(event: EventTemplate) {
      this.extraEvents = [...this.extraEvents, { ...event, participants: [...event.participants] }];
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
    setView(view: View) {
      this.view = view;
    },
  },
});
