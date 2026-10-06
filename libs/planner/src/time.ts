export const HOURS_PER_DAY = 24;

/** "8:30" → 8.5 */
export function toH(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h + m / 60;
}

/** 8.5 → "8:30" */
export function fmtH(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Hours since the start of the planning window. */
export const abs = (d: number, h: number): number => d * HOURS_PER_DAY + h;

/** Fail fast on a missing lookup instead of propagating `undefined`. */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Unknown ${what}`);
  return value;
}
