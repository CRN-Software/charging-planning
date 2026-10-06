import { fmtH } from '@charging/planner';

export const fmtEur = (value: number): string =>
  value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export const fmtRate = (eurPerKwh: number): string =>
  `${eurPerKwh.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/kWh`;

/** 8.5 → "08:30", the format of <input type="time">. */
export const timeValue = (hours: number): string => fmtH(hours).padStart(5, '0');

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
