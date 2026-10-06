import { toH } from './time.ts';
import type { Day, EventTemplate, PlannedEvent } from './types.ts';

const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
const DAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
export const WINDOW_DAYS = 7;
export const WINDOW_END_T = WINDOW_DAYS * 24;

const weekdayOf = (date: Date) => (date.getDay() + 6) % 7;
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fmtDate = (date: Date) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const occursOn = (e: { wd?: number; date?: string }, day: Day) =>
  e.date !== undefined ? e.date === day.iso : e.wd === day.wd;

export interface Week {
  days: Day[];
  startH: number;
  label: string;
  instantiate<T extends { wd?: number; date?: string; end: string }>(
    items: readonly T[],
  ): (T & { d: number; wd: number })[];
}

function buildDay(now: Date, d: number): Day {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
  const wd = weekdayOf(date);
  return {
    d,
    wd,
    date,
    iso: isoDate(date),
    weekend: wd >= 5,
    label: d === 0 ? "Aujourd'hui" : `${DAY_SHORT[wd] ?? ''} ${date.getDate()}`,
    name: d === 0 ? "aujourd'hui" : (DAY_LONG[wd] ?? ''),
  };
}

/** Rolling window of 7 days starting now; past items of today are dropped. */
export function buildWeek(now = new Date()): Week {
  const days = Array.from({ length: WINDOW_DAYS }, (_, d) => buildDay(now, d));
  const startH = now.getHours() + now.getMinutes() / 60;
  const first = days[0];
  const last = days[WINDOW_DAYS - 1];
  return {
    days,
    startH,
    label: first && last ? `Du ${fmtDate(first.date)} au ${fmtDate(last.date)}` : '',
    instantiate: (items) =>
      items
        .flatMap((item) =>
          days
            .filter((day) => occursOn(item, day))
            .map((day) => ({ ...item, d: day.d, wd: day.wd })),
        )
        .filter((item) => item.d > 0 || toH(item.end) > startH),
  };
}

export const planEvents = (week: Week, events: readonly EventTemplate[]): PlannedEvent[] =>
  week.instantiate(events);
