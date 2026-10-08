import { chooseDriver, chooseMode, noVehicleText, startOf, type TripSource } from './choices.ts';
import type { Dispatcher } from './dispatch.ts';
import { HOME, travelH } from './geo.ts';
import type { Journey } from './journeys.ts';
import { decide, homeDetourH, personName, placeName } from './presences.ts';
import { fmtH } from './time.ts';
import { nearby, stopOrder, stopsOf, tourStart } from './tours.ts';
import type { ModeId, PersonId, PlaceId } from './types.ts';

/** A place the car goes to: some people get off, others get on (once `at` has come). */
export interface Visit {
  journeys: Journey[];
  place: PlaceId;
  at?: number;
  board: PersonId[];
  alight: PersonId[];
}

/** One driver and one car going from visit to visit. */
export interface Round {
  driver: PersonId;
  mode: ModeId;
  from: PlaceId;
  dep: number;
  aboard: PersonId[];
  visits: Visit[];
  why: string[];
  source: TripSource;
  prefix: string;
}

export interface RoundEnd {
  at: PlaceId;
  t: number;
  aboard: PersonId[];
}

/** Drives the round: waits on site for pickups, lets people off and on; where it ends, who is aboard. */
export function driveRound(d: Dispatcher, r: Round): RoundEnd {
  let at = r.from;
  let t = r.dep;
  let aboard = [...new Set([r.driver, ...r.aboard])];
  r.visits.forEach((v, i) => {
    const [journey] = v.journeys;
    if (!journey) return;
    if (v.place !== at) {
      const travel = travelH(d.h.places, at, v.place);
      const dep = v.at === undefined ? t : Math.max(t, v.at - travel);
      d.waitAll(aboard, r.mode, at, t, dep);
      const passengers = aboard.filter((p) => p !== r.driver);
      for (const j of v.journeys) if (v.alight.length) d.arrive(j, dep + travel);
      d.move(journey, {
        driver: r.driver,
        mode: r.mode,
        passengers,
        from: at,
        to: v.place,
        dep,
        arr: dep + travel,
        purpose: 'event',
        why: r.why,
        source: r.source,
        suffix: `${r.prefix}${i}`,
      });
      [at, t] = [v.place, dep + travel];
    }
    if (v.at !== undefined && v.at > t) {
      d.waitAll(aboard, r.mode, at, t, v.at);
      t = v.at;
    }
    aboard = [
      ...new Set([...aboard.filter((p) => p === r.driver || !v.alight.includes(p)), ...v.board]),
    ];
  });
  return { at, t, aboard: aboard.filter((p) => p !== r.driver) };
}

/** A pickup soon at or near `at`, by nobody travelling with a driver of their own. */
function nextPickup(
  d: Dispatcher,
  at: PlaceId,
  t: number,
  pending: readonly Journey[],
): Journey | undefined {
  return pending.find(
    (k) =>
      nearby(d.h, at, k.from) &&
      k.dep >= t &&
      k.to === HOME &&
      k.dep - t < homeDetourH(d.h, at, k.from),
  );
}

/**
 * After the last drop-off, the driver heading home waits nearby (with whoever rides home) when
 * a pickup comes sooner than a round trip home; the user can force going home instead.
 */
function waitUntil(
  d: Dispatcher,
  driver: PersonId,
  end: RoundEnd,
  head: Journey,
  pending: readonly Journey[],
): number | undefined {
  const pickup = nextPickup(d, end.at, end.t, pending);
  if (!pickup) return undefined;
  const id = `wait:${head.wd}:${end.at}:${fmtH(end.t)}`;
  const { stay, origin } = decide(d.h, d.input.gaps, id, true);
  const until = pickup.dep - travelH(d.h.places, end.at, pickup.from);
  const label = `${personName(d.h, driver)} à ${placeName(d.h, end.at)} (${fmtH(end.t)} → ${fmtH(pickup.dep)})`;
  d.links.push({
    id,
    kind: 'wait',
    person: driver,
    d: head.d,
    place: end.at,
    from: end.t,
    to: pickup.dep,
    stay,
    origin,
    label,
  });
  return stay && until > end.t ? until : undefined;
}

/**
 * People leaving one place together for different places: one car drops each at their stop.
 * False when nobody among them can drive them all (each journey is then served on its own).
 */
export function serveTour(d: Dispatcher, journeys: Journey[], pending: () => Journey[]): boolean {
  const [head] = journeys;
  if (!head) return false;
  const members = [...new Set(journeys.flatMap((j) => j.members))];
  const whole = {
    ...head,
    members,
    occurrences: [...new Set(journeys.flatMap((j) => j.occurrences))],
  };
  const c = d.context(head);
  const choice = chooseDriver(c, whole);
  if (!choice || choice.external || !choice.member) return false;
  const order = stopOrder(d.h, head.from, journeys, choice.driver);
  const ready = Math.max(
    ...journeys.flatMap((j) => j.members.map((m) => d.ledger.readyAt(m, j.dep, j.to))),
  );
  const stops = stopsOf(
    d.h,
    head.from,
    journeys,
    order,
    tourStart(d.h, head.from, journeys, order, ready),
  );
  const first = stops[0];
  const lastStop = stops.at(-1);
  if (!first || !lastStop) return false;
  const start = { from: head.from, dep: first.arr - travelH(d.h.places, head.from, first.place) };
  const vehicle = chooseMode(c, { ...whole, arr: lastStop.arr }, start);
  if (vehicle.missing) d.conflict(head, start.dep, noVehicleText(d.h, choice.driver, head));
  const visits = stops.map((s): Visit => ({
    journeys: s.journeys,
    place: s.place,
    board: [],
    alight: s.journeys.flatMap((j) => j.members),
  }));
  const home = visits.at(-1)?.place === HOME ? visits.pop() : undefined;
  const round = {
    driver: choice.driver,
    mode: vehicle.mode,
    why: [choice.why, vehicle.why],
    source: choice.source,
  };
  const end = driveRound(d, {
    ...round,
    from: head.from,
    dep: start.dep,
    aboard: members,
    visits,
    prefix: 'tour',
  });
  if (home) {
    const until = waitUntil(d, choice.driver, end, head, pending());
    if (until !== undefined)
      d.waitAll([choice.driver, ...end.aboard], vehicle.mode, end.at, end.t, until);
    else
      driveRound(d, {
        ...round,
        from: end.at,
        dep: end.t,
        aboard: end.aboard,
        visits: [home],
        prefix: 'home',
      });
    return true;
  }
  const last =
    lastStop.journeys.find((j) => j.members.includes(choice.driver)) ?? lastStop.journeys[0];
  if (last) d.park(choice.driver, vehicle.mode, { ...last, arr: lastStop.arr });
  return true;
}

/**
 * Several pickups toward one place from nearby places: one driver collects them in time order,
 * waiting on site in between, with anyone left waiting there.
 */
export function serveGathering(
  d: Dispatcher,
  journeys: Journey[],
  pending: readonly Journey[],
): boolean {
  const sorted = [...journeys].sort((a, b) => a.dep - b.dep);
  const [head] = sorted;
  const last = sorted.at(-1);
  if (!head || !last) return false;
  const members = [...new Set(sorted.flatMap((j) => j.members))];
  const arr = last.dep + travelH(d.h.places, last.from, last.to);
  const whole = {
    ...head,
    members,
    arr,
    occurrences: [...new Set(sorted.flatMap((j) => j.occurrences))],
  };
  const c = d.context(head);
  const choice = chooseDriver(c, whole);
  if (!choice || choice.external) return false;
  const start = startOf(c, choice.driver, whole);
  const vehicle = chooseMode(c, whole, start);
  if (vehicle.missing) d.conflict(head, start.dep, noVehicleText(d.h, choice.driver, head));
  const pickups = sorted.map((j): Visit => ({
    journeys: [j],
    place: j.from,
    at: j.dep,
    board: j.members,
    alight: [],
  }));
  const drop: Visit = { journeys: [last], place: last.to, board: [], alight: members };
  const along = d.stranded(start.from, start.dep, members);
  const why = [choice.why, vehicle.why];
  const end = driveRound(d, {
    driver: choice.driver,
    mode: vehicle.mode,
    from: start.from,
    dep: start.dep,
    aboard: along,
    visits: [...pickups, drop],
    why,
    source: choice.source,
    prefix: 'gather',
  });
  if (!choice.member && end.at !== HOME)
    d.afterEscort({ ...last, arr: end.t }, choice.driver, vehicle.mode, pending);
  return true;
}
