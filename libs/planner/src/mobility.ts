import { Dispatcher, type Conflict, type Trip } from './dispatch.ts';
import { journeysOf, type Journey } from './journeys.ts';
import type { Ledger } from './ledger.ts';
import { presencesOf, type Link, type Presence } from './presences.ts';
import type { GapChoice, Household, ModeId, Override, PlannedEvent } from './types.ts';

const QUESTION_MIN_KM = 20;

export interface Question {
  group: string;
  d: number;
  km: number;
  title: string;
  current: ModeId;
  text: string;
  modes: ModeId[];
}

export interface MobilityInput {
  household: Household;
  events: readonly PlannedEvent[];
  overrides: Readonly<Record<string, Override>>;
  gaps: Readonly<Record<string, GapChoice>>;
}

/** Who goes where, how and with whom over the week, and the state of every entity per day. */
export interface Mobility {
  presences: Presence[];
  journeys: Journey[];
  trips: Trip[];
  links: Link[];
  conflicts: Conflict[];
  questions: Question[];
  ledgers: Map<number, Ledger>;
}

const byDay = <T extends { d: number }>(items: readonly T[]) => {
  const days = new Map<number, T[]>();
  items.forEach((item) => days.set(item.d, [...(days.get(item.d) ?? []), item]));
  return days;
};

/** Long trips in the tracked vehicle while another household car was free: worth asking. */
function questionsOf(
  input: MobilityInput,
  trips: readonly Trip[],
  ledgers: Map<number, Ledger>,
): Question[] {
  const h = input.household;
  const others = h.autoModes.filter((m) => m !== h.trackedMode && h.modes[m]?.vehicle);
  const groups = byDay(
    trips.filter((t) => t.mode === h.trackedMode && input.overrides[t.group]?.mode === undefined),
  );
  return [...groups.values()]
    .flatMap((dayTrips) => {
      const perGroup = new Map<string, Trip[]>();
      dayTrips.forEach((t) => perGroup.set(t.group, [...(perGroup.get(t.group) ?? []), t]));
      return [...perGroup.entries()].flatMap(([group, ts]): Question[] => {
        const km = Math.round(ts.reduce((s, t) => s + t.km, 0));
        const first = ts[0];
        const ledger = first ? ledgers.get(first.d) : undefined;
        if (
          !first ||
          !ledger ||
          km < QUESTION_MIN_KM ||
          h.places[first.to]?.preferMode !== undefined
        )
          return [];
        const free = others.filter((m) => ts.every((t) => ledger.isFree(m, t.dep, t.arr)));
        if (!free.length) return [];
        return [
          {
            group,
            d: first.d,
            km,
            title: h.places[first.to]?.name ?? first.to,
            current: h.trackedMode,
            text: `${km} km et une autre voiture est libre. Laquelle part ?`,
            modes: [h.trackedMode, ...free],
          },
        ];
      });
    })
    .sort((a, b) => b.km - a.km);
}

/** Calendar occurrences → presences, journeys, then a dispatch per day (everyone home at night). */
export function planMobility(input: MobilityInput): Mobility {
  const presences = presencesOf(input.household, input.events);
  const { journeys, links } = journeysOf(input.household, input.gaps, presences);
  const presenceDays = byDay(presences);
  const journeyDays = byDay(journeys);
  const days = [...new Set([...presenceDays.keys(), ...journeyDays.keys()])].sort((a, b) => a - b);
  const result: Mobility = {
    presences,
    journeys,
    trips: [],
    links: [...links],
    conflicts: [],
    questions: [],
    ledgers: new Map(),
  };
  for (const d of days) {
    const dispatcher = new Dispatcher({
      ...input,
      presences: presenceDays.get(d) ?? [],
      journeys: journeyDays.get(d) ?? [],
    });
    dispatcher.run();
    result.trips.push(...dispatcher.trips);
    result.links.push(...dispatcher.links);
    result.conflicts.push(...dispatcher.conflicts);
    result.ledgers.set(d, dispatcher.ledger);
  }
  result.trips.sort((a, b) => a.d - b.d || a.dep - b.dep);
  result.questions = questionsOf(input, result.trips, result.ledgers);
  return result;
}
