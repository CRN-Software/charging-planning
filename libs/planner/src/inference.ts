import {
  escortLoops,
  mergeOutings,
  personName,
  selfLoops,
  type Builder,
  type DraftLoop,
  type Gap,
} from './loops.ts';
import { abs, must } from './time.ts';
import type { GapChoice, Household, ModeId, Override, PersonId, PlannedEvent } from './types.ts';

const QUESTION_MIN_KM = 20;

export type LoopSource = 'calendar' | 'inferred' | 'corrected' | 'suggested' | 'rule' | 'manual';

export type Loop = DraftLoop & {
  driver: PersonId;
  driverName: string;
  mode: ModeId;
  altFree: ModeId[];
  source: LoopSource;
};

export interface Question {
  group: string;
  d: number;
  km: number;
  title: string;
  current: ModeId;
  kind: 'place' | 'vehicle';
  text: string;
  modes: ModeId[];
}

export interface InferenceInput {
  household: Household;
  events: readonly PlannedEvent[];
  overrides: Readonly<Record<string, Override>>;
  gaps: Readonly<Record<string, GapChoice>>;
}

export interface Inference {
  loops: Loop[];
  gaps: Gap[];
  questions: Question[];
}

interface Booking {
  s: number;
  e: number;
  label: string;
}

class Calendar {
  private readonly busy = new Map<string, Booking[]>();
  book(key: string, [s, e]: readonly [number, number], label: string) {
    this.busy.set(key, [...(this.busy.get(key) ?? []), { s, e, label }]);
  }
  conflict(key: string, [s, e]: readonly [number, number]): Booking | undefined {
    return this.busy.get(key)?.find((b) => s < b.e && b.s < e);
  }
}

export const span = (l: {
  d: number;
  legs: readonly { dep: number; arr: number }[];
}): [number, number] => [
  abs(l.d, must(l.legs[0], 'leg').dep),
  abs(l.d, must(l.legs.at(-1), 'leg').arr),
];

const isExternal = (h: Household, id: PersonId) => h.people[id]?.external === true;
const modeLabel = (h: Household, id: ModeId) => must(h.modes[id], `mode ${id}`).label;

function pickDriver(h: Household, l: DraftLoop, ov: Override, cal: Calendar) {
  if (l.kind === 'self')
    return { driver: l.who, driverName: personName(h, l.who), why: [] as string[] };
  const s = span(l);
  const checks = h.driverPreference.map((p) => ({ p, c: cal.conflict(p, s) }));
  const driver = ov.driver ?? checks.find((x) => !x.c)?.p ?? must(h.driverPreference[0], 'driver');
  const driverName = ov.driverName ?? personName(h, driver);
  if (isExternal(h, driver))
    return { driver, driverName, why: [ov.note ?? "Accompagné par quelqu'un hors du foyer."] };
  cal.book(driver, s, `trajet ${l.placeLabel}`);
  const busy = checks
    .filter((x) => x.c)
    .map((x) => `${personName(h, x.p)} n'est pas disponible (${x.c?.label ?? ''}).`);
  const reason =
    ov.note ??
    (ov.driver
      ? 'Accompagnateur choisi par vous.'
      : busy.join(' ') || `${driverName} est disponible.`);
  return { driver, driverName, why: [reason] };
}

function pickMode(h: Household, l: DraftLoop, driver: PersonId, ov: Override, cal: Calendar) {
  if (isExternal(h, driver))
    return { mode: h.externalMode, altFree: [], why: 'Aucun véhicule du foyer utilisé.' };
  const s = span(l);
  const checks = h.autoModes.map((m) => ({ m, c: cal.conflict(m, s) }));
  const free = checks.filter((x) => !x.c).map((x) => x.m);
  const preferred =
    l.preferMode !== undefined && free.includes(l.preferMode) ? l.preferMode : undefined;
  const mode = ov.mode ?? preferred ?? free[0] ?? must(h.autoModes.at(-1), 'mode');
  const taken = checks
    .filter((x) => x.c && x.m !== mode)
    .map((x) => `${modeLabel(h, x.m)} déjà prise (${x.c?.label ?? ''}).`);
  const why = ov.mode
    ? 'Moyen de transport choisi par vous.'
    : l.preferMode === mode
      ? `${modeLabel(h, mode)} par défaut ici : borne sur place.`
      : taken.join(' ') || `${modeLabel(h, mode)} disponible.`;
  return { mode, altFree: free.filter((m) => m !== mode), why };
}

function sourceOf(l: DraftLoop, corrected: boolean, rule: boolean): LoopSource {
  if (corrected) return 'corrected';
  if (rule) return 'rule';
  if (l.suggested) return 'suggested';
  if (l.manualEvents.length) return 'manual';
  return l.kind === 'self' ? 'calendar' : 'inferred';
}

function assignOne(input: InferenceInput, l: DraftLoop, cal: Calendar): Loop {
  const h = input.household;
  const rule =
    l.kind === 'escort'
      ? h.escortRules.find((r) => r.wd === l.wd && r.place === l.place)
      : undefined;
  const corrected = input.overrides[l.group];
  const ov: Override = corrected ?? rule ?? {};
  const driver = pickDriver(h, l, ov, cal);
  const mode = pickMode(h, l, driver.driver, ov, cal);
  if (h.modes[mode.mode]?.vehicle)
    cal.book(mode.mode, span(l), `${driver.driverName}, ${l.placeLabel}`);
  return {
    ...l,
    driver: driver.driver,
    driverName: driver.driverName,
    mode: mode.mode,
    altFree: mode.altFree,
    why: [...l.why, ...driver.why, mode.why],
    source: sourceOf(l, corrected !== undefined, rule !== undefined),
  };
}

function assign(input: InferenceInput, drafts: readonly DraftLoop[]): Loop[] {
  const cal = new Calendar();
  const groupKm = new Map<string, number>();
  drafts.forEach((l) => groupKm.set(l.group, (groupKm.get(l.group) ?? 0) + l.km));
  drafts.forEach((l) => {
    if (l.kind === 'self') cal.book(l.who, span(l), l.title);
  });
  const order = [...drafts].sort(
    (a, b) =>
      Number(b.preferMode !== undefined) - Number(a.preferMode !== undefined) ||
      (groupKm.get(b.group) ?? 0) - (groupKm.get(a.group) ?? 0) ||
      span(a)[0] - span(b)[0],
  );
  const assigned = new Map(order.map((l) => [l, assignOne(input, l, cal)] as const));
  return drafts.map((l) => must(assigned.get(l), 'loop'));
}

function questionFor(h: Household, ls: readonly Loop[]): Question[] {
  const l = must(ls[0], 'loop');
  const km = ls.reduce((s, x) => s + x.km, 0);
  const base = { group: l.group, d: l.d, km, title: l.groupTitle, current: l.mode };
  const others = h.autoModes.filter((m) => m !== h.trackedMode);
  if (ls.some((x) => x.unknownPlace)) {
    const text = `Pas d'adresse dans l'agenda, on compte ${km} km. Comment s'y rend ${personName(h, l.driver)} ?`;
    const soft = Object.keys(h.modes)
      .filter((m) => !h.modes[m]?.vehicle && m !== h.externalMode)
      .slice(0, 1);
    return [{ ...base, kind: 'place', text, modes: [...others, h.trackedMode, ...soft] }];
  }
  const otherFree = ls.every((x) => others.some((m) => x.altFree.includes(m)));
  if (l.mode !== h.trackedMode || km < QUESTION_MIN_KM || l.preferMode !== undefined || !otherFree)
    return [];
  return [
    {
      ...base,
      kind: 'vehicle',
      text: `${km} km et les deux voitures sont libres. Laquelle part ?`,
      modes: [h.trackedMode, ...others],
    },
  ];
}

function questionsFor(input: InferenceInput, loops: readonly Loop[]): Question[] {
  const groups = new Map<string, Loop[]>();
  loops.forEach((l) => groups.set(l.group, [...(groups.get(l.group) ?? []), l]));
  return [...groups.entries()]
    .filter(([group]) => input.overrides[group]?.mode === undefined)
    .flatMap(([, ls]) => questionFor(input.household, ls))
    .sort((a, b) => b.km - a.km);
}

/** Calendar events → home-to-home loops with driver, vehicle and the questions worth asking. */
export function infer(input: InferenceInput): Inference {
  const h = input.household;
  const outings = mergeOutings(h, input.events);
  const builder: Builder = { household: h, gaps: input.gaps, gapLog: [] };
  const adults = outings.filter((o) => h.people[o.who]?.adult === true);
  const children = outings.filter((o) => h.people[o.who]?.adult !== true);
  const loops = assign(input, [...selfLoops(builder, adults), ...escortLoops(builder, children)]);
  return { loops, gaps: builder.gapLog, questions: questionsFor(input, loops) };
}
