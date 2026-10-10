import { z } from 'zod';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** French national address base (BAN) on IGN's Géoplateforme: tolerant to typos in street names. */
const BAN_URL = 'https://data.geopf.fr/geocodage/search';
const BAN_REVERSE_URL = 'https://data.geopf.fr/geocodage/reverse';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const BAN_MIN_SCORE = 0.5;
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const USER_AGENT = 'charging-planning (https://charging-planning.crn-tech.fr; support@crn-tech.fr)';

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
const banSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({ label: z.string(), score: z.number() }),
    }),
  ),
});
const nominatimReverseSchema = z.object({ display_name: z.string().optional() });
const osrmTableSchema = z.object({
  distances: z.array(z.array(z.number().nullable())),
  durations: z.array(z.array(z.number().nullable())),
});

/** A street address (house number first, or a postcode) is best found by the BAN; a place name by OpenStreetMap. */
export const looksLikeAddress = (query: string): boolean =>
  /^\d/.test(query.trim()) || /\b\d{5}\b/.test(query);

const ABBREVIATIONS: readonly [RegExp, string][] = [
  [/\bpl\.\s*/gi, 'place '],
  [/\bchem\.\s*/gi, 'chemin '],
  [/\bav\.\s*/gi, 'avenue '],
  [/\bbd\.?\s+/gi, 'boulevard '],
  [/\brte\.?\s+/gi, 'route '],
  [/\bimp\.\s*/gi, 'impasse '],
  [/\ball\.\s*/gi, 'allée '],
];
const OTHER_COUNTRIES =
  /^(belgique|belgium|belgië|suisse|switzerland|luxembourg|allemagne|germany|deutschland|espagne|spain|italie|italy|pays-bas|netherlands|nederland|royaume-uni|united kingdom)$/i;
/** Keep at least street, city and country: never fall back to a mere town centre. */
const MIN_SEGMENTS = 3;
const MAX_CANDIDATES = 3;

export const expandAbbreviations = (query: string): string =>
  ABBREVIATIONS.reduce((text, [pattern, word]) => text.replace(pattern, word), query)
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Google Maps writes "Venue, street, postcode city, country": geocoders know the street, rarely the
 * venue. Candidates: the full text first (a bare place name), then without the leading segments.
 */
export function addressCandidates(query: string): string[] {
  const segments = expandAbbreviations(query)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const suffixes = segments
    .slice(1)
    .map((_, i) => segments.slice(i + 1))
    .filter((rest) => rest.length >= MIN_SEGMENTS);
  return [segments, ...suffixes].map((parts) => parts.join(', ')).slice(0, MAX_CANDIDATES);
}

/** The BAN only covers France: never ask it for an address abroad. */
export const inFrance = (query: string): boolean =>
  !OTHER_COUNTRIES.test(query.split(',').at(-1)?.trim() ?? '');

export async function nominatim(query: string): Promise<Geocoded | undefined> {
  const response = await fetch(
    `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr' } },
  );
  if (!response.ok) throw new Error(`Nominatim: HTTP ${response.status}`);
  const [first] = nominatimSchema.parse(await response.json());
  return first ? { lat: first.lat, lon: first.lon, label: first.display_name } : undefined;
}

export async function ban(query: string): Promise<Geocoded | undefined> {
  const response = await fetch(`${BAN_URL}?limit=1&q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) throw new Error(`BAN: HTTP ${response.status}`);
  const [first] = banSchema.parse(await response.json()).features;
  if (!first || first.properties.score < BAN_MIN_SCORE) return undefined;
  const [lon, lat] = first.geometry.coordinates;
  return { lat, lon, label: first.properties.label };
}

/** The address at a position, from the national address base (France only). */
export async function banReverse(at: Coordinates): Promise<string | undefined> {
  const response = await fetch(`${BAN_REVERSE_URL}?limit=1&lat=${at.lat}&lon=${at.lon}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) throw new Error(`BAN: HTTP ${response.status}`);
  return banSchema.parse(await response.json()).features[0]?.properties.label;
}

export async function nominatimReverse(at: Coordinates): Promise<string | undefined> {
  const response = await fetch(
    `${NOMINATIM_REVERSE_URL}?format=jsonv2&lat=${at.lat}&lon=${at.lon}`,
    {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr' },
    },
  );
  if (!response.ok) throw new Error(`Nominatim: HTTP ${response.status}`);
  return nominatimReverseSchema.parse(await response.json()).display_name;
}

export interface Route {
  km: number;
  min: number;
}

/** Driving distance and duration between every ordered pair of points, in one OSRM request. */
export async function osrmTable(points: readonly Coordinates[]): Promise<(Route | undefined)[][]> {
  const path = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const response = await fetch(
    `${OSRM_URL.replace('/route/', '/table/')}/${path}?annotations=distance,duration`,
    {
      headers: { 'User-Agent': USER_AGENT },
    },
  );
  if (!response.ok) throw new Error(`OSRM: HTTP ${response.status}`);
  const { distances, durations } = osrmTableSchema.parse(await response.json());
  return distances.map((row, i) =>
    row.map((meters, j) => {
      const seconds = durations[i]?.[j];
      return meters === null || seconds == null
        ? undefined
        : { km: Math.round(meters / 100) / 10, min: Math.round(seconds / 60) };
    }),
  );
}
