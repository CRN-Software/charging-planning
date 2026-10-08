import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  Agenda,
  AgendaEvent,
  AgendaPlace,
  Calendar,
  HouseholdSettings,
  HouseholdSetup,
} from '@charging/contracts';
import { AccountsRepository } from '@/auth/accounts.repository';
import { GoogleCalendarClient } from '@/google/google-calendar.client';
import { GeoService } from '@/places/geo.service';
import type { Coordinates } from '@/places/geo.service';
import { HOME_PLACE, isHome, occurrencesOf, placeId } from './agenda-mapper';
import type { Occurrence } from './agenda-mapper';
import { HouseholdRepository } from './household.repository';

const WINDOW_DAYS = 8;

const toAgendaEvent = (o: Occurrence, place: string): AgendaEvent => ({
  id: o.googleId,
  participants: o.participants,
  date: o.date,
  start: o.start,
  end: o.end,
  title: o.title,
  place,
});

@Injectable()
export class HouseholdService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly households: HouseholdRepository,
    private readonly calendar: GoogleCalendarClient,
    private readonly geo: GeoService,
  ) {}

  async calendars(householdId: string): Promise<Calendar[]> {
    const members = await this.accounts.members(householdId);
    const lists = await Promise.all(
      members.map(async (accountId) =>
        (await this.calendar.calendars(accountId)).map((c) => ({
          accountId,
          calendarId: c.id,
          name: c.name,
          primary: c.primary,
        })),
      ),
    );
    return lists.flat();
  }

  /** Only calendars of the household's own accounts; the home address is geocoded once here. */
  async setup(householdId: string, setup: HouseholdSetup): Promise<HouseholdSettings> {
    const members = new Set(await this.accounts.members(householdId));
    if (setup.calendars.some((c) => !members.has(c.accountId)))
      throw new BadRequestException('calendar of another household');
    const people = new Set(setup.people.map((p) => p.id));
    if (setup.calendars.some((c) => c.people.some((p) => !people.has(p))))
      throw new BadRequestException('calendar linked to an unknown person');
    const home = setup.homeAddress ? await this.geo.geocode(setup.homeAddress) : undefined;
    if (setup.homeAddress && !home) throw new BadRequestException('home address not found');
    const settings = { ...setup, home: home ? { lat: home.lat, lon: home.lon } : null };
    await this.households.save(householdId, settings);
    return settings;
  }

  async agenda(householdId: string, now: Date): Promise<Agenda> {
    const settings = await this.households.settings(householdId);
    const to = new Date(now.getTime() + WINDOW_DAYS * 24 * 3600 * 1000);
    const { occurrences: events, unlocated, ignored } = await this.occurrences(settings, now, to);
    const places: Record<string, AgendaPlace> = {};
    const agenda: Agenda = {
      events: [],
      places,
      unlocated: unlocated.map(({ googleId, ...rest }) => ({ id: googleId, ...rest })),
      unresolved: [],
      ignored,
    };
    for (const event of events) {
      const place = await this.resolve(event.location, settings.home, places);
      if (place) agenda.events.push(toAgendaEvent(event, place));
      else
        agenda.unresolved.push({ title: event.title, location: event.location, date: event.date });
    }
    await this.route(places, settings.home);
    return agenda;
  }

  /** Real driving routes between every place of the week and home, not only to and from home. */
  private async route(
    places: Record<string, AgendaPlace>,
    home: Coordinates | null,
  ): Promise<void> {
    const points: Record<string, Coordinates> = Object.fromEntries(
      Object.entries(places).map(([id, p]) => [id, { lat: p.lat, lon: p.lon }]),
    );
    if (home) points[HOME_PLACE] = home;
    const routes = await this.geo.routes(points);
    for (const [id, place] of Object.entries(places)) place.routes = routes[id] ?? {};
  }

  /** Every calendar's events, merged into occurrences with their participants. */
  private async occurrences(settings: HouseholdSettings, from: Date, to: Date) {
    const copies = await Promise.all(
      settings.calendars.map(async (link) =>
        (await this.calendar.events(link.accountId, link.calendarId, from, to)).map((event) => ({
          event,
          people: link.people,
        })),
      ),
    );
    return occurrencesOf(copies.flat());
  }

  /** Place id for the planner, or undefined when the address cannot be found. */
  private async resolve(
    location: string,
    home: Coordinates | null,
    places: Record<string, AgendaPlace>,
  ): Promise<string | undefined> {
    const id = placeId(location);
    if (places[id]) return id;
    const found = await this.geo.geocode(location);
    if (!found) return undefined;
    if (home && isHome(home, found)) return HOME_PLACE;
    places[id] = {
      name: location.split(',')[0] ?? location,
      lat: found.lat,
      lon: found.lon,
      routes: {},
    };
    return id;
  }
}
