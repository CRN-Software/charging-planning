import { describe, expect, it } from 'vitest';
import { calendarRows, slug, toSetup } from './household-setup';

const ACCOUNT = '0d6c2a1e-9a51-4b0e-8a0f-3b1d2c4e5f60';
const cal = (calendarId: string, name: string, primary = false) => ({
  accountId: ACCOUNT,
  calendarId,
  name,
  primary,
});

describe('household setup', () => {
  it('turns names into ids', () => {
    expect(slug('Léa Martin')).toBe('lea-martin');
    expect(slug('  ')).toBe('personne');
  });

  it('prefills the main calendar with the account name', () => {
    const rows = calendarRows(
      [cal('me', 'Agenda', true), cal('kids', 'Enfants')],
      { homeAddress: null, home: null, people: [] },
      'Claire',
    );
    expect(rows.map((r) => [r.name, r.use, r.adult])).toEqual([
      ['Claire', false, true],
      ['Enfants', false, false],
    ]);
  });

  it('groups the calendars of one person and skips unused ones', () => {
    const rows = [
      { calendar: cal('a', 'Travail'), use: true, name: 'Claire', adult: true },
      { calendar: cal('b', 'Perso'), use: true, name: 'claire', adult: false },
      { calendar: cal('c', 'Fêtes'), use: false, name: 'Fêtes', adult: false },
    ];
    expect(toSetup(' 1 rue Exemple ', rows)).toEqual({
      homeAddress: '1 rue Exemple',
      people: [
        {
          id: 'claire',
          name: 'Claire',
          adult: true,
          calendars: [
            { accountId: ACCOUNT, calendarId: 'a' },
            { accountId: ACCOUNT, calendarId: 'b' },
          ],
        },
      ],
    });
  });
});
