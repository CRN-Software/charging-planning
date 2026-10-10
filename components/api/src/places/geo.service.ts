import { Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import type { Database } from '@/platform/database/database.types';
import {
  addressCandidates,
  ban,
  inFrance,
  looksLikeAddress,
  nominatim,
  osrmTable,
  banReverse,
  nominatimReverse,
} from './providers';
import type { Coordinates, Geocoded, Route } from './providers';

export type { Coordinates, Geocoded, Route } from './providers';

/** Nominatim usage policy: at most one request per second. */
const NOMINATIM_INTERVAL_MS = 1100;
/** A failed lookup is retried after a day: the address may be fixed, providers improve. */
const NOT_FOUND_TTL_MS = 24 * 3600 * 1000;

export const normalizeAddress = (address: string): string =>
  address.trim().replace(/\s+/g, ' ').toLowerCase();
const round = (value: number): number => Math.round(value * 1e5) / 1e5;
const routeKey = (from: Coordinates | undefined, to: Coordinates | undefined) => {
  if (!from || !to) throw new Error('unknown point');
  return {
    from_lat: round(from.lat),
    from_lon: round(from.lon),
    to_lat: round(to.lat),
    to_lon: round(to.lon),
  };
};

/** Geocoding (BAN, OpenStreetMap) and driving routes (OSRM), cached in Postgres for every household. */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: Kysely<Database>) {}

  async geocode(address: string): Promise<Geocoded | undefined> {
    const query = normalizeAddress(address);
    const cached = await this.db
      .selectFrom('geocode_cache')
      .selectAll()
      .where('query', '=', query)
      .executeTakeFirst();
    if (cached?.lat != null && cached.lon != null) {
      return { lat: cached.lat, lon: cached.lon, label: cached.label ?? address };
    }
    if (cached && Date.now() - cached.created_at.getTime() < NOT_FOUND_TTL_MS) return undefined;
    const found = await this.lookup(query);
    const row = {
      lat: found?.lat ?? null,
      lon: found?.lon ?? null,
      label: found?.label ?? null,
      created_at: new Date(),
    };
    await this.db
      .insertInto('geocode_cache')
      .values({ query, ...row })
      .onConflict((oc) => oc.column('query').doUpdateSet(row))
      .execute();
    return found;
  }

  /** The address at a position (where the car is), never cached: it moves. */
  async address(at: Coordinates): Promise<string | undefined> {
    return (
      (await this.safely('BAN', () => banReverse(at))) ??
      (await this.safely('Nominatim', () => this.throttled(() => nominatimReverse(at))))
    );
  }

  /**
   * Driving routes between every pair of places, by id. Cached pairs are reused; when one is
   * missing, a single OSRM table request computes them all. A pair OSRM cannot route is left out:
   * the planner then falls back on the straight-line distance.
   */
  async routes(
    points: Record<string, Coordinates>,
  ): Promise<Record<string, Record<string, Route>>> {
    const ids = Object.keys(points);
    const pairs = ids.flatMap((from) =>
      ids.filter((to) => to !== from).map((to) => [from, to] as const),
    );
    const cached = await this.cachedRoutes(points, pairs);
    const missing = pairs.some(([from, to]) => !cached.has(`${from}>${to}`));
    const table = missing
      ? await this.safely('OSRM', () => this.computeTable(points, ids))
      : undefined;
    const result: Record<string, Record<string, Route>> = {};
    for (const [from, to] of pairs) {
      const route = cached.get(`${from}>${to}`) ?? table?.get(`${from}>${to}`);
      if (route) (result[from] ??= {})[to] = route;
    }
    return result;
  }

  private async cachedRoutes(
    points: Record<string, Coordinates>,
    pairs: readonly (readonly [string, string])[],
  ) {
    const keys = pairs.map(([from, to]) => ({ from, to, key: routeKey(points[from], points[to]) }));
    const rows = keys.length
      ? await this.db
          .selectFrom('route_cache')
          .select(['from_lat', 'from_lon', 'to_lat', 'to_lon', 'km', 'min'])
          .where(
            sql<boolean>`(from_lat, from_lon, to_lat, to_lon) in (${sql.join(keys.map(({ key }) => sql`(${key.from_lat}, ${key.from_lon}, ${key.to_lat}, ${key.to_lon})`))})`,
          )
          .execute()
      : [];
    const byKey = new Map(
      rows.map((r) => [
        `${Number(r.from_lat)},${Number(r.from_lon)},${Number(r.to_lat)},${Number(r.to_lon)}`,
        { km: r.km, min: r.min },
      ]),
    );
    return new Map(
      keys.flatMap(({ from, to, key }) => {
        const route = byKey.get(`${key.from_lat},${key.from_lon},${key.to_lat},${key.to_lon}`);
        return route ? [[`${from}>${to}`, route] as const] : [];
      }),
    );
  }

  private async computeTable(points: Record<string, Coordinates>, ids: string[]) {
    const matrix = await osrmTable(
      ids.map((id) => {
        const point = points[id];
        if (!point) throw new Error(`unknown point ${id}`);
        return point;
      }),
    );
    const found = new Map<string, Route>();
    const rows = ids.flatMap((from, i) =>
      ids.flatMap((to, j) => {
        const route = matrix[i]?.[j];
        if (i === j || !route) return [];
        found.set(`${from}>${to}`, route);
        return [{ ...routeKey(points[from], points[to]), ...route }];
      }),
    );
    if (rows.length)
      await this.db
        .insertInto('route_cache')
        .values(rows)
        .onConflict((oc) => oc.doNothing())
        .execute();
    return found;
  }

  /** Tries each candidate form of the address; per candidate, the better provider goes first. */
  private async lookup(query: string): Promise<Geocoded | undefined> {
    for (const candidate of addressCandidates(query)) {
      const found = await this.lookupOne(candidate);
      if (found) return found;
    }
    return undefined;
  }

  private async lookupOne(query: string): Promise<Geocoded | undefined> {
    const osm = () => this.safely('Nominatim', () => this.throttled(() => nominatim(query)));
    if (!inFrance(query)) return osm();
    const national = () => this.safely('BAN', () => ban(query));
    const [first, second] = looksLikeAddress(query) ? [national, osm] : [osm, national];
    return (await first()) ?? (await second());
  }

  private async safely<T>(
    provider: string,
    task: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    try {
      return await task();
    } catch (error) {
      this.logger.warn(`${provider} unavailable: ${(error as Error).message}`);
      return undefined;
    }
  }

  private throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run
      .catch(() => undefined)
      .then(() => new Promise((resolve) => setTimeout(resolve, NOMINATIM_INTERVAL_MS)));
    return run;
  }
}
