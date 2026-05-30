import { describe, it, expect } from 'vitest';
import {
  listAllServiceBulletins,
  getSbPlacementsForPage,
  findSbById,
} from './index';

describe('listAllServiceBulletins', () => {
  it('returns an empty array for an aircraft with no SBs', () => {
    expect(listAllServiceBulletins('vans-rv10')).toEqual([]);
  });

  it('returns an empty array for an unknown aircraft slug', () => {
    expect(listAllServiceBulletins('boeing-787')).toEqual([]);
  });
});

describe('getSbPlacementsForPage', () => {
  it('returns an empty array when no SBs match the page', () => {
    expect(getSbPlacementsForPage('vans-rv10', '18', 3)).toEqual([]);
  });
});

describe('findSbById', () => {
  it('returns undefined for an unknown SB id', () => {
    expect(findSbById('vans-rv10', 'SB-NOPE')).toBeUndefined();
  });
});

describe('getSbPlacementsForPage (synthetic catalog)', () => {
  it.todo('exercise filter with a synthetic catalog when the registry path becomes too coarse');
});
