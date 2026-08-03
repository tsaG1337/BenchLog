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
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { MIcon } from '@/components/AppShell';
import { fetchPlanPdf, updatePlan, fetchGeneralSettings, type PlanFile, type GeneralSettings } from '@/lib/api';
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
import { PlanPartLinkLayer } from './PlanPartLinkLayer';
import { usePdfPartRefs } from './usePdfPartRefs';
import { registerActivePdf, unregisterActivePdf } from './pdfSearchBridge';
import type { ServiceBulletin, SbPlacement } from '@/lib/aircraft';
import { getAircraft } from '@/lib/aircraft';
import { useAuth } from '@/contexts/AuthContext';

const SCALE_KEY = 'plans:zoom';

/**
 * Round a "fit" zoom level DOWN to the 2 decimals the zoom state keeps.
 * Rounding to nearest can land just above the true fit — e.g. a 0.895
 * fit becoming 0.90 renders the sheet 360px wide in 358px of space,
 * leaving a couple of pixels of horizontal scroll on something the user
 * asked to be exactly fitted.
 */
const floorScale = (v: number) => Math.floor(v * 100) / 100;

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
  // Unzoomed (scale-1) dimensions per page, read straight from pdf.js as
  // soon as the document loads. Pages can have different orientations, so
  // we can't share one size across them.
  //
  // This is the linchpin of the zoom behaviour: knowing the natural size
  // lets every page's box be sized as `natural x scale` — a pure function
  // of React state — so the whole stack's layout is correct the moment a
  // new zoom level commits. Previously the boxes took their size from
  // whatever canvas pdf.js had most recently rasterized, which lands
  // asynchronously and not in page order, so for a while after a zoom the
  // stack was a mix of old and new sizes. See the zoom-anchoring layout
  // effect below for why that mattered.
  const [naturalSizes, setNaturalSizes] = useState<Record<number, { width: number; height: number }>>({});
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
  // On-screen size of each page at the current zoom. Floor to match the
  // integer pixel size react-pdf gives its own canvas
  // (`Math.floor(viewport.width)`), so the box and the raster agree.
  const pageDisplaySizes = useMemo(() => {
    const out: Record<number, { width: number; height: number }> = {};
    for (const key of Object.keys(naturalSizes)) {
      const n = Number(key);
      const nat = naturalSizes[n];
      out[n] = { width: Math.floor(nat.width * scale), height: Math.floor(nat.height * scale) };
    }
    return out;
  }, [naturalSizes, scale]);
  // Used by handleFit + toolbar-disabled checks; cheap derived value.
  const pageSize = pageDisplaySizes[pageNumber] ?? null;

  // ─── Render windowing ─────────────────────────────────────────
  // Only pages near the viewport get a real <Page>; the rest are
  // correctly-sized blank boxes. Rasterizing every page of a long
  // section is what made opening one slow and memory-hungry — a 40-page
  // sheet meant 40 pdf.js render() calls and 40 live canvases.
  //
  // This is only safe because a page box's size comes from
  // `naturalSize x scale` rather than from its canvas. An earlier
  // attempt at windowing (before that change) collapsed unrendered
  // pages to zero height, which broke scroll position, the page
  // indicator, and deep links. With state-driven sizing, an unrendered
  // page still occupies exactly the space it will occupy once drawn, so
  // scrolling, IntersectionObserver tracking and zoom anchoring are all
  // unaffected by what happens to be rasterized.
  const OVERSCAN_SCREENS = 1;
  const [renderRange, setRenderRange] = useState<[number, number]>([1, 1]);

  // Each page's top offset within the stack, derived rather than
  // measured — same formula the render uses, so it needs no DOM reads
  // and stays correct even for pages that have never been rasterized.
  const pageTops = useMemo(() => {
    const tops: number[] = [];
    let y = 0;
    for (let n = 1; n <= numPages; n++) {
      tops[n] = y;
      y += (pageDisplaySizes[n]?.height ?? 0) + 16 * scale;
    }
    return tops;
  }, [numPages, pageDisplaySizes, scale]);

  const recomputeRenderRange = useCallback(() => {
    const c = scrollContainerRef.current;
    const wrapper = stackWrapperRef.current;
    if (!c || !wrapper || !numPages || !pageDisplaySizes[1]) return;
    // Where the stack starts inside the scrollable content. One rect
    // pair per recompute (rAF-throttled), rather than one per page.
    const stackTop = wrapper.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop;
    const viewTop = c.scrollTop - stackTop - c.clientHeight * OVERSCAN_SCREENS;
    const viewBottom = c.scrollTop - stackTop + c.clientHeight * (1 + OVERSCAN_SCREENS);
    let first = 0;
    let last = 0;
    for (let n = 1; n <= numPages; n++) {
      const h = pageDisplaySizes[n]?.height ?? 0;
      if (pageTops[n] + h >= viewTop && pageTops[n] <= viewBottom) {
        if (!first) first = n;
        last = n;
      }
    }
    if (!first) return;
    setRenderRange(prev => (prev[0] === first && prev[1] === last ? prev : [first, last]));
  }, [numPages, pageDisplaySizes, pageTops]);

  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; recomputeRenderRange(); });
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    // Also runs on mount and whenever zoom or page sizes change, which
    // is when the set of pages covering the viewport shifts.
    recomputeRenderRange();
    return () => {
      c.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [recomputeRenderRange]);
  const { role, demoMode } = useAuth();
  const isAdmin = role === 'admin';
  // Same vendor resolution indexPlanFile() already uses for search
  // indexing — aircraft with no configured OCR vendor simply detect no
  // part refs (usePdfPartRefs handles a null vendor as "nothing to
  // scan"), same silent-skip behavior the search indexer already has.
  const vendor = useMemo(() => getAircraft(aircraftSlug)?.manufacturer.labelOcr ?? null, [aircraftSlug]);
  const [featureFlags, setFeatureFlags] = useState<GeneralSettings['featureFlags']>(undefined);
  useEffect(() => {
    fetchGeneralSettings().then(s => setFeatureFlags(s.featureFlags)).catch(() => {});
  }, []);
  // Same admin-bypass convention as AppShell's nav gating: only a real
  // (non-demo) admin session bypasses the flag; everyone else needs
  // `inventory` to not be explicitly disabled. Missing key defaults to
  // enabled.
  const showPartLinks = (role === 'admin' && !demoMode) || featureFlags?.inventory !== false;
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
  const partRefs = usePdfPartRefs(pdfDoc, vendor);

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

  // Read every page's unzoomed size once the document loads. getPage() is
  // cheap here — pdf.js has the page dictionaries in memory already and
  // caches the proxies, which the search indexer and part-ref scanner
  // then reuse. Collected into one setState so the stack doesn't reflow
  // page by page.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    setNaturalSizes({});
    (async () => {
      const sizes: Record<number, { width: number; height: number }> = {};
      for (let n = 1; n <= pdfDoc.numPages; n++) {
        try {
          const page = await pdfDoc.getPage(n);
          if (cancelled) return;
          const vp = page.getViewport({ scale: 1 });
          sizes[n] = { width: vp.width, height: vp.height };
        } catch {
          // Leave this page out — it falls back to canvas-driven sizing,
          // i.e. exactly the old behaviour, rather than failing outright.
        }
      }
      if (!cancelled) setNaturalSizes(sizes);
    })();
    return () => { cancelled = true; };
  }, [pdfDoc]);

  // Click handler attached to each page wrapper. `page` is the 1-indexed
  // page number captured at mount time so the picker gets the right
  // coordinates even if the user scrolled to a different page than the
  // toolbar shows.
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (mode !== 'place-sb') return;
    if (!naturalSizes[page]) return;
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
  // user's fingers stays put visually. Only used as a fallback for the
  // brief window before page sizes are known — see previewShift.
  const [pinchOrigin, setPinchOrigin] = useState<string | undefined>(undefined);
  // Translation applied to the page stack alongside the live pinch
  // scale, so the preview reproduces EXACTLY where the committed layout
  // will land — scroll clamping at the document ends included.
  //
  // Without it, the CSS transform cheerfully scales content past the top
  // of the scroller, i.e. it shows a position that scrollTop = 0 can
  // never reproduce; releasing then snapped by the difference. Measured
  // at 245px (enough to put a different page under your fingers) when
  // zooming out near the start of a document. With it, preview and
  // commit agree by construction, so release is seamless everywhere —
  // including the ends, where the view legitimately can't follow your
  // fingers and now simply shows that while you pinch.
  const [previewShift, setPreviewShift] = useState<{ dx: number; dy: number } | null>(null);
  // The touch handlers are attached once, so they read these through
  // refs rather than capturing a render's values.
  const naturalSizesRef = useRef(naturalSizes);
  useEffect(() => { naturalSizesRef.current = naturalSizes; }, [naturalSizes]);
  const numPagesRef = useRef(numPages);
  useEffect(() => { numPagesRef.current = numPages; }, [numPages]);
  // ─── Zoom anchoring ───────────────────────────────────────────
  // What should stay put across the next `scale` change: the point at
  // (fracX, fracY) within page `page` should still sit at (ax, ay),
  // measured from the scroll container's top-left corner. Consumed by
  // the layout effect below, exactly once per scale change.
  const pendingZoomAnchorRef = useRef<{ page: number; fracX: number; fracY: number; ax: number; ay: number } | null>(null);
  // Page the next fit action should bring back into frame. Takes
  // precedence over the anchor above: "fit" means re-frame, not "hold
  // whatever was under the middle of the screen".
  const pendingFitRef = useRef<number | null>(null);

  // Snapshot what's currently under a screen point, for the next zoom to
  // restore. MUST be called before setScale, while the DOM still shows
  // the old zoom level. Coordinates default to the middle of the visible
  // area, which is what the toolbar's zoom buttons want.
  const computeZoomAnchor = (clientX?: number, clientY?: number) => {
    const container = scrollContainerRef.current;
    if (!container) return null;
    const cRect = container.getBoundingClientRect();
    const px = clientX ?? cRect.left + container.clientWidth / 2;
    const py = clientY ?? cRect.top + container.clientHeight / 2;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    // Prefer the page the point actually lands on. If it fell in the gap
    // between two pages (or off the ends of the stack), anchor to the
    // vertically nearest page with clamped fractions — a near-miss
    // anchor still holds the view steady, whereas no anchor at all is
    // the drift we're fixing.
    let best: { page: number; fracX: number; fracY: number } | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const [n, node] of pageRefs.current) {
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const dist = py < r.top ? r.top - py : py > r.bottom ? py - r.bottom : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = { page: n, fracX: clamp01((px - r.left) / r.width), fracY: clamp01((py - r.top) / r.height) };
      }
      if (dist === 0) break;
    }
    if (!best) return null;
    return { ...best, ax: px - cRect.left, ay: py - cRect.top };
  };

  // Apply the anchor synchronously after React commits the new page-box
  // sizes but before the browser paints — so the correction is never
  // visible as a jump, and there is nothing to wait for or debounce.
  //
  // This only works because a page box's size is `natural x scale`, pure
  // state, and so is final at commit time. The previous implementations
  // measured after pdf.js re-rasterized (onRenderSuccess), which is
  // async, arrives per page, and isn't ordered top-to-bottom — so the
  // anchored page's position was read off a stack that was still part
  // old-size, part new-size. That's why release landed somewhere else,
  // and why it got worse the bigger the zoom change (more pages
  // mid-resize at once) — zooming way out being the extreme case.
  // Scroll a fit target back into frame: its top edge just inside the
  // container's top padding, horizontal scroll reset (at any fit level
  // the sheet is no wider than the viewport, so 0 is where it belongs).
  const frameFitPage = () => {
    const page = pendingFitRef.current;
    if (page === null) return;
    pendingFitRef.current = null;
    const c = scrollContainerRef.current;
    const node = pageRefs.current.get(page);
    if (!c || !node) return;
    const padTop = parseFloat(getComputedStyle(c).paddingTop) || 0;
    const top = c.scrollTop + node.getBoundingClientRect().top - c.getBoundingClientRect().top - padTop;
    c.scrollTop = Math.max(0, Math.min(c.scrollHeight - c.clientHeight, top));
    c.scrollLeft = 0;
  };

  useLayoutEffect(() => {
    // A pending fit wins over the centre-anchor a zoom would normally
    // preserve — the whole point of pressing Fit is to reset the framing.
    if (pendingFitRef.current !== null) {
      pendingZoomAnchorRef.current = null;
      frameFitPage();
      return;
    }
    const anchor = pendingZoomAnchorRef.current;
    if (!anchor) return;
    pendingZoomAnchorRef.current = null;
    const container = scrollContainerRef.current;
    const node = pageRefs.current.get(anchor.page);
    if (!container || !node) return;
    const cRect = container.getBoundingClientRect();
    const pRect = node.getBoundingClientRect();
    const dx = pRect.left + anchor.fracX * pRect.width - (cRect.left + anchor.ax);
    const dy = pRect.top + anchor.fracY * pRect.height - (cRect.top + anchor.ay);
    container.scrollLeft = Math.max(0, Math.min(container.scrollWidth - container.clientWidth, container.scrollLeft + dx));
    container.scrollTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + dy));
  }, [scale]);

  // Zoom to an explicit level, holding `anchor` in place. Defaults to
  // the middle of the view, so repeated toolbar taps don't let the sheet
  // crawl away from you. Reads scaleRef rather than `scale` so the touch
  // handlers — attached once, with a first-render closure — can call it.
  // Returns whether the zoom level actually changed — callers that also
  // need to move the scroll position have to do it themselves when it
  // didn't, because no re-render (and so no layout effect) will follow.
  const zoomTo = (next: number, anchor?: ReturnType<typeof computeZoomAnchor>) => {
    const clamped = +Math.max(0.25, Math.min(3, next)).toFixed(2);
    if (clamped === scaleRef.current) return false;
    pendingZoomAnchorRef.current = anchor !== undefined ? anchor : computeZoomAnchor();
    setScale(clamped);
    return true;
  };

  // The zoom at which `page` exactly fills the usable width. This is the
  // level you actually want for reading a plan sheet: fit-to-page has to
  // honour the height too, which on a landscape sheet held in portrait
  // shrinks the text to nothing.
  const fitWidthScaleFor = (page: number) => {
    const nat = naturalSizesRef.current[page];
    const c = scrollContainerRef.current;
    if (!nat || !c) return null;
    const cs = getComputedStyle(c);
    const avail = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return floorScale(Math.max(0.25, Math.min(3, avail / nat.width)));
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    let startDistance = 0;
    let startScale = 1;
    let rafPending = false;
    let pendingZoom = 1;
    // What was under the fingers when the gesture began. Captured now,
    // while liveZoom is still 1 and the DOM therefore untransformed;
    // handed to the anchoring layout effect on release.
    let gestureAnchor: ReturnType<typeof computeZoomAnchor> = null;
    // ─── Double-tap to zoom ─────────────────────────────────────
    // Toggles between fit-width and a comfortable reading zoom, centred
    // on what you tapped. The browser's own double-tap zoom is already
    // off here (touch-action excludes it), so there's nothing to fight.
    const DOUBLE_TAP_MS = 300;   // max gap between the two taps
    const DOUBLE_TAP_SLOP = 30;  // max distance between them
    const TAP_MAX_MS = 250;      // longer than this is a press, not a tap
    const TAP_MOVE_SLOP = 10;    // further than this is a drag, not a tap
    let tapStart: { x: number; y: number; t: number; interactive: boolean } | null = null;
    let tapMoved = false;
    let sawSecondFinger = false;
    let lastTap: { x: number; y: number; t: number } | null = null;

    const onDoubleTap = (x: number, y: number) => {
      const anchor = computeZoomAnchor(x, y);
      if (!anchor) return;
      const fit = fitWidthScaleFor(anchor.page);
      if (fit === null) return;
      // Anything above fit-width counts as "zoomed in", so a double-tap
      // there pulls back out to the whole width — matching how every
      // other viewer behaves. The 5% tolerance stops a rounded-off
      // fit-width from reading as zoomed-in and doing nothing.
      const zoomedIn = scaleRef.current > fit * 1.05;
      zoomTo(zoomedIn ? fit : Math.min(3, fit * 2.5), anchor);
    };
    // Geometry snapshot taken at gesture start, in the coordinate space
    // the whole prediction below works in. Null between gestures.
    let g: {
      startScale: number;
      padTop: number; padBottom: number; padLeft: number; padRight: number;
      clientW: number; clientH: number;
      containerLeft: number; containerTop: number;
      wrapperLeft: number; wrapperTop: number;
      cx0: number; cy0: number; ax: number; ay: number;
    } | null = null;
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    // Where the committed layout WILL put the stack for a live ratio of
    // `z`, expressed as the translation the preview needs so it matches.
    // Mirrors the render exactly: page boxes are floor(natural x scale),
    // the gap is 16 x scale, and the scroll offset is clamped to the
    // scrollable range. Returns null while page sizes are still
    // unknown, in which case the caller falls back to a plain
    // scale-about-the-midpoint preview.
    const predictShift = (z: number) => {
      if (!g) return null;
      const nat = naturalSizesRef.current;
      const N = numPagesRef.current;
      if (!N || !nat[1]) return null;
      const s1 = g.startScale * z;
      let contentH = 0;
      let contentW = 0;
      for (let n = 1; n <= N; n++) {
        const p = nat[n];
        if (!p) return null;
        contentH += Math.floor(p.height * s1);
        contentW = Math.max(contentW, Math.floor(p.width * s1));
      }
      contentH += (N - 1) * 16 * s1;
      const maxTop = Math.max(0, contentH + g.padTop + g.padBottom - g.clientH);
      const maxLeft = Math.max(0, contentW + g.padLeft + g.padRight - g.clientW);
      // Where the stack's top-left will sit within the scrollable
      // content. Vertically that's just the padding; horizontally the
      // stack is centred while it still fits.
      const oy = g.padTop;
      const ox = g.padLeft + Math.max(0, (g.clientW - g.padLeft - g.padRight - contentW) / 2);
      const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
      const top1 = clamp(oy + g.cy0 * z - g.ay, maxTop);
      const left1 = clamp(ox + g.cx0 * z - g.ax, maxLeft);
      return {
        dx: g.containerLeft + ox - left1 - g.wrapperLeft,
        dy: g.containerTop + oy - top1 - g.wrapperTop,
      };
    };

    const flush = () => {
      rafPending = false;
      // Sync the ref synchronously so any non-React reader (e.g. a
      // simultaneous gesture cleanup) sees the freshest value without
      // waiting for the post-render useEffect to apply.
      liveZoomRef.current = pendingZoom;
      setPreviewShift(predictShift(pendingZoom));
      setLiveZoom(pendingZoom);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        // Don't hijack a double-tap aimed at a part link, an SB marker
        // or an annotation — those own their own taps.
        const el = e.target as HTMLElement | null;
        tapStart = {
          x: t.clientX, y: t.clientY, t: Date.now(),
          interactive: !!el?.closest?.('button, a, input, textarea, [role="button"]'),
        };
        tapMoved = false;
        sawSecondFinger = false;
      } else {
        // A pinch is not a tap, and it cancels any half-finished one.
        sawSecondFinger = true;
        lastTap = null;
      }
      if (e.touches.length === 2) {
        const wrapper = stackWrapperRef.current;
        if (!wrapper) return;
        // Drop any anchor a previous gesture left behind (it can only
        // survive if that gesture ended without changing scale), so it
        // can't be picked up by this one.
        pendingZoomAnchorRef.current = null;
        startDistance = dist(e.touches[0], e.touches[1]);
        startScale = scaleRef.current;
        const wrapperRect = wrapper.getBoundingClientRect();
        const containerRect = el.getBoundingClientRect();
        const touchMidClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const touchMidClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        gestureAnchor = computeZoomAnchor(touchMidClientX, touchMidClientY);

        // Snapshot everything predictShift needs. Paddings are read from
        // the live element rather than hard-coded because the scroll
        // area's bottom padding differs between the mobile dock layout
        // (pb-14) and desktop (pb-4).
        const cs = getComputedStyle(el);
        g = {
          startScale,
          padTop: parseFloat(cs.paddingTop), padBottom: parseFloat(cs.paddingBottom),
          padLeft: parseFloat(cs.paddingLeft), padRight: parseFloat(cs.paddingRight),
          clientW: el.clientWidth, clientH: el.clientHeight,
          containerLeft: containerRect.left, containerTop: containerRect.top,
          wrapperLeft: wrapperRect.left, wrapperTop: wrapperRect.top,
          // The midpoint's offset from the stack's top-left, in the
          // stack's own (untransformed) pixels.
          cx0: touchMidClientX - wrapperRect.left,
          cy0: touchMidClientY - wrapperRect.top,
          ax: touchMidClientX - containerRect.left,
          ay: touchMidClientY - containerRect.top,
        };
        // Fallback origin for the (brief) case where page sizes aren't
        // known yet and predictShift can't run: scale about the pinch
        // midpoint, which at least keeps that spot visually pinned.
        setPinchOrigin(`${g.cx0}px ${g.cy0}px`);
        setPreviewShift(predictShift(1));
        pendingZoom = 1;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && tapStart && !tapMoved) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > TAP_MOVE_SLOP) tapMoved = true;
      }
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
        const next = +Math.max(0.25, Math.min(3, startScale * z)).toFixed(3);
        // Compare the value we're actually committing: if it rounds back
        // to the scale we started at, React bails out of the re-render,
        // the layout effect never runs, and an anchor set here would sit
        // around unconsumed until some later, unrelated zoom.
        if (next !== startScale) pendingZoomAnchorRef.current = gestureAnchor;
        // Commit and snap back to identity transform in the same render
        // tick. React batches both updates, so the page boxes take their
        // new size and the anchoring layout effect restores the scroll
        // position in that same commit — the CSS transform unwinds onto
        // an already-corrected view rather than into a visible jump.
        setScale(next);
        setLiveZoom(1);
        setPinchOrigin(undefined);
        setPreviewShift(null);
        startDistance = 0;
        gestureAnchor = null;
        g = null;
      }

      // Tap bookkeeping — only once every finger is off the glass.
      if (e.touches.length === 0) {
        const tap = tapStart;
        tapStart = null;
        if (!tap || tapMoved || sawSecondFinger || tap.interactive) return;
        const now = Date.now();
        if (now - tap.t > TAP_MAX_MS) { lastTap = null; return; }
        if (
          lastTap &&
          now - lastTap.t < DOUBLE_TAP_MS &&
          Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < DOUBLE_TAP_SLOP
        ) {
          lastTap = null;
          onDoubleTap(tap.x, tap.y);
        } else {
          lastTap = { x: tap.x, y: tap.y, t: now };
        }
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
    // Attached once, on purpose: re-binding touch listeners mid-gesture
    // would drop the in-flight pinch state held in this closure.
    // computeZoomAnchor, zoomTo and fitWidthScaleFor all read refs and
    // setState only, so the first-render closure never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit the current page to the visible scroll area. Uses whichever of
  // width/height is the tighter constraint so the whole page is visible
  // without scrolling — matching what most PDF viewers call "fit page".
  //
  // Always re-frames the page, even when the zoom level it computes is
  // the one already applied. Pressing Fit after scrolling around used to
  // do nothing at all in that case: every page of a section usually has
  // the same dimensions, so the fit level was unchanged, `zoomTo` bailed
  // out, and no scrolling happened either.
  const handleFit = () => {
    const nat = naturalSizes[pageNumber];
    const c = scrollContainerRef.current;
    if (!nat || !c) return;
    // Read the real padding rather than assuming 16px all round: the
    // mobile layout uses pb-14 (56px) to clear the bottom dock, so a
    // hard-coded 32px total overestimated the usable height by 40px and
    // fit-page came out slightly too large to actually fit.
    const cs = getComputedStyle(c);
    const availW = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    pendingFitRef.current = pageNumber;
    if (!zoomTo(floorScale(Math.min(availW / nat.width, availH / nat.height)), null)) frameFitPage();
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
  //
  // Depends on `pdfDoc` (not `pdfBlobUrl`) because react-pdf's
  // <Document> doesn't render its children (our page wrapper divs)
  // the instant pdfBlobUrl is set — it shows its own internal
  // `loading` placeholder until it finishes parsing, and only renders
  // children once that completes, which is the same moment
  // `onLoadSuccess` sets `pdfDoc`. `pdfBlobUrl` was the wrong signal:
  // confirmed via instrumenting IntersectionObserver in a live session
  // that with the pdfBlobUrl-based effect, an observer got created but
  // .observe() was called on it zero times — pageRefs.current was
  // still empty at that point because the actual page divs hadn't
  // rendered yet. If a file's cached pageCount already happens to be
  // correct, `numPages` never changes value after the first render, so
  // it alone can't be relied on to re-fire the effect once the divs
  // exist — `pdfDoc` transitions null → object exactly once, at
  // exactly the right moment, regardless of whether numPages needed
  // correcting.
  useEffect(() => {
    if (!numPages || !pdfDoc || !scrollContainerRef.current) return;
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
  }, [numPages, onPageChange, pdfDoc]);

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
        onClick={() => zoomTo(scale - 0.1)}
        className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center rounded hover:bg-muted active:bg-muted transition"
        title="Zoom out (10%)"
      >
        <MIcon name="zoom_out" className="text-xl md:text-base" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums px-1 w-12 md:w-10 text-center">
        {Math.round(scale * 100)}%
      </span>
      <button
        onClick={() => zoomTo(scale + 0.1)}
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
  // full sharpness, but "pages x high zoom x native DPR" is what used to
  // spike canvas memory enough to kill the tab on long sections. Taper
  // DPR down as zoom goes up so the raster budget (scale * dpr) stays
  // bounded at a worst case known to be safe: scale=3 at dpr=1. At
  // scale=1 (the common case) this yields full native DPR.
  //
  // Render windowing now bounds the number of live canvases too, so the
  // per-page cap could likely be relaxed for sharper text at high zoom —
  // but Van's sheets are physically large (a 34x22" plan at scale 3 is
  // already ~35M pixels per canvas), so that wants measuring on a real
  // device before loosening rather than guessing.
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
        // Not `flex justify-center`: once a sheet is zoomed wider than
        // the screen, a centred flex item overflows in BOTH directions
        // and its left edge becomes unreachable by scrolling. The page
        // stack centres itself with `w-fit mx-auto` instead, which
        // degrades to left-aligned-and-scrollable when it outgrows the
        // viewport. predictShift's `ox` mirrors this rule.
        className="absolute inset-0 overflow-auto p-4 pb-14 md:pb-4"
        // touch-action: pan-x pan-y lets single-finger scroll keep working
        // but tells the browser NOT to claim the pinch gesture — the
        // useEffect-attached TouchEvent listeners pick it up instead and
        // resize the PDF rather than the whole page chrome.
        style={{ touchAction: 'pan-x pan-y' }}
      >
        {loadError ? (
          <div className="text-sm text-destructive p-8 w-fit mx-auto">{loadError}</div>
        ) : !pdfBlobUrl ? (
          <div className="text-sm text-muted-foreground p-8 w-fit mx-auto">Loading PDF…</div>
        ) : (
          <Document
            file={pdfBlobUrl}
            className="w-fit mx-auto"
            onLoadSuccess={pdf => { setNumPages(pdf.numPages); setPdfDoc(pdf); }}
            onLoadError={err => { console.error('PDF load error', err); setLoadError('Failed to render PDF'); toast.error('Failed to render PDF'); }}
            loading={<div className="p-8 text-sm text-muted-foreground">Rendering…</div>}
          >
            <div
              ref={stackWrapperRef}
              className="flex flex-col items-center"
              style={{
                // Scales with `scale` (not a fixed Tailwind gap-4) so the
                // inter-page spacing grows/shrinks proportionally with
                // zoom, same as everything else in the stack. This used
                // to be a fixed 16px regardless of zoom level, which the
                // live pinch (a CSS transform on the whole wrapper, gaps
                // included) visually scaled anyway — so on release, once
                // the real re-render landed with that gap back at a flat
                // 16px, anything below the first page ended up in a
                // different spot than what the pinch had just shown, and
                // the post-pinch scroll-position math (which assumes
                // every pixel between the wrapper's origin and the pinch
                // point scales uniformly) inherited the same wrong
                // assumption.
                gap: `${16 * scale}px`,
                // With a predicted shift the transform is expressed from
                // the stack's own top-left, because that's the corner
                // predictShift positions. Only the (rare) no-prediction
                // fallback scales about the pinch midpoint.
                transform: previewShift
                  ? `translate(${previewShift.dx}px, ${previewShift.dy}px) scale(${liveZoom})`
                  : liveZoom !== 1 ? `scale(${liveZoom})` : undefined,
                transformOrigin: previewShift ? '0 0' : pinchOrigin ?? 'center top',
                willChange: liveZoom !== 1 ? 'transform' : undefined,
              }}
            >
              {Array.from({ length: numPages }, (_, i) => {
                const n = i + 1;
                const size = pageDisplaySizes[n] ?? null;
                // Windowing needs page sizes to know what covers the
                // viewport. If they're unavailable (pdf.js couldn't hand
                // us a viewport), fall back to rendering everything
                // rather than silently showing only page 1.
                const rendered = !pageDisplaySizes[1] || (n >= renderRange[0] && n <= renderRange[1]);
                return (
                  <div
                    key={n}
                    data-page-number={n}
                    ref={el => {
                      if (el) pageRefs.current.set(n, el);
                      else pageRefs.current.delete(n);
                    }}
                    // `plan-page-box` (src/index.css) makes react-pdf's
                    // own boxes fill this one instead of sizing to the
                    // canvas. Only applied once we know the natural size
                    // — without an explicit size here it would collapse.
                    // bg-white so a page that isn't rasterized yet still
                    // reads as a blank sheet rather than a hole — the
                    // same background react-pdf's own <Page> paints.
                    className={`relative inline-block shadow-md bg-white${size ? ' plan-page-box' : ''}`}
                    onClick={e => handlePageClick(e, n)}
                    style={{
                      cursor: mode === 'place-sb' ? 'crosshair' : undefined,
                      // Sized from state, not from the rasterized canvas,
                      // so the stack's layout is correct the instant a
                      // zoom commits. See the zoom-anchoring layout
                      // effect. Also stops pages collapsing to nothing
                      // (and the scroll position lurching) while pdf.js
                      // re-renders them.
                      width: size?.width,
                      height: size?.height,
                    }}
                  >
                    {rendered ? (
                      <Page
                        pageNumber={n}
                        scale={scale}
                        devicePixelRatio={rasterDpr}
                        renderTextLayer
                        renderAnnotationLayer={false}
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-sm text-black/20 select-none">
                        {n}
                      </span>
                    )}
                    {/* Not gated on the window: this fetches the file's
                        whole annotation list on mount, so unmounting it
                        while scrolling would re-request on every pass.
                        It's a couple of DOM nodes when a page has no
                        annotations — the canvas is the expensive part. */}
                    {size && (
                      <PlanAnnotationsLayer
                        fileId={file.id}
                        pageNumber={n}
                        width={size.width}
                        height={size.height}
                        mode={mode}
                      />
                    )}
                    {/* The rest are pure render off already-loaded data,
                        so gating them costs nothing and saves real DOM —
                        a busy sheet can carry a hundred part links, and
                        there's no point building them for a page that
                        isn't drawn. */}
                    {rendered && (
                      <SbMarkerLayer
                        aircraftSlug={aircraftSlug}
                        sectionId={file.sectionId}
                        pageNumber={n}
                        pageSize={size}
                        stagedPlacements={stagedSbPlacements}
                      />
                    )}
                    {rendered && size && (
                      <PlanSearchHighlightLayer
                        matches={search.matchesByPage.get(n) ?? []}
                        currentIndex={search.currentIndex}
                      />
                    )}
                    {rendered && size && showPartLinks && (
                      <PlanPartLinkLayer
                        refs={partRefs.refsByPage.get(n) ?? []}
                        pageSize={size}
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
