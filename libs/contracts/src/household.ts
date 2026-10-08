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
export type Calendar = z.infer<typeof calendarSchema>;

/** A household vehicle; the tracked one is the electric car whose battery is planned. */
export const vehicleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  label: z.string().min(1).max(40),
  electric: z.boolean(),
  /** Usable battery and consumption (electric only). */
  batteryKwh: z.number().positive().max(250).optional(),
  whPerKm: z.number().positive().max(500).optional(),
  /** Fuel consumption and price (combustion only). */
  litersPer100Km: z.number().positive().max(30).optional(),
  eurPerLiter: z.number().positive().max(5).optional(),
});

/** A charger: at work (the car charges while parked there), or on the road (a supercharger). */
export const chargerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  label: z.string().min(1).max(60),
  address: z.string().min(1).max(200),
  kw: z.number().positive().max(400),
  /** Maximum state of charge allowed there, in %. */
  limit: z.number().min(10).max(100),
  /** Flat price, or time-of-use tariffs: [from hour, €/kWh], each until the next one. */
  price: z.number().min(0).max(2).optional(),
  tariffs: z
    .array(z.tuple([z.number().int().min(0).max(23), z.number().min(0).max(2)]))
    .max(12)
    .optional(),
  /** Days it can be used (0 = Monday); every day when absent. */
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  /** Length of a session on the road, in hours. */
  sessionH: z.number().positive().max(4).optional(),
  /** What the inconvenience of using it is worth, in €. */
  hassle: z.number().min(0).max(20),
  /** At someone's workplace: the days and hours they can be there with the car. */
  workplace: z
    .object({
      person: z.string(),
      days: z.array(z.number().int().min(0).max(6)),
      start: z.string().regex(/^\d{1,2}:\d{2}$/),
      end: z.string().regex(/^\d{1,2}:\d{2}$/),
    })
    .optional(),
});

/** Vehicles, chargers and the battery reserve of the household. */
export const equipmentSchema = z.object({
  vehicles: z.array(vehicleSchema).min(1).max(6),
  trackedVehicle: z.string(),
  chargers: z.array(chargerSchema).max(20),
  /** Never plan below the kilometres needed to reach the nearest charger. */
  reserveKm: z.number().min(0).max(200),
});

export const chargerPlaceSchema = z.object({ lat: z.number(), lon: z.number() });

/** Equipment as stored: chargers carry the coordinates of their address. */
export const storedEquipmentSchema = equipmentSchema.extend({
  chargers: z.array(chargerSchema.extend(chargerPlaceSchema.shape)),
});

export const DEFAULT_EQUIPMENT: z.infer<typeof storedEquipmentSchema> = {
  vehicles: [
    { id: 'tesla', label: 'Tesla', electric: true, batteryKwh: 80, whPerKm: 170 },
    {
      id: 'voiture',
      label: 'Autre voiture',
      electric: false,
      litersPer100Km: 6.5,
      eurPerLiter: 1.75,
    },
  ],
  trackedVehicle: 'tesla',
  chargers: [],
  reserveKm: 11,
};

export type Vehicle = z.infer<typeof vehicleSchema>;

/** Fuel cost of a kilometre in a combustion car. */
export const fuelEurPerKm = (v: Vehicle): number =>
  ((v.litersPer100Km ?? 0) * (v.eurPerLiter ?? 0)) / 100;
export type ChargerSetup = z.infer<typeof chargerSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;
export type StoredEquipment = z.infer<typeof storedEquipmentSchema>;
export type StoredCharger = StoredEquipment['chargers'][number];

/** Everything the household configures, as stored and returned by the API. */
export const householdSettingsSchema = householdSetupSchema.extend({
  home: coordinatesSchema.nullable(),
  equipment: storedEquipmentSchema.default(DEFAULT_EQUIPMENT),
});
export type HouseholdSettings = z.infer<typeof householdSettingsSchema>;
