import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import { GeoService } from '@/places/geo.service';
import { createDatabase, MIGRATIONS_DIR } from '@/platform/database/database.factory';
import type { Database } from '@/platform/database/database.types';
import { migrate } from '@/platform/database/migrator';

const DATABASE_URL = process.env.DATABASE_URL;
// Random points per run: the cache is shared with earlier runs.
const jitter = () => Math.round(Math.random() * 1e4) / 1e7;
const POINTS = {
  home: { lat: 50.6 + jitter(), lon: 3.15 },
  pool: { lat: 50.55 + jitter(), lon: 3.2 },
  office: { lat: 50.62 + jitter(), lon: 3.06 },
};
const TABLE = {
  code: 'Ok',
  distances: [
    [0, 7100, 9400],
    [7300, 0, null],
    [9500, 15200, 0],
  ],
  durations: [
    [0, 720, 960],
    [740, 0, null],
    [980, 1500, 0],
  ],
};

describe.skipIf(!DATABASE_URL)('route matrix (Postgres)', () => {
  let db: Kysely<Database>;
  let geo: GeoService;

  beforeAll(async () => {
    db = createDatabase(DATABASE_URL ?? '', 2);
    await migrate(db, MIGRATIONS_DIR);
    geo = new GeoService(db);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.destroy();
  });

  it('routes every pair once, then reads them from the cache', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(TABLE))));
    vi.stubGlobal('fetch', fetch);
    const first = await geo.routes(POINTS);
    expect(first.home?.office).toEqual({ km: 9.4, min: 16 });
    expect(first.pool?.office).toBeUndefined(); // OSRM could not route it: straight-line fallback
    expect(fetch).toHaveBeenCalledTimes(1);

    const again = await geo.routes({ home: POINTS.home, office: POINTS.office });
    expect(again).toEqual({ home: { office: { km: 9.4, min: 16 } }, office: { home: { km: 9.5, min: 16 } } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
