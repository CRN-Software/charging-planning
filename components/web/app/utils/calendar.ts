import type { UnlocatedEvent } from '@charging/contracts';
import {
  fmtH,
  timelineOf,
  toH,
  type Day,
  type Household,
  type ModeId,
  type Plan,
  type PlannedEvent,
} from '@charging/planner';

export const START_H = 0;
export const END_H = 24;
export const PX_PER_H = 36;
export const INITIAL_SCROLL_H = 6;
export const SNAP_H = 0.25;
export const TESLA_LANE_PX = 18;
export const DEFAULT_LENGTH_H = { charge: 0.5, event: 1 } as const;
const LAST_SLOT_H = END_H - SNAP_H;
const MIN_LABEL_PX = 48;

export type SlotKind = keyof typeof DEFAULT_LENGTH_H;
export interface Slot {
  d: number;
  start: number;
  end: number;
}

/** Pixel offset of an hour in a day column. */
export const yOf = (h: number): number =>
  (Math.max(START_H, Math.min(END_H, h)) - START_H) * PX_PER_H;

export const boxStyle = (start: number, end: number, min = 3): Record<string, string> => ({
  top: `${yOf(start)}px`,
  height: `${Math.max(min, yOf(end) - yOf(start))}px`,
});

/** Pointer offset in a day column → hour snapped to the quarter. */
export const hourAt = (offsetPx: number): number =>
  Math.min(
    LAST_SLOT_H,
    Math.max(START_H, Math.round((START_H + offsetPx / PX_PER_H) / SNAP_H) * SNAP_H),
  );

/** Range drawn while dragging from `from` to `to`; a click gives the default length. */
export function dragRange(kind: SlotKind, from: number, to: number): [number, number] {
  if (to - from >= SNAP_H) return [from, to];
  if (to < from) return [to, from];
  return [from, from + DEFAULT_LENGTH_H[kind]];
}

export interface Positioned<T> {
  item: T;
  start: number;
  end: number;
  col: number;
  cols: number;
}

/** Google-Calendar-like layout: overlapping items share the width side by side. */
export function layoutColumns<T>(
  items: readonly { item: T; start: number; end: number }[],
): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    const cols = Math.max(0, ...cluster.map((p) => p.col + 1));
    cluster.forEach((p) => {
      p.cols = cols;
    });
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd) {
      close();
      cluster = [];
    }
    const ends = cluster.reduce<number[]>((acc, p) => {
      acc[p.col] = Math.max(acc[p.col] ?? 0, p.end);
      return acc;
    }, []);
    const free = ends.findIndex((end) => end <= it.start);
    const positioned = { ...it, col: free === -1 ? ends.length : free, cols: 1 };
    cluster.push(positioned);
    out.push(positioned);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  close();
  return out;
}

export type SegmentKind = 'drive' | 'parked' | 'charge';
export interface Segment {
  kind: SegmentKind;
  start: number;
  end: number;
  title: string;
  group?: string;
  place?: string;
  label?: string;
}

const placeName = (h: Household, id: string) => h.places[id]?.name ?? id;
const personName = (h: Household, id: string | null) =>
  (id ? h.people[id]?.name : undefined) ?? '?';

/** A vehicle's day from the state machine: driving, or parked away from home. */
export function vehicleSegments(plan: Plan, h: Household, mode: ModeId, d: number): Segment[] {
  return timelineOf(plan, h, mode, d).flatMap((s): Segment[] => {
    if (s.kind === 'trip' && s.trip) {
      const t = s.trip;
      const riders = [personName(h, t.driver), ...t.passengers.map((p) => personName(h, p))].join(
        ', ',
      );
      return [
        {
          kind: 'drive',
          start: s.from,
          end: s.to,
          group: t.group,
          title: `${riders} · ${placeName(h, t.from)} → ${placeName(h, t.to)} · ${Math.round(t.km)} km`,
        },
      ];
    }
    if (s.kind !== 'parked' && s.kind !== 'away') return [];
    const place = placeName(h, s.place);
    const parked: Segment = {
      kind: 'parked',
      start: s.from,
      end: s.to,
      place,
      title: `Stationnée à ${place} ${fmtH(s.from)}–${fmtH(s.to)}`,
    };
    if (yOf(s.to) - yOf(s.from) > MIN_LABEL_PX) parked.label = place;
    return [parked];
  });
}

export function chargeSegments(plan: Plan, d: number): Segment[] {
  return plan.sim.applied
    .filter((c) => c.d === d && c.amount > 0.5)
    .map((c) => ({
      kind: 'charge',
      start: c.t % 24,
      end: (c.t % 24) + c.duration,
      title: `En charge · ${c.label} · +${Math.round(c.amount)} % en ${fmtH(c.duration)}`,
    }));
}

export type Activity =
  { kind: 'event'; event: PlannedEvent } | { kind: 'unlocated'; event: UnlocatedEvent };

/**
 * One block per occurrence, whatever the number of participants and calendars; events without
 * an address share the layout, shown apart.
 */
export function activities(
  plan: Plan,
  day: Day,
  unlocated: readonly UnlocatedEvent[],
): Positioned<Activity>[] {
  const items = [
    ...plan.events
      .filter((e) => e.d === day.d)
      .map((event): Activity => ({ kind: 'event', event })),
    ...unlocated
      .filter((u) => u.date === day.iso)
      .map((event): Activity => ({ kind: 'unlocated', event })),
  ].map((item) => ({ item, start: toH(item.event.start), end: toH(item.event.end) }));
  return layoutColumns(items);
}
