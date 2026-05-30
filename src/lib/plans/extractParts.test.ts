import { describe, it, expect } from 'vitest';
import { extractPartRefsFromTextItems } from './extractParts';
import { VANS_VENDOR } from '@/lib/aircraft/vans/label-ocr';

// Minimal TextItem shape we depend on — matches pdfjs.TextItem subset.
function ti(str: string, x = 0, y = 0): { str: string; transform: number[] } {
  return { str, transform: [1, 0, 0, 1, x, y] };
}

describe('extractPartRefsFromTextItems', () => {
  it('extracts Van\'s part numbers from a page of TextItems', () => {
    // Real text from RV-10 section 18 page 1 — fuel tank assembly.
    const items = [
      ti('T-1003B-R'), ti('TANK INBD'), ti('RIB - AFT'),
      ti('VA-141'), ti('FUEL FLANGE'),
      ti('T-1001-L'), ti('FUEL TANK SKIN'),
      ti('AN470AD4-5'), // hardware
      ti('SECTION 18'), // header — should not match
    ];
    const refs = extractPartRefsFromTextItems(items, 1, VANS_VENDOR);
    const partNumbers = refs.map(r => r.partNumber);
    expect(partNumbers).toContain('T-1003B-R');
    expect(partNumbers).toContain('VA-141');
    expect(partNumbers).toContain('T-1001-L');
    expect(partNumbers).toContain('AN470AD4-5');
    // Header text shouldn't be picked up as a part
    expect(partNumbers).not.toContain('SECTION');
    expect(partNumbers).not.toContain('18');
    // pageNumber propagates
    expect(refs.every(r => r.pageNumber === 1)).toBe(true);
  });

  it('dedupes the same part number within a page', () => {
    const items = [ti('AN3-5A'), ti('AN3-5A'), ti('AN3-5A')];
    const refs = extractPartRefsFromTextItems(items, 2, VANS_VENDOR);
    expect(refs.filter(r => r.partNumber === 'AN3-5A')).toHaveLength(1);
  });

  it('attaches a snippet from neighbouring TextItems', () => {
    const items = [
      ti('T-1003B-R'),
      ti('TANK INBD RIB - AFT'),
    ];
    const refs = extractPartRefsFromTextItems(items, 1, VANS_VENDOR);
    const ref = refs.find(r => r.partNumber === 'T-1003B-R');
    expect(ref).toBeDefined();
    expect(ref!.snippet).toContain('TANK INBD');
  });

  it('handles items that contain text outside any pattern', () => {
    const items = [ti('STEP 1:'), ti('Trim the part.'), ti('See Figure 1.')];
    const refs = extractPartRefsFromTextItems(items, 1, VANS_VENDOR);
    expect(refs).toHaveLength(0);
  });

  it('prefers the longer snippet when the same part appears twice on a page', () => {
    const items = [
      ti('T-1003B-R'),                          // first occurrence, no follow-on context
      ti('T-1003B-R'), ti('TANK INBD'), ti('RIB - AFT'),  // second occurrence with context
    ];
    const refs = extractPartRefsFromTextItems(items, 1, VANS_VENDOR);
    const tank = refs.find(r => r.partNumber === 'T-1003B-R');
    expect(tank).toBeDefined();
    expect(tank!.snippet).toContain('TANK INBD');
  });
});
