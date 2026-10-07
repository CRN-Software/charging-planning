import { describe, expect, it } from 'vitest';
import { isHome, placeId, timedEvent } from '@/household/agenda-mapper';

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
