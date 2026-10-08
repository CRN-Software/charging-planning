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
  it('comes from the car unless someone typed a newer one', () => {
    expect(latestBattery({ soc: 40, socAt: null }, car('2026-10-08T08:00:00.000Z'))).toMatchObject({
      soc: 57,
      source: 'car',
    });
    expect(
      latestBattery(
        { soc: 40, socAt: '2026-10-08T09:00:00.000Z' },
        car('2026-10-08T08:00:00.000Z'),
      ),
    ).toMatchObject({ soc: 40, source: 'manual' });
    expect(latestBattery({ soc: 40, socAt: null }, null)).toMatchObject({
      soc: 40,
      source: 'manual',
    });
  });
});
