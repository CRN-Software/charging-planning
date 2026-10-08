import {
  fmtH,
  type AppliedCharge,
  type Day,
  type GapChoice,
  type Household,
  type Link,
  type Plan,
  type TripSource,
} from '@charging/planner';
import { fmtRate } from './format';
import { personName, placeName } from './plan';

export const SOURCE_LABELS: Record<TripSource, string> = {
  calendar: 'agenda',
  inferred: 'supposé',
  corrected: 'corrigé',
  suggested: 'suggéré',
  rule: 'règle',
  manual: 'ajouté',
};

/** Sources worth a badge on a trip card: the others are the normal case. */
export const BADGED_SOURCES: readonly TripSource[] = ['rule', 'suggested', 'corrected', 'manual'];

export const LINK_CHOICES: Record<Link['kind'], readonly (readonly [GapChoice, string])[]> = {
  self: [
    ['stay', 'Enchaîner sans repasser par la maison'],
    ['home', 'Repasser par la maison'],
  ],
  wait: [
    ['stay', 'Attendre sur place'],
    ['home', 'Rentrer à la maison entre les deux'],
  ],
};

/** The internal state between two moments: chaining, waiting on site, or going home. */
export function linkText(
  link: Link,
  h: Household,
): { icon: string; text: string; action: string; origin: string } {
  const who = personName(h, link.person);
  const origin =
    link.origin === 'rule' ? ' · règle' : link.origin === 'corrected' ? ' · choisi' : '';
  if (link.kind === 'wait') {
    const where = link.place ? placeName(h, link.place) : '';
    return link.stay
      ? { icon: '⏸', text: `${who} attend à ${where}`, action: 'Rentrer ?', origin }
      : { icon: '↩', text: `${who} rentre depuis ${where}`, action: 'Attendre ?', origin };
  }
  return link.stay
    ? { icon: '→', text: `${who} enchaîne`, action: 'Repasser ?', origin }
    : { icon: '↩', text: `${who} repasse à la maison`, action: 'Enchaîner ?', origin };
}

export const linkAutoLabel = (link: Link): string => {
  const [stay, home] = LINK_CHOICES[link.kind];
  return `Automatique : ${(link.stay ? stay : home)?.[1].toLowerCase() ?? ''}`;
};

export function chargeHow(c: AppliedCharge): string {
  if (c.kind === 'routine') return `Routine, ${c.kw} kW jusqu'à ${c.limit} %`;
  if (c.kind === 'manual')
    return `Ajoutée par vous, ${fmtH(c.hours)} à ${c.kw} kW · ${fmtRate(c.price)}`;
  if (c.event) return `Journée de travail à ${c.event.title} à ajouter`;
  if (c.kind === 'onsite') return 'Déjà sur place, à brancher';
  return `Détour ${c.detourKm} km · ${fmtRate(c.price)}`;
}

export function chargeWhy(
  c: AppliedCharge,
  days: readonly Day[],
  reserveKm: number,
  h: Household,
): string {
  const trip = c.reason?.trip;
  if (!trip) return '';
  return `Sinon la réserve de ${reserveKm} km est entamée ${days[trip.d]?.name ?? ''} (${placeName(h, trip.from)} → ${placeName(h, trip.to)})`;
}

export function impact(plan: Plan): string {
  if (plan.sim.violation) return 'batterie insuffisante';
  const n = plan.chosen.length;
  return n ? `${n} recharge${n > 1 ? 's' : ''} en plus` : 'aucune recharge en plus';
}
