import { createHash } from 'node:crypto';
import type { AgendaPlace, IgnoredReason, StoredCharger } from '@charging/contracts';
import type { GoogleEvent } from '@/google/google-calendar.client';
import { normalizeAddress } from '@/places/geo.service';
import type { Coordinates } from '@/places/geo.service';

export const HOUSEHOLD_TIME_ZONE = 'Europe/Paris';
export const HOME_PLACE = 'home';
/** Within this distance two addresses are the same place (an event at home, a charger at work). */
const SAME_PLACE_KM = 0.2;

export interface TimedEvent {
  googleId: string;
  date: string;
  start: string;
  end: string;
  title: string;
  location: string;
}

const parts = (instant: string, timeZone: string) => {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${Number(values.hour)}:${values.minute}`,
  };
};

/** Why an event is not a trip: cancelled, all-day, without a location, or online (a link as location). */
export function ignoredReason(event: GoogleEvent): IgnoredReason | undefined {
  const location = event.location?.trim() ?? '';
  if (event.status === 'cancelled') return 'cancelled';
  if (!event.start.dateTime || !event.end.dateTime) return 'allDay';
  if (location.length === 0) return 'noLocation';
  return /^https?:\/\//i.test(location) ? 'online' : undefined;
}

/** A trip candidate: a confirmed, timed event with a physical address. */
/** Day, times and title of a timed event, in the household time zone. */
function timing(event: GoogleEvent, timeZone: string) {
  if (!event.start.dateTime || !event.end.dateTime) return undefined;
  const title = event.summary?.trim() ?? '';
  const start = parts(event.start.dateTime, timeZone);
  const end = parts(event.end.dateTime, timeZone);
  return {
    googleId: event.id,
    date: start.date,
    start: start.time,
    end: end.date === start.date ? end.time : '23:59',
    title: title.length > 0 ? title : 'Sans titre',
  };
}

/** A trip candidate: a confirmed, timed event with a physical address. */
export function timedEvent(
  event: GoogleEvent,
  timeZone = HOUSEHOLD_TIME_ZONE,
): TimedEvent | undefined {
  const location = event.location?.trim();
  const time = timing(event, timeZone);
  return ignoredReason(event) || !location || !time ? undefined : { ...time, location };
}

export const placeId = (location: string): string =>
  `p-${createHash('sha256').update(normalizeAddress(location)).digest('hex').slice(0, 10)}`;

const rad = (deg: number) => (deg * Math.PI) / 180;
export function crowKm(a: Coordinates, b: Coordinates): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const isNear = (home: Coordinates, point: Coordinates): boolean =>
  crowKm(home, point) <= SAME_PLACE_KM;

/** A trip candidate and everybody it involves, across all the calendars it appears in. */
export interface Occurrence extends TimedEvent {
  participants: string[];
}

export interface CalendarCopy {
  event: GoogleEvent;
  /** People of the calendar the copy was read from. */
  people: readonly string[];
}

/** Same for every copy of one occurrence (invitations, shared calendars), and per instance of a series. */
const occurrenceKey = (e: GoogleEvent) =>
  `${e.iCalUID ?? e.id}@${e.start.dateTime ?? e.start.date ?? ''}`;

/**
 * One occurrence per event, whatever the number of calendars it appears in: its participants are
 * the people of all of them. Events that are not trips are counted once, by reason.
 */
export interface Unlocated extends Omit<TimedEvent, 'location'> {
  participants: string[];
  reason: 'noLocation' | 'online';
}

/**
 * One occurrence per event, whatever the number of calendars it appears in: its participants are
 * the people of all of them. Timed events without an address are kept apart (shown, not
 * planned); the others that are not trips are counted once, by reason.
 */
export function occurrencesOf(copies: readonly CalendarCopy[]): {
  occurrences: Occurrence[];
  unlocated: Unlocated[];
  ignored: Record<IgnoredReason, number>;
} {
  const groups = new Map<string, CalendarCopy[]>();
  for (const copy of copies) {
    const key = occurrenceKey(copy.event);
    groups.set(key, [...(groups.get(key) ?? []), copy]);
  }
  const result = {
    occurrences: [] as Occurrence[],
    unlocated: [] as Unlocated[],
    ignored: { noLocation: 0, allDay: 0, online: 0, cancelled: 0 },
  };
  for (const group of groups.values()) {
    const first = group[0]?.event;
    if (!first) continue;
    const participants = [...new Set(group.flatMap((c) => c.people))];
    const reason = ignoredReason(first);
    if (reason) result.ignored[reason] += 1;
    const time = timing(first, HOUSEHOLD_TIME_ZONE);
    const trip = reason ? undefined : timedEvent(first);
    if (trip) result.occurrences.push({ ...trip, participants });
    else if (time && (reason === 'noLocation' || reason === 'online'))
      result.unlocated.push({ ...time, participants, reason });
  }
  return result;
}

/**
 * A charger within reach of a calendar place is that place's charger (the car charges while
 * parked there); the others become places of their own, routed like the rest.
 */
export function attachChargers(
  places: Record<string, AgendaPlace>,
  chargers: readonly StoredCharger[],
): void {
  for (const c of chargers) {
    const near = Object.entries(places).find(([, p]) => !p.charger && isNear(c, p));
    if (near) near[1].charger = c.id;
    else
      places[`charger-${c.id}`] = {
        name: c.label,
        lat: c.lat,
        lon: c.lon,
        routes: {},
        charger: c.id,
      };
  }
}
