import { crowKm, type Day, type Household, type Plan, type PlaceId } from '@charging/planner';
import type { VehicleSnapshot, VehicleStatus } from '@charging/contracts';

/** A reported position this close to a known place is at that place (a car park, a street). */
const SAME_PLACE_KM = 0.3;

export interface Battery {
  soc: number;
  /** When it was read (ISO), on the car or by hand. */
  at: string | null;
  source: 'car' | 'manual';
}

/** The latest reading wins: the car's, unless a household member typed a newer one. */
export function latestBattery(
  manual: { soc: number; socAt: string | null },
  status: VehicleStatus | null,
): Battery {
  const car = status?.snapshot;
  if (car && (!manual.socAt || car.at > manual.socAt))
    return { soc: car.soc, at: car.at, source: 'car' };
  return { soc: manual.soc, at: manual.socAt, source: 'manual' };
}

export interface Whereabouts {
  /** The known place the car reported, or null when it is elsewhere. */
  actual: PlaceId | null;
  /** Where the plan expected it at that time. */
  expected: PlaceId;
  matches: boolean;
}

/** The car's reported position against the plan, on the day of the report. */
export function whereabouts(
  plan: Plan,
  h: Household,
  days: readonly Day[],
  car: VehicleSnapshot,
): Whereabouts | undefined {
  if (car.lat === null || car.lon === null) return undefined;
  const at = new Date(car.at);
  const day = days.find((d) => d.date.toDateString() === at.toDateString());
  const ledger = day && plan.ledgers.get(day.d);
  if (!ledger) return undefined;
  const expected = ledger.locationAt(h.trackedMode, at.getHours() + at.getMinutes() / 60);
  const position = { lat: car.lat, lon: car.lon };
  const near = Object.entries(h.places)
    .filter(([, p]) => p.lat !== undefined && p.lon !== undefined)
    .map(([id, p]) => ({ id, km: crowKm(position, { lat: p.lat ?? 0, lon: p.lon ?? 0 }) }))
    .filter((p) => p.km <= SAME_PLACE_KM)
    .sort((a, b) => a.km - b.km)[0];
  const actual = near?.id ?? null;
  return { actual, expected, matches: actual === expected };
}
