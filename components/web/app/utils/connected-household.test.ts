import { buildWeek, DEMO_SETTINGS, HOME, planWeek } from '@charging/planner';
import type { Agenda, HouseholdSettings } from '@charging/contracts';
import { describe, expect, it } from 'vitest';
import { agendaEvents, connectedHousehold, isConfigured } from './connected-household';

const ACCOUNT = '0d6c2a1e-9a51-4b0e-8a0f-3b1d2c4e5f60';
const NOW = new Date(2026, 9, 7, 7, 0);
const SETTINGS: HouseholdSettings = {
  homeAddress: '1 rue Exemple',
  home: { lat: 50.6, lon: 3.15 },
  people: [
    {
      id: 'claire',
      name: 'Claire',
      adult: true,
      calendars: [{ accountId: ACCOUNT, calendarId: 'c' }],
    },
    {
      id: 'hugo',
      name: 'Hugo',
      adult: false,
      calendars: [{ accountId: ACCOUNT, calendarId: 'h' }],
    },
  ],
};
const AGENDA: Agenda = {
  events: [
    {
      id: 'claire:1',
      who: 'claire',
      date: '2026-10-08',
      start: '8:30',
      end: '17:00',
      title: 'Travail',
      place: 'p-office',
    },
    {
      id: 'hugo:1',
      who: 'hugo',
      date: '2026-10-08',
      start: '14:00',
      end: '15:00',
      title: 'Piscine',
      place: 'p-pool',
    },
  ],
  places: {
    'p-office': { name: 'Bureau', lat: 50.62, lon: 3.06, fromHome: { km: 9.4, min: 16 } },
    'p-pool': { name: 'Piscine', lat: 50.55, lon: 3.2 },
  },
  unresolved: [],
};

describe('connected household', () => {
  it('needs a home and at least one calendar', () => {
    expect(isConfigured(null)).toBe(false);
    expect(isConfigured({ ...SETTINGS, home: null })).toBe(false);
    expect(isConfigured(SETTINGS)).toBe(true);
  });

  it('uses the household people, home and calendar places, without demo workplace', () => {
    const household = connectedHousehold({ ...SETTINGS, home: { lat: 50.6, lon: 3.15 } }, AGENDA);
    expect(Object.keys(household.people)).toEqual(['claire', 'hugo', 'external']);
    expect(household.driverPreference).toEqual(['claire']);
    expect(household.places[HOME]).toMatchObject({ lat: 50.6, lon: 3.15 });
    expect(household.places['p-office']?.routes?.[HOME]).toEqual({ km: 9.4, min: 16 });
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
      settings: DEMO_SETTINGS,
      overrides: {},
      gaps: {},
    });
    expect(plan.sim).toBeDefined();
  });
});
