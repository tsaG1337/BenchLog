/**
 * Full-text search inside a loaded PDF document.
 *
 * Walks every page via pdfjs `getTextContent()`, joins the text items
 * into a per-page haystack, finds occurrences of the query, and maps
 * each hit back to the source text items so a callable highlight layer
 * can draw rectangles over the match.
 *
 * Coordinates are returned **normalized** (0..1, top-left origin) so a
 * renderer can place absolutely-positioned overlays as percentages of
 * the rendered page wrapper — no need to know the current zoom.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { textItemToNormalizedRect, type NormalizedRect, type PdfTextItemLike } from './pdfTextRects';

export type PdfSearchRect = NormalizedRect;

export interface PdfSearchMatch {
  /** 1-indexed page number. */
  page: number;
  /** Index of this match across all matches in document order. */
  index: number;
  /** Char-level snippet (≈±25 chars around the hit, ellipsised). */
  snippet: string;
  /** One rectangle per overlapped text item (pdfjs sometimes splits a
   *  word across items at font/style boundaries). */
  rects: PdfSearchRect[];
}

/** Minimum number of characters before searching. Anything shorter
 *  matches so much it just churns the UI. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Search a whole PDF document for `query`. Returns matches in
 * document order (page 1 → N, then in-page order).
 *
 * Case-insensitive. Spaces in the query collapse to a single character
 * boundary because pdfjs `getTextContent()` rarely emits multi-word
 * text items consistently.
 *
 * Safe to call repeatedly — pdfjs caches the per-page text content.
 */
export async function searchPdfDocument(
  pdf: PDFDocumentProxy,
  rawQuery: string,
): Promise<PdfSearchMatch[]> {
  const query = rawQuery.trim();
  if (query.length < MIN_QUERY_LENGTH) return [];
  const out: PdfSearchMatch[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const pageMatches = await searchPage(page, query, out.length);
    out.push(...pageMatches);
  }
  return out;
}

async function searchPage(
  page: PDFPageProxy,
  query: string,
  startIndex: number,
): Promise<PdfSearchMatch[]> {
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  const items = content.items as PdfTextItemLike[];

  // Build a joined string + parallel position table so we can find
  // matches in the haystack and trace each match's character span
  // back to the source items.
  type CharPos = { itemIndex: number };
  const positions: CharPos[] = [];
  let haystack = '';
  for (let i = 0; i < items.length; i++) {
    const str = items[i].str ?? '';
    for (let j = 0; j < str.length; j++) {
      positions.push({ itemIndex: i });
      haystack += str[j];
    }
    // Separator between items so word boundaries are preserved (otherwise
    // adjacent items like "WD-" + "1017" wouldn't match the query "WD-1017"
    // — they already wouldn't, the issue here is the OPPOSITE: we don't want
    // "rib" + "bolt" to match "ribbolt". A space char fixes that.
    if (i < items.length - 1) {
      positions.push({ itemIndex: -1 }); // gap marker
      haystack += ' ';
    }
  }

  const hayLower = haystack.toLowerCase();
  const needle = query.toLowerCase();
  const matches: PdfSearchMatch[] = [];
  let from = 0;
  let localIndex = 0;
  while (true) {
    const idx = hayLower.indexOf(needle, from);
    if (idx === -1) break;
    const end = idx + needle.length;

    // Items overlapped by [idx, end). Use a Set to dedupe — a single item
    // can contribute many characters to the match.
    const itemSet = new Set<number>();
    for (let k = idx; k < end; k++) {
      const pos = positions[k];
      if (pos && pos.itemIndex !== -1) itemSet.add(pos.itemIndex);
    }

    const rects: PdfSearchRect[] = [];
    for (const itemIdx of itemSet) {
      const item = items[itemIdx];
      const rect = textItemToNormalizedRect(item, pageWidth, pageHeight);
      if (rect) rects.push(rect);
    }

    // Snippet: ±25 chars around the hit, ellipsised.
    const snipStart = Math.max(0, idx - 25);
    const snipEnd = Math.min(haystack.length, end + 25);
    const snippet =
      (snipStart > 0 ? '…' : '') +
      haystack.slice(snipStart, snipEnd).replace(/\s+/g, ' ').trim() +
      (snipEnd < haystack.length ? '…' : '');

    matches.push({
      page: page.pageNumber,
      index: startIndex + localIndex,
      snippet,
      rects,
    });
    localIndex++;
    // Advance past at least one char to avoid an infinite loop on
    // zero-length-needle edge cases (we already gate on MIN_QUERY_LENGTH
    // but be defensive).
    from = idx + Math.max(1, needle.length);
  }
  return matches;
}
