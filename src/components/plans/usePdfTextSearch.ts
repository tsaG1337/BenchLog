/**
 * React hook for in-PDF text search.
 *
 * Given a loaded PDFDocumentProxy and a query string, returns the
 * matches (debounced), a current-match cursor, prev/next helpers, and
 * a matchesByPage map for the sidebar.
 *
 * The hook owns the debounce timer + the AbortController-style
 * cancellation flag so callers don't have to.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { searchPdfDocument, MIN_QUERY_LENGTH, type PdfSearchMatch } from '@/lib/plans/pdfSearch';

export interface UsePdfTextSearchResult {
  query: string;
  setQuery: (q: string) => void;
  matches: PdfSearchMatch[];
  matchesByPage: Map<number, PdfSearchMatch[]>;
  currentIndex: number;
  setCurrentIndex: (n: number) => void;
  next: () => void;
  prev: () => void;
  isSearching: boolean;
  tooShort: boolean;
}

const DEBOUNCE_MS = 200;

export function usePdfTextSearch(
  pdf: PDFDocumentProxy | null,
  options?: { initialQuery?: string },
): UsePdfTextSearchResult {
  const [query, setQuery] = useState(options?.initialQuery ?? '');
  const [matches, setMatches] = useState<PdfSearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Bumped on every query change so a stale in-flight search can be
  // ignored when it resolves after a newer one was kicked off.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!pdf || trimmed.length < MIN_QUERY_LENGTH) {
      setMatches([]);
      setIsSearching(false);
      return;
    }
    const myId = ++requestIdRef.current;
    setIsSearching(true);
    const handle = setTimeout(async () => {
      try {
        const found = await searchPdfDocument(pdf, trimmed);
        if (requestIdRef.current !== myId) return;
        setMatches(found);
        // Reset cursor to the first match whenever the result-set
        // shape changes. If there are no matches, leave it at 0 (a
        // no-op until the user types again).
        setCurrentIndex(0);
      } catch (err) {
        if (requestIdRef.current !== myId) return;
        console.error('[pdf-search] failed:', err);
        setMatches([]);
      } finally {
        if (requestIdRef.current === myId) setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [pdf, query]);

  // Reset matches when the document changes so a stale result-set from
  // the previous file doesn't flash up.
  useEffect(() => {
    setMatches([]);
    setCurrentIndex(0);
  }, [pdf]);

  const matchesByPage = useMemo(() => {
    const m = new Map<number, PdfSearchMatch[]>();
    for (const match of matches) {
      const arr = m.get(match.page);
      if (arr) arr.push(match);
      else m.set(match.page, [match]);
    }
    return m;
  }, [matches]);

  const next = useCallback(() => {
    setCurrentIndex(i => (matches.length ? (i + 1) % matches.length : 0));
  }, [matches.length]);

  const prev = useCallback(() => {
    setCurrentIndex(i => (matches.length ? (i - 1 + matches.length) % matches.length : 0));
  }, [matches.length]);

  return {
    query,
    setQuery,
    matches,
    matchesByPage,
    currentIndex,
    setCurrentIndex,
    next,
    prev,
    isSearching,
    tooShort: query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH,
  };
}
