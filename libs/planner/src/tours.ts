import { distance, HOME, travelH } from './geo.ts';
import type { Journey } from './journeys.ts';
import type { Household, PersonId, PlaceId } from './types.ts';

/** People leaving one place within this window go together, even to different places. */
export const TOUR_WINDOW_H = 0.5;

/** A drop-off along a tour: the members of `journey` get off at its destination. */
export interface Stop {
  place: PlaceId;
  journeys: Journey[];
  arr: number;
}

/** Journeys of the same day leaving the same place at about the same time, to other places. */
export const isTourmate = (j: Journey, k: Journey): boolean =>
  k.d === j.d && k.from === j.from && k.to !== j.to && Math.abs(k.dep - j.dep) <= TOUR_WINDOW_H;

/**
 * Visiting order: nearest stop first; the driver's own destination (where they stay with the
 * car) last, home after any other stop.
 */
export function stopOrder(
  h: Household,
  from: PlaceId,
  journeys: readonly Journey[],
  driver: PersonId,
): PlaceId[] {
  const last = journeys.find((j) => j.members.includes(driver))?.to;
  const others = [...new Set(journeys.map((j) => j.to))].filter((p) => p !== last);
  const ordered: PlaceId[] = [];
  let at = from;
  const pending = others.filter((p) => p !== HOME);
  while (pending.length) {
    pending.sort((a, b) => distance(h.places, at, a) - distance(h.places, at, b));
    const next = pending.shift();
    if (next === undefined) break;
    ordered.push(next);
    at = next;
  }
  if (others.includes(HOME)) ordered.push(HOME);
  if (last !== undefined) ordered.push(last);
  return ordered;
}

/**
 * When to leave: with the first leaving journey, or late enough to reach every stop in time
 * when they all aim at an arrival; never before everybody is ready.
 */
export function tourStart(
  h: Household,
  from: PlaceId,
  journeys: readonly Journey[],
  order: readonly PlaceId[],
  ready: number,
): number {
  const departs = journeys.filter((j) => j.anchor === 'depart').map((j) => j.dep);
  if (departs.length) return Math.max(ready, Math.min(...departs));
  let at = from;
  let elapsed = 0;
  const latest = order.map((place) => {
    elapsed += travelH(h.places, at, place);
    at = place;
    const deadline = Math.min(...journeys.filter((j) => j.to === place).map((j) => j.arr));
    return deadline - elapsed;
  });
  return Math.max(ready, Math.min(...latest));
}

/** The stops of a tour with their arrival times. */
export function stopsOf(
  h: Household,
  from: PlaceId,
  journeys: readonly Journey[],
  order: readonly PlaceId[],
  start: number,
): Stop[] {
  let at = from;
  let t = start;
  return order.map((place) => {
    t += travelH(h.places, at, place);
    at = place;
    return { place, journeys: journeys.filter((j) => j.to === place), arr: t };
  });
}

/** Places close enough to wait at one for the other (a car park in the same town). */
export const NEARBY_KM = 5;
export const nearby = (h: Household, a: PlaceId, b: PlaceId): boolean =>
  a === b || distance(h.places, a, b) <= NEARBY_KM;
