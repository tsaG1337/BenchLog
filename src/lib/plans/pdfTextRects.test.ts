import { describe, it, expect } from 'vitest';
import { textItemToNormalizedRect } from './pdfTextRects';

function item(str: string, transform: number[], width = 40, height = 10) {
  return { str, transform, width, height };
}

describe('textItemToNormalizedRect', () => {
  it('converts a PDF-space text item to a normalized top-left-origin rect', () => {
    // 12pt text at (100, 700) baseline on a 600x800 page.
    const rect = textItemToNormalizedRect(item('T-1003B-R', [12, 0, 0, 12, 100, 700], 60, 10), 600, 800);
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeCloseTo(100 / 600, 5);
    expect(rect!.width).toBeCloseTo(60 / 600, 5);
    // y = 1 - (baseline + fontHeight) / pageHeight = 1 - (700 + 12) / 800
    expect(rect!.y).toBeCloseTo(1 - 712 / 800, 5);
    expect(rect!.height).toBeCloseTo(12 / 800, 5);
  });

  it('returns null when the item has no usable transform', () => {
    expect(textItemToNormalizedRect(item('X', []), 600, 800)).toBeNull();
  });

  it('clamps out-of-range coordinates into [0,1]', () => {
    const rect = textItemToNormalizedRect(item('X', [12, 0, 0, 12, -50, 900], 60, 10), 600, 800);
    expect(rect!.x).toBe(0);
    expect(rect!.y).toBe(0);
  });
});
