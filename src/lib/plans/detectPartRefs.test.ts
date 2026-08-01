import { describe, it, expect } from 'vitest';
import { scanTextItemsForPartRefs } from './detectPartRefs';
import { VANS_VENDOR } from '@/lib/aircraft/vans/label-ocr';

function ti(str: string, x = 0, y = 700, fontSize = 12, width = 60) {
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width, height: fontSize };
}

describe('scanTextItemsForPartRefs', () => {
  it('returns one match per occurrence, not deduped', () => {
    const items = [ti('AN3-5A', 0), ti('AN3-5A', 100), ti('AN3-5A', 200)];
    const refs = scanTextItemsForPartRefs(items, 3, VANS_VENDOR, 600, 800);
    expect(refs).toHaveLength(3);
    expect(refs.every(r => r.partNumber === 'AN3-5A')).toBe(true);
    expect(refs.every(r => r.page === 3)).toBe(true);
  });

  it('positions each match rect at its own text item location', () => {
    const items = [ti('T-1003B-R', 0), ti('T-1003B-R', 300)];
    const refs = scanTextItemsForPartRefs(items, 1, VANS_VENDOR, 600, 800);
    expect(refs[0].rect.x).toBeCloseTo(0, 5);
    expect(refs[1].rect.x).toBeCloseTo(300 / 600, 5);
  });

  it('skips items with no recognizable part number', () => {
    const items = [ti('STEP 1:'), ti('Trim the part.'), ti('See Figure 1.')];
    const refs = scanTextItemsForPartRefs(items, 1, VANS_VENDOR, 600, 800);
    expect(refs).toHaveLength(0);
  });
});
