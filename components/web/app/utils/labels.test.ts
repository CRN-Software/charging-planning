import { describe, expect, it } from 'vitest';
import { DEMO_HOUSEHOLD, type Link } from '@charging/planner';
import { linkAutoLabel, linkText } from './labels';
import { fmtRate, timeValue } from './format';

const link = (patch: Partial<Link>): Link => ({
  id: 'l',
  kind: 'wait',
  person: 'claire',
  d: 2,
  place: 'conservatoire',
  stay: true,
  origin: 'auto',
  from: 13.5,
  to: 17.25,
  label: 'x',
  ...patch,
});

describe('labels', () => {
  it('describe a wait on site and offer going home instead', () => {
    expect(linkText(link({ origin: 'rule' }), DEMO_HOUSEHOLD)).toEqual({
      icon: '⏸',
      text: 'Claire attend à Conservatoire',
      action: 'Rentrer ?',
      origin: ' · règle',
    });
  });

  it('describe a driver going home between two stops', () => {
    expect(linkText(link({ kind: 'self', stay: false, person: 'paul' }), DEMO_HOUSEHOLD).text).toBe(
      'Paul repasse à la maison',
    );
  });

  it('name what the automatic choice currently does', () => {
    expect(linkAutoLabel(link({ stay: false }))).toBe(
      'Automatique : rentrer à la maison entre les deux',
    );
  });

  it('format prices and time inputs the French way', () => {
    expect(fmtRate(0.16)).toBe('0,16 €/kWh');
    expect(timeValue(8.5)).toBe('08:30');
  });
});
