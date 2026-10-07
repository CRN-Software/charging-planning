import { createHash } from 'node:crypto';
import type { GoogleEvent } from '@/google/google-calendar.client';
import { normalizeAddress } from '@/places/geo.service';
import type { Coordinates } from '@/places/geo.service';

export const HOUSEHOLD_TIME_ZONE = 'Europe/Paris';
export const HOME_PLACE = 'home';
/** Within this distance an event address is the household's home. */
const HOME_RADIUS_KM = 0.2;

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

/**
 * A trip candidate: a confirmed, timed event with a physical address. All-day events, events
 * without a location and online meetings (a link as location) are not trips.
 */
export function timedEvent(
  event: GoogleEvent,
  timeZone = HOUSEHOLD_TIME_ZONE,
): TimedEvent | undefined {
  const location = event.location?.trim();
  if (event.status === 'cancelled' || !event.start.dateTime || !event.end.dateTime)
    return undefined;
  if (!location || /^https?:\/\//i.test(location)) return undefined;
  const title = event.summary?.trim() ?? '';
  const start = parts(event.start.dateTime, timeZone);
  const end = parts(event.end.dateTime, timeZone);
  return {
    googleId: event.id,
    date: start.date,
    start: start.time,
    end: end.date === start.date ? end.time : '23:59',
    title: title.length > 0 ? title : 'Sans titre',
    location,
  };
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

export const isHome = (home: Coordinates, point: Coordinates): boolean =>
  crowKm(home, point) <= HOME_RADIUS_KM;
