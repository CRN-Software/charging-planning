import { describe, expect, it } from 'vitest';
import { dragRange, hourAt, layoutColumns, PX_PER_H, yOf } from './calendar';

const item = (id: string, start: number, end: number) => ({ item: id, start, end });

describe('calendar layout', () => {
  it('puts overlapping activities side by side and frees columns afterwards', () => {
    const out = layoutColumns([
      item('a', 9, 11),
      item('b', 10, 12),
      item('c', 11, 12),
      item('d', 14, 15),
    ]);
    const byId = Object.fromEntries(out.map((p) => [p.item, [p.col, p.cols]]));
    expect(byId).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
  });

  it('snaps the pointer to the quarter hour', () => {
    expect(hourAt(PX_PER_H * 9.1)).toBe(9);
    expect(hourAt(PX_PER_H * 9.2)).toBe(9.25);
    expect(yOf(6)).toBe(6 * PX_PER_H);
  });

  it('gives a default length to a click and orders a backwards drag', () => {
    expect(dragRange('charge', 22, 22)).toEqual([22, 22.5]);
    expect(dragRange('event', 10, 10)).toEqual([10, 11]);
    expect(dragRange('event', 10, 8)).toEqual([8, 10]);
    expect(dragRange('event', 10, 12.5)).toEqual([10, 12.5]);
  });
});
