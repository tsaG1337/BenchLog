/**
 * Plan PDF → part-number index extractor.
 *
 * Van's plan PDFs are vector — pdfjs.getTextContent() returns the source
 * text directly with no OCR. We tokenise items, run each through the
 * aircraft's `OcrVendorConfig.partNumberPatterns` (the same regex library
 * the inventory label scanner uses), and emit one ref per (page, partNumber).
 *
 * Dedup is per-page. A part that genuinely appears on pages 4 and 7 yields
 * two refs; the same part appearing twice on page 4 yields one.
 */
import type { OcrVendorConfig } from '@/lib/ocrVendors';
import type { PlanPartRefInput } from '@/lib/api';

interface TextItemLike {
  str: string;
  transform?: number[];
}

const STOPWORDS = new Set([
  'SECTION', 'FIGURE', 'STEP', 'NOTE', 'PAGE', 'REVISION', 'DATE',
  'VAN\'S', 'AIRCRAFT', 'INC', 'TYP', 'PLACES', 'TYPICAL',
]);

/** Run vendor regexes against one string. Returns the first match or null. */
function firstMatch(text: string, vendor: OcrVendorConfig): string | null {
  for (const re of vendor.partNumberPatterns) {
    re.lastIndex = 0; // safety — these are constructed with /g-less, but be defensive
    const m = re.exec(text);
    if (m && m[1]) {
      const candidate = m[1].toUpperCase().trim();
      if (STOPWORDS.has(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

export function extractPartRefsFromTextItems(
  items: TextItemLike[],
  pageNumber: number,
  vendor: OcrVendorConfig
): PlanPartRefInput[] {
  const seen = new Map<string, PlanPartRefInput>();
  for (let i = 0; i < items.length; i++) {
    const str = (items[i].str || '').trim();
    if (str.length < 3) continue;
    const pn = firstMatch(str, vendor);
    if (!pn) continue;
    // Build a small snippet from the next 2-3 items for context.
    const snippetParts: string[] = [];
    for (let j = i + 1; j < Math.min(items.length, i + 4); j++) {
      const s = (items[j].str || '').trim();
      if (s) snippetParts.push(s);
    }
    const snippet = snippetParts.join(' ').slice(0, 120);
    const existing = seen.get(pn);
    // Keep the first occurrence unless we now have a strictly more informative
    // snippet (a later occurrence in the same page often carries the BOM/legend
    // context where the first sighting was just a callout label).
    if (!existing || (snippet.length > (existing.snippet ?? '').length)) {
      seen.set(pn, { pageNumber, partNumber: pn, snippet });
    }
  }
  return Array.from(seen.values());
}

/** Extract all part refs from a PDF Buffer using pdfjs. */
export async function extractPartRefsFromPdf(
  pdfBytes: ArrayBuffer,
  vendor: OcrVendorConfig
): Promise<PlanPartRefInput[]> {
  // Lazy-load pdfjs to avoid pulling the worker into the test bundle.
  // Worker init (side-effect) MUST run before importing react-pdf so the
  // GlobalWorkerOptions are set before any consumer of pdfjs touches them.
  await import('@/lib/pdfjs'); // worker init first
  const { pdfjs } = await import('react-pdf');
  const loadingTask = pdfjs.getDocument({ data: pdfBytes });
  const doc = await loadingTask.promise;
  const all: PlanPartRefInput[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const text = await page.getTextContent();
    // pdfjs TextItem is { str, transform, ... }
    const refs = extractPartRefsFromTextItems(text.items as TextItemLike[], p, vendor);
    all.push(...refs);
  }
  return all;
}
