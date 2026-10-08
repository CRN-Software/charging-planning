import type {
  Calendar,
  CalendarLink,
  HouseholdPerson,
  HouseholdSettings,
  HouseholdSetup,
} from '@charging/contracts';

/** A calendar of the household's accounts and the people its events involve (none: unused). */
export interface CalendarRow {
  calendar: Calendar;
  people: string[];
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

const sameCalendar = (a: Pick<CalendarLink, 'accountId' | 'calendarId'>, b: Calendar) =>
  a.accountId === b.accountId && a.calendarId === b.calendarId;

/** The saved people, or the signed-in person to start with. */
export const initialPeople = (settings: HouseholdSettings, myName: string): HouseholdPerson[] =>
  settings.people.length ? settings.people : [{ id: slug(myName), name: myName, driver: true }];

/** A row per readable calendar; the main calendar of a new household starts with its owner. */
export function calendarRows(
  calendars: Calendar[],
  settings: HouseholdSettings,
  people: HouseholdPerson[],
): CalendarRow[] {
  return calendars.map((calendar) => {
    const link = settings.calendars.find((c) => sameCalendar(c, calendar));
    const owner = settings.calendars.length === 0 && calendar.primary ? people[0] : undefined;
    return { calendar, people: link ? [...link.people] : owner ? [owner.id] : [] };
  });
}

/** A new person with a unique id. */
export function addPerson(people: HouseholdPerson[], name: string): HouseholdPerson[] {
  const base = slug(name);
  let id = base;
  for (let i = 2; people.some((p) => p.id === id); i++) id = `${base}-${i}`;
  return [...people, { id, name: name.trim(), driver: false }];
}

export function toSetup(
  address: string,
  people: HouseholdPerson[],
  rows: CalendarRow[],
): HouseholdSetup {
  const known = new Set(people.map((p) => p.id));
  return {
    homeAddress: address.trim() || null,
    people,
    calendars: rows
      .map((r) => ({
        accountId: r.calendar.accountId,
        calendarId: r.calendar.calendarId,
        people: r.people.filter((p) => known.has(p)),
      }))
      .filter((c) => c.people.length > 0),
  };
}
