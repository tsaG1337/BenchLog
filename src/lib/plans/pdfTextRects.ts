/**
 * Shared geometry: converts a pdfjs TextItem into a normalized (0..1)
 * rectangle on its page, top-left origin (DOM-friendly).
 *
 * pdfjs uses PDF user-space coordinates: origin at bottom-left, Y goes
 * up. The transform matrix is `[a, b, c, d, e, f]` — for almost all
 * text items it boils down to `[fontSize, 0, 0, fontSize, x, y]` where
 * (x, y) is the lower-left baseline of the text run. We use the
 * absolute value of `d` (or `a` as a fallback) as the visual height.
 *
 * Used by both the in-PDF search highlighter (pdfSearch.ts) and the
 * part-number link overlay (detectPartRefs.ts) — one implementation,
 * two consumers.
 */

export interface NormalizedRect {
  /** 0..1, left edge as fraction of page width. */
  x: number;
  /** 0..1, top edge as fraction of page height. */
  y: number;
  /** 0..1, fraction of page width. */
  width: number;
  /** 0..1, fraction of page height. */
  height: number;
}

export interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export function textItemToNormalizedRect(
  item: PdfTextItemLike,
  pageWidth: number,
  pageHeight: number,
): NormalizedRect | null {
  if (!item.transform || item.transform.length < 6) return null;
  const [a, , , d, e, f] = item.transform;
  const fontHeight = Math.abs(d) || Math.abs(a) || item.height || 10;
  const itemWidth = item.width || fontHeight * (item.str?.length ?? 1) * 0.5;
  // Bottom of text in PDF space → top in DOM space.
  const domTopPdf = f; // baseline y; we'll lift by fontHeight for the cap
  const x = e / pageWidth;
  const y = 1 - (domTopPdf + fontHeight) / pageHeight;
  const width = itemWidth / pageWidth;
  const height = fontHeight / pageHeight;
  // Clamp to [0,1] just in case of weirdly-transformed text (e.g.
  // rotated callouts that fall outside the standard page rect).
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0, Math.min(1, width)),
    height: Math.max(0, Math.min(1, height)),
  };
}

/**
 * Same as `textItemToNormalizedRect`, but scoped to a character range
 * within the item's string rather than the whole item — e.g. the "F-1074"
 * inside a single text run "F-1074 Forward Top Skin". pdfjs doesn't expose
 * per-character positions, so this assumes roughly uniform character
 * width across the item (true enough for the monospace-ish technical
 * lettering these plans use) and scales the full rect proportionally.
 * Callers with a match spanning the entire item (charStart 0, charLength
 * === item.str.length) get back the same rect as the unscoped function.
 */
export function textItemRangeToNormalizedRect(
  item: PdfTextItemLike,
  pageWidth: number,
  pageHeight: number,
  charStart: number,
  charLength: number,
): NormalizedRect | null {
  const full = textItemToNormalizedRect(item, pageWidth, pageHeight);
  if (!full) return null;
  const totalChars = item.str?.length || 1;
  const fracStart = charStart / totalChars;
  const fracWidth = charLength / totalChars;
  return {
    x: full.x + full.width * fracStart,
    y: full.y,
    width: full.width * fracWidth,
    height: full.height,
  };
}
