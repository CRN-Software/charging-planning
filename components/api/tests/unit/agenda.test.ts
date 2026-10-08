import { describe, expect, it } from 'vitest';
import { ignoredReason, isHome, occurrencesOf, placeId, timedEvent } from '@/household/agenda-mapper';
import { readSettings } from '@/household/settings-reader';

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt',
  status: 'confirmed',
  summary: ' Piscine ',
  location: '10 rue des Bains, Ville',
  start: { dateTime: '2026-10-08T12:00:00+02:00' },
  end: { dateTime: '2026-10-08T14:00:00+02:00' },
  ...overrides,
});

describe('calendar events', () => {
  it('become trips in the household time zone', () => {
    expect(timedEvent(event())).toEqual({
      googleId: 'evt',
      date: '2026-10-08',
      start: '12:00',
      end: '14:00',
      title: 'Piscine',
      location: '10 rue des Bains, Ville',
    });
  });

  it('use the local day of an event given in UTC', () => {
    expect(timedEvent(event({ start: { dateTime: '2026-10-08T22:30:00Z' }, end: { dateTime: '2026-10-08T23:30:00Z' } }))).toMatchObject({
      date: '2026-10-09',
      start: '0:30',
      end: '1:30',
    });
  });

  it('end at midnight when they run past it', () => {
    expect(timedEvent(event({ end: { dateTime: '2026-10-09T01:00:00+02:00' } }))?.end).toBe('23:59');
  });

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['all-day', { start: { date: '2026-10-08' }, end: { date: '2026-10-09' } }],
    ['without location', { location: undefined }],
    ['online', { location: 'https://meet.google.com/abc-defg-hij' }],
  ])('ignore %s events', (_, overrides) => {
    expect(timedEvent(event(overrides))).toBeUndefined();
  });

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['allDay', { start: { date: '2026-10-08' }, end: { date: '2026-10-09' } }],
    ['noLocation', { location: '   ' }],
    ['online', { location: 'https://meet.google.com/abc-defg-hij' }],
  ])('count the reason: %s', (reason, overrides) => {
    expect(ignoredReason(event(overrides))).toBe(reason);
  });

  it('name untitled events', () => {
    expect(timedEvent(event({ summary: '  ' }))?.title).toBe('Sans titre');
  });
});

describe('places', () => {
  it('share an id whatever the case and spacing of the address', () => {
    expect(placeId('10 Rue des Bains,  Ville')).toBe(placeId('10 rue des bains, ville'));
  });

  it('are home within 200 m of it', () => {
    const home = { lat: 50.6, lon: 3.15 };
    expect(isHome(home, { lat: 50.601, lon: 3.15 })).toBe(true);
    expect(isHome(home, { lat: 50.61, lon: 3.15 })).toBe(false);
  });
});

describe('occurrences', () => {
  const copy = (people: string[], overrides: Record<string, unknown> = {}) => ({
    event: event({ iCalUID: 'uid-1', ...overrides }),
    people,
  });

  it('are one per event, with the people of every calendar it appears in', () => {
    const { occurrences } = occurrencesOf([copy(['tim']), copy(['anne']), copy(['alice', 'achille']), copy(['tim', 'alice'])]);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.participants).toEqual(['tim', 'anne', 'alice', 'achille']);
  });

  it('keep the instances of a series apart', () => {
    const later = { start: { dateTime: '2026-10-15T12:00:00+02:00' }, end: { dateTime: '2026-10-15T14:00:00+02:00' } };
    expect(occurrencesOf([copy(['tim']), copy(['tim'], later)]).occurrences).toHaveLength(2);
  });

  it('keep timed events without an address apart, to display them', () => {
    const { occurrences, unlocated } = occurrencesOf([copy(['tim'], { location: undefined }), copy(['anne'], { location: undefined })]);
    expect(occurrences).toEqual([]);
    expect(unlocated).toEqual([
      { googleId: 'evt', date: '2026-10-08', start: '12:00', end: '14:00', title: 'Piscine', participants: ['tim', 'anne'], reason: 'noLocation' },
    ]);
  });

  it('count an ignored event once, whatever the number of calendars', () => {
    const { occurrences, ignored } = occurrencesOf([copy(['tim'], { location: undefined }), copy(['anne'], { location: undefined })]);
    expect(occurrences).toEqual([]);
    expect(ignored.noLocation).toBe(1);
  });
});

describe('household settings', () => {
  it('upgrade the settings saved with calendars per person', () => {
    const account = '0d6c2a1e-9a51-4b0e-8a0f-3b1d2c4e5f60';
    const legacy = {
      homeAddress: '1 rue Exemple',
      home: { lat: 50.6, lon: 3.15 },
      people: [
        { id: 'anne', name: 'Anne', adult: true, calendars: [{ accountId: account, calendarId: 'family' }] },
        { id: 'tim', name: 'Tim', adult: false, calendars: [{ accountId: account, calendarId: 'family' }, { accountId: account, calendarId: 'tim' }] },
      ],
    };
    expect(readSettings(legacy)).toEqual({
      homeAddress: '1 rue Exemple',
      home: { lat: 50.6, lon: 3.15 },
      people: [
        { id: 'anne', name: 'Anne', driver: true },
        { id: 'tim', name: 'Tim', driver: false },
      ],
      calendars: [
        { accountId: account, calendarId: 'family', people: ['anne', 'tim'] },
        { accountId: account, calendarId: 'tim', people: ['tim'] },
      ],
    });
  });

  it('are empty when unreadable', () => {
    expect(readSettings({ nope: true })).toEqual({ homeAddress: null, home: null, people: [], calendars: [] });
  });
});
