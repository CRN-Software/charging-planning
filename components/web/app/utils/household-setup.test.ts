import { describe, expect, it } from 'vitest';
import { addPerson, calendarRows, initialPeople, slug, toSetup } from './household-setup';

const ACCOUNT = '0d6c2a1e-9a51-4b0e-8a0f-3b1d2c4e5f60';
const cal = (calendarId: string, name: string, primary = false) => ({
  accountId: ACCOUNT,
  calendarId,
  name,
  primary,
});
const EMPTY = { homeAddress: null, home: null, people: [], calendars: [] };

describe('household setup', () => {
  it('turns names into ids', () => {
    expect(slug('Léa Martin')).toBe('lea-martin');
    expect(slug('  ')).toBe('personne');
  });

  it('starts a new household with its signed-in driver on the main calendar', () => {
    const people = initialPeople(EMPTY, 'Claire');
    expect(people).toEqual([{ id: 'claire', name: 'Claire', driver: true }]);
    expect(
      calendarRows([cal('me', 'Agenda', true), cal('fam', 'Famille')], EMPTY, people).map(
        (r) => r.people,
      ),
    ).toEqual([['claire'], []]);
  });

  it('gives each new person a unique id', () => {
    const people = addPerson(addPerson([{ id: 'tim', name: 'Tim', driver: false }], 'Tim'), 'Tim');
    expect(people.map((p) => p.id)).toEqual(['tim', 'tim-2', 'tim-3']);
  });

  it('links a shared calendar to several people and drops unused calendars', () => {
    const people = [
      { id: 'anne', name: 'Anne', driver: true },
      { id: 'tim', name: 'Tim', driver: false },
    ];
    const rows = [
      { calendar: cal('fam', 'Famille'), people: ['anne', 'tim'] },
      { calendar: cal('work', 'Travail'), people: [] },
    ];
    expect(toSetup(' 1 rue Exemple ', people, rows)).toEqual({
      homeAddress: '1 rue Exemple',
      people,
      calendars: [{ accountId: ACCOUNT, calendarId: 'fam', people: ['anne', 'tim'] }],
    });
  });
});
