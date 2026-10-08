import type { Trip } from './dispatch.ts';
import { HOME } from './geo.ts';
import type { Booking } from './ledger.ts';
import type { Mobility } from './mobility.ts';
import type { Household, PlaceId } from './types.ts';

/** What an entity (person or vehicle) is doing over a span of a day. */
export interface Segment {
  d: number;
  from: number;
  to: number;
  kind: 'home' | 'away' | Booking['kind'];
  place: PlaceId;
  label: string;
  trip?: Trip;
}

const DAY_END = 24;
/** A few seconds: times computed from travel durations never meet exactly. */
const EPSILON = 1e-3;

/** The day of an entity: its bookings, and in between where it stays (home or elsewhere). */
export function timelineOf(m: Mobility, h: Household, entity: string, d: number): Segment[] {
  const bookings = m.ledgers.get(d)?.of(entity) ?? [];
  const segments: Segment[] = [];
  let t = 0;
  let place: PlaceId = HOME;
  for (const b of bookings) {
    if (b.from > t + EPSILON) segments.push(idle(d, t, b.from, place, h));
    const trip =
      b.kind === 'trip'
        ? m.trips.find(
            (x) =>
              x.d === d &&
              x.dep === b.from &&
              x.from === b.at &&
              [x.driver, x.mode, ...x.passengers].includes(entity),
          )
        : undefined;
    segments.push({
      d,
      from: b.from,
      to: b.to,
      kind: b.kind,
      place: b.until,
      label: b.label,
      ...(trip ? { trip } : {}),
    });
    t = Math.max(t, b.to);
    place = b.until;
  }
  if (t < DAY_END) segments.push(idle(d, t, DAY_END, place, h));
  return segments;
}

const idle = (d: number, from: number, to: number, place: PlaceId, h: Household): Segment => ({
  d,
  from,
  to,
  kind: place === HOME ? 'home' : 'away',
  place,
  label: h.places[place]?.name ?? place,
});

/**
 * The invariants of the state machine, checked independently of how the plan was built: no
 * entity booked twice at once, every move leaves from where the entity is, back home at night,
 * every household vehicle driven by a driver.
 */
export function violations(m: Mobility, h: Household): string[] {
  const found: string[] = [];
  for (const [d, ledger] of m.ledgers) {
    for (const entity of ledger.entities()) {
      let at: PlaceId = HOME;
      let until = 0;
      for (const b of ledger.of(entity)) {
        if (b.from < until - EPSILON)
          found.push(`jour ${d} : ${entity} occupé deux fois à ${b.from.toFixed(2)}`);
        if (b.at !== at)
          found.push(
            `jour ${d} : ${entity} part de ${b.at} mais se trouve à ${at} (${b.from.toFixed(2)})`,
          );
        at = b.until;
        until = Math.max(until, b.to);
      }
      if (at !== HOME) found.push(`jour ${d} : ${entity} ne rentre pas (${at})`);
    }
  }
  for (const t of m.trips) {
    if (h.modes[t.mode]?.vehicle && t.driver && h.people[t.driver]?.driver !== true)
      found.push(`jour ${t.d} : ${t.driver} conduit ${t.mode} sans être conducteur`);
  }
  return found;
}
