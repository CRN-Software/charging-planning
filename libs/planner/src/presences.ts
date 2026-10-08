import { HOME, travelH } from './geo.ts';
import { fmtH, must, toH } from './time.ts';
import type { GapChoice, Household, PersonId, PlaceId, PlannedEvent } from './types.ts';

/** Margin kept at a place before driving home and back is worth it. */
export const STAY_MARGIN_H = 0.75;

/** A person required at a place: one or several consecutive occurrences there. */
export interface Presence {
  person: PersonId;
  d: number;
  wd: number;
  place: PlaceId;
  start: number;
  end: number;
  occurrences: PlannedEvent[];
}

/**
 * Between two presences of a person, or while a driver waits for someone: stay (chain directly
 * to the next place, or wait on site) or go home in between.
 */
export interface Link {
  id: string;
  kind: 'self' | 'wait';
  person: PersonId;
  d: number;
  place?: PlaceId;
  from: number;
  to: number;
  stay: boolean;
  origin: 'auto' | 'rule' | 'corrected';
  label: string;
}

export const personName = (h: Household, id: PersonId) => must(h.people[id], `person ${id}`).name;
export const names = (h: Household, ids: readonly PersonId[]) =>
  ids.map((id) => personName(h, id)).join(', ');
export const placeName = (h: Household, id: PlaceId) => must(h.places[id], `place ${id}`).name;

export const homeDetourH = (h: Household, from: PlaceId, to: PlaceId) =>
  travelH(h.places, from, HOME) + travelH(h.places, HOME, to) + STAY_MARGIN_H;

const titleOf = (p: Presence) => p.occurrences.map((e) => e.title).join(' + ');

/** Each participant's presences; back-to-back occurrences at one place make a single presence. */
export function presencesOf(h: Household, events: readonly PlannedEvent[]): Presence[] {
  const perPerson = events.flatMap((e) => e.participants.map((person) => ({ person, e })));
  perPerson.sort(
    (a, b) => a.person.localeCompare(b.person) || a.e.d - b.e.d || toH(a.e.start) - toH(b.e.start),
  );
  return perPerson.reduce<Presence[]>((presences, { person, e }) => {
    const last = presences.at(-1);
    const [start, end] = [toH(e.start), toH(e.end)];
    const same =
      last?.person === person &&
      last.d === e.d &&
      last.place === e.place &&
      start - last.end < homeDetourH(h, e.place, e.place);
    if (last && same) {
      last.end = Math.max(last.end, end);
      last.occurrences.push(e);
    } else
      presences.push({ person, d: e.d, wd: e.wd, place: e.place, start, end, occurrences: [e] });
    return presences;
  }, []);
}

export function decide(
  h: Household,
  gaps: Readonly<Record<string, GapChoice>>,
  id: string,
  auto: boolean,
): { stay: boolean; origin: Link['origin'] } {
  const choice = gaps[id] ?? h.gapRules[id];
  const origin = gaps[id] ? 'corrected' : h.gapRules[id] ? 'rule' : 'auto';
  return { stay: choice === undefined ? auto : choice === 'stay', origin };
}

/** Chain to the next place or go home between two presences of the same person and day. */
export function selfLink(
  h: Household,
  gaps: Readonly<Record<string, GapChoice>>,
  prev: Presence,
  next: Presence,
): Link {
  const id = `${prev.person}:${must(prev.occurrences.at(-1), 'event').id}>${must(next.occurrences[0], 'event').id}`;
  const auto = next.start - prev.end < homeDetourH(h, prev.place, next.place);
  return {
    id,
    kind: 'self',
    person: prev.person,
    d: prev.d,
    from: prev.end,
    to: next.start,
    ...decide(h, gaps, id, auto),
    label: `${titleOf(prev)} (${fmtH(prev.end)}) → ${titleOf(next)} (${fmtH(next.start)})`,
  };
}
