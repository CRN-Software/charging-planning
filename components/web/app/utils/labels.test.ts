import { describe, expect, it } from 'vitest';
import type { Gap } from '@charging/planner';
import { gapAutoLabel, gapText } from './labels';
import { fmtRate, timeValue } from './format';

const gap = (patch: Partial<Gap>): Gap => ({
  id: 'g',
  kind: 'escort',
  d: 2,
  stay: true,
  origin: 'auto',
  from: 13.5,
  to: 17.25,
  subject: 'Conservatoire',
  label: 'x',
  ...patch,
});

describe('labels', () => {
  it('describes a wait on site and offers going home instead', () => {
    expect(gapText(gap({ origin: 'rule' }))).toEqual({
      text: 'Attente à Conservatoire',
      action: 'Rentrer ?',
      origin: ' · règle',
    });
  });

  it('describes an adult going home between two stops', () => {
    expect(gapText(gap({ kind: 'self', stay: false, subject: 'Paul' })).text).toBe(
      'Paul repasse à la maison',
    );
  });

  it('names what the automatic choice currently does', () => {
    expect(gapAutoLabel(gap({ stay: false }))).toBe(
      'Automatique : rentrer à la maison entre les deux',
    );
  });

  it('formats prices and time inputs the French way', () => {
    expect(fmtRate(0.16)).toBe('0,16 €/kWh');
    expect(timeValue(8.5)).toBe('08:30');
  });
});
