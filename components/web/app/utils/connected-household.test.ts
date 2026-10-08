import { buildWeek, DEFAULT_SETTINGS, HOME, planWeek } from '@charging/planner';
import { DEFAULT_EQUIPMENT, type Agenda, type HouseholdSettings } from '@charging/contracts';
import { describe, expect, it } from 'vitest';
import { agendaEvents, connectedHousehold, isConfigured } from './connected-household';

const ACCOUNT = '0d6c2a1e-9a51-4b0e-8a0f-3b1d2c4e5f60';
const NOW = new Date(2026, 9, 7, 7, 0);
const SETTINGS: HouseholdSettings = {
  homeAddress: '1 rue Exemple',
  home: { lat: 50.6, lon: 3.15 },
  people: [
    { id: 'claire', name: 'Claire', driver: true },
    { id: 'hugo', name: 'Hugo', driver: false },
  ],
  calendars: [{ accountId: ACCOUNT, calendarId: 'family', people: ['claire', 'hugo'] }],
  equipment: DEFAULT_EQUIPMENT,
};
const AGENDA: Agenda = {
  events: [
    {
      id: 'claire:1',
      participants: ['claire'],
      date: '2026-10-08',
      start: '8:30',
      end: '17:00',
      title: 'Travail',
      place: 'p-office',
    },
    {
      id: 'hugo:1',
      participants: ['hugo'],
      date: '2026-10-08',
      start: '14:00',
      end: '15:00',
      title: 'Piscine',
      place: 'p-pool',
    },
  ],
  places: {
    'p-office': {
      name: 'Bureau',
      lat: 50.62,
      lon: 3.06,
      routes: { home: { km: 9.4, min: 16 }, 'p-pool': { km: 12.1, min: 18 } },
    },
    'p-pool': { name: 'Piscine', lat: 50.55, lon: 3.2, routes: {} },
  },
  unlocated: [],
  unresolved: [],
  ignored: { noLocation: 0, allDay: 0, online: 0, cancelled: 0 },
};

describe('connected household', () => {
  it('needs a home and at least one calendar', () => {
    expect(isConfigured(null)).toBe(false);
    expect(isConfigured({ ...SETTINGS, home: null })).toBe(false);
    expect(isConfigured({ ...SETTINGS, calendars: [] })).toBe(false);
    expect(isConfigured(SETTINGS)).toBe(true);
  });

  it('uses the household people, home and calendar places, without demo workplace', () => {
    const household = connectedHousehold({ ...SETTINGS, home: { lat: 50.6, lon: 3.15 } }, AGENDA);
    expect(Object.keys(household.people)).toEqual(['claire', 'hugo', 'external']);
    expect(household.driverPreference).toEqual(['claire']);
    expect(household.places[HOME]).toMatchObject({ lat: 50.6, lon: 3.15 });
    expect(household.places['p-office']?.routes?.[HOME]).toEqual({ km: 9.4, min: 16 });
    expect(household.places['p-office']?.routes?.['p-pool']).toEqual({ km: 12.1, min: 18 });
    expect(household.workplace).toBeUndefined();
  });

  it('plans the week from the calendar events', () => {
    const household = connectedHousehold({ ...SETTINGS, home: { lat: 50.6, lon: 3.15 } }, AGENDA);
    const week = buildWeek(NOW);
    const plan = planWeek({
      household,
      days: week.days,
      startH: week.startH,
      events: week.instantiate(agendaEvents(AGENDA)),
      manualCharges: [],
      settings: DEFAULT_SETTINGS,
      overrides: {},
      gaps: {},
    });
    expect(plan.sim).toBeDefined();
  });

  it('charge at the office while the car is parked there, with the household chargers', () => {
    const work = {
      id: 'work',
      label: 'Borne du bureau',
      address: 'x',
      kw: 11,
      limit: 100,
      price: 0.1,
      hassle: 0.5,
      lat: 50.62,
      lon: 3.06,
      workplace: { person: 'claire', days: [0, 1, 2, 3, 4], start: '8:30', end: '17:00' },
    };
    const settings = {
      ...SETTINGS,
      home: { lat: 50.6, lon: 3.15 },
      equipment: { ...DEFAULT_EQUIPMENT, chargers: [work] },
    };
    const office = AGENDA.places['p-office'];
    const agenda = {
      ...AGENDA,
      places: { ...AGENDA.places, ...(office && { 'p-office': { ...office, charger: 'work' } }) },
    };
    const household = connectedHousehold(settings, agenda);
    expect(household.chargers.work?.place).toBe('p-office');
    expect(household.workplace).toMatchObject({ who: 'claire', place: 'p-office' });
    const week = buildWeek(NOW);
    const plan = planWeek({
      household,
      days: week.days,
      startH: week.startH,
      events: week.instantiate(agendaEvents(agenda)),
      manualCharges: [],
      settings: { ...DEFAULT_SETTINGS, soc: 30 },
      overrides: {},
      gaps: {},
    });
    expect(plan.opportunities.some((o) => o.kind === 'onsite' && o.chargerId === 'work')).toBe(
      true,
    );
  });
});
