import { z } from 'zod';

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const personIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);

/** A member of the household; only drivers ever drive a household vehicle. */
export const personSchema = z.object({
  id: personIdSchema,
  name: z.string().min(1).max(60),
  driver: z.boolean(),
});

/**
 * A Google calendar of one of the household's accounts, and the people its events involve:
 * a personal calendar (one person), a "family" or "children" calendar (several).
 */
export const calendarLinkSchema = z.object({
  accountId: z.uuid(),
  calendarId: z.string().min(1),
  people: z.array(personIdSchema).min(1),
});

/** What a household configures; the home is geocoded by the API when saved. */
export const householdSetupSchema = z.object({
  homeAddress: z.string().max(200).nullable(),
  people: z.array(personSchema).max(12),
  calendars: z.array(calendarLinkSchema).max(30),
});

export const householdSettingsSchema = householdSetupSchema.extend({
  home: coordinatesSchema.nullable(),
});

/** A Google calendar the household's accounts can read. */
export const calendarSchema = z.object({
  accountId: z.uuid(),
  calendarId: z.string(),
  name: z.string(),
  primary: z.boolean(),
});

export type HouseholdPerson = z.infer<typeof personSchema>;
export type CalendarLink = z.infer<typeof calendarLinkSchema>;
export type HouseholdSetup = z.infer<typeof householdSetupSchema>;
export type HouseholdSettings = z.infer<typeof householdSettingsSchema>;
export type Calendar = z.infer<typeof calendarSchema>;
