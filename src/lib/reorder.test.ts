import { describe, it, expect } from 'vitest';
import { moveItem, canMove } from './reorder';

const abcde = ['a', 'b', 'c', 'd', 'e'] as const;

describe('moveItem', () => {
  it('moves an item forward, shifting the ones it passes back', () => {
    expect(moveItem(abcde, 1, 3)).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  it('moves an item backward, shifting the ones it passes forward', () => {
    expect(moveItem(abcde, 3, 1)).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('moves an item to the very front', () => {
    expect(moveItem(abcde, 4, 0)).toEqual(['e', 'a', 'b', 'c', 'd']);
  });

  it('moves an item to the very end', () => {
    expect(moveItem(abcde, 0, 4)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('is a single-step swap for adjacent indices', () => {
    expect(moveItem(abcde, 2, 3)).toEqual(['a', 'b', 'd', 'c', 'e']);
    expect(moveItem(abcde, 3, 2)).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('round-trips: moving there and back restores the original order', () => {
    const moved = moveItem(abcde, 0, 3) as string[];
    expect(moveItem(moved, 3, 0)).toEqual([...abcde]);
  });

  it('returns the SAME array reference for a no-op, so callers can skip a render', () => {
    expect(moveItem(abcde, 2, 2)).toBe(abcde);
  });

  it('returns the input untouched for out-of-range indices', () => {
    expect(moveItem(abcde, -1, 2)).toBe(abcde);
    expect(moveItem(abcde, 2, 99)).toBe(abcde);
    expect(moveItem(abcde, 99, 0)).toBe(abcde);
  });

  it('never loses or duplicates an item', () => {
    for (let from = 0; from < abcde.length; from++) {
      for (let to = 0; to < abcde.length; to++) {
        const out = moveItem(abcde, from, to);
        expect([...out].sort()).toEqual([...abcde].sort());
        expect(out).toHaveLength(abcde.length);
      }
    }
  });

  it('leaves the input array unmutated', () => {
    const input = ['a', 'b', 'c'];
    moveItem(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('handles a single-item and empty list without throwing', () => {
    expect(moveItem(['only'], 0, 0)).toEqual(['only']);
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});

describe('canMove', () => {
  it('is false for no-ops and out-of-range moves', () => {
    expect(canMove(5, 2, 2)).toBe(false);
    expect(canMove(5, -1, 0)).toBe(false);
    expect(canMove(5, 0, 5)).toBe(false);
    expect(canMove(0, 0, 0)).toBe(false);
  });

  it('is true for a real move', () => {
    expect(canMove(5, 0, 4)).toBe(true);
    expect(canMove(2, 1, 0)).toBe(true);
  });
});
