import {
  DEFAULT_COSTS,
  DEFAULT_MODES,
  EXTERNAL_PERSON,
  HOME,
  SUPERCHARGER_PLACES,
  SUPERCHARGERS,
} from '@charging/planner';
import type { EventTemplate, Household, Person, Place } from '@charging/planner';
import type { Agenda, HouseholdSettings } from '@charging/contracts';

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
      { name: p.name, lat: p.lat, lon: p.lon, routes: p.routes },
    ]),
  );

/** The planner's household: its people, home and calendar places, default vehicles and chargers. */
export function connectedHousehold(settings: ConfiguredSettings, agenda: Agenda): Household {
  return {
    people: people(settings),
    driverPreference: settings.people.filter((p) => p.driver).map((p) => p.id),
    modes: DEFAULT_MODES,
    autoModes: ['tesla', 'voiture'],
    trackedMode: 'tesla',
    externalMode: 'tiers',
    places: {
      [HOME]: { name: 'Domicile', ...settings.home },
      ...SUPERCHARGER_PLACES,
      ...agendaPlaces(agenda),
    },
    chargers: SUPERCHARGERS,
    escortRules: [],
    gapRules: {},
    chargeRoutines: [],
    costs: DEFAULT_COSTS,
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
