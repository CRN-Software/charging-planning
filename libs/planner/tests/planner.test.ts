import { describe, expect, it } from 'vitest';
import {
  buildWeek, DEMO_EVENTS, DEMO_HOUSEHOLD, DEMO_SETTINGS, distance, infer, kmPerPct, must, planWeek, priceAt, span,
  type GapChoice, type Household, type ManualCharge, type Override, type PlanContext, type Settings,
} from '../src/index.ts';

const MONDAY = new Date(2026, 9, 5, 0, 0);
const SATURDAY_AFTERNOON = new Date(2026, 9, 3, 16, 30);
const week = buildWeek(MONDAY);
const events = week.instantiate(DEMO_EVENTS);
const h = DEMO_HOUSEHOLD;

const inferWith = (overrides: Record<string, Override> = {}, gaps: Record<string, GapChoice> = {}) =>
  infer({ household: h, events, overrides, gaps });

function ctx(patch: { settings?: Partial<Settings>; household?: Household; now?: Date; manual?: ManualCharge[] } = {}): PlanContext {
  const w = patch.now ? buildWeek(patch.now) : week;
  return {
    household: patch.household ?? h, days: w.days, startH: w.startH, events: w.instantiate(DEMO_EVENTS),
    settings: { ...DEMO_SETTINGS, ...patch.settings }, overrides: {}, gaps: {}, manualCharges: w.instantiate(patch.manual ?? []),
  };
}

const overlap = ([a, b]: [number, number], [c, d]: [number, number]) => a < d && c < b;
const loopsOf = (group: string, overrides?: Record<string, Override>, gaps?: Record<string, GapChoice>) =>
  inferWith(overrides, gaps).loops.filter((l) => l.group === group);

describe('trip inference', () => {
  it('never lets a child drive', () => {
    inferWith().loops.forEach((l) => { expect(h.people[l.driver]?.adult, l.title).toBe(true); });
  });

  it('never books a vehicle twice at the same time', () => {
    const { loops } = inferWith();
    Object.keys(h.modes).filter((m) => h.modes[m]?.vehicle).forEach((mode) => {
      const spans = loops.filter((l) => l.mode === mode).map(span);
      spans.forEach((s, i) => { spans.slice(i + 1).forEach((o) => { expect(overlap(s, o), mode).toBe(false); }); });
    });
  });

  it('lets an outside friend drive the tuesday pool without a household car', () => {
    const pool = loopsOf('kids-1-piscine');
    expect(pool.length).toBeGreaterThan(0);
    pool.forEach((l) => { expect([l.mode, l.source]).toEqual(['tiers', 'rule']); });
  });

  it('applies a user correction over a rule', () => {
    loopsOf('kids-1-piscine', { 'kids-1-piscine': { driver: 'claire' } }).forEach((l) => { expect(l.driver).toBe('claire'); });
  });

  it('applies a vehicle override to every loop of the group', () => {
    loopsOf('kids-2-conservatoire', { 'kids-2-conservatoire': { mode: 'clio' } }).forEach((l) => { expect(l.mode).toBe('clio'); });
  });

  it('follows the wednesday rule: wait on site until Léa, bring her home, go back for Hugo', () => {
    expect(loopsOf('kids-2-conservatoire').map((l) => l.title)).toEqual(['Dépose Hugo, Léa, puis Récupère Léa', 'Récupère Hugo']);
  });

  it('lets a gap choice override the rule', () => {
    expect(loopsOf('kids-2-conservatoire', {}, { '2-conservatoire-13:50>17:25': 'home' })).toHaveLength(3);
  });

  it('chains the sunday lunch and the shopping stop without going home', () => {
    const sunday = inferWith().loops.filter((l) => l.d === 6);
    expect(sunday).toHaveLength(1);
    expect(sunday[0]?.legs.map((g) => g.to)).toEqual(['grands-parents', 'courses', 'home']);
  });

  it('splits the chained trip when the user forces a return home', () => {
    expect(inferWith({}, { 'a4>m1': 'home' }).loops.filter((l) => l.d === 6)).toHaveLength(2);
  });
});

describe('rolling week', () => {
  it('starts today and drops what is already over', () => {
    const sat = buildWeek(new Date(2026, 9, 3, 15, 0));
    const planned = sat.instantiate(DEMO_EVENTS);
    expect(sat.days[0]?.wd).toBe(5);
    expect(planned.some((e) => e.id === 'l8' && e.d === 0)).toBe(false);
    expect(planned.some((e) => e.id === 'n4' && e.d === 0)).toBe(true);
    expect(planned.some((e) => e.id === 'a1' && e.d === 2)).toBe(true);
  });
});

describe('charging plan', () => {
  it('never lets the battery drop below the reserve kilometres', () => {
    const plan = planWeek(ctx());
    expect(plan.sim.violation).toBeNull();
    expect(plan.sim.minSoc).toBeGreaterThanOrEqual(DEMO_SETTINGS.reserveKm / kmPerPct(DEMO_SETTINGS) - 0.01);
  });

  it('fills the battery to the charger limit during a full workday', () => {
    const routine = planWeek(ctx()).sim.applied.find((c) => c.kind === 'routine');
    expect(Math.round((routine?.socBefore ?? 0) + (routine?.amount ?? 0))).toBe(100);
  });

  it('only charges what a slow charger can deliver during the stay', () => {
    const work = { ...must(h.chargers.work, 'work'), kw: 2 };
    const household = { ...h, chargers: { work } };
    const routine = planWeek(ctx({ household, settings: { soc: 10 } })).sim.applied.find((c) => c.kind === 'routine');
    expect(routine?.amount).toBeCloseTo(((2 * 9 * 0.9) / 80) * 100, 2);
  });

  it('finds a feasible plan even with a nearly empty battery', () => {
    [5, 10, 15, 20, 25].forEach((soc) => {
      const plan = planWeek(ctx({ now: SATURDAY_AFTERNOON, settings: { soc } }));
      expect(plan.sim.violation, `soc ${soc}`).toBeNull();
      expect(plan.sim.applied.filter((c) => c.kind === 'supercharger').length, `soc ${soc}`).toBeLessThanOrEqual(1);
      plan.sim.applied.forEach((c) => { expect(c.socBefore + c.amount).toBeLessThanOrEqual(c.limit + 0.01); });
    });
  });

  it('prefers a cheap night slot when a supercharger is needed', () => {
    const sc = planWeek(ctx({ now: SATURDAY_AFTERNOON, settings: { soc: 10 } })).sim.applied.find((c) => c.kind === 'supercharger');
    expect(sc?.price).toBeLessThanOrEqual(0.22);
  });
});

describe('chargers', () => {
  it('follows the time-of-use tariff and loops over midnight', () => {
    const [lesquin, englos] = [must(h.chargers.lesquin, 'lesquin'), must(h.chargers.englos, 'englos')];
    expect([2, 5, 12, 21, 23.5].map((hour) => priceAt(lesquin, hour))).toEqual([0.16, 0.21, 0.38, 0.28, 0.28]);
    expect(priceAt(englos, 22)).toBe(0.22);
  });

  it('prices a manual supercharger session at its start and caps it by its duration', () => {
    const manual = [{ id: 'x', charger: 'lesquin', wd: 0, start: '20:00', end: '20:10' }];
    const c = planWeek(ctx({ manual, settings: { soc: 20 } })).sim.applied.find((a) => a.kind === 'manual');
    expect(c?.price).toBe(0.28);
    expect(c?.amount).toBeCloseTo((150 * (10 / 60) * 0.9 * 100) / 80, 0);
    expect(c?.detourKm).toBe(2 * distance(h.places, 'home', 'lesquin'));
  });

  it('ignores a workplace charge on a weekend', () => {
    const manual = [{ id: 'y', charger: 'work', wd: 5, start: '9:00', end: '12:00' }];
    expect(planWeek(ctx({ manual })).sim.applied.some((a) => a.kind === 'manual')).toBe(false);
  });

  it('adds the presence at work for a manual workplace charge, capped by its power', () => {
    const manual = [{ id: 'z', charger: 'work', wd: 2, start: '9:00', end: '10:00' }];
    const plan = planWeek(ctx({ manual, settings: { soc: 30 } }));
    expect(plan.events.some((e) => e.id === 'mc-z')).toBe(true);
    expect(plan.sim.applied.find((a) => a.kind === 'manual')?.amount).toBeLessThanOrEqual(((11 * 0.9) / 80) * 100 + 0.01);
  });
});
