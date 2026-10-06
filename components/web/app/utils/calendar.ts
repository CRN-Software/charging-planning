import {
  fmtH,
  toH,
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

export function vehicleSegments(plan: Plan, h: Household, mode: ModeId, d: number): Segment[] {
  return plan.loops
    .filter((l) => l.mode === mode && l.d === d)
    .flatMap((l) =>
      l.legs.flatMap((g, i): Segment[] => {
        const drive: Segment = {
          kind: 'drive',
          start: g.dep,
          end: g.arr,
          group: l.group,
          title: `${l.driverName} · ${placeName(h, g.from)} → ${placeName(h, g.to)} · ${g.km} km`,
        };
        const next = l.legs[i + 1];
        if (!next) return [drive];
        const place = placeName(h, g.to);
        const parked: Segment = {
          kind: 'parked',
          start: g.arr,
          end: next.dep,
          group: l.group,
          place,
          title: `Stationnée à ${place} ${fmtH(g.arr)}–${fmtH(next.dep)}`,
        };
        if (yOf(next.dep) - yOf(g.arr) > MIN_LABEL_PX) parked.label = place;
        return [drive, parked];
      }),
    );
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

export function groupOf(plan: Plan, e: PlannedEvent): string | undefined {
  return plan.loops.find((l) =>
    l.kind === 'self'
      ? l.outings.some((o) => o.events.some((x) => x.id === e.id))
      : l.d === e.d && l.place === e.place && l.kids.includes(e.who),
  )?.group;
}

export interface Activity {
  event: PlannedEvent;
  group: string | undefined;
}

export function activities(plan: Plan, h: Household, d: number): Positioned<Activity>[] {
  const items = plan.events
    .filter((e) => e.d === d && h.people[e.who]?.external !== true)
    .map((event) => ({
      item: { event, group: groupOf(plan, event) },
      start: toH(event.start),
      end: toH(event.end),
    }));
  return layoutColumns(items);
}
