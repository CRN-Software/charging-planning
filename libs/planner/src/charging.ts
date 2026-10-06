import { distance, HOME } from './geo.ts';
import { span, type Loop } from './inference.ts';
import { abs, must, toH } from './time.ts';
import { WINDOW_END_T } from './week.ts';
import type {
  Charger,
  ChargerId,
  Day,
  Household,
  ManualCharge,
  PlannedEvent,
  Settings,
} from './types.ts';

const CHARGE_EFFICIENCY = 0.9;
const NIGHT_END_H = 6;
const NIGHT_HASSLE = 1;

export type ChargeKind = 'routine' | 'onsite' | 'workday' | 'supercharger' | 'manual';

/** A place and time where the tracked vehicle could charge. */
export interface Opportunity {
  id: string;
  kind: ChargeKind;
  chargerId: ChargerId;
  label: string;
  d: number;
  t: number;
  kw: number;
  limit: number;
  hours: number;
  price: number;
  maxPct: number;
  hassle: number;
  /** Fill to the limit (long stay) or charge a planned amount (supercharger). */
  fill: boolean;
  detourKm: number;
  wd?: number;
  workplace?: boolean;
  event?: PlannedEvent;
  manualId?: string;
}

export interface ChargingContext {
  household: Household;
  days: readonly Day[];
  settings: Settings;
}

export const kmPerPct = (s: Settings) => (s.batteryKwh * 10) / s.whPerKm;
export const pctToKwh = (pct: number, s: Settings) => (pct * s.batteryKwh) / 100;
export const reservePct = (s: Settings) => s.reserveKm / kmPerPct(s);
export const maxPctFor = (c: Charger, hours: number, s: Settings) =>
  ((c.kw * hours * CHARGE_EFFICIENCY) / s.batteryKwh) * 100;
export const chargeDurationH = (c: { kw: number }, kwh: number) => kwh / (c.kw * CHARGE_EFFICIENCY);

export function priceAt(c: Charger, h: number): number {
  if (!c.tariffs?.length) return c.price ?? 0;
  const sorted = [...c.tariffs].sort((a, b) => a[0] - b[0]);
  const tariff = sorted.filter(([from]) => from <= h % 24).at(-1) ?? sorted.at(-1);
  return must(tariff, 'tariff')[1];
}

const charger = (h: Household, id: ChargerId) => must(h.chargers[id], `charger ${id}`);
const detourKm = (h: Household, c: Charger) =>
  c.workplace ? 0 : 2 * distance(h.places, HOME, c.place);

function session(ctx: ChargingContext, id: ChargerId, hours: number, startH: number) {
  const c = charger(ctx.household, id);
  return {
    chargerId: id,
    label: c.label,
    kw: c.kw,
    limit: c.limit,
    hours,
    hassle: c.hassle,
    price: priceAt(c, startH),
    maxPct: maxPctFor(c, hours, ctx.settings),
    detourKm: detourKm(ctx.household, c),
    ...(c.workplace !== undefined && { workplace: c.workplace }),
  };
}

export function onsiteOpportunities(ctx: ChargingContext, tracked: readonly Loop[]): Opportunity[] {
  const h = ctx.household;
  return tracked.flatMap((l) =>
    l.outings.flatMap((o) => {
      const chargerId = h.places[o.place]?.charger;
      if (chargerId === undefined) return [];
      const routine = h.chargeRoutines.some((r) => r.wd === o.wd && r.place === o.place);
      const s = session(ctx, chargerId, o.end - o.start, o.start);
      return [
        {
          ...s,
          id: `${o.place}-${o.wd}`,
          kind: routine ? 'routine' : 'onsite',
          d: o.d,
          wd: o.wd,
          t: abs(o.d, o.start),
          hassle: routine ? 0 : s.hassle,
          fill: true,
        } satisfies Opportunity,
      ];
    }),
  );
}

export function workdayOpportunities(
  ctx: ChargingContext,
  events: readonly PlannedEvent[],
  taken: ReadonlySet<string>,
): Opportunity[] {
  const w = ctx.household.workplace;
  const chargerId = w ? ctx.household.places[w.place]?.charger : undefined;
  if (!w || chargerId === undefined) return [];
  const [start, end] = [toH(w.start), toH(w.end)];
  const busy = (d: number) =>
    events.some((e) => e.who === w.who && e.d === d && toH(e.start) < end && toH(e.end) > start);
  return ctx.days
    .filter(({ d, wd }) => w.days.includes(wd) && !taken.has(`${w.place}-${wd}`) && !busy(d))
    .map(({ d, wd }) => ({
      ...session(ctx, chargerId, end - start, start),
      id: `${w.place}-${wd}`,
      kind: 'workday',
      d,
      wd,
      t: abs(d, start),
      hassle: w.hassle,
      fill: true,
      event: {
        id: `wd-${wd}`,
        who: w.who,
        d,
        wd,
        start: w.start,
        end: w.end,
        title: ctx.household.places[w.place]?.name ?? '',
        place: w.place,
        suggested: true,
      },
    }));
}

export function superchargerOpportunities(
  ctx: ChargingContext,
  tracked: readonly Loop[],
): Opportunity[] {
  const busy = tracked.map(span);
  const stations = Object.entries(ctx.household.chargers).filter(([, c]) => c.tariffs?.length);
  return stations
    .flatMap(([id, c]) =>
      ctx.days.flatMap(({ d }) =>
        (c.tariffs ?? []).map(([h]): Opportunity => {
          const t = abs(d, h + (h < NIGHT_END_H ? 24 : 0));
          const s = session(ctx, id, c.sessionH ?? 0.75, h);
          return {
            ...s,
            id: `${id}-${d}-${h}`,
            kind: 'supercharger',
            d: Math.floor(t / 24),
            t,
            fill: false,
            hassle: s.hassle + (h < NIGHT_END_H ? NIGHT_HASSLE : 0),
          };
        }),
      ),
    )
    .filter((o) => o.t < WINDOW_END_T && !busy.some(([s, e]) => o.t < e && s < o.t + o.hours));
}

export function manualOpportunities(
  ctx: ChargingContext,
  manual: readonly (ManualCharge & { d: number; wd: number })[],
): Opportunity[] {
  return manual
    .filter((m) => charger(ctx.household, m.charger).weekdays?.includes(m.wd) ?? true)
    .map((m) => {
      const start = toH(m.start);
      return {
        ...session(ctx, m.charger, toH(m.end) - start, start),
        id: `manual-${m.id}`,
        manualId: m.id,
        kind: 'manual',
        d: m.d,
        wd: m.wd,
        t: abs(m.d, start),
        hassle: 0,
        fill: true,
      };
    });
}

/** A manual charge at the workplace implies being there: add the presence if the calendar lacks it. */
export function presenceEvents(
  ctx: ChargingContext,
  events: readonly PlannedEvent[],
  manual: readonly Opportunity[],
): PlannedEvent[] {
  const w = ctx.household.workplace;
  if (!w) return [];
  return manual
    .filter(
      (m) =>
        m.workplace && !events.some((e) => e.d === m.d && e.place === w.place && e.who === w.who),
    )
    .map((m) => {
      const c = charger(ctx.household, m.chargerId);
      const start = m.t - m.d * 24;
      const end = start + m.hours;
      const hhmm = (x: number) =>
        `${Math.floor(x)}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`;
      return {
        id: `mc-${m.manualId ?? m.id}`,
        who: w.who,
        d: m.d,
        wd: m.wd ?? 0,
        start: hhmm(start),
        end: hhmm(end),
        title: `${c.label} (recharge)`,
        place: c.place,
        manual: true,
        charge: true,
      };
    });
}
