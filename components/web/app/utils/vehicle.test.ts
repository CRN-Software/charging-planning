import { describe, expect, it } from 'vitest';
import { latestBattery } from './vehicle';

const car = (at: string) => ({
  available: true,
  linked: true,
  name: 'Tesla',
  asleep: false,
  broken: false,
  snapshot: { soc: 57, limit: 80, charging: 'Stopped', lat: null, lon: null, at },
});

describe('battery level', () => {
  it('comes from the linked car, and from the level typed by hand only without it', () => {
    const typedLater = { soc: 91, socAt: '2026-10-08T09:00:00.000Z' };
    const linked = car('2026-10-08T08:00:00.000Z');
    expect(latestBattery(typedLater, linked)).toMatchObject({ soc: 57, source: 'car' });
    expect(latestBattery(typedLater, { ...linked, linked: false })).toMatchObject({
      soc: 91,
      source: 'manual',
    });
    expect(latestBattery(typedLater, null)).toMatchObject({ soc: 91, source: 'manual' });
  });
});
