import { HOME } from './geo.ts';
import type { PlaceId } from './types.ts';

/** Something an entity (person or vehicle) is busy with: travelling, or attending an occurrence. */
export interface Booking {
  kind: 'trip' | 'event' | 'wait' | 'parked';
  from: number;
  to: number;
  /** Where the entity is at the start and at the end of the booking. */
  at: PlaceId;
  until: PlaceId;
  label: string;
}

/** A few seconds: times computed from travel durations never meet exactly. */
const EPSILON = 1e-3;
const overlaps = (a: { from: number; to: number }, from: number, to: number) =>
  from < a.to - EPSILON && a.from < to - EPSILON;

/**
 * The state machine of a day: for every entity, its bookings in time order. An entity is never
 * booked twice at once, and it always leaves from where it last arrived (home at the start).
 */
export class Ledger {
  private readonly bookings = new Map<string, Booking[]>();

  of(entity: string): readonly Booking[] {
    return this.bookings.get(entity) ?? [];
  }

  /** Where the entity is at time t (in the middle of a trip: where it is heading). */
  locationAt(entity: string, t: number): PlaceId {
    const before = this.of(entity).filter((b) => b.from <= t + EPSILON);
    return before.at(-1)?.until ?? HOME;
  }

  /** Time from which the entity stays free and where, until its next booking after t. */
  freeSince(entity: string, t: number): number {
    return Math.max(
      0,
      ...this.of(entity)
        .filter((b) => b.from <= t + EPSILON)
        .map((b) => b.to),
    );
  }

  nextAfter(entity: string, t: number): Booking | undefined {
    return this.of(entity).find((b) => b.from >= t - EPSILON);
  }

  isFree(entity: string, from: number, to: number): boolean {
    return !this.of(entity).some((b) => overlaps(b, from, to));
  }

  /** A move from `at` to `until`: valid when free, leaving from where the entity is. */
  canMove(entity: string, at: PlaceId, from: number, to: number): boolean {
    return (
      this.isFree(entity, from, to) &&
      this.locationAt(entity, from) === at &&
      this.freeSince(entity, from) <= from + EPSILON
    );
  }

  /**
   * When the entity is free to leave, from `from` on: what it is busy with then, and what starts
   * right as that ends, its destination's occurrence aside.
   */
  readyAt(entity: string, from: number, destination: PlaceId): number {
    let ready = from;
    for (;;) {
      const next = Math.max(
        ready,
        ...this.of(entity)
          .filter(
            (b) =>
              b.from <= ready + EPSILON &&
              b.to > ready + EPSILON &&
              !(b.kind === 'event' && b.at === destination),
          )
          .map((b) => b.to),
      );
      if (next <= ready + EPSILON) return ready;
      ready = next;
    }
  }

  /**
   * Arriving late at `place`: the occurrence starts for this entity when it gets there, or is
   * missed (dropped from its day) when it is already over. Returns the missed one.
   */
  arriveLate(entity: string, place: PlaceId, at: number): Booking | undefined {
    const list = this.of(entity);
    const event = list.find((b) => b.kind === 'event' && b.at === place && b.from < at - EPSILON);
    if (!event) return undefined;
    if (event.to > at + EPSILON) {
      event.from = at;
      return undefined;
    }
    this.bookings.set(
      entity,
      list.filter((b) => b !== event),
    );
    return event;
  }

  book(entity: string, booking: Booking): void {
    const list = [...this.of(entity), booking].sort((a, b) => a.from - b.from);
    this.bookings.set(entity, list);
  }

  entities(): string[] {
    return [...this.bookings.keys()];
  }
}
