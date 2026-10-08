import { z } from 'zod';

/**
 * A timed calendar occurrence placed on a day, in the household's time zone: one per event,
 * whatever the number of calendars it appears in. `participants`: the people of all of them.
 */
export const agendaEventSchema = z.object({
  id: z.string(),
  participants: z.array(z.string()).min(1),
  date: z.iso.date(),
  start: z.string().regex(/^\d{1,2}:\d{2}$/),
  end: z.string().regex(/^\d{1,2}:\d{2}$/),
  title: z.string(),
  place: z.string(),
});

/** A timed occurrence that is not a trip (no address, or online): shown, not planned. */
export const unlocatedEventSchema = agendaEventSchema.omit({ place: true }).extend({
  reason: z.enum(['noLocation', 'online']),
});

export const agendaPlaceSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  /** The household charger at this place, if any. */
  charger: z.string().optional(),
  /** Driving routes to the other places (`home` included), by place id, when OSRM answered. */
  routes: z.record(z.string(), z.object({ km: z.number(), min: z.number() })),
});

/** Events of the planning window; `home` is the reserved place id of the household's home. */
export const agendaSchema = z.object({
  events: z.array(agendaEventSchema),
  places: z.record(z.string(), agendaPlaceSchema),
  /** Timed occurrences without a physical address: displayed so a forgotten one shows up. */
  unlocated: z.array(unlocatedEventSchema),
  /** Events skipped because their address could not be found. */
  unresolved: z.array(z.object({ title: z.string(), location: z.string(), date: z.iso.date() })),
  /** Events that are not trips, counted by reason. */
  ignored: z.object({
    noLocation: z.number().int(),
    allDay: z.number().int(),
    online: z.number().int(),
    cancelled: z.number().int(),
  }),
});

export type AgendaEvent = z.infer<typeof agendaEventSchema>;
export type AgendaPlace = z.infer<typeof agendaPlaceSchema>;
export type UnlocatedEvent = z.infer<typeof unlocatedEventSchema>;
export type Agenda = z.infer<typeof agendaSchema>;
export type IgnoredReason = keyof Agenda['ignored'];
