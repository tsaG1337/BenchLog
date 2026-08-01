/**
 * Live, per-page detection of part-number occurrences on a rendered
 * plan page, for the click-through "part info" link overlay.
 *
 * Deliberately NOT deduped per page (unlike extractPartRefsFromTextItems,
 * used for search indexing) — every occurrence gets its own clickable
 * span, so a BOM table listing the same rivet 15 times shows 15 links,
 * each exactly over its own source text.
 *
 * Matching happens per text item (same convention already used by
 * extractPartRefsFromTextItems for search indexing) rather than across
 * a joined haystack, so unlike PdfSearchMatch this never needs multiple
 * rects for one occurrence — a part number splitting across two text
 * items already isn't picked up by the existing search-indexing
 * extractor either, so this isn't a new gap.
 *
 * Runs live in the browser against the already-loaded PDFDocumentProxy;
 * nothing here is persisted or pre-indexed.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { OcrVendorConfig } from '@/lib/ocrVendors';
import { matchPartNumber } from './extractParts';
import { textItemToNormalizedRect, type NormalizedRect, type PdfTextItemLike } from './pdfTextRects';

export interface PdfPartRefMatch {
  /** 1-indexed page number. */
  page: number;
  partNumber: string;
  rect: NormalizedRect;
}

/** Pure, synchronous: scans one page's already-fetched text items. */
export function scanTextItemsForPartRefs(
  items: PdfTextItemLike[],
  pageNumber: number,
  vendor: OcrVendorConfig,
  pageWidth: number,
  pageHeight: number,
): PdfPartRefMatch[] {
  const out: PdfPartRefMatch[] = [];
  for (const item of items) {
    const str = (item.str || '').trim();
    if (str.length < 3) continue;
    const partNumber = matchPartNumber(str, vendor);
    if (!partNumber) continue;
    const rect = textItemToNormalizedRect(item, pageWidth, pageHeight);
    if (!rect) continue;
    out.push({ page: pageNumber, partNumber, rect });
  }
  return out;
}

/** Async: walks every page of a loaded PDF document. */
export async function scanPdfForPartRefs(
  pdf: PDFDocumentProxy,
  vendor: OcrVendorConfig,
): Promise<PdfPartRefMatch[]> {
  const out: PdfPartRefMatch[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page: PDFPageProxy = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const items = content.items as PdfTextItemLike[];
    out.push(...scanTextItemsForPartRefs(items, pageNum, vendor, viewport.width, viewport.height));
  }
  return out;
}
