import { describe, expect, it } from 'vitest';
import {
  buildWeek, DEMO_EVENTS, DEMO_HOUSEHOLD, DEMO_SETTINGS, distance, kmPerPct, must, planMobility, planWeek, priceAt, timelineOf, violations,
  type EventTemplate, type GapChoice, type Household, type ManualCharge, type Override, type PlanContext, type Settings, type Trip,
} from '../src/index.ts';

const MONDAY = new Date(2026, 9, 5, 0, 0);
const SATURDAY_AFTERNOON = new Date(2026, 9, 3, 16, 30);
const week = buildWeek(MONDAY);
const h = DEMO_HOUSEHOLD;

const mobility = (overrides: Record<string, Override> = {}, gaps: Record<string, GapChoice> = {}, templates: readonly EventTemplate[] = DEMO_EVENTS) =>
  planMobility({ household: h, events: week.instantiate(templates), overrides, gaps });
const tripsTo = (trips: readonly Trip[], place: string, d: number) => trips.filter((t) => t.d === d && (t.to === place || t.from === place));
const riders = (t: Trip) => [t.driver, ...t.passengers];

function ctx(patch: { settings?: Partial<Settings>; household?: Household; now?: Date; manual?: ManualCharge[] } = {}): PlanContext {
  const w = patch.now ? buildWeek(patch.now) : week;
  return {
    household: patch.household ?? h, days: w.days, startH: w.startH, events: w.instantiate(DEMO_EVENTS),
    settings: { ...DEMO_SETTINGS, ...patch.settings }, overrides: {}, gaps: {}, manualCharges: w.instantiate(patch.manual ?? []),
  };
}

describe('state machine invariants', () => {
  it('hold for the whole week: nobody in two places, everybody home at night, cars driven by drivers', () => {
    const m = mobility();
    expect(violations(m, h)).toEqual([]);
    expect(m.conflicts).toEqual([]);
  });

  it('never let a non-driver drive', () => {
    mobility().trips.filter((t) => h.modes[t.mode]?.vehicle).forEach((t) => {
      expect(h.people[t.driver ?? '']?.driver, t.id).toBe(true);
    });
  });

  it('give every entity a continuous day timeline', () => {
    const m = mobility();
    const segments = timelineOf(m, h, 'tesla', 2);
    segments.slice(1).forEach((s, i) => { expect(s.from).toBeCloseTo(must(segments[i], 'segment').to, 6); });
    expect(segments.at(-1)?.kind).toBe('home');
  });
});

describe('shared occurrences', () => {
  const shared: EventTemplate = { id: 's1', participants: ['claire', 'hugo', 'lea'], wd: 3, start: '14:00', end: '16:00', title: 'Spectacle', place: 'centre' };
  const m = mobility({}, {}, [shared]);

  it('take everybody in one car: the driver attends, the children ride along', () => {
    const outward = must(m.trips.find((t) => t.to === 'centre'), 'outward');
    expect(outward.driver).toBe('claire');
    expect(outward.passengers.sort()).toEqual(['hugo', 'lea']);
    expect(m.trips).toHaveLength(2);
  });

  it('keep the car parked on site during the occurrence', () => {
    const tesla = timelineOf(m, h, 'tesla', 3);
    expect(tesla.find((s) => s.kind === 'parked')?.place).toBe('centre');
  });
});

describe('tours', () => {
  // Monday: an outing for four, then each child to their own lesson at two nearby places.
  const outing: EventTemplate[] = [
    { id: 'f1', participants: ['claire', 'hugo', 'lea', 'tom'], wd: 0, start: '12:00', end: '15:20', title: 'Forêt', place: 'grands-parents' },
    { id: 'f2', participants: ['lea'], wd: 0, start: '16:20', end: '17:10', title: 'Danse', place: 'musique' },
    { id: 'f3', participants: ['hugo'], wd: 0, start: '16:30', end: '18:10', title: 'Arts', place: 'restaurant' },
  ];
  const m = mobility({}, {}, outing);
  const afternoon = m.trips.filter((t) => t.d === 0 && t.dep >= 15);
  const line = (t: Trip) => `${t.from}>${t.to}:${t.driver}+${[...t.passengers].sort().join(',')}`;

  it('leave together in one car and drop each child at their stop', () => {
    expect(afternoon.slice(0, 2).map(line)).toEqual([
      'grands-parents>musique:claire+hugo,lea,tom',
      'musique>restaurant:claire+hugo,tom',
    ]);
  });

  it('wait nearby for the pickups instead of driving home and back, then bring everyone home', () => {
    expect(afternoon.slice(2).map(line)).toEqual([
      'restaurant>musique:claire+tom',
      'musique>restaurant:claire+lea,tom',
      'restaurant>home:claire+hugo,lea,tom',
    ]);
  });

  it('never send the other car', () => {
    expect(m.trips.some((t) => t.driver === 'paul')).toBe(false);
    expect(violations(m, h)).toEqual([]);
    expect(m.conflicts).toEqual([]);
  });
});

describe('escorts', () => {
  it('let an outside friend drive the tuesday pool without a household car', () => {
    const pool = tripsTo(mobility().trips, 'piscine', 1);
    expect(pool.length).toBeGreaterThan(0);
    pool.forEach((t) => { expect([t.mode, t.source]).toEqual(['tiers', 'rule']); });
  });

  it('apply a user correction over a rule', () => {
    const pool = tripsTo(mobility({ 'occ:l2': { driver: 'claire' }, 'occ:t3': { driver: 'claire' } }).trips, 'piscine', 1);
    pool.forEach((t) => { expect(t.driver).toBe('claire'); });
  });

  it('follow the wednesday rule: wait on site until Léa, bring her home, go back for Hugo', () => {
    const wednesday = tripsTo(mobility().trips, 'conservatoire', 2).map((t) => `${t.from}>${t.to}:${riders(t).slice(1).sort().join(',')}`);
    expect(wednesday).toEqual(['home>conservatoire:hugo,lea', 'conservatoire>home:lea', 'home>conservatoire:', 'conservatoire>home:hugo']);
    expect(mobility().links.find((l) => l.id === 'wait:2:conservatoire:13:50')).toMatchObject({ stay: true, origin: 'rule' });
  });

  it('let a wait choice override the rule: the driver goes home after the drop', () => {
    const trips = tripsTo(mobility({}, { 'wait:2:conservatoire:13:50': 'home' }).trips, 'conservatoire', 2);
    expect(trips.map((t) => `${t.from}>${t.to}`)).toEqual(['home>conservatoire', 'conservatoire>home', 'home>conservatoire', 'conservatoire>home', 'home>conservatoire', 'conservatoire>home']);
  });
});

describe('chained occurrences', () => {
  it('chain the sunday lunch and the shopping stop without going home', () => {
    expect(mobility().trips.filter((t) => t.d === 6).map((t) => t.to)).toEqual(['grands-parents', 'courses', 'home']);
  });

  it('split the chain when the user forces a return home, and report the delay it causes', () => {
    const m = mobility({}, { 'paul:a4>m1': 'home' });
    expect(m.trips.filter((t) => t.d === 6).map((t) => t.to)).toEqual(['grands-parents', 'home', 'courses', 'home']);
    expect(m.conflicts.some((c) => c.d === 6 && c.text.includes('Courses'))).toBe(true);
    expect(violations(m, h)).toEqual([]);
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

  it('fills the battery to the charger limit while parked at the office', () => {
    const routine = planWeek(ctx()).sim.applied.find((c) => c.kind === 'routine');
    expect(Math.round((routine?.socBefore ?? 0) + (routine?.amount ?? 0))).toBe(100);
  });

  it('always charges for free where the car is parked anyway, even with no shortfall', () => {
    const free = { ...h, chargeRoutines: [], chargers: { work: { ...must(h.chargers.work, 'work'), price: 0 } } };
    const plan = planWeek(ctx({ household: free, settings: { soc: 60 } }));
    expect(plan.chosen).toEqual([]);
    expect(plan.sim.applied.some((c) => c.kind === 'onsite' && c.amount > 0.5)).toBe(true);
    const paid = { ...free, chargers: { work: { ...must(h.chargers.work, 'work'), price: 0.1 } } };
    expect(planWeek(ctx({ household: paid, settings: { soc: 60 } })).sim.applied.every((c) => c.reason)).toBe(true);
  });

  it('only charges what a slow charger can deliver while parked', () => {
    const work = { ...must(h.chargers.work, 'work'), kw: 2 };
    const household = { ...h, chargers: { work } };
    const routine = planWeek(ctx({ household, settings: { soc: 10 } })).sim.applied.find((c) => c.kind === 'routine');
    expect(routine?.amount).toBeCloseTo(((2 * (routine?.hours ?? 0) * 0.9) / 80) * 100, 2);
  });

  it('finds a feasible plan even with a nearly empty battery', () => {
    [5, 10, 15, 20, 25].forEach((soc) => {
      const plan = planWeek(ctx({ now: SATURDAY_AFTERNOON, settings: { soc } }));
      expect(plan.sim.violation, `soc ${soc}`).toBeNull();
      plan.sim.applied.forEach((c) => { expect(c.socBefore + c.amount).toBeLessThanOrEqual(c.limit + 0.01); });
    });
  });

  it('prefers a cheap night slot when a supercharger is needed', () => {
    const sc = planWeek(ctx({ now: SATURDAY_AFTERNOON, settings: { soc: 10 } })).sim.applied.find((c) => c.kind === 'supercharger');
    expect(sc?.price).toBeLessThanOrEqual(0.22);
  });
});

describe('chargers', () => {
  it('follow the time-of-use tariff and loop over midnight', () => {
    const [lesquin, englos] = [must(h.chargers.lesquin, 'lesquin'), must(h.chargers.englos, 'englos')];
    expect([2, 5, 12, 21, 23.5].map((hour) => priceAt(lesquin, hour))).toEqual([0.16, 0.21, 0.38, 0.28, 0.28]);
    expect(priceAt(englos, 22)).toBe(0.22);
  });

  it('price a manual supercharger session at its start and cap it by its duration', () => {
    const manual = [{ id: 'x', charger: 'lesquin', wd: 0, start: '20:00', end: '20:10' }];
    const c = planWeek(ctx({ manual, settings: { soc: 20 } })).sim.applied.find((a) => a.kind === 'manual');
    expect(c?.price).toBe(0.28);
    expect(c?.amount).toBeCloseTo((150 * (10 / 60) * 0.9 * 100) / 80, 0);
    expect(c?.detourKm).toBe(2 * distance(h.places, 'home', 'lesquin'));
  });

  it('ignore a workplace charge on a weekend', () => {
    const manual = [{ id: 'y', charger: 'work', wd: 5, start: '9:00', end: '12:00' }];
    expect(planWeek(ctx({ manual })).sim.applied.some((a) => a.kind === 'manual')).toBe(false);
  });

  it('add the presence at work for a manual workplace charge, capped by its power', () => {
    const manual = [{ id: 'z', charger: 'work', wd: 2, start: '9:00', end: '10:00' }];
    const plan = planWeek(ctx({ manual, settings: { soc: 30 } }));
    expect(plan.events.some((e) => e.id === 'mc-z')).toBe(true);
    expect(plan.sim.applied.find((a) => a.kind === 'manual')?.amount).toBeLessThanOrEqual(((11 * 0.9) / 80) * 100 + 0.01);
  });
});
