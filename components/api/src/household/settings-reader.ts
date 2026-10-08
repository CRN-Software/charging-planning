import { householdSettingsSchema } from '@charging/contracts';
import type { HouseholdSettings } from '@charging/contracts';
import { z } from 'zod';

const EMPTY: HouseholdSettings = { homeAddress: null, home: null, people: [], calendars: [] };

/** Saved before calendars could involve several people: each person carried their calendars. */
const legacySchema = z.object({
  homeAddress: z.string().nullable(),
  home: z.object({ lat: z.number(), lon: z.number() }).nullable(),
  people: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      adult: z.boolean(),
      calendars: z.array(z.object({ accountId: z.string(), calendarId: z.string() })),
    }),
  ),
});

function upgrade(legacy: z.infer<typeof legacySchema>): HouseholdSettings {
  const calendars = new Map<string, HouseholdSettings['calendars'][number]>();
  for (const person of legacy.people) {
    for (const { accountId, calendarId } of person.calendars) {
      const key = `${accountId}/${calendarId}`;
      const link = calendars.get(key) ?? { accountId, calendarId, people: [] };
      link.people.push(person.id);
      calendars.set(key, link);
    }
  }
  return {
    homeAddress: legacy.homeAddress,
    home: legacy.home,
    people: legacy.people.map(({ id, name, adult }) => ({ id, name, driver: adult })),
    calendars: [...calendars.values()],
  };
}

/** The household's settings, whatever version they were saved in; empty when unreadable. */
export function readSettings(raw: unknown): HouseholdSettings {
  const current = householdSettingsSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = legacySchema.safeParse(raw);
  return legacy.success ? householdSettingsSchema.parse(upgrade(legacy.data)) : EMPTY;
}
