import { z } from 'zod';

const time = z.string().regex(/^\d{1,2}:\d{2}$/);

/**
 * The household's week as corrected by its members: battery read on the car, who drives and
 * with what, stay or go home, trips and charges added by hand. Opaque to the API (the planner
 * owns their meaning); kept per household so every member sees the same plan.
 */
export const planningSchema = z.object({
  soc: z.number().min(0).max(100),
  socAt: z.iso.datetime().nullable(),
  overrides: z.record(
    z.string(),
    z.object({
      driver: z.string().optional(),
      driverName: z.string().optional(),
      mode: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  gaps: z.record(z.string(), z.enum(['stay', 'home'])),
  extraEvents: z.array(
    z.object({
      id: z.string(),
      participants: z.array(z.string()),
      start: time,
      end: time,
      title: z.string(),
      place: z.string(),
      wd: z.number().int().min(0).max(6).optional(),
      date: z.iso.date().optional(),
      manual: z.boolean().optional(),
    }),
  ),
  manualCharges: z.array(
    z.object({
      id: z.string(),
      charger: z.string(),
      start: time,
      end: time,
      wd: z.number().int().min(0).max(6).optional(),
      date: z.iso.date().optional(),
    }),
  ),
  accepted: z.array(z.string()),
});

export const EMPTY_PLANNING: Planning = {
  soc: 45,
  socAt: null,
  overrides: {},
  gaps: {},
  extraEvents: [],
  manualCharges: [],
  accepted: [],
};

export type Planning = z.infer<typeof planningSchema>;
