import {
  chargeDurationH,
  kmPerPct,
  manualOpportunities,
  onsiteOpportunities,
  pctToKwh,
  presenceEvents,
  reservePct,
  superchargerOpportunities,
  workdayOpportunities,
  type ChargingContext,
  type Opportunity,
} from './charging.ts';
import type { Trip } from './dispatch.ts';
import { planMobility, type Mobility } from './mobility.ts';
import { abs } from './time.ts';
import { WINDOW_END_T } from './week.ts';
import type { GapChoice, ManualCharge, Override, PlannedEvent, Settings } from './types.ts';

const MAX_CHARGE_STEPS = 6;
const SAFETY_MARGIN_PCT = 5;
const UNSOLVED_PENALTY = 1000;

export interface PlanContext extends ChargingContext {
  events: readonly PlannedEvent[];
  startH: number;
  overrides: Readonly<Record<string, Override>>;
  gaps: Readonly<Record<string, GapChoice>>;
  manualCharges: readonly (ManualCharge & { d: number; wd: number })[];
}

export interface Violation {
  t: number;
  need: number;
  trip?: Trip;
}
export interface SocPoint {
  t: number;
  soc: number;
  charge?: boolean;
}
export interface AppliedCharge extends Opportunity {
  amount: number;
  duration: number;
  socBefore: number;
  reason?: Violation;
}
export interface Simulation {
  points: SocPoint[];
  applied: AppliedCharge[];
  violation: Violation | null;
  endSoc: number;
  minSoc: number;
}

/** A charge chosen by the planner; `amount` undefined means "fill to the charger limit". */
export interface Chosen {
  id: string;
  t: number;
  amount?: number;
  event?: PlannedEvent;
  reason: Violation;
}

export interface Plan extends Mobility {
  events: PlannedEvent[];
  opportunities: Opportunity[];
  chosen: Chosen[];
  sim: Simulation;
  chargeEur: number;
  otherCarKm: number;
  otherCarEur: number;
  weekEur: number;
  score: number;
}

type Step =
  | { t: number; end: number; km: number; trip: Trip }
  | { t: number; charge: Opportunity & { amount?: number; reason?: Violation } };

function steps(tracked: readonly Trip[], charges: readonly Step[], startH: number): Step[] {
  const drives = tracked.map((trip): Step => ({
    t: abs(trip.d, trip.dep),
    end: abs(trip.d, trip.arr),
    km: trip.km,
    trip,
  }));
  return [...drives, ...charges].filter((s) => s.t >= startH).sort((a, b) => a.t - b.t);
}

function simulate(
  tracked: readonly Trip[],
  charges: readonly Step[],
  s: Settings,
  startH: number,
): Simulation {
  let soc = s.soc;
  let violation: Violation | null = null;
  const points: SocPoint[] = [{ t: startH, soc }];
  const applied: AppliedCharge[] = [];
  for (const step of steps(tracked, charges, startH)) {
    if ('km' in step) {
      soc -= step.km / kmPerPct(s);
      points.push({ t: step.end, soc });
      if (!violation && soc < reservePct(s) - 0.01)
        violation = { t: step.t, need: reservePct(s) - soc, trip: step.trip };
      continue;
    }
    const c = step.charge;
    soc -= c.detourKm / kmPerPct(s);
    const amount = Math.min(
      Math.max(0, c.limit - Math.max(0, soc)),
      c.maxPct,
      c.fill ? Infinity : (c.amount ?? 0),
    );
    const duration = Math.min(c.hours, chargeDurationH(c, pctToKwh(amount, s)));
    points.push({ t: c.t, soc });
    applied.push({ ...c, amount, duration, socBefore: soc });
    soc += amount;
    points.push({ t: c.t + duration, soc, charge: amount > 0.5 });
  }
  points.push({ t: WINDOW_END_T, soc });
  points.sort((a, b) => a.t - b.t);
  return { points, applied, violation, endSoc: soc, minSoc: Math.min(...points.map((p) => p.soc)) };
}

function costs(ctx: PlanContext, trips: readonly Trip[], sim: Simulation) {
  const s = ctx.settings;
  const chargeEur = sim.applied.reduce((sum, c) => sum + pctToKwh(c.amount, s) * c.price, 0);
  const hassle = sim.applied.reduce((sum, c) => sum + c.hassle, 0);
  const other = ctx.household.autoModes.filter((m) => m !== ctx.household.trackedMode);
  const otherCarKm = trips.filter((t) => other.includes(t.mode)).reduce((sum, t) => sum + t.km, 0);
  const otherCarEur = otherCarKm * ctx.household.costs.otherCarEurPerKm;
  const energyEur = pctToKwh(s.soc - sim.endSoc, s) * ctx.household.costs.energyValueEurPerKwh;
  const score =
    chargeEur + hassle + otherCarEur + energyEur + (sim.violation ? UNSOLVED_PENALTY : 0);
  return { chargeEur, otherCarKm, otherCarEur, weekEur: chargeEur + otherCarEur, score };
}

/**
 * Taken without being asked for: routines, and free charging where the car is parked anyway
 * (filled to the charger limit, whether or not the battery runs short later).
 */
export const isAutomatic = (o: Opportunity): boolean =>
  o.kind === 'routine' || (o.kind === 'onsite' && o.price === 0);

const mobilityCache = new WeakMap<PlanContext, Map<string, Mobility>>();

/** Mobility only changes when a suggested charge adds a presence (a workday at the office). */
function mobilityFor(
  ctx: PlanContext,
  events: readonly PlannedEvent[],
  chosen: readonly Chosen[],
): Mobility {
  const cache = mobilityCache.get(ctx) ?? new Map<string, Mobility>();
  mobilityCache.set(ctx, cache);
  const key = chosen
    .filter((c) => c.event)
    .map((c) => c.id)
    .sort()
    .join();
  const hit =
    cache.get(key) ??
    planMobility({ household: ctx.household, events, overrides: ctx.overrides, gaps: ctx.gaps });
  cache.set(key, hit);
  return hit;
}

function opportunitiesFor(
  ctx: PlanContext,
  events: readonly PlannedEvent[],
  mobility: Mobility,
  replaced: ReadonlySet<string>,
) {
  const onsite = onsiteOpportunities(ctx, mobility);
  return [
    ...onsite,
    ...workdayOpportunities(ctx, events, new Set(onsite.map((o) => o.id))),
    ...superchargerOpportunities(ctx, mobility),
  ].filter((o) => o.t >= ctx.startH && !replaced.has(o.id));
}

export function evaluate(ctx: PlanContext, chosen: readonly Chosen[]): Plan {
  const manual = manualOpportunities(ctx, ctx.manualCharges);
  const replaced = new Set(
    manual
      .filter((m) => m.workplace)
      .map((m) => `${ctx.household.chargers[m.chargerId]?.place ?? ''}-${m.wd ?? ''}`),
  );
  const events = [
    ...ctx.events,
    ...presenceEvents(ctx, ctx.events, manual),
    ...chosen.flatMap((c) => (c.event ? [c.event] : [])),
  ];
  const mobility = mobilityFor(ctx, events, chosen);
  const tracked = mobility.trips.filter((t) => t.mode === ctx.household.trackedMode);
  const opportunities = opportunitiesFor(ctx, events, mobility, replaced);
  const picked = new Map(chosen.map((c) => [c.id, c]));
  const charges: Step[] = [
    ...manual.filter((m) => m.t >= ctx.startH).map((charge) => ({ t: charge.t, charge })),
    ...opportunities
      .filter((o) => isAutomatic(o) || picked.has(o.id))
      .map((o) => {
        const c = picked.get(o.id);
        return {
          t: o.t,
          charge: {
            ...o,
            ...(c?.amount !== undefined && { amount: c.amount }),
            ...(c && { reason: c.reason }),
          },
        };
      }),
  ];
  const sim = simulate(tracked, charges, ctx.settings, ctx.startH);
  return {
    ...mobility,
    events,
    opportunities,
    chosen: [...chosen],
    sim,
    ...costs(ctx, mobility.trips, sim),
  };
}

const progressed = (after: Violation | null, before: Violation) =>
  !after || after.t > before.t || after.need < before.need - 0.5;

function newSessions(ctx: PlanContext, best: Plan, v: Violation): Chosen[][] {
  const used = new Set(best.chosen.map((c) => c.id));
  return best.opportunities
    .filter((o) => !isAutomatic(o) && !used.has(o.id) && o.t < v.t)
    .flatMap((o) => {
      const amounts = o.fill
        ? [undefined]
        : [v.need + SAFETY_MARGIN_PCT + o.detourKm / kmPerPct(ctx.settings), Infinity];
      return amounts.map((amount) => [
        ...best.chosen,
        {
          id: o.id,
          t: o.t,
          reason: v,
          ...(amount !== undefined && { amount }),
          ...(o.event && { event: o.event }),
        },
      ]);
    });
}

function topUps(best: Plan, v: Violation): Chosen[][] {
  return best.chosen
    .filter((c) => c.amount !== undefined && c.t < v.t)
    .map((c) =>
      best.chosen.map((x) =>
        x === c ? { ...x, amount: (x.amount ?? 0) + v.need + SAFETY_MARGIN_PCT } : x,
      ),
    );
}

/** Greedy planner: at each battery shortfall, add or top up the cheapest charge that fixes it. */
export function planWeek(ctx: PlanContext): Plan {
  let best = evaluate(ctx, []);
  for (let i = 0; i < MAX_CHARGE_STEPS && best.sim.violation; i++) {
    const v = best.sim.violation;
    const next = [...topUps(best, v), ...newSessions(ctx, best, v)]
      .map((chosen) => evaluate(ctx, chosen))
      .filter((r) => progressed(r.sim.violation, v))
      .sort((a, b) => a.score - b.score)[0];
    if (!next) break;
    best = next;
  }
  return best;
}
