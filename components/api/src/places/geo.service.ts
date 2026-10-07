import { Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import type { Database } from '@/platform/database/database.types';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const USER_AGENT = 'charging-planning (https://charging-planning.crn-tech.fr; support@crn-tech.fr)';
/** Nominatim usage policy: at most one request per second. */
const NOMINATIM_INTERVAL_MS = 1100;

export interface Coordinates {
  lat: number;
  lon: number;
}
export interface Geocoded extends Coordinates {
  label: string;
}

const nominatimSchema = z.array(
  z.object({ lat: z.coerce.number(), lon: z.coerce.number(), display_name: z.string() }),
);
const osrmSchema = z.object({
  routes: z.array(z.object({ distance: z.number(), duration: z.number() })),
});

export const normalizeAddress = (address: string): string =>
  address.trim().replace(/\s+/g, ' ').toLowerCase();
const round = (value: number): number => Math.round(value * 1e5) / 1e5;

/** Geocoding (OpenStreetMap Nominatim) and driving routes (OSRM), cached in Postgres for every household. */
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
    if (cached)
      return cached.lat === null || cached.lon === null
        ? undefined
        : { lat: cached.lat, lon: cached.lon, label: cached.label ?? address };
    const found = await this.throttled(() => this.nominatim(query));
    await this.db
      .insertInto('geocode_cache')
      .values({
        query,
        lat: found?.lat ?? null,
        lon: found?.lon ?? null,
        label: found?.label ?? null,
      })
      .onConflict((oc) => oc.column('query').doNothing())
      .execute();
    return found;
  }

  async route(
    from: Coordinates,
    to: Coordinates,
  ): Promise<{ km: number; min: number } | undefined> {
    const key = {
      from_lat: round(from.lat),
      from_lon: round(from.lon),
      to_lat: round(to.lat),
      to_lon: round(to.lon),
    };
    const cached = await this.db
      .selectFrom('route_cache')
      .select(['km', 'min'])
      .where(
        sql<boolean>`(from_lat, from_lon, to_lat, to_lon) = (${key.from_lat}, ${key.from_lon}, ${key.to_lat}, ${key.to_lon})`,
      )
      .executeTakeFirst();
    if (cached) return cached;
    const route = await this.osrm(key);
    if (route) {
      await this.db
        .insertInto('route_cache')
        .values({ ...key, ...route })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
    return route;
  }

  private async nominatim(query: string): Promise<Geocoded | undefined> {
    const response = await fetch(
      `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr' },
      },
    );
    if (!response.ok) throw new Error(`Nominatim: HTTP ${response.status}`);
    const [first] = nominatimSchema.parse(await response.json());
    return first ? { lat: first.lat, lon: first.lon, label: first.display_name } : undefined;
  }

  private async osrm(key: { from_lat: number; from_lon: number; to_lat: number; to_lon: number }) {
    const path = `${key.from_lon},${key.from_lat};${key.to_lon},${key.to_lat}`;
    try {
      const response = await fetch(`${OSRM_URL}/${path}?overview=false`, {
        headers: { 'User-Agent': USER_AGENT },
      });
      const [route] = osrmSchema.parse(await response.json()).routes;
      return route
        ? { km: Math.round(route.distance / 100) / 10, min: Math.round(route.duration / 60) }
        : undefined;
    } catch (error) {
      this.logger.warn(`OSRM unavailable: ${(error as Error).message}`);
      return undefined; // the planner falls back on straight-line distance
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
