import { distance, HOME, travelH } from './geo.ts';
import { selfLink, type Link, type Presence } from './presences.ts';
import { fmtH, must } from './time.ts';
import type { GapChoice, Household, PersonId, PlaceId } from './types.ts';

/** Departures and arrivals this close to each other travel together. */
const TOGETHER_H = 0.25;

/** A person who must go from one place to another: arrive by `t`, or leave at `t`. */
interface Need {
  person: PersonId;
  d: number;
  from: PlaceId;
  to: PlaceId;
  anchor: 'arrive' | 'depart';
  t: number;
  group: string;
  occurrences: string[];
}

/**
 * People moving together between the same places at the same time. `group` ties the outward and
 * return journeys of one outing: it is the key of the user's corrections (driver, vehicle).
 */
export interface Journey {
  id: string;
  /** Arrive by `arr` (going to an occurrence) or leave at `dep` (after one). */
  anchor: 'arrive' | 'depart';
  d: number;
  wd: number;
  from: PlaceId;
  to: PlaceId;
  dep: number;
  arr: number;
  km: number;
  members: PersonId[];
  group: string;
  occurrences: string[];
}

const groupOf = (p: Presence, edge: 'first' | 'last') =>
  `occ:${must(edge === 'first' ? p.occurrences[0] : p.occurrences.at(-1), 'event').id}`;
const idsOf = (p: Presence) => p.occurrences.map((e) => e.id);

function arrive(p: Presence, from: PlaceId): Need {
  return {
    person: p.person,
    d: p.d,
    from,
    to: p.place,
    anchor: 'arrive',
    t: p.start,
    group: groupOf(p, 'first'),
    occurrences: idsOf(p),
  };
}

function depart(p: Presence, to: PlaceId): Need {
  return {
    person: p.person,
    d: p.d,
    from: p.place,
    to,
    anchor: 'depart',
    t: p.end,
    group: groupOf(p, 'last'),
    occurrences: idsOf(p),
  };
}

/** The moves of one person over a day: from home, between presences, back home. */
function needsOfDay(
  h: Household,
  gaps: Readonly<Record<string, GapChoice>>,
  day: readonly Presence[],
  links: Link[],
): Need[] {
  const first = must(day[0], 'presence');
  const needs: Need[] = [arrive(first, HOME)];
  day.slice(1).forEach((next, i) => {
    const prev = must(day[i], 'presence');
    const link = selfLink(h, gaps, prev, next);
    links.push(link);
    if (link.stay && prev.place === next.place) return;
    if (link.stay) needs.push({ ...depart(prev, next.place), group: groupOf(next, 'first') });
    else needs.push(depart(prev, HOME), arrive(next, HOME));
  });
  needs.push(depart(must(day.at(-1), 'presence'), HOME));
  return needs;
}

function needsOf(
  h: Household,
  gaps: Readonly<Record<string, GapChoice>>,
  presences: readonly Presence[],
) {
  const days = new Map<string, Presence[]>();
  presences.forEach((p) =>
    days.set(`${p.person}/${p.d}`, [...(days.get(`${p.person}/${p.d}`) ?? []), p]),
  );
  const links: Link[] = [];
  const needs = [...days.values()].flatMap((day) => needsOfDay(h, gaps, day, links));
  return { needs, links };
}

function journeyOf(h: Household, needs: Need[], wd: number): Journey {
  const first = must(needs[0], 'need');
  const t =
    first.anchor === 'arrive'
      ? Math.min(...needs.map((n) => n.t))
      : Math.max(...needs.map((n) => n.t));
  const duration = travelH(h.places, first.from, first.to);
  const dep = first.anchor === 'arrive' ? t - duration : t;
  return {
    id: `${first.d}|${first.anchor}|${first.from}>${first.to}|${fmtH(t)}`,
    anchor: first.anchor,
    d: first.d,
    wd,
    from: first.from,
    to: first.to,
    dep,
    arr: dep + duration,
    km: distance(h.places, first.from, first.to),
    members: [...new Set(needs.map((n) => n.person))],
    group: [...new Set(needs.map((n) => n.group))].sort()[0] ?? first.group,
    occurrences: [...new Set(needs.flatMap((n) => n.occurrences))],
  };
}

export const anchorTime = (j: Journey) => (j.anchor === 'arrive' ? j.arr : j.dep);

/** Everybody's moves, grouped into journeys taken together; plus the stay/home decisions made. */
export function journeysOf(
  h: Household,
  gaps: Readonly<Record<string, GapChoice>>,
  presences: readonly Presence[],
): { journeys: Journey[]; links: Link[] } {
  const { needs, links } = needsOf(h, gaps, presences);
  const wdOf = new Map(presences.map((p) => [p.d, p.wd]));
  const key = (n: Need) => `${n.d}|${n.anchor}|${n.from}>${n.to}`;
  const sorted = [...needs].sort((a, b) => key(a).localeCompare(key(b)) || a.t - b.t);
  const groups = sorted.reduce<Need[][]>((acc, need) => {
    const last = acc.at(-1);
    const head = last?.[0];
    if (
      last &&
      head &&
      key(head) === key(need) &&
      need.t - must(last.at(-1), 'need').t <= TOGETHER_H
    )
      last.push(need);
    else acc.push([need]);
    return acc;
  }, []);
  const journeys = groups.map((g) => journeyOf(h, g, wdOf.get(must(g[0], 'need').d) ?? 0));
  // By anchor time: each person's moves stay in order even when travel is longer than the gap.
  return { journeys: journeys.sort((a, b) => a.d - b.d || anchorTime(a) - anchorTime(b)), links };
}
