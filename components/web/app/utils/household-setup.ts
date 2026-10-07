import type { Calendar, HouseholdSettings, HouseholdSetup } from '@charging/contracts';

export interface CalendarRow {
  calendar: Calendar;
  use: boolean;
  name: string;
  adult: boolean;
}

/** "Léa Martin" → "lea-martin". */
export const slug = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'personne';

const sameCalendar = (a: { accountId: string; calendarId: string }, b: Calendar) =>
  a.accountId === b.accountId && a.calendarId === b.calendarId;

/** A row per calendar, prefilled from the saved setup (or the account's name for its main calendar). */
export function calendarRows(
  calendars: Calendar[],
  settings: HouseholdSettings,
  myName: string,
): CalendarRow[] {
  return calendars.map((calendar) => {
    const person = settings.people.find((p) => p.calendars.some((c) => sameCalendar(c, calendar)));
    return {
      calendar,
      use: person !== undefined,
      name: person?.name ?? (calendar.primary ? myName : calendar.name),
      adult: person?.adult ?? calendar.primary,
    };
  });
}

/** Calendars given the same name belong to the same person. */
export function toSetup(address: string, rows: CalendarRow[]): HouseholdSetup {
  const people = new Map<string, HouseholdSetup['people'][number]>();
  for (const row of rows.filter((r) => r.use && r.name.trim())) {
    const id = slug(row.name);
    const person = people.get(id) ?? { id, name: row.name.trim(), adult: row.adult, calendars: [] };
    person.calendars.push({
      accountId: row.calendar.accountId,
      calendarId: row.calendar.calendarId,
    });
    person.adult ||= row.adult;
    people.set(id, person);
  }
  return { homeAddress: address.trim() || null, people: [...people.values()] };
}
