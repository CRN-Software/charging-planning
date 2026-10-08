import { describe, expect, it } from 'vitest';
import { addressCandidates, expandAbbreviations, inFrance, looksLikeAddress } from '@/places/providers';

describe('geocoder choice', () => {
  it.each([
    ['12 rue de la Paix, Ville', true],
    ['Rue de la Paix 75002 Paris', true],
    ['Piscine municipale', false],
    ['Gare Lille Flandres', false],
  ])('%s looks like an address: %s', (query, expected) => {
    expect(looksLikeAddress(query)).toBe(expected);
  });
});

describe('address candidates', () => {
  it('drop the venue name Google Maps puts first', () => {
    expect(addressCandidates('Salle des fêtes, 2 Chem. des Prés, 59000 Ville, France')).toEqual([
      'Salle des fêtes, 2 chemin des Prés, 59000 Ville, France',
      '2 chemin des Prés, 59000 Ville, France',
    ]);
  });

  it('never fall back to a mere town', () => {
    expect(addressCandidates('Piscine, 59000 Ville, France')).toEqual(['Piscine, 59000 Ville, France']);
  });

  it('keep a bare place name as it is', () => {
    expect(addressCandidates('Gare de Ville')).toEqual(['Gare de Ville']);
  });

  it('expand street abbreviations', () => {
    expect(expandAbbreviations('Pl. du Marché 2, Av. Foch, Bd Carnot')).toBe('place du Marché 2, avenue Foch, boulevard Carnot');
  });

  it('send only French addresses to the national base', () => {
    expect(inFrance('Place du Marché 2, 7500 Ville, Belgique')).toBe(false);
    expect(inFrance('2 rue Haute, 59000 Ville, France')).toBe(true);
    expect(inFrance('Gare de Ville')).toBe(true);
  });
});
