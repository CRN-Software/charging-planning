import { DEFAULT_SETTINGS, EXTERNAL_PERSON, HOME } from '@charging/planner';
import type { Charger, EventTemplate, Household, Person, Place, Settings } from '@charging/planner';
import {
  fuelEurPerKm,
  type Agenda,
  type HouseholdSettings,
  type StoredEquipment,
} from '@charging/contracts';

const PERSON_COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)'];

export type ConfiguredSettings = HouseholdSettings & { home: { lat: number; lon: number } };

/** A household ready to plan: a geocoded home and at least one person with calendars. */
export const isConfigured = (settings: HouseholdSettings | null): settings is ConfiguredSettings =>
  settings?.home != null && settings.people.length > 0 && settings.calendars.length > 0;

const people = (settings: HouseholdSettings): Record<string, Person> => ({
  ...Object.fromEntries(
    settings.people.map((p, i) => [
      p.id,
      {
        name: p.name,
        driver: p.driver,
        color: PERSON_COLORS[i % PERSON_COLORS.length] ?? 'var(--p1)',
      },
    ]),
  ),
  external: EXTERNAL_PERSON,
});

const agendaPlaces = (agenda: Agenda): Record<string, Place> =>
  Object.fromEntries(
    Object.entries(agenda.places).map(([id, p]) => [
      id,
      {
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        routes: p.routes,
        ...(p.charger && { charger: p.charger }),
      },
    ]),
  );

const SOFT_MODES: Household['modes'] = {
  velo: { label: 'Vélo' },
  marche: { label: 'Marche' },
  tiers: { label: 'Véhicule tiers' },
};
const ENERGY_VALUE_EUR_PER_KWH = 0.2;
const WORKPLACE_HASSLE = 2;

const modesOf = (e: StoredEquipment): Household['modes'] => ({
  ...Object.fromEntries(e.vehicles.map((v) => [v.id, { label: v.label, vehicle: true }])),
  ...SOFT_MODES,
});

/** The place of each charger: the calendar place it belongs to, or its own. */
const chargerPlace = (agenda: Agenda, id: string) =>
  Object.entries(agenda.places).find(([, p]) => p.charger === id)?.[0] ?? `charger-${id}`;

function chargersOf(e: StoredEquipment, agenda: Agenda): Record<string, Charger> {
  return Object.fromEntries(
    e.chargers.map((c): [string, Charger] => [
      c.id,
      {
        label: c.label,
        place: chargerPlace(agenda, c.id),
        kw: c.kw,
        limit: c.limit,
        hassle: c.hassle,
        ...(c.price !== undefined && { price: c.price }),
        ...(c.tariffs?.length && { tariffs: c.tariffs }),
        ...(c.weekdays && { weekdays: c.weekdays }),
        ...(c.sessionH !== undefined && { sessionH: c.sessionH }),
        ...(c.workplace && { workplace: true }),
      },
    ]),
  );
}

function workplaceOf(e: StoredEquipment, agenda: Agenda): Household['workplace'] {
  const c = e.chargers.find((x) => x.workplace);
  if (!c?.workplace) return undefined;
  const { person, days, start, end } = c.workplace;
  return {
    who: person,
    place: chargerPlace(agenda, c.id),
    start,
    end,
    days,
    hassle: WORKPLACE_HASSLE,
  };
}

/** The planner's household: its people, home, calendar places, vehicles and chargers. */
export function connectedHousehold(settings: ConfiguredSettings, agenda: Agenda): Household {
  const e = settings.equipment;
  const others = e.vehicles.filter((v) => v.id !== e.trackedVehicle);
  const workplace = workplaceOf(e, agenda);
  return {
    people: people(settings),
    driverPreference: settings.people.filter((p) => p.driver).map((p) => p.id),
    modes: modesOf(e),
    autoModes: [e.trackedVehicle, ...others.map((v) => v.id)],
    trackedMode: e.trackedVehicle,
    externalMode: 'tiers',
    places: { [HOME]: { name: 'Domicile', ...settings.home }, ...agendaPlaces(agenda) },
    chargers: chargersOf(e, agenda),
    ...(workplace && { workplace }),
    escortRules: [],
    gapRules: {},
    chargeRoutines: [],
    costs: {
      otherCarEurPerKm: others[0] ? fuelEurPerKm(others[0]) : 0,
      energyValueEurPerKwh: ENERGY_VALUE_EUR_PER_KWH,
    },
  };
}

/** Battery settings of the tracked vehicle, with the level read by hand (or on the car). */
export function batterySettings(settings: HouseholdSettings | null, soc: number): Settings {
  const e = settings?.equipment;
  const tracked = e?.vehicles.find((v) => v.id === e.trackedVehicle);
  return {
    soc,
    reserveKm: e?.reserveKm ?? DEFAULT_SETTINGS.reserveKm,
    batteryKwh: tracked?.batteryKwh ?? DEFAULT_SETTINGS.batteryKwh,
    whPerKm: tracked?.whPerKm ?? DEFAULT_SETTINGS.whPerKm,
  };
}

export const agendaEvents = (agenda: Agenda): EventTemplate[] =>
  agenda.events.map(({ id, participants, date, start, end, title, place }) => ({
    id,
    participants,
    date,
    start,
    end,
    title,
    place,
  }));
