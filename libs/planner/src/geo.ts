import { must } from './time.ts';
import type { Place, PlaceId, Route } from './types.ts';

const EARTH_RADIUS_KM = 6371;
const ROAD_FACTOR = 1.3;
const MIN_PER_KM_ESTIMATE = 1.3;
const PARKING_MIN = 5;
export const HOME: PlaceId = 'home';

export interface Coordinates {
  lat: number;
  lon: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function crowKm(a: Coordinates, b: Coordinates): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

type Places = Record<PlaceId, Place>;

const place = (places: Places, id: PlaceId) => must(places[id], `place ${id}`);
const routeBetween = (places: Places, a: PlaceId, b: PlaceId): Route | undefined =>
  place(places, a).routes?.[b] ?? place(places, b).routes?.[a];
const homeOverride = (places: Places, a: PlaceId, b: PlaceId): number | undefined =>
  a === HOME ? place(places, b).km : b === HOME ? place(places, a).km : undefined;
const coordinates = (p: Place): Coordinates | undefined =>
  p.lat !== undefined && p.lon !== undefined ? { lat: p.lat, lon: p.lon } : undefined;

/** Road km: user override, then cached route, then straight line × road factor, then via home. */
export function distance(places: Places, a: PlaceId, b: PlaceId): number {
  if (a === b) return 0;
  const known = homeOverride(places, a, b) ?? routeBetween(places, a, b)?.km;
  if (known !== undefined) return known;
  const [ca, cb] = [coordinates(place(places, a)), coordinates(place(places, b))];
  if (ca && cb) return Math.round(crowKm(ca, cb) * ROAD_FACTOR);
  if (a === HOME || b === HOME) throw new Error(`No distance between ${a} and ${b}`);
  return distance(places, a, HOME) + distance(places, HOME, b);
}

export function travelH(places: Places, a: PlaceId, b: PlaceId): number {
  const route = routeBetween(places, a, b);
  if (route && homeOverride(places, a, b) === undefined) return (route.min + PARKING_MIN) / 60;
  return (distance(places, a, b) * MIN_PER_KM_ESTIMATE + PARKING_MIN) / 60;
}
