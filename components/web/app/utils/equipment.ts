import type { ChargerSetup, Equipment, StoredEquipment, Vehicle } from '@charging/contracts';
import { slug } from './household-setup';

export const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;
const WORKDAYS = [0, 1, 2, 3, 4];
/** A typical petrol car, until the household enters its own figures. */
const FUEL_DEFAULTS = { litersPer100Km: 6.5, eurPerLiter: 1.75 };

/** The form's copy of the stored equipment (coordinates are the API's business). */
export const editable = (e: StoredEquipment): Equipment => ({
  ...e,
  vehicles: e.vehicles.map((v) => (v.electric ? { ...v } : { ...FUEL_DEFAULTS, ...v })),
  chargers: e.chargers.map(({ lat: _lat, lon: _lon, ...c }) => ({
    ...c,
    ...(c.tariffs && { tariffs: c.tariffs.map((t) => [...t] as [number, number]) }),
  })),
});

const uniqueId = (taken: readonly { id: string }[], name: string) => {
  const base = slug(name);
  let id = base;
  for (let i = 2; taken.some((x) => x.id === id); i++) id = `${base}-${i}`;
  return id;
};

export const newVehicle = (vehicles: readonly Vehicle[], electric: boolean): Vehicle =>
  electric
    ? {
        id: uniqueId(vehicles, 'electrique'),
        label: 'Voiture électrique',
        electric,
        batteryKwh: 60,
        whPerKm: 170,
      }
    : {
        id: uniqueId(vehicles, 'voiture'),
        label: 'Voiture',
        electric,
        litersPer100Km: 6.5,
        eurPerLiter: 1.75,
      };

/** A workplace charger by default: slow, free at work during the week. */
export const newCharger = (chargers: readonly ChargerSetup[]): ChargerSetup => ({
  id: uniqueId(chargers, `borne-${chargers.length + 1}`),
  label: 'Nouvelle borne',
  address: '',
  kw: 11,
  limit: 100,
  price: 0,
  weekdays: [...WORKDAYS],
  hassle: 0.5,
});

/** A road charger: time-of-use tariffs and a short session. */
export const asSupercharger = (c: ChargerSetup): ChargerSetup => {
  const { price: _price, workplace: _workplace, ...rest } = c;
  return {
    ...rest,
    kw: 150,
    limit: 90,
    sessionH: 0.75,
    hassle: 3,
    tariffs: [
      [0, 0.22],
      [9, 0.38],
    ],
  };
};

export const toggleDay = (days: readonly number[] | undefined, day: number): number[] => {
  const current = days ?? [0, 1, 2, 3, 4, 5, 6];
  return current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
};
