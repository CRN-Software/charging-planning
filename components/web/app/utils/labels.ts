import {
  fmtH,
  type AppliedCharge,
  type Day,
  type Gap,
  type GapChoice,
  type LoopSource,
  type Plan,
} from '@charging/planner';
import { fmtRate } from './format';

export const SOURCE_LABELS: Record<LoopSource, string> = {
  calendar: 'agenda',
  inferred: 'supposé',
  corrected: 'corrigé',
  suggested: 'suggéré',
  rule: 'règle',
  manual: 'ajouté',
};

/** Sources worth a badge on a trip card: the others are the normal case. */
export const BADGED_SOURCES: readonly LoopSource[] = ['rule', 'suggested', 'corrected', 'manual'];

export const GAP_CHOICES: Record<Gap['kind'], readonly (readonly [GapChoice, string])[]> = {
  self: [
    ['stay', 'Enchaîner sans repasser par la maison'],
    ['home', 'Repasser par la maison'],
  ],
  escort: [
    ['stay', 'Attendre sur place'],
    ['home', 'Rentrer à la maison entre les deux'],
  ],
};

const GAP_TEXT: Record<
  Gap['kind'],
  Record<'stay' | 'home', { text: (subject: string) => string; action: string }>
> = {
  escort: {
    stay: { text: (s) => `Attente à ${s}`, action: 'Rentrer ?' },
    home: { text: (s) => `Retour maison depuis ${s}`, action: 'Attendre ?' },
  },
  self: {
    stay: { text: (s) => `${s} enchaîne`, action: 'Repasser ?' },
    home: { text: (s) => `${s} repasse à la maison`, action: 'Enchaîner ?' },
  },
};

export function gapText(gap: Gap): { text: string; action: string; origin: string } {
  const entry = GAP_TEXT[gap.kind][gap.stay ? 'stay' : 'home'];
  const origin = gap.origin === 'rule' ? ' · règle' : gap.origin === 'corrected' ? ' · choisi' : '';
  return { text: entry.text(gap.subject), action: entry.action, origin };
}

export const gapAutoLabel = (gap: Gap): string => {
  const [stay, home] = GAP_CHOICES[gap.kind];
  return `Automatique : ${(gap.stay ? stay : home)?.[1].toLowerCase() ?? ''}`;
};

export function chargeHow(c: AppliedCharge): string {
  if (c.kind === 'routine') return `Routine, ${c.kw} kW jusqu'à ${c.limit} %`;
  if (c.kind === 'manual')
    return `Ajoutée par vous, ${fmtH(c.hours)} à ${c.kw} kW · ${fmtRate(c.price)}`;
  if (c.event) return `Journée de travail à ${c.event.title} à ajouter`;
  if (c.kind === 'onsite') return 'Déjà sur place, à brancher';
  return `Détour ${c.detourKm} km · ${fmtRate(c.price)}`;
}

export function chargeWhy(c: AppliedCharge, days: readonly Day[], reserveKm: number): string {
  const loop = c.reason?.loop;
  if (!loop) return '';
  return `Sinon la réserve de ${reserveKm} km est entamée ${days[loop.d]?.name ?? ''} (${loop.title})`;
}

export function impact(plan: Plan): string {
  if (plan.sim.violation) return 'batterie insuffisante';
  const n = plan.chosen.length;
  return n ? `${n} recharge${n > 1 ? 's' : ''} en plus` : 'aucune recharge en plus';
}
