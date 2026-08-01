/**
 * Plans Library — PDF reader pane.
 *
 * Loads the PDF via auth-gated fetch (the file URL is private), then
 * renders the active page with react-pdf. Toolbar handles page nav,
 * zoom, and annotation-mode toggles.
 *
 * Annotations live in a sibling overlay (PlanAnnotationsLayer) so the
 * react-pdf canvas stays untouched.
 */
import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { MIcon } from '@/components/AppShell';
import { fetchPlanPdf, updatePlan, type PlanFile } from '@/lib/api';
import { toast } from 'sonner';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import '@/lib/pdfjs';  // worker init (side-effect import)
import { PlanAnnotationsLayer, type AnnotationMode } from './PlanAnnotationsLayer';
import { SbMarkerLayer } from './SbMarkerLayer';
import { SbPlacementPicker } from './SbPlacementPicker';
import { PlanSearchBar } from './PlanSearchBar';
import { PlanSearchSidebar } from './PlanSearchSidebar';
import { PlanSearchHighlightLayer } from './PlanSearchHighlightLayer';
import { usePdfTextSearch } from './usePdfTextSearch';
import { registerActivePdf, unregisterActivePdf } from './pdfSearchBridge';
import type { ServiceBulletin, SbPlacement } from '@/lib/aircraft';
import { useAuth } from '@/contexts/AuthContext';

const SCALE_KEY = 'plans:zoom';

interface Props {
  file: PlanFile;
  pageNumber: number;
  onPageChange: (page: number) => void;
  onOpenLibrary: () => void;
  aircraftSlug: string;
}

export function PlanReader({ file, pageNumber, onPageChange, onOpenLibrary, aircraftSlug }: Props) {
  // We pass the PDF to react-pdf as a Blob URL rather than `{ data:
  // ArrayBuffer }`. react-pdf / pdfjs internally transfers ArrayBuffers
  // to the worker, which detaches them on the main thread. A subsequent
  // re-render of <Document> with the same (now-detached) buffer then
  // throws "Cannot perform Construct on a detached ArrayBuffer". A Blob
  // is an opaque handle to immutable bytes — safe across re-renders.
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(file.pageCount || 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // PDFDocumentProxy from pdfjs — needed for in-PDF search. Captured
  // from <Document>'s onLoadSuccess callback (its first argument).
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Zoom is persisted per-builder (not per-file) — once a builder finds the
  // magnification that suits their screen, every subsequent sheet honours
  // it. Default 100% fits the screen on common laptop widths; users on
  // 4K monitors typically push it up to 150–200%.
  const [scale, setScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem(SCALE_KEY));
    return saved >= 0.25 && saved <= 3 ? saved : 1.0;
  });
  useEffect(() => { localStorage.setItem(SCALE_KEY, String(scale)); }, [scale]);
  // Pinch-to-zoom needs the latest scale at pointerdown time. Stashing
  // it in a ref avoids a stale closure capture on the touch handlers
  // (which are attached once but read scale every gesture start).
  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  const [mode, setMode] = useState<AnnotationMode>('view');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // One entry per rendered page. Pages can have different orientations, so
  // we can't share a single pageSize across them.
  const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});
  // DOM refs per page wrapper, for scrollIntoView when pageNumber changes
  // externally (URL deep-link, arrow buttons).
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // The page-stack wrapper (flex column of all page wrappers). Needed by
  // the pinch math to compute its position inside the scroll container —
  // `flex justify-center` + the container's padding mean the wrapper is
  // NOT at (0, 0), and its offset shifts when the wrapper grows past the
  // container's width on zoom-in.
  const stackWrapperRef = useRef<HTMLDivElement>(null);
  // The page the IntersectionObserver currently considers "in view". Lives
  // in a ref so the scroll-to-page effect can compare without re-running
  // whenever the visible page shifts.
  const latestVisiblePageRef = useRef<number>(pageNumber);
  // Used by handleFit + toolbar-disabled checks; cheap derived value.
  const pageSize = pageSizes[pageNumber] ?? null;
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  // Captured (normalized) coordinates of the most recent place-sb click.
  // When non-null, the SbPlacementPicker dialog is mounted so the admin
  // can pick an SB from the catalog and stage / copy the placement.
  const [pickerCoords, setPickerCoords] = useState<{ x: number; y: number; page: number } | null>(null);
  // Placements staged by the admin via the picker. Rendered with a dashed
  // border by SbMarkerLayer so they're visually distinct from committed
  // placements. Persisted to localStorage scoped per aircraft so multiple
  // aircraft don't share staging. Note: if `aircraftSlug` changes mid-
  // session, the lazy initializer below won't re-read the new key — in
  // practice the page reloads on aircraft change, so this is fine.
  const stagedKey = `sb-staged:${aircraftSlug}`;
  const [stagedSbPlacements, setStagedSbPlacements] = useState<Array<{ sb: ServiceBulletin; placement: SbPlacement }>>(() => {
    try {
      const raw = localStorage.getItem(stagedKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(stagedKey, JSON.stringify(stagedSbPlacements)); }
    catch { /* quota or private mode — accept loss */ }
  }, [stagedKey, stagedSbPlacements]);

  // ─── In-PDF text search ────────────────────────────────────────
  // The search bar is opened on Ctrl+F (or by the global palette's
  // "Search in this PDF" toggle, which navigates here with ?search=).
  // The bar / sidebar / highlights are all controlled views over a
  // single usePdfTextSearch hook.
  const urlSearch = searchParams.get('search') ?? '';
  const [searchOpen, setSearchOpen] = useState<boolean>(() => !!urlSearch);
  const [searchSidebarOpen, setSearchSidebarOpen] = useState(true);
  const search = usePdfTextSearch(pdfDoc, { initialQuery: urlSearch });

  // Track which match the user has scrolled to so we don't fight the
  // IntersectionObserver every time a new match becomes active.
  const lastScrolledMatchRef = useRef<number>(-1);

  // When ?search= is set externally (palette deep-link), feed the query
  // into the hook. Only respond to changes — a stable param shouldn't
  // overwrite what the user just typed.
  useEffect(() => {
    if (urlSearch && urlSearch !== search.query) {
      search.setQuery(urlSearch);
      setSearchOpen(true);
    }
    // Don't depend on `search.query` here — that would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  // Sync the active query into the URL so palette → reader deep-links
  // round-trip and the user can copy the URL to share a search result.
  useEffect(() => {
    if (!searchOpen) return;
    const next = new URLSearchParams(searchParams);
    if (search.query.trim()) next.set('search', search.query.trim());
    else next.delete('search');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query, searchOpen]);

  // Strip ?search= when the user closes the search bar so the URL
  // doesn't carry stale state.
  const handleSearchClose = () => {
    setSearchOpen(false);
    search.setQuery('');
    const next = new URLSearchParams(searchParams);
    next.delete('search');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  };

  // Ctrl+F / Cmd+F → open the search bar. Capture-phase so it runs
  // before the browser's native find (which only finds DOM text and
  // would be unhelpful inside a canvas-rendered PDF).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape' && searchOpen) {
        // Esc only closes the search bar if the focus is OUTSIDE the
        // input (the input has its own Esc handler so Esc inside the
        // input wins). Otherwise it would still close on input-Esc
        // since both handlers run.
        const target = e.target as HTMLElement | null;
        const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
        if (!isInput) handleSearchClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // When the current match changes (Enter, sidebar click, palette
  // deep-link), scroll its page into view + recenter the page so the
  // highlight lands roughly in the middle of the viewport.
  useEffect(() => {
    if (!search.matches.length) return;
    if (search.currentIndex === lastScrolledMatchRef.current) return;
    const match = search.matches[search.currentIndex];
    if (!match) return;
    lastScrolledMatchRef.current = search.currentIndex;
    const node = pageRefs.current.get(match.page);
    if (node) {
      // Scroll the page wrapper into view; align the matched rect by
      // first scrolling to the start of the page then nudging by the
      // rect's normalized y position.
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      latestVisiblePageRef.current = match.page;
      // After the page scroll settles, nudge by the first rect's y.
      const firstRect = match.rects[0];
      if (firstRect && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        // Wait a frame so scrollIntoView has committed.
        requestAnimationFrame(() => {
          const yOffset = firstRect.y * node.clientHeight - container.clientHeight * 0.35;
          container.scrollBy({ top: yOffset, behavior: 'smooth' });
        });
      }
      // Mirror onto the parent's page state so the toolbar counter
      // reflects which page we just jumped to.
      if (match.page !== pageNumber) onPageChange(match.page);
    }
  }, [search.currentIndex, search.matches, pageNumber, onPageChange]);

  // Register this reader with the global bridge so the CommandPalette
  // can offer a "Search in this PDF" toggle.
  useEffect(() => {
    if (!pdfDoc) return;
    registerActivePdf({
      fileId: file.id,
      fileName: file.originalName,
      sectionLabel: `${file.sectionId || '—'} · ${file.sectionTitle || file.originalName}`,
      pdf: pdfDoc,
    });
    return () => unregisterActivePdf(file.id);
  }, [pdfDoc, file.id, file.originalName, file.sectionId, file.sectionTitle]);

  // Click handler attached to each page wrapper. `page` is the 1-indexed
  // page number captured at mount time so the picker gets the right
  // coordinates even if the user scrolled to a different page than the
  // toolbar shows.
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (mode !== 'place-sb') return;
    if (!pageSizes[page]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPickerCoords({ x, y, page });
  };

  // ─── Pinch-to-zoom (touch) ────────────────────────────────────
  // Two-state zoom for native-feeling smoothness:
  //
  //   • `liveZoom` — a CSS `transform: scale(N)` multiplier applied to
  //     the page stack DURING the gesture. The browser composites this
  //     on the GPU at the full screen refresh rate, so pinching feels
  //     instant and analogue, the way it does in Photos or Safari.
  //
  //   • `scale` — the actual zoom level handed to react-pdf's <Page>,
  //     which re-rasterizes the canvas at the new resolution. We only
  //     touch this ONCE per gesture (on touchend), so the user sees
  //     buttery transforms while pinching and a single sharp re-render
  //     when their fingers lift.
  //
  // Without this split, every touchmove triggered a synchronous pdf.js
  // re-raster — at high zoom that took 50–200ms per frame, which read
  // as "stepped" zoom even though the math was continuous.
  const [liveZoom, setLiveZoom] = useState(1);
  const liveZoomRef = useRef(1);
  useEffect(() => { liveZoomRef.current = liveZoom; }, [liveZoom]);
  // transform-origin pinned to the pinch midpoint so the spot under the
  // user's fingers stays put visually. Resets when the gesture ends.
  const [pinchOrigin, setPinchOrigin] = useState<string | undefined>(undefined);
  // Snapshot taken at touchstart so the post-commit scroll target can be
  // computed in useLayoutEffect once the new layout is realised. We store
  // the input parameters (not a pre-computed scroll position) because the
  // wrapper's offset within the scroll container may shift between old
  // and new scale due to flex centering and padding.
  const pendingScrollRef = useRef<{
    actualZ: number;
    startScrollLeft: number;
    startScrollTop: number;
    midpointX: number;
    midpointY: number;
    oldOffsetLeft: number;
    oldOffsetTop: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!pendingScrollRef.current) return;
    const container = scrollContainerRef.current;
    const wrapper = stackWrapperRef.current;
    if (!container || !wrapper) return;
    const p = pendingScrollRef.current;
    pendingScrollRef.current = null;

    // Read the wrapper's NEW offset within the scroll container. After
    // the scale commit, the wrapper has grown / shrunk and the flex
    // centering may have shifted it left or right relative to the old
    // position. Computed from getBoundingClientRect so we don't depend
    // on offsetParent chains.
    const containerRect = container.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const newOffsetLeft = wrapperRect.left - containerRect.left + container.scrollLeft;
    const newOffsetTop = wrapperRect.top - containerRect.top + container.scrollTop;

    // The midpoint's wrapper-local position at the OLD scale. Content
    // there scales linearly with actualZ to its new wrapper-local
    // position. Re-projecting via the new wrapper offset gives us the
    // scroll position that keeps that same content under the same
    // viewport pixel the user pinched at.
    const oldWrapperLocalX = p.startScrollLeft + p.midpointX - p.oldOffsetLeft;
    const oldWrapperLocalY = p.startScrollTop + p.midpointY - p.oldOffsetTop;
    const newScrollLeft = newOffsetLeft + oldWrapperLocalX * p.actualZ - p.midpointX;
    const newScrollTop = newOffsetTop + oldWrapperLocalY * p.actualZ - p.midpointY;

    container.scrollLeft = Math.max(0, Math.min(container.scrollWidth - container.clientWidth, newScrollLeft));
    container.scrollTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, newScrollTop));
  }, [scale]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    let startDistance = 0;
    let startScale = 1;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    // Pinch midpoint in scroll-container viewport coords (i.e., 0..clientWidth).
    let midpointX = 0;
    let midpointY = 0;
    // Page-stack wrapper's offset within the scroll container at gesture
    // start — needed because flex justify-center + container padding
    // mean the wrapper does NOT start at (0, 0), and its offset shifts
    // as the wrapper grows past the container width on zoom-in.
    let oldOffsetLeft = 0;
    let oldOffsetTop = 0;
    let rafPending = false;
    let pendingZoom = 1;
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const flush = () => {
      rafPending = false;
      // Sync the ref synchronously so any non-React reader (e.g. a
      // simultaneous gesture cleanup) sees the freshest value without
      // waiting for the post-render useEffect to apply.
      liveZoomRef.current = pendingZoom;
      setLiveZoom(pendingZoom);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const wrapper = stackWrapperRef.current;
        if (!wrapper) return;
        startDistance = dist(e.touches[0], e.touches[1]);
        startScale = scaleRef.current;
        startScrollLeft = el.scrollLeft;
        startScrollTop = el.scrollTop;
        const containerRect = el.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        midpointX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - containerRect.left;
        midpointY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - containerRect.top;
        // Wrapper position within scrollable content (invariant to
        // scroll offset — purely the layout origin of the wrapper
        // inside the scroll container's content box).
        oldOffsetLeft = wrapperRect.left - containerRect.left + startScrollLeft;
        oldOffsetTop = wrapperRect.top - containerRect.top + startScrollTop;
        // transform-origin in wrapper-local coords. Picking the local
        // coord of midpoint means the content under the user's fingers
        // stays visually pinned during the gesture.
        const localX = startScrollLeft + midpointX - oldOffsetLeft;
        const localY = startScrollTop + midpointY - oldOffsetTop;
        setPinchOrigin(`${localX}px ${localY}px`);
        pendingZoom = 1;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDistance > 0) {
        e.preventDefault();
        const newDist = dist(e.touches[0], e.touches[1]);
        // Clamp ratio so the live transform stays within the same
        // 0.25–3× envelope the committed scale enforces.
        const ratio = Math.max(0.25 / startScale, Math.min(3 / startScale, newDist / startDistance));
        pendingZoom = ratio;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(flush);
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && startDistance > 0) {
        // Use `pendingZoom` (the freshest in-closure value) rather than
        // liveZoomRef — the latter lags by up to one frame because it's
        // synced after the React render, which means commit could use
        // a stale ratio and you'd see a small "snap" on release.
        const z = pendingZoom;
        const next = Math.max(0.25, Math.min(3, startScale * z));
        // actualZ accounts for the clamp — if the user pinched past the
        // 3× ceiling, the visual went up to 3× but the underlying scale
        // also stops there, and the scroll math must use the realised
        // multiplier, not the raw finger-distance ratio.
        const actualZ = next / startScale;
        pendingScrollRef.current = {
          actualZ,
          startScrollLeft,
          startScrollTop,
          midpointX,
          midpointY,
          oldOffsetLeft,
          oldOffsetTop,
        };
        // Commit and snap back to identity transform in the same render
        // tick. React batches both updates so the canvas re-rasters at
        // the new resolution as the CSS scale unwinds — minimal flash.
        // The pending-scroll useLayoutEffect then aligns scroll position
        // to the new bounds before paint.
        setScale(+next.toFixed(3));
        setLiveZoom(1);
        setPinchOrigin(undefined);
        startDistance = 0;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // Fit the current page to the visible scroll area. Uses whichever of
  // width/height is the tighter constraint so the whole page is visible
  // without scrolling — matching what most PDF viewers call "fit page".
  // pageSize is the rendered size at the current scale; divide it out to
  // recover the natural page dimensions before computing the new scale.
  const handleFit = () => {
    if (!pageSize || !scrollContainerRef.current) return;
    const c = scrollContainerRef.current;
    const padding = 32; // p-4 → 16px each side
    const availW = c.clientWidth - padding;
    const availH = c.clientHeight - padding;
    const naturalW = pageSize.width / scale;
    const naturalH = pageSize.height / scale;
    const newScale = Math.min(availW / naturalW, availH / naturalH);
    setScale(Math.max(0.25, Math.min(3, newScale)));
  };

  // Load the PDF when the file changes. Convert ArrayBuffer → Blob → object URL.
  // The object URL is revoked on cleanup to avoid leaking memory.
  useEffect(() => {
    let aborted = false;
    let createdUrl: string | null = null;
    setPdfBlobUrl(null);
    setLoadError(null);
    fetchPlanPdf(file.id)
      .then(buf => {
        if (aborted) return;
        const blob = new Blob([buf], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(createdUrl);
      })
      .catch(err => { if (!aborted) setLoadError(err?.message || 'Failed to load PDF'); });
    return () => {
      aborted = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file.id]);

  // When page count changes, persist it (so the sidebar can show it later).
  useEffect(() => {
    if (numPages && numPages !== file.pageCount) {
      updatePlan(file.id, { pageCount: numPages }).catch(() => {});
    }
  }, [numPages, file.id, file.pageCount]);

  // External pageNumber change → scroll that page into view. Triggered by
  // the URL ?page= param, the arrow buttons, or palette deep-links.
  // We skip when the requested page is already the one in view (IO already
  // told us so), preventing scroll-loops when natural scroll triggers
  // onPageChange which would otherwise re-trigger a scroll.
  useEffect(() => {
    if (!numPages) return;
    if (pageNumber === latestVisiblePageRef.current) return;
    const node = pageRefs.current.get(pageNumber);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Optimistically mark this as visible so a follow-up IO callback for
    // an adjacent page doesn't trigger a counter-scroll back to wherever
    // we started.
    latestVisiblePageRef.current = pageNumber;
  }, [pageNumber, numPages]);

  // IntersectionObserver — updates the toolbar's "current page" indicator
  // and notifies the parent as the user scrolls between pages. We pick the
  // page with the largest visible area. Threshold steps every 25% give us
  // enough granularity without firing on every scroll pixel.
  useEffect(() => {
    if (!numPages || !scrollContainerRef.current) return;
    const root = scrollContainerRef.current;
    const visible = new Map<number, number>(); // page → ratio
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const n = Number(entry.target.getAttribute('data-page-number')) || 0;
          if (!n) continue;
          if (entry.isIntersecting) visible.set(n, entry.intersectionRatio);
          else visible.delete(n);
        }
        if (visible.size === 0) return;
        // Page with the largest visible area wins. Ties go to the lower
        // page number (Map iteration order = insertion order).
        let best = 0;
        let bestRatio = -1;
        for (const [n, r] of visible) {
          if (r > bestRatio) { best = n; bestRatio = r; }
        }
        if (best && best !== latestVisiblePageRef.current) {
          latestVisiblePageRef.current = best;
          onPageChange(best);
        }
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const node of pageRefs.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [numPages, onPageChange]);

  // Action buttons used in both the desktop top-toolbar and the mobile
  // bottom-dock. Extracted so we don't duplicate handlers between the
  // two layouts.
  const modeButtons = (
    <>
      <ModeButton active={mode === 'view'}   onClick={() => setMode('view')}   icon="visibility"    title="View (no edits)" />
      <ModeButton active={mode === 'text'}   onClick={() => setMode('text')}   icon="sticky_note_2" title="Add text note — tap anywhere on the page" />
      <ModeButton active={mode === 'stroke'} onClick={() => setMode('stroke')} icon="draw"          title="Freehand — drag to draw" />
      {isAdmin && stagedSbPlacements.length > 0 && (
        <button
          onClick={() => {
            setStagedSbPlacements([]);
            toast.success('Cleared staged SB markers.');
          }}
          title={`Clear ${stagedSbPlacements.length} staged SB marker(s)`}
          className="text-[10px] uppercase tracking-wider px-2 py-1 rounded text-amber-600 hover:bg-amber-500/10"
        >
          {stagedSbPlacements.length} staged · clear
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => setMode(mode === 'place-sb' ? 'view' : 'place-sb')}
          title="Place Service Bulletin marker"
          aria-pressed={mode === 'place-sb'}
          className={`min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded transition ${
            mode === 'place-sb'
              ? 'bg-amber-500/20 text-amber-600'
              : 'hover:bg-muted active:bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <MIcon name="warning" className="text-xl md:text-base" />
        </button>
      )}
    </>
  );
  const pageNav = (
    <>
      <button
        onClick={() => onPageChange(Math.max(1, pageNumber - 1))}
        disabled={pageNumber <= 1}
        className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded hover:bg-muted active:bg-muted disabled:opacity-40 transition"
        title="Previous page"
      >
        <MIcon name="chevron_left" className="text-xl md:text-base" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums px-2 min-w-[60px] text-center">
        {pageNumber} / {numPages || '…'}
      </span>
      <button
        onClick={() => onPageChange(Math.min(numPages || pageNumber + 1, pageNumber + 1))}
        disabled={!!numPages && pageNumber >= numPages}
        className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded hover:bg-muted active:bg-muted disabled:opacity-40 transition"
        title="Next page"
      >
        <MIcon name="chevron_right" className="text-xl md:text-base" />
      </button>
    </>
  );
  const zoom = (
    <>
      <button
        onClick={() => setScale(s => Math.max(0.25, +(s - 0.1).toFixed(2)))}
        className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded hover:bg-muted active:bg-muted transition"
        title="Zoom out (10%)"
      >
        <MIcon name="zoom_out" className="text-xl md:text-base" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums px-1 w-12 md:w-10 text-center">
        {Math.round(scale * 100)}%
      </span>
      <button
        onClick={() => setScale(s => Math.min(3, +(s + 0.1).toFixed(2)))}
        className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded hover:bg-muted active:bg-muted transition"
        title="Zoom in (10%)"
      >
        <MIcon name="zoom_in" className="text-xl md:text-base" />
      </button>
      <button
        onClick={handleFit}
        disabled={!pageSize}
        className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded hover:bg-muted active:bg-muted disabled:opacity-40 transition"
        title="Fit page to screen"
      >
        <MIcon name="fit_screen" className="text-xl md:text-base" />
      </button>
    </>
  );

  // Raster resolution handed to pdf.js, independent from the CSS zoom
  // level (`scale`). Native devicePixelRatio (2-3x on Retina/4K) gives
  // full sharpness, but "N pages x high zoom x native DPR" is what used
  // to spike canvas memory enough to kill the tab on long sections —
  // which is why DPR was pinned to 1 everywhere. Instead of a flat cap,
  // taper DPR down as zoom goes up so the raster budget (scale * dpr)
  // stays bounded at the same worst case already known to be safe:
  // scale=3 (max zoom) at dpr=1. At scale=1 (the common case) this
  // yields full native DPR, while still degrading gracefully at high
  // zoom on long sections.
  const rasterDpr = Math.min(window.devicePixelRatio || 1, 3 / scale);

  return (
    <>
    <div className="h-full flex flex-col">
      {/* Top header — desktop only. On mobile this whole bar is hidden
          to claw back ~40px of vertical space; the library-toggle button
          moves into the bottom dock so navigation is still reachable
          with one thumb. */}
      <header className="hidden md:flex items-center justify-between gap-3 px-3 md:px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onOpenLibrary}
            title="Open library (or pick a different sheet)"
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded hover:bg-muted active:bg-muted text-muted-foreground hover:text-foreground transition shrink-0"
          >
            <MIcon name="menu_book" className="text-xl md:text-base" />
          </button>
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
            {file.sectionId || '—'}
          </span>
          <h2 className="text-sm font-semibold truncate" title={file.sectionTitle || file.originalName}>
            {file.sectionTitle || file.originalName}
          </h2>
        </div>
        {/* Desktop-only inline toolbar */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          {modeButtons}
          <span className="mx-2 h-5 w-px bg-border" />
          {pageNav}
          <span className="mx-2 h-5 w-px bg-border" />
          {zoom}
          <span className="mx-2 h-5 w-px bg-border" />
          <button
            onClick={() => setSearchOpen(v => !v)}
            title="Find in PDF (Ctrl+F)"
            aria-pressed={searchOpen}
            className={`min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded transition ${
              searchOpen
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <MIcon name="search" className="text-xl md:text-base" />
          </button>
        </div>
      </header>

      {/* PDF canvas + annotation overlay. All pages render stacked
          vertically; the user scrolls between them freely. Page-nav
          arrows still work — they scroll the requested page into view
          (see the scroll-to-page effect above).
          The outer wrapper is the positioning context for the floating
          search bar + match sidebar; both sit absolutely over the
          scroll area without participating in its scroll. */}
      <div className="relative flex-1 min-h-0">
      {searchOpen && (
        <PlanSearchBar
          query={search.query}
          onQueryChange={search.setQuery}
          matchCount={search.matches.length}
          currentIndex={search.currentIndex}
          isSearching={search.isSearching}
          tooShort={search.tooShort}
          onNext={search.next}
          onPrev={search.prev}
          onClose={handleSearchClose}
          sidebarOpen={searchSidebarOpen}
          onToggleSidebar={() => setSearchSidebarOpen(v => !v)}
        />
      )}
      {searchOpen && searchSidebarOpen && (
        <PlanSearchSidebar
          matchesByPage={search.matchesByPage}
          totalMatches={search.matches.length}
          currentIndex={search.currentIndex}
          onPickMatch={search.setCurrentIndex}
          query={search.query}
          isSearching={search.isSearching}
        />
      )}
      <div
        ref={scrollContainerRef}
        className="absolute inset-0 overflow-auto p-4 pb-14 md:pb-4 flex justify-center"
        // touch-action: pan-x pan-y lets single-finger scroll keep working
        // but tells the browser NOT to claim the pinch gesture — the
        // useEffect-attached TouchEvent listeners pick it up instead and
        // resize the PDF rather than the whole page chrome.
        style={{ touchAction: 'pan-x pan-y' }}
      >
        {loadError ? (
          <div className="text-sm text-destructive p-8">{loadError}</div>
        ) : !pdfBlobUrl ? (
          <div className="text-sm text-muted-foreground p-8">Loading PDF…</div>
        ) : (
          <Document
            file={pdfBlobUrl}
            onLoadSuccess={pdf => { setNumPages(pdf.numPages); setPdfDoc(pdf); }}
            onLoadError={err => { console.error('PDF load error', err); setLoadError('Failed to render PDF'); toast.error('Failed to render PDF'); }}
            loading={<div className="p-8 text-sm text-muted-foreground">Rendering…</div>}
          >
            <div
              ref={stackWrapperRef}
              className="flex flex-col items-center gap-4"
              style={{
                transform: liveZoom !== 1 ? `scale(${liveZoom})` : undefined,
                // Anchor at the pinch midpoint during a gesture (set by
                // touchstart). Falls back to `center top` for any other
                // transforms — keeps the pages visually centred.
                transformOrigin: pinchOrigin ?? 'center top',
                willChange: liveZoom !== 1 ? 'transform' : undefined,
              }}
            >
              {Array.from({ length: numPages }, (_, i) => {
                const n = i + 1;
                const size = pageSizes[n] ?? null;
                return (
                  <div
                    key={n}
                    data-page-number={n}
                    ref={el => {
                      if (el) pageRefs.current.set(n, el);
                      else pageRefs.current.delete(n);
                    }}
                    className="relative inline-block shadow-md"
                    onClick={e => handlePageClick(e, n)}
                    style={{ cursor: mode === 'place-sb' ? 'crosshair' : undefined }}
                  >
                    <Page
                      pageNumber={n}
                      scale={scale}
                      devicePixelRatio={rasterDpr}
                      onRenderSuccess={({ width, height }) =>
                        setPageSizes(prev => ({ ...prev, [n]: { width, height } }))
                      }
                      renderTextLayer
                      renderAnnotationLayer={false}
                    />
                    {size && (
                      <PlanAnnotationsLayer
                        fileId={file.id}
                        pageNumber={n}
                        width={size.width}
                        height={size.height}
                        mode={mode}
                      />
                    )}
                    <SbMarkerLayer
                      aircraftSlug={aircraftSlug}
                      sectionId={file.sectionId}
                      pageNumber={n}
                      pageSize={size}
                      stagedPlacements={stagedSbPlacements}
                    />
                    {size && (
                      <PlanSearchHighlightLayer
                        matches={search.matchesByPage.get(n) ?? []}
                        currentIndex={search.currentIndex}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Document>
        )}
      </div>
      </div>

      {/* Mobile / tablet bottom dock — thumb-reachable on a held iPad.
          Slimmed down vs the desktop toolbar: continuous scroll replaces
          the prev/next page nav, and explicit zoom in/out buttons are
          gone — users pinch the canvas instead. Fit-to-screen and search
          stay because they have no good gesture equivalent. */}
      <footer
        className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-card/95 backdrop-blur border-t border-border px-2 py-0 flex items-center justify-between gap-1"
        // Just 2px above the iOS home indicator instead of 6px — the
        // 44px tap targets already give us all the height we need.
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2px)', paddingTop: '2px' }}
      >
        <div className="flex items-center gap-0.5">
          {/* Library button — replaces the one in the mobile-hidden
              PlanReader header. Same handler, same icon, same purpose. */}
          <button
            onClick={onOpenLibrary}
            title="Open library"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-muted active:bg-muted text-muted-foreground hover:text-foreground transition"
          >
            <MIcon name="menu_book" className="text-xl" />
          </button>
          {modeButtons}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleFit}
            disabled={!pageSize}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-muted active:bg-muted disabled:opacity-40 transition"
            title="Fit page to screen"
          >
            <MIcon name="fit_screen" className="text-xl" />
          </button>
          <button
            onClick={() => setSearchOpen(v => !v)}
            aria-pressed={searchOpen}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded transition ${
              searchOpen
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted active:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Find in PDF"
          >
            <MIcon name="search" className="text-xl" />
          </button>
        </div>
      </footer>
    </div>
    {pickerCoords && (
      <SbPlacementPicker
        open={!!pickerCoords}
        onClose={() => setPickerCoords(null)}
        aircraftSlug={aircraftSlug}
        sectionId={file.sectionId}
        pickerCoords={pickerCoords}
        onStaged={entry => setStagedSbPlacements(prev => [...prev, entry])}
      />
    )}
    </>
  );
}

function ModeButton({ active, onClick, icon, title }: { active: boolean; onClick: () => void; icon: string; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded transition ${
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted active:bg-muted text-muted-foreground hover:text-foreground'
      }`}
    >
      <MIcon name={icon} className="text-xl md:text-base" />
    </button>
  );
}
