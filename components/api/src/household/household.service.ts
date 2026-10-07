import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  Agenda,
  AgendaPlace,
  Calendar,
  HouseholdSettings,
  HouseholdSetup,
} from '@charging/contracts';
import { AccountsRepository } from '@/auth/accounts.repository';
import { GoogleCalendarClient } from '@/google/google-calendar.client';
import { GeoService } from '@/places/geo.service';
import type { Coordinates } from '@/places/geo.service';
import { HOME_PLACE, isHome, placeId, timedEvent } from './agenda-mapper';
import type { TimedEvent } from './agenda-mapper';
import { HouseholdRepository } from './household.repository';

const WINDOW_DAYS = 8;

interface PersonEvent extends TimedEvent {
  who: string;
}

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
    const foreign = setup.people.flatMap((p) => p.calendars).find((c) => !members.has(c.accountId));
    if (foreign) throw new BadRequestException('calendar of another household');
    const home = setup.homeAddress ? await this.geo.geocode(setup.homeAddress) : undefined;
    if (setup.homeAddress && !home) throw new BadRequestException('home address not found');
    const settings = { ...setup, home: home ? { lat: home.lat, lon: home.lon } : null };
    await this.households.save(householdId, settings);
    return settings;
  }

  async agenda(householdId: string, now: Date): Promise<Agenda> {
    const settings = await this.households.settings(householdId);
    const to = new Date(now.getTime() + WINDOW_DAYS * 24 * 3600 * 1000);
    const events = await this.personEvents(settings, now, to);
    const places: Record<string, AgendaPlace> = {};
    const agenda: Agenda = { events: [], places, unresolved: [] };
    for (const event of events) {
      const place = await this.resolve(event.location, settings.home, places);
      if (place)
        agenda.events.push({
          id: `${event.who}:${event.googleId}`,
          who: event.who,
          date: event.date,
          start: event.start,
          end: event.end,
          title: event.title,
          place,
        });
      else
        agenda.unresolved.push({ title: event.title, location: event.location, date: event.date });
    }
    return agenda;
  }

  private async personEvents(
    settings: HouseholdSettings,
    from: Date,
    to: Date,
  ): Promise<PersonEvent[]> {
    const perCalendar = await Promise.all(
      settings.people.flatMap((person) =>
        person.calendars.map(async (ref) =>
          (await this.calendar.events(ref.accountId, ref.calendarId, from, to))
            .map((event) => timedEvent(event))
            .filter((event): event is TimedEvent => event !== undefined)
            .map((event) => ({ ...event, who: person.id })),
        ),
      ),
    );
    return perCalendar.flat();
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
    const fromHome = home ? await this.geo.route(home, found) : undefined;
    places[id] = {
      name: location.split(',')[0] ?? location,
      lat: found.lat,
      lon: found.lon,
      ...(fromHome ? { fromHome } : {}),
    };
    return id;
  }
}
