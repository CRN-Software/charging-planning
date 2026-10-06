import { distance, HOME, travelH } from './geo.ts';
import { fmtH, must, toH } from './time.ts';
import type { GapChoice, Household, ModeId, PersonId, PlaceId, PlannedEvent } from './types.ts';

const STAY_MARGIN_H = 0.75;
const MERGE_TOLERANCE_H = 0.25;

export interface Leg {
  d: number;
  from: PlaceId;
  to: PlaceId;
  km: number;
  dep: number;
  arr: number;
}

export interface Outing {
  who: PersonId;
  d: number;
  wd: number;
  place: PlaceId;
  start: number;
  end: number;
  events: PlannedEvent[];
}

export interface Task {
  type: 'drop' | 'pickup';
  d: number;
  wd: number;
  place: PlaceId;
  t: number;
  kids: PersonId[];
}

export interface Gap {
  id: string;
  kind: 'self' | 'escort';
  d: number;
  who?: PersonId;
  place?: PlaceId;
  stay: boolean;
  origin: 'auto' | 'rule' | 'corrected';
  from: number;
  to: number;
  subject: string;
  label: string;
}

interface LoopShape {
  d: number;
  wd: number;
  group: string;
  legs: Leg[];
  km: number;
  title: string;
  groupTitle: string;
  placeLabel: string;
  unknownPlace: boolean;
  suggested: boolean;
  preferMode: ModeId | undefined;
  manualEvents: PlannedEvent[];
  outings: Outing[];
  why: string[];
}

export interface SelfLoop extends LoopShape {
  kind: 'self';
  who: PersonId;
}

export interface EscortLoop extends LoopShape {
  kind: 'escort';
  place: PlaceId;
  tasks: Task[];
  kids: PersonId[];
}

export type DraftLoop = SelfLoop | EscortLoop;

export interface Builder {
  household: Household;
  gaps: Readonly<Record<string, GapChoice>>;
  gapLog: Gap[];
}

const placeOf = (h: Household, id: PlaceId) => must(h.places[id], `place ${id}`);
export const personName = (h: Household, id: PersonId) => must(h.people[id], `person ${id}`).name;
export const names = (h: Household, ids: readonly PersonId[]) =>
  ids.map((id) => personName(h, id)).join(', ');
const sumKm = (legs: readonly Leg[]) => legs.reduce((s, g) => s + g.km, 0);

const homeDetourH = (h: Household, from: PlaceId, to: PlaceId) =>
  travelH(h.places, from, HOME) + travelH(h.places, HOME, to) + STAY_MARGIN_H;

function decideGap(
  b: Builder,
  id: string,
  auto: boolean,
): { stay: boolean; origin: Gap['origin'] } {
  const choice = b.gaps[id] ?? b.household.gapRules[id];
  const origin = b.gaps[id] ? 'corrected' : b.household.gapRules[id] ? 'rule' : 'auto';
  return { stay: choice === undefined ? auto : choice === 'stay', origin };
}

function leg(
  h: Household,
  d: number,
  from: PlaceId,
  to: PlaceId,
  at: { arriveAt?: number; departAt?: number },
): Leg {
  const duration = travelH(h.places, from, to);
  const dep = at.departAt ?? (at.arriveAt ?? 0) - duration;
  return { d, from, to, km: distance(h.places, from, to), dep, arr: dep + duration };
}

export function mergeOutings(h: Household, events: readonly PlannedEvent[]): Outing[] {
  const sorted = [...events].sort(
    (a, b) => a.who.localeCompare(b.who) || a.d - b.d || toH(a.start) - toH(b.start),
  );
  return sorted.reduce<Outing[]>((outings, e) => {
    const last = outings.at(-1);
    const [start, end] = [toH(e.start), toH(e.end)];
    const sameStay =
      last?.who === e.who &&
      last.d === e.d &&
      last.place === e.place &&
      start - last.end < homeDetourH(h, e.place, e.place);
    if (last && sameStay) {
      last.end = Math.max(last.end, end);
      last.events.push(e);
    } else outings.push({ who: e.who, d: e.d, wd: e.wd, place: e.place, start, end, events: [e] });
    return outings;
  }, []);
}

const outingTitle = (o: Outing) => o.events.map((e) => e.title).join(' + ');
const firstEvent = (o: Outing) => must(o.events[0], 'outing event');
const lastEvent = (o: Outing) => must(o.events.at(-1), 'outing event');

function logSelfGap(b: Builder, prev: Outing, o: Outing): boolean {
  const id = `${lastEvent(prev).id}>${firstEvent(o).id}`;
  const auto = o.start - prev.end < homeDetourH(b.household, prev.place, o.place);
  const { stay, origin } = decideGap(b, id, auto);
  b.gapLog.push({
    id,
    kind: 'self',
    who: o.who,
    d: o.d,
    stay,
    origin,
    from: prev.end,
    to: o.start,
    subject: personName(b.household, o.who),
    label: `${outingTitle(prev)} (${fmtH(prev.end)}) → ${outingTitle(o)} (${fmtH(o.start)})`,
  });
  return stay;
}

function finishSelfLoop(h: Household, outings: Outing[], legs: Leg[], who: PersonId): SelfLoop {
  const first = must(outings[0], 'outing');
  const last = must(outings.at(-1), 'outing');
  const allLegs = [...legs, leg(h, last.d, last.place, HOME, { departAt: last.end })];
  const title = outings.map(outingTitle).join(' → ');
  const events = outings.flatMap((o) => o.events);
  return {
    kind: 'self',
    who,
    d: first.d,
    wd: first.wd,
    group: `self-${firstEvent(first).id}`,
    outings,
    legs: allLegs,
    km: sumKm(allLegs),
    title,
    groupTitle: `${personName(h, who)} · ${title}`,
    placeLabel: outings.map((o) => placeOf(h, o.place).name).join(' → '),
    preferMode: outings.map((o) => placeOf(h, o.place).preferMode).find(Boolean),
    suggested: events.some((e) => e.suggested),
    manualEvents: events.filter((e) => e.manual),
    unknownPlace: outings.some((o) => placeOf(h, o.place).unknown),
    why: [`Retour au domicile supposé après ${fmtH(last.end)}.`],
  };
}

export function selfLoops(b: Builder, outings: readonly Outing[]): SelfLoop[] {
  const chains: { outings: Outing[]; legs: Leg[] }[] = [];
  outings.forEach((o, i) => {
    const prev = outings[i - 1];
    const chain = chains.at(-1);
    if (prev?.who === o.who && prev.d === o.d && chain && logSelfGap(b, prev, o)) {
      chain.legs.push(leg(b.household, o.d, prev.place, o.place, { departAt: prev.end }));
      chain.outings.push(o);
    } else
      chains.push({
        outings: [o],
        legs: [leg(b.household, o.d, HOME, o.place, { arriveAt: o.start })],
      });
  });
  return chains.map((c) => finishSelfLoop(b.household, c.outings, c.legs, firstOf(c.outings).who));
}

const firstOf = <T>(items: readonly T[]): T => must(items[0], 'item');

export function escortTasks(outings: readonly Outing[]): Task[] {
  const tasks = outings.flatMap((o): Task[] => [
    { type: 'drop', d: o.d, wd: o.wd, place: o.place, t: o.start, kids: [o.who] },
    { type: 'pickup', d: o.d, wd: o.wd, place: o.place, t: o.end, kids: [o.who] },
  ]);
  tasks.sort((a, b) => a.d - b.d || a.place.localeCompare(b.place) || a.t - b.t);
  return tasks.reduce<Task[]>((acc, task) => {
    const last = acc.at(-1);
    const together =
      last?.type === task.type &&
      last.d === task.d &&
      last.place === task.place &&
      task.t - last.t <= MERGE_TOLERANCE_H;
    if (!last || !together) return [...acc, { ...task, kids: [...task.kids] }];
    last.kids.push(...task.kids);
    if (task.type === 'pickup') last.t = task.t;
    return acc;
  }, []);
}

export const taskLabel = (h: Household, t: Task) =>
  `${t.type === 'drop' ? 'Dépose' : 'Récupère'} ${names(h, t.kids)}`;

function logEscortGap(b: Builder, prev: Task, task: Task): boolean {
  const id = `${task.wd}-${task.place}-${fmtH(prev.t)}>${fmtH(task.t)}`;
  const { stay, origin } = decideGap(
    b,
    id,
    task.t - prev.t < homeDetourH(b.household, task.place, task.place),
  );
  b.gapLog.push({
    id,
    kind: 'escort',
    d: task.d,
    place: task.place,
    stay,
    origin,
    from: prev.t,
    to: task.t,
    subject: placeOf(b.household, task.place).name,
    label: `${taskLabel(b.household, prev)} (${fmtH(prev.t)}) → ${taskLabel(b.household, task)} (${fmtH(task.t)})`,
  });
  return stay;
}

function groupTasks(b: Builder, tasks: readonly Task[]): Task[][] {
  const groups: Task[][] = [];
  tasks.forEach((task, i) => {
    const prev = tasks[i - 1];
    const current = groups.at(-1);
    if (prev?.d === task.d && prev.place === task.place && current && logEscortGap(b, prev, task))
      current.push(task);
    else groups.push([task]);
  });
  return groups;
}

function escortLoop(
  h: Household,
  tasks: Task[],
  groupKids: Map<string, Set<PersonId>>,
): EscortLoop {
  const first = firstOf(tasks);
  const last = must(tasks.at(-1), 'task');
  const group = `kids-${first.wd}-${first.place}`;
  const legs = [
    leg(h, first.d, HOME, first.place, { arriveAt: first.t }),
    leg(h, first.d, first.place, HOME, { departAt: last.t }),
  ];
  const place = placeOf(h, first.place);
  return {
    kind: 'escort',
    d: first.d,
    wd: first.wd,
    place: first.place,
    group,
    tasks,
    legs,
    km: sumKm(legs),
    outings: [],
    manualEvents: [],
    suggested: false,
    preferMode: undefined,
    kids: [...new Set(tasks.flatMap((t) => t.kids))],
    title: tasks.map((t) => taskLabel(h, t)).join(', puis '),
    groupTitle: `Trajets ${place.name} · ${names(h, [...(groupKids.get(group) ?? [])])}`,
    placeLabel: place.name,
    unknownPlace: place.unknown === true,
    why: [
      tasks.length > 1
        ? 'Attente sur place entre les activités.'
        : 'Aller-retour depuis le domicile.',
    ],
  };
}

export function escortLoops(b: Builder, outings: readonly Outing[]): EscortLoop[] {
  const groups = groupTasks(b, escortTasks(outings));
  const groupKids = new Map<string, Set<PersonId>>();
  groups.forEach((tasks) => {
    const first = firstOf(tasks);
    const key = `kids-${first.wd}-${first.place}`;
    const kids = groupKids.get(key) ?? new Set<PersonId>();
    tasks.forEach((t) => {
      t.kids.forEach((k) => kids.add(k));
    });
    groupKids.set(key, kids);
  });
  return groups.map((tasks) => escortLoop(b.household, tasks, groupKids));
}
