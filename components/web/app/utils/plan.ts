import type { Household, Plan, Trip } from '@charging/planner';

/** Battery level at hour `t` of the window (last known point before it). */
export const socAt = (plan: Plan, t: number, fallback: number): number =>
  [...plan.sim.points].reverse().find((p) => p.t <= t)?.soc ?? fallback;

export const sumKm = (trips: readonly Trip[]): number =>
  Math.round(trips.reduce((s, t) => s + t.km, 0));

export const trackedTrips = (plan: Plan, h: Household): Trip[] =>
  plan.trips.filter((t) => t.mode === h.trackedMode);

export const modeLabel = (h: Household, mode: string): string => h.modes[mode]?.label ?? mode;

export const personName = (h: Household, id: string | null | undefined): string =>
  (id ? h.people[id]?.name : undefined) ?? '?';

export const personColor = (h: Household, id: string | null | undefined): string =>
  (id ? h.people[id]?.color : undefined) ?? 'var(--muted)';

export const placeName = (h: Household, id: string): string => h.places[id]?.name ?? id;

/** "Anne avec Tim, Alice" — who is in the car. */
export const crew = (h: Household, t: Trip): string => {
  const others = t.passengers.map((p) => personName(h, p)).join(', ');
  if (!t.driver) return others;
  return others ? `${personName(h, t.driver)} avec ${others}` : personName(h, t.driver);
};

/** The occurrence group of an event (corrections are stored per group). */
export const groupOfEvent = (id: string): string => `occ:${id}`;
