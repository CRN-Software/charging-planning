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
import { infer, type Inference, type Loop } from './inference.ts';
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
  loop?: Loop;
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

export interface Plan extends Inference {
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
  | { t: number; end: number; km: number; loop: Loop }
  | { t: number; charge: Opportunity & { amount?: number; reason?: Violation } };

function steps(tracked: readonly Loop[], charges: readonly Step[], startH: number): Step[] {
  const drives = tracked.flatMap((l) =>
    l.legs.map((g): Step => ({ t: abs(l.d, g.dep), end: abs(l.d, g.arr), km: g.km, loop: l })),
  );
  return [...drives, ...charges].filter((s) => s.t >= startH).sort((a, b) => a.t - b.t);
}

function simulate(
  tracked: readonly Loop[],
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
        violation = { t: step.t, need: reservePct(s) - soc, loop: step.loop };
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

function costs(ctx: PlanContext, loops: readonly Loop[], sim: Simulation) {
  const s = ctx.settings;
  const chargeEur = sim.applied.reduce((sum, c) => sum + pctToKwh(c.amount, s) * c.price, 0);
  const hassle = sim.applied.reduce((sum, c) => sum + c.hassle, 0);
  const other = ctx.household.autoModes.filter((m) => m !== ctx.household.trackedMode);
  const otherCarKm = loops.filter((l) => other.includes(l.mode)).reduce((sum, l) => sum + l.km, 0);
  const otherCarEur = otherCarKm * ctx.household.costs.otherCarEurPerKm;
  const energyEur = pctToKwh(s.soc - sim.endSoc, s) * ctx.household.costs.energyValueEurPerKwh;
  const score =
    chargeEur + hassle + otherCarEur + energyEur + (sim.violation ? UNSOLVED_PENALTY : 0);
  return { chargeEur, otherCarKm, otherCarEur, weekEur: chargeEur + otherCarEur, score };
}

const inferCache = new WeakMap<PlanContext, Map<string, Inference>>();

function inferFor(
  ctx: PlanContext,
  events: readonly PlannedEvent[],
  chosen: readonly Chosen[],
): Inference {
  const cache = inferCache.get(ctx) ?? new Map<string, Inference>();
  inferCache.set(ctx, cache);
  const key = chosen
    .filter((c) => c.event)
    .map((c) => c.id)
    .sort()
    .join();
  const hit =
    cache.get(key) ??
    infer({ household: ctx.household, events, overrides: ctx.overrides, gaps: ctx.gaps });
  cache.set(key, hit);
  return hit;
}

function opportunitiesFor(
  ctx: PlanContext,
  events: readonly PlannedEvent[],
  tracked: readonly Loop[],
  replaced: ReadonlySet<string>,
) {
  const onsite = onsiteOpportunities(ctx, tracked);
  return [
    ...onsite,
    ...workdayOpportunities(ctx, events, new Set(onsite.map((o) => o.id))),
    ...superchargerOpportunities(ctx, tracked),
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
  const inference = inferFor(ctx, events, chosen);
  const tracked = inference.loops.filter((l) => l.mode === ctx.household.trackedMode);
  const opportunities = opportunitiesFor(ctx, events, tracked, replaced);
  const picked = new Map(chosen.map((c) => [c.id, c]));
  const charges: Step[] = [
    ...manual.filter((m) => m.t >= ctx.startH).map((charge) => ({ t: charge.t, charge })),
    ...opportunities
      .filter((o) => o.kind === 'routine' || picked.has(o.id))
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
    ...inference,
    events,
    opportunities,
    chosen: [...chosen],
    sim,
    ...costs(ctx, inference.loops, sim),
  };
}

const progressed = (after: Violation | null, before: Violation) =>
  !after || after.t > before.t || after.need < before.need - 0.5;

function newSessions(ctx: PlanContext, best: Plan, v: Violation): Chosen[][] {
  const used = new Set(best.chosen.map((c) => c.id));
  return best.opportunities
    .filter((o) => o.kind !== 'routine' && !used.has(o.id) && o.t < v.t)
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
