import { describe, it, expect } from 'vitest';
import { findBagFuzzy } from './kitManifest';

// Van's physical bag labels print only the bag NUMBER (e.g. "1217-1"),
// without the word "BAG" that the manifest stores in the bag id
// ("BAG 1217-1"). `findBagFuzzy` must match the bare number too.
describe('findBagFuzzy — bare bag-number labels', () => {
  it('matches a label showing only the number, no "BAG" word', () => {
    expect(findBagFuzzy('vans-rv10', '1217-1')?.bag.id).toBe('BAG 1217-1');
  });

  it('still matches the full "BAG 1217-1" form', () => {
    expect(findBagFuzzy('vans-rv10', 'BAG 1217-1')?.bag.id).toBe('BAG 1217-1');
  });

  it('matches a bare number with trailing OCR noise', () => {
    expect(findBagFuzzy('vans-rv10', '1217-1 MISC WING PARTS')?.bag.id).toBe('BAG 1217-1');
  });

  it('returns undefined for an unknown bag number', () => {
    expect(findBagFuzzy('vans-rv10', '9999-9')).toBeUndefined();
  });
});
