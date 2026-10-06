import type { Household, Loop, Plan } from '@charging/planner';

/** Battery level at hour `t` of the window (last known point before it). */
export const socAt = (plan: Plan, t: number, fallback: number): number =>
  [...plan.sim.points].reverse().find((p) => p.t <= t)?.soc ?? fallback;

export const sumKm = (loops: readonly Loop[]): number => loops.reduce((s, l) => s + l.km, 0);

export const trackedLoops = (plan: Plan, h: Household): Loop[] =>
  plan.loops.filter((l) => l.mode === h.trackedMode);

export const modeLabel = (h: Household, mode: string): string => h.modes[mode]?.label ?? mode;

export const personColor = (h: Household, id: string | undefined): string =>
  (id === undefined ? undefined : h.people[id]?.color) ?? 'var(--muted)';

export const firstDeparture = (l: Loop): number => l.legs[0]?.dep ?? 0;
