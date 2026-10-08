import { distance, travelH } from './geo.ts';
import type { Journey } from './journeys.ts';
import type { Ledger } from './ledger.ts';
import { names, personName, placeName } from './presences.ts';
import { fmtH } from './time.ts';
import type { Household, ModeId, Override, PersonId, PlaceId } from './types.ts';

export type TripSource = 'calendar' | 'inferred' | 'corrected' | 'suggested' | 'rule' | 'manual';

/** Who takes the journey's members, and why. */
export interface Choice {
  driver: PersonId;
  member: boolean;
  external: boolean;
  why: string;
  source: TripSource;
}

export interface Start {
  from: PlaceId;
  dep: number;
}

export interface ChoiceContext {
  h: Household;
  ledger: Ledger;
  override: Override | undefined;
  /** 'calendar', 'suggested' or 'manual': where the journey's occurrences come from. */
  origin: TripSource;
}

export const isDriver = (h: Household, id: PersonId) => {
  const person = h.people[id];
  return person?.driver === true && person.external !== true;
};
export const isExternal = (h: Household, id: PersonId) => h.people[id]?.external === true;
export const isVehicle = (h: Household, mode: ModeId) => h.modes[mode]?.vehicle === true;
export const vehicles = (h: Household) => h.autoModes.filter((m) => isVehicle(h, m));

const rank = (h: Household, id: PersonId) => {
  const i = h.driverPreference.indexOf(id);
  return i === -1 ? h.driverPreference.length : i;
};

/** Where the driver starts from: the journey's origin, or where they are (then drive there). */
export function startOf(c: ChoiceContext, driver: PersonId, j: Journey): Start {
  const at = c.ledger.locationAt(driver, j.dep);
  return { from: at, dep: at === j.from ? j.dep : j.dep - travelH(c.h.places, at, j.from) };
}

function corrected(c: ChoiceContext, j: Journey): Choice | undefined {
  const ov = c.override;
  const self = j.members[0];
  if (ov?.mode && !isVehicle(c.h, ov.mode) && !ov.driver && self) {
    const how = c.h.modes[ov.mode]?.label.toLowerCase() ?? ov.mode;
    return {
      driver: self,
      member: true,
      external: false,
      why: `${names(c.h, j.members)} y va par ${how}.`,
      source: 'corrected',
    };
  }
  if (!ov?.driver) return undefined;
  return {
    driver: ov.driver,
    member: j.members.includes(ov.driver),
    external: isExternal(c.h, ov.driver),
    why: ov.note ?? 'Conducteur choisi par vous.',
    source: 'corrected',
  };
}

/** A driver among the people travelling: they drive themselves and take the others. */
function own(c: ChoiceContext, j: Journey): Choice | undefined {
  const driver = j.members
    .filter((m) => isDriver(c.h, m))
    .sort((a, b) => rank(c.h, a) - rank(c.h, b))[0];
  return driver
    ? {
        driver,
        member: true,
        external: false,
        why: `${personName(c.h, driver)} conduit.`,
        source: c.origin,
      }
    : undefined;
}

function rule(c: ChoiceContext, j: Journey): Choice | undefined {
  const r = c.h.escortRules.find((x) => x.wd === j.wd && (x.place === j.to || x.place === j.from));
  if (!r) return undefined;
  const who = r.driverName ?? personName(c.h, r.driver);
  return {
    driver: r.driver,
    member: false,
    external: isExternal(c.h, r.driver),
    why: r.note ?? `${who} s'en charge.`,
    source: 'rule',
  };
}

/** A household driver free to come and take the journey, then reach their own next commitment. */
function canEscort(c: ChoiceContext, e: PersonId, j: Journey): boolean {
  const start = startOf(c, e, j);
  if (!c.ledger.canMove(e, start.from, start.dep, j.arr)) return false;
  if (!vehicles(c.h).some((m) => c.ledger.canMove(m, start.from, start.dep, j.arr))) return false;
  const next = c.ledger.nextAfter(e, j.arr);
  return !next || next.at === j.to || j.arr + travelH(c.h.places, j.to, next.at) <= next.from;
}

function escort(c: ChoiceContext, j: Journey): Choice | undefined {
  // The closest driver first (already there, or waiting nearby), then the household's preference.
  const away = (p: PersonId) => distance(c.h.places, c.ledger.locationAt(p, j.dep), j.from);
  const candidates = Object.keys(c.h.people)
    .filter((p) => isDriver(c.h, p) && !j.members.includes(p))
    .sort((a, b) => away(a) - away(b) || rank(c.h, a) - rank(c.h, b));
  const driver = candidates.find((e) => canEscort(c, e, j));
  if (!driver) return undefined;
  const busy = candidates
    .filter((p) => p !== driver && rank(c.h, p) < rank(c.h, driver))
    .map((p) => `${personName(c.h, p)} n'est pas disponible.`);
  const why = [`${personName(c.h, driver)} accompagne ${names(c.h, j.members)}.`, ...busy].join(
    ' ',
  );
  return { driver, member: false, external: false, why, source: 'inferred' };
}

/** The user's correction, then a driver travelling anyway, then a rule, then a free driver. */
export const chooseDriver = (c: ChoiceContext, j: Journey): Choice | undefined =>
  corrected(c, j) ?? own(c, j) ?? rule(c, j) ?? escort(c, j);

/** A vehicle waiting where the driver starts, free for the whole journey. */
export function chooseMode(
  c: ChoiceContext,
  j: Journey,
  start: Start,
): { mode: ModeId; why: string; missing: boolean } {
  const ov = c.override;
  if (ov?.mode && !isVehicle(c.h, ov.mode))
    return { mode: ov.mode, why: 'Moyen de transport choisi par vous.', missing: false };
  const preferred = c.h.places[j.to]?.preferMode ?? c.h.places[j.from]?.preferMode;
  const order = [...new Set([ov?.mode, preferred, ...vehicles(c.h)])].filter(
    (m): m is ModeId => m !== undefined && isVehicle(c.h, m),
  );
  const free = order.filter((m) => c.ledger.canMove(m, start.from, start.dep, j.arr));
  const mode = free[0];
  if (mode === undefined)
    return {
      mode: order[0] ?? c.h.trackedMode,
      why: 'Aucune voiture libre à cet endroit.',
      missing: true,
    };
  const label = c.h.modes[mode]?.label ?? mode;
  if (ov?.mode === mode) return { mode, why: 'Véhicule choisi par vous.', missing: false };
  if (preferred === mode)
    return { mode, why: `${label} par défaut ici : borne sur place.`, missing: false };
  const taken = order
    .filter((m) => !free.includes(m))
    .map((m) => `${c.h.modes[m]?.label ?? m} indisponible.`);
  return { mode, why: [...taken, `${label} disponible.`].join(' '), missing: false };
}

export const noVehicleText = (h: Household, driver: PersonId, j: Journey) =>
  `Aucune voiture disponible pour ${personName(h, driver)} (${placeName(h, j.from)} → ${placeName(h, j.to)} à ${fmtH(j.dep)}).`;
