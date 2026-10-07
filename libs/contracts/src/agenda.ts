import { z } from 'zod';

/** A timed calendar event placed on a day, in the household's time zone. */
export const agendaEventSchema = z.object({
  id: z.string(),
  who: z.string(),
  date: z.iso.date(),
  start: z.string().regex(/^\d{1,2}:\d{2}$/),
  end: z.string().regex(/^\d{1,2}:\d{2}$/),
  title: z.string(),
  place: z.string(),
});

export const agendaPlaceSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  /** Driving route from home, when OSRM answered. */
  fromHome: z.object({ km: z.number(), min: z.number() }).optional(),
});

/** Events of the planning window; `home` is the reserved place id of the household's home. */
export const agendaSchema = z.object({
  events: z.array(agendaEventSchema),
  places: z.record(z.string(), agendaPlaceSchema),
  /** Events skipped because their address could not be found. */
  unresolved: z.array(z.object({ title: z.string(), location: z.string(), date: z.iso.date() })),
});

export type AgendaEvent = z.infer<typeof agendaEventSchema>;
export type AgendaPlace = z.infer<typeof agendaPlaceSchema>;
export type Agenda = z.infer<typeof agendaSchema>;
