import {
  chooseDriver,
  chooseMode,
  isDriver,
  isVehicle,
  noVehicleText,
  startOf,
  type Choice,
  type ChoiceContext,
  type TripSource,
} from './choices.ts';
import { distance, HOME, travelH } from './geo.ts';
import { serveGathering, serveTour } from './rounds.ts';
import { isTourmate, nearby } from './tours.ts';
import type { Journey } from './journeys.ts';
import { Ledger } from './ledger.ts';
import {
  decide,
  homeDetourH,
  names,
  personName,
  placeName,
  type Link,
  type Presence,
} from './presences.ts';
import { fmtH } from './time.ts';
import type { GapChoice, Household, ModeId, Override, PersonId, PlaceId } from './types.ts';

export type { TripSource } from './choices.ts';

/** A move of one vehicle (or on foot, by bike) with its driver and passengers. */
export interface Trip {
  id: string;
  journey: string;
  group: string;
  d: number;
  wd: number;
  from: PlaceId;
  to: PlaceId;
  dep: number;
  arr: number;
  km: number;
  /** Household vehicle, soft mode (bike, walk) or the external mode (someone else's car). */
  mode: ModeId;
  /** Null when nobody can take the passengers: a conflict says why. */
  driver: PersonId | null;
  passengers: PersonId[];
  /** `escort`: the driver travels only to take or fetch others; `event`: the people attend. */
  purpose: 'event' | 'escort';
  occurrences: string[];
  why: string[];
  source: TripSource;
}

export interface Conflict {
  d: number;
  t: number;
  text: string;
  group?: string;
}

export interface DispatchInput {
  household: Household;
  overrides: Readonly<Record<string, Override>>;
  gaps: Readonly<Record<string, GapChoice>>;
  presences: readonly Presence[];
  journeys: readonly Journey[];
}

type Move = Pick<
  Trip,
  'driver' | 'mode' | 'passengers' | 'from' | 'to' | 'dep' | 'arr' | 'purpose' | 'why' | 'source'
> & {
  suffix: string;
};

/** A few minutes late is how families live: only report longer delays. */
const LATE_TOLERANCE_H = 10 / 60;

/**
 * Serves the journeys of one day in time order, booking every person and vehicle in the ledger:
 * each choice is made from the state the day has reached (who is where, what is free).
 */
export class Dispatcher {
  readonly ledger = new Ledger();
  readonly trips: Trip[] = [];
  readonly conflicts: Conflict[] = [];
  readonly links: Link[] = [];
  readonly h: Household;

  constructor(readonly input: DispatchInput) {
    this.h = input.household;
    for (const p of input.presences) {
      const label = p.occurrences.map((e) => e.title).join(' + ');
      this.ledger.book(p.person, {
        kind: 'event',
        from: p.start,
        to: p.end,
        at: p.place,
        until: p.place,
        label,
      });
    }
  }

  run(): void {
    const served = new Set<string>();
    const journeys = this.input.journeys;
    journeys.forEach((j, i) => {
      if (served.has(j.id)) return;
      const pending = () => journeys.slice(i + 1).filter((k) => !served.has(k.id));
      const tourmates = pending().filter((k) => isTourmate(j, k));
      const gathered = tourmates.length ? [] : pending().filter((k) => this.gathersWith(j, k));
      const group = [j, ...tourmates, ...gathered];
      group.forEach((k) => served.add(k.id));
      if (tourmates.length && serveTour(this, group, pending)) return;
      if (gathered.length && serveGathering(this, group, pending())) return;
      for (const journey of group) {
        const prepared = this.prepare(journey);
        if (prepared) this.serve(prepared, pending());
      }
    });
  }

  /** Pickups toward the same place, from nearby places, soon after one another, with no driver. */
  private gathersWith(j: Journey, k: Journey): boolean {
    return (
      k.d === j.d &&
      k.to === j.to &&
      nearby(this.h, j.from, k.from) &&
      k.dep >= j.dep &&
      k.dep - j.dep < homeDetourH(this.h, j.from, k.from) &&
      ![...j.members, ...k.members].some((m) => isDriver(this.h, m))
    );
  }

  /** Non-drivers left at a place with nothing else planned today: they go with the next car. */
  stranded(place: PlaceId, t: number, exclude: readonly PersonId[] = []): PersonId[] {
    if (place === HOME) return [];
    return Object.keys(this.h.people).filter(
      (p) =>
        !exclude.includes(p) &&
        !isDriver(this.h, p) &&
        this.h.people[p]?.external !== true &&
        this.ledger.locationAt(p, t) === place &&
        this.ledger.freeSince(p, t) <= t + 1e-6 &&
        this.ledger.nextAfter(p, t) === undefined,
    );
  }

  /** People and their car staying at a place for a while (nothing to book at home). */
  waitAll(people: readonly PersonId[], mode: ModeId, at: PlaceId, from: number, to: number): void {
    if (at === HOME || to <= from + 1e-6) return;
    const label = `attend à ${placeName(this.h, at)}`;
    for (const p of people) this.ledger.book(p, { kind: 'wait', from, to, at, until: at, label });
    if (isVehicle(this.h, mode))
      this.ledger.book(mode, { kind: 'parked', from, to, at, until: at, label });
  }

  /** The members of a journey reach its destination at `arr`: shift or drop what they miss. */
  arrive(j: Journey, arr: number): void {
    for (const m of j.members) {
      const missed = this.ledger.arriveLate(m, j.to, arr);
      if (missed)
        this.conflict(
          j,
          arr,
          `${personName(this.h, m)} manque « ${missed.label} » : arrivée à ${fmtH(arr)}, après la fin.`,
        );
    }
    if (j.anchor === 'arrive' && arr - j.arr > LATE_TOLERANCE_H)
      this.conflict(
        j,
        arr,
        `${names(this.h, j.members)} à ${placeName(this.h, j.to)} à ${fmtH(arr)} au lieu de ${fmtH(j.arr)}.`,
      );
  }

  conflict(j: Journey, t: number, text: string): void {
    this.conflicts.push({ d: j.d, t, group: j.group, text });
  }

  context(j: Journey): ChoiceContext {
    const events = this.input.presences
      .flatMap((p) => p.occurrences)
      .filter((e) => j.occurrences.includes(e.id));
    const origin = events.some((e) => e.suggested)
      ? 'suggested'
      : events.some((e) => e.manual)
        ? 'manual'
        : 'calendar';
    return { h: this.h, ledger: this.ledger, override: this.input.overrides[j.group], origin };
  }

  /** Leaves once every member is free at the origin; drops members already there; notes delays. */
  private prepare(planned: Journey): Journey | undefined {
    const ready = Math.max(
      ...planned.members.map((m) => this.ledger.readyAt(m, planned.dep, planned.to)),
    );
    const j =
      ready > planned.dep
        ? { ...planned, dep: ready, arr: ready + planned.arr - planned.dep }
        : planned;
    const members = j.members.filter(
      (m) => this.ledger.locationAt(m, j.dep) !== j.to || !this.ledger.isFree(m, j.dep, j.arr),
    );
    if (members.length === 0) return undefined;
    for (const m of members) {
      const missed = this.ledger.arriveLate(m, j.to, j.arr);
      if (missed)
        this.conflict(
          j,
          j.arr,
          `${personName(this.h, m)} manque « ${missed.label} » : arrivée à ${fmtH(j.arr)}, après la fin.`,
        );
    }
    if (j.arr - planned.arr > LATE_TOLERANCE_H) {
      const verb = members.length > 1 ? 'arrivent' : 'arrive';
      this.conflict(
        j,
        j.arr,
        `${names(this.h, members)} ${verb} à ${placeName(this.h, j.to)} à ${fmtH(j.arr)} au lieu de ${fmtH(planned.arr)}.`,
      );
    }
    return { ...j, members };
  }

  private serve(j: Journey, later: readonly Journey[]): void {
    const c = this.context(j);
    const choice = chooseDriver(c, j);
    if (!choice) {
      this.conflict(
        j,
        j.dep,
        `Personne ne peut emmener ${names(this.h, j.members)} (${placeName(this.h, j.from)} → ${placeName(this.h, j.to)} à ${fmtH(j.dep)}).`,
      );
      this.move(j, {
        driver: null,
        mode: this.h.externalMode,
        passengers: j.members,
        from: j.from,
        to: j.to,
        dep: j.dep,
        arr: j.arr,
        purpose: 'escort',
        why: ['Aucun conducteur disponible.'],
        source: 'inferred',
        suffix: 'main',
      });
    } else if (choice.external) {
      this.move(j, {
        driver: choice.driver,
        mode: this.h.externalMode,
        passengers: j.members,
        from: j.from,
        to: j.to,
        dep: j.dep,
        arr: j.arr,
        purpose: 'escort',
        why: [choice.why, 'Aucun véhicule du foyer utilisé.'],
        source: choice.source,
        suffix: 'main',
      });
    } else this.drive(c, j, choice, later);
  }

  /** Drives there first when needed, takes the members, then parks, waits or goes home. */
  private drive(c: ChoiceContext, j: Journey, choice: Choice, later: readonly Journey[]): void {
    const start = startOf(c, choice.driver, j);
    const vehicle = chooseMode(c, j, start);
    if (vehicle.missing) this.conflict(j, start.dep, noVehicleText(this.h, choice.driver, j));
    const common = { driver: choice.driver, mode: vehicle.mode, source: choice.source };
    const along = this.stranded(start.from, start.dep, j.members);
    if (start.from !== j.from) {
      const why = [
        `${personName(this.h, choice.driver)} part chercher ${names(this.h, j.members)}.`,
      ];
      this.move(j, {
        ...common,
        passengers: along,
        from: start.from,
        to: j.from,
        dep: start.dep,
        arr: j.dep,
        purpose: 'escort',
        why,
        suffix: 'approach',
      });
    }
    const passengers = [
      ...j.members.filter((m) => m !== choice.driver),
      ...(start.from === j.from ? along : []),
    ];
    const purpose = choice.member ? 'event' : 'escort';
    this.move(j, {
      ...common,
      passengers,
      from: j.from,
      to: j.to,
      dep: j.dep,
      arr: j.arr,
      purpose,
      why: [choice.why, vehicle.why],
      suffix: 'main',
    });
    if (choice.member) this.park(choice.driver, vehicle.mode, j);
    else this.afterEscort(j, choice.driver, vehicle.mode, later);
  }

  move(j: Journey, move: Move): void {
    const { suffix, ...trip } = move;
    const km = distance(this.h.places, trip.from, trip.to);
    this.trips.push({
      ...trip,
      id: `${j.id}#${suffix}`,
      journey: j.id,
      group: j.group,
      d: j.d,
      wd: j.wd,
      km,
      occurrences: j.occurrences,
    });
    const label = `${placeName(this.h, trip.from)} → ${placeName(this.h, trip.to)}`;
    const riders = [
      ...(trip.driver ? [trip.driver] : []),
      ...trip.passengers,
      ...(isVehicle(this.h, trip.mode) ? [trip.mode] : []),
    ];
    for (const entity of riders) {
      if (!this.ledger.canMove(entity, trip.from, trip.dep, trip.arr)) {
        const name = this.h.people[entity]?.name ?? this.h.modes[entity]?.label ?? entity;
        this.conflict(
          j,
          trip.dep,
          `${name} n'est pas libre à ${placeName(this.h, trip.from)} à ${fmtH(trip.dep)}.`,
        );
      }
      this.ledger.book(entity, {
        kind: 'trip',
        from: trip.dep,
        to: trip.arr,
        at: trip.from,
        until: trip.to,
        label,
      });
    }
  }

  /** The vehicle waits where its driver attends, until the driver leaves. */
  park(driver: PersonId, mode: ModeId, j: Journey): void {
    const stay = this.ledger.nextAfter(driver, j.arr);
    if (!isVehicle(this.h, mode) || stay?.at !== j.to) return;
    const label = `stationnée (${personName(this.h, driver)})`;
    this.ledger.book(mode, {
      kind: 'parked',
      from: j.arr,
      to: stay.to,
      at: j.to,
      until: j.to,
      label,
    });
  }

  /** After a drop-off: wait on site for the pickup, or drive home. */
  afterEscort(j: Journey, driver: PersonId, mode: ModeId, later: readonly Journey[]): void {
    if (j.to === HOME) return;
    const pickup = later.find(
      (k) =>
        k.d === j.d &&
        k.from === j.to &&
        k.dep >= j.arr &&
        !k.members.some((m) => isDriver(this.h, m)),
    );
    if (pickup && this.waits(j, driver, pickup)) {
      this.wait(driver, mode, j, pickup.dep);
      return;
    }
    if (this.ledger.nextAfter(driver, j.arr)?.at === j.to) return;
    const arr = j.arr + travelH(this.h.places, j.to, HOME);
    this.move(j, {
      driver,
      mode,
      passengers: this.stranded(j.to, j.arr),
      from: j.to,
      to: HOME,
      dep: j.arr,
      arr,
      purpose: 'escort',
      why: [`${personName(this.h, driver)} rentre.`],
      source: 'inferred',
      suffix: 'back',
    });
  }

  /** Waiting is the default when the pickup comes sooner than a round trip home. */
  waits(j: Journey, driver: PersonId, pickup: Journey): boolean {
    const id = `wait:${j.wd}:${j.to}:${fmtH(j.arr)}`;
    const auto = pickup.dep - j.arr < homeDetourH(this.h, j.to, j.to);
    const { stay, origin } = decide(this.h, this.input.gaps, id, auto);
    const label = `${personName(this.h, driver)} à ${placeName(this.h, j.to)} (${fmtH(j.arr)} → ${fmtH(pickup.dep)})`;
    this.links.push({
      id,
      kind: 'wait',
      person: driver,
      d: j.d,
      place: j.to,
      from: j.arr,
      to: pickup.dep,
      stay,
      origin,
      label,
    });
    return stay;
  }

  private wait(driver: PersonId, mode: ModeId, j: Journey, until: number): void {
    const label = `attend à ${placeName(this.h, j.to)}`;
    this.ledger.book(driver, {
      kind: 'wait',
      from: j.arr,
      to: until,
      at: j.to,
      until: j.to,
      label,
    });
    if (isVehicle(this.h, mode))
      this.ledger.book(mode, {
        kind: 'parked',
        from: j.arr,
        to: until,
        at: j.to,
        until: j.to,
        label,
      });
  }
}
