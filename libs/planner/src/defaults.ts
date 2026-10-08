import type { Charger, Household, Mode, Person, Place, Settings } from './types.ts';

/** Starting values of a new household, until it configures its own vehicles and chargers. */
export const DEFAULT_SETTINGS: Settings = { soc: 45, reserveKm: 11, batteryKwh: 80, whPerKm: 170 };

export const DEFAULT_MODES: Record<string, Mode> = {
  tesla: { label: 'Tesla', vehicle: true },
  voiture: { label: 'Autre voiture', vehicle: true },
  velo: { label: 'Vélo' },
  marche: { label: 'Marche' },
  tiers: { label: 'Véhicule tiers' },
};

/** Someone outside the household who drives (friend, car-pool). */
export const EXTERNAL_PERSON: Person = {
  name: 'Hors foyer (ami, covoiturage)',
  driver: true,
  external: true,
  color: 'var(--muted)',
};

export const DEFAULT_COSTS: Household['costs'] = {
  otherCarEurPerKm: 0.11,
  energyValueEurPerKwh: 0.2,
};

/** Public superchargers with their time-of-use tariffs. */
export const SUPERCHARGER_PLACES: Record<string, Place> = {
  lesquin: { name: 'Superchargeur Lesquin', lat: 50.589, lon: 3.111 },
  englos: { name: 'Superchargeur Englos', lat: 50.627, lon: 2.958 },
};

export const SUPERCHARGERS: Record<string, Charger> = {
  lesquin: {
    label: 'Superchargeur Lesquin',
    place: 'lesquin',
    kw: 150,
    limit: 90,
    sessionH: 0.75,
    hassle: 3,
    tariffs: [
      [0, 0.16],
      [4, 0.21],
      [9, 0.38],
      [20, 0.28],
    ],
  },
  englos: {
    label: 'Superchargeur Englos',
    place: 'englos',
    kw: 150,
    limit: 90,
    sessionH: 0.75,
    hassle: 3,
    tariffs: [
      [0, 0.22],
      [9, 0.38],
      [21, 0.22],
    ],
  },
};
