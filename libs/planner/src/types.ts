export type PersonId = string;
export type PlaceId = string;
export type ModeId = string;
export type ChargerId = string;
export type GapChoice = 'stay' | 'home';

export interface Person {
  name: string;
  color: string;
  /** Can drive a household vehicle; the others always travel as passengers. */
  driver?: boolean;
  /** Someone outside the household (friend, car-pool): drives without using a household vehicle. */
  external?: boolean;
}

export interface Mode {
  label: string;
  /** A household vehicle: it cannot be in two places at once. */
  vehicle?: boolean;
}

export interface Route {
  km: number;
  min: number;
}

export interface Place {
  name: string;
  lat?: number;
  lon?: number;
  /** Distance from home set by the user; wins over computed routes. */
  km?: number;
  unknown?: boolean;
  preferMode?: ModeId;
  charger?: ChargerId;
  routes?: Record<PlaceId, Route>;
}

export type Tariff = readonly [fromHour: number, eurPerKwh: number];

export interface Charger {
  label: string;
  place: PlaceId;
  kw: number;
  /** Maximum state of charge in %. */
  limit: number;
  /** Cost in € of the inconvenience of going there. */
  hassle: number;
  price?: number;
  tariffs?: readonly Tariff[];
  weekdays?: readonly number[];
  workplace?: boolean;
  sessionH?: number;
}

export interface Workplace {
  who: PersonId;
  place: PlaceId;
  start: string;
  end: string;
  days: readonly number[];
  hassle: number;
}

export interface EscortRule {
  wd: number;
  place: PlaceId;
  driver: PersonId;
  driverName?: string;
  note?: string;
}

export interface ChargeRoutine {
  wd: number;
  place: PlaceId;
}

export interface Household {
  people: Record<PersonId, Person>;
  driverPreference: readonly PersonId[];
  modes: Record<ModeId, Mode>;
  /** Vehicles picked automatically, in order of preference. */
  autoModes: readonly ModeId[];
  /** The electric vehicle whose battery is planned. */
  trackedMode: ModeId;
  /** Mode used when someone outside the household drives. */
  externalMode: ModeId;
  places: Record<PlaceId, Place>;
  chargers: Record<ChargerId, Charger>;
  workplace?: Workplace;
  escortRules: readonly EscortRule[];
  gapRules: Readonly<Record<string, GapChoice>>;
  chargeRoutines: readonly ChargeRoutine[];
  costs: { otherCarEurPerKm: number; energyValueEurPerKwh: number };
}

export interface Settings {
  soc: number;
  reserveKm: number;
  batteryKwh: number;
  whPerKm: number;
}

/**
 * A calendar occurrence recurring on weekday `wd` (0 = Monday) or dated (`date`, YYYY-MM-DD).
 * `participants`: every household member attending it (one occurrence, whatever the number of
 * calendars it appears in).
 */
export interface EventTemplate {
  id: string;
  participants: readonly PersonId[];
  start: string;
  end: string;
  title: string;
  place: PlaceId;
  wd?: number;
  date?: string;
  manual?: boolean;
  suggested?: boolean;
  charge?: boolean;
}

/** An event placed in the planning window: `d` is the day index (0 = today). */
export interface PlannedEvent extends EventTemplate {
  d: number;
  wd: number;
}

export interface Override {
  driver?: PersonId;
  driverName?: string;
  mode?: ModeId;
  note?: string;
}

export interface ManualCharge {
  id: string;
  charger: ChargerId;
  start: string;
  end: string;
  wd?: number;
  date?: string;
}

export interface Day {
  d: number;
  wd: number;
  iso: string;
  date: Date;
  weekend: boolean;
  label: string;
  name: string;
}
