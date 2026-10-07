import { z } from 'zod';

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/** A Google calendar, owned by one account of the household. */
export const calendarRefSchema = z.object({ accountId: z.uuid(), calendarId: z.string().min(1) });

export const personSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1).max(60),
  adult: z.boolean(),
  calendars: z.array(calendarRefSchema),
});

/** What a household configures; the home is geocoded by the API when saved. */
export const householdSetupSchema = z.object({
  homeAddress: z.string().max(200).nullable(),
  people: z.array(personSchema).max(12),
});

export const householdSettingsSchema = householdSetupSchema.extend({
  home: coordinatesSchema.nullable(),
});

export const calendarSchema = z.object({
  accountId: z.uuid(),
  calendarId: z.string(),
  name: z.string(),
  primary: z.boolean(),
});

export type CalendarRef = z.infer<typeof calendarRefSchema>;
export type HouseholdPerson = z.infer<typeof personSchema>;
export type HouseholdSetup = z.infer<typeof householdSetupSchema>;
export type HouseholdSettings = z.infer<typeof householdSettingsSchema>;
export type Calendar = z.infer<typeof calendarSchema>;
