/**
 * React hook: scans a loaded PDF document once for part-number
 * occurrences (live, client-side — see detectPartRefs.ts), grouped by
 * page for the part-link overlay layer.
 *
 * Unlike usePdfTextSearch, there's no query to debounce — the scan is
 * static (fixed vendor patterns) and runs once whenever the document
 * (or vendor) changes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { OcrVendorConfig } from '@/lib/ocrVendors';
import { scanPdfForPartRefs, type PdfPartRefMatch } from '@/lib/plans/detectPartRefs';

export interface UsePdfPartRefsResult {
  refsByPage: Map<number, PdfPartRefMatch[]>;
  isLoading: boolean;
}

export function usePdfPartRefs(
  pdf: PDFDocumentProxy | null,
  vendor: OcrVendorConfig | null,
): UsePdfPartRefsResult {
  const [matches, setMatches] = useState<PdfPartRefMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Bumped whenever pdf/vendor changes so a stale in-flight scan can be
  // ignored when it resolves after a newer one was kicked off.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!pdf || !vendor) {
      setMatches([]);
      setIsLoading(false);
      return;
    }
    const myId = ++requestIdRef.current;
    setIsLoading(true);
    scanPdfForPartRefs(pdf, vendor)
      .then(found => {
        if (requestIdRef.current !== myId) return;
        setMatches(found);
      })
      .catch(err => {
        if (requestIdRef.current !== myId) return;
        console.error('[part-refs] scan failed:', err);
        setMatches([]);
      })
      .finally(() => {
        if (requestIdRef.current === myId) setIsLoading(false);
      });
  }, [pdf, vendor]);

  const refsByPage = useMemo(() => {
    const m = new Map<number, PdfPartRefMatch[]>();
    for (const match of matches) {
      const arr = m.get(match.page);
      if (arr) arr.push(match);
      else m.set(match.page, [match]);
    }
    return m;
  }, [matches]);

  return { refsByPage, isLoading };
}
