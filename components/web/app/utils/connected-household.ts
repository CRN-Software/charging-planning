import { DEMO_HOUSEHOLD, HOME } from '@charging/planner';
import type { EventTemplate, Household, Person, Place } from '@charging/planner';
import type { Agenda, HouseholdSettings } from '@charging/contracts';

const PERSON_COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)'];
/** Public superchargers offered until the household configures its own chargers. */
const DEFAULT_CHARGERS = ['lesquin', 'englos'] as const;

/** A household ready to plan: a geocoded home and at least one person with calendars. */
export const isConfigured = (
  settings: HouseholdSettings | null,
): settings is HouseholdSettings & { home: { lat: number; lon: number } } =>
  settings?.home != null && settings.people.some((p) => p.calendars.length > 0);

const people = (settings: HouseholdSettings): Record<string, Person> => ({
  ...Object.fromEntries(
    settings.people.map((p, i) => [
      p.id,
      {
        name: p.name,
        adult: p.adult,
        color: PERSON_COLORS[i % PERSON_COLORS.length] ?? 'var(--p1)',
      },
    ]),
  ),
  external: DEMO_HOUSEHOLD.people.external ?? {
    name: 'Hors foyer',
    adult: true,
    external: true,
    color: 'var(--muted)',
  },
});

const agendaPlaces = (agenda: Agenda): Record<string, Place> =>
  Object.fromEntries(
    Object.entries(agenda.places).map(([id, p]) => [
      id,
      {
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        ...(p.fromHome ? { routes: { [HOME]: p.fromHome } } : {}),
      },
    ]),
  );

const defaultChargers = () =>
  Object.fromEntries(
    DEFAULT_CHARGERS.flatMap((id) =>
      DEMO_HOUSEHOLD.chargers[id] ? [[id, DEMO_HOUSEHOLD.chargers[id]]] : [],
    ),
  );

const chargerPlaces = () =>
  Object.fromEntries(
    DEFAULT_CHARGERS.flatMap((id) =>
      DEMO_HOUSEHOLD.places[id] ? [[id, DEMO_HOUSEHOLD.places[id]]] : [],
    ),
  );

/** The planner's household for a connected family: its people, home and calendar places. */
export function connectedHousehold(
  settings: HouseholdSettings & { home: { lat: number; lon: number } },
  agenda: Agenda,
): Household {
  const { workplace: _demoWorkplace, ...defaults } = DEMO_HOUSEHOLD;
  return {
    ...defaults,
    people: people(settings),
    driverPreference: settings.people.filter((p) => p.adult).map((p) => p.id),
    places: {
      [HOME]: { name: 'Domicile', ...settings.home },
      ...chargerPlaces(),
      ...agendaPlaces(agenda),
    },
    chargers: defaultChargers(),
    escortRules: [],
    gapRules: {},
    chargeRoutines: [],
  };
}

export const agendaEvents = (agenda: Agenda): EventTemplate[] =>
  agenda.events.map((e) => ({
    id: e.id,
    who: e.who,
    date: e.date,
    start: e.start,
    end: e.end,
    title: e.title,
    place: e.place,
  }));
