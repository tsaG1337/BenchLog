import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Box,
  Timer,
  FileText,
  MapPin,
  LayoutDashboard,
  PackageSearch,
  ClipboardCheck,
  Cable,
  Wallet,
  FileSearch,
  ScanSearch,
} from 'lucide-react';
import { fetchSessions, fetchBlogPosts, fetchInvParts, fetchInvLocations, fetchExpenses, listPlans, searchPlanPartRefs } from '@/lib/api';
import type { WorkSession } from '@/lib/types';
import type { BlogPost, InvPart, InvLocation, PlanFile, PlanPartRef, Expense } from '@/lib/api';
import { useActivePdf } from '@/components/plans/pdfSearchBridge';
import { searchPdfDocument, type PdfSearchMatch, MIN_QUERY_LENGTH } from '@/lib/plans/pdfSearch';

const NAV_TARGETS = [
  { id: 'dashboard',   label: 'Dashboard',         to: '/dashboard',    Icon: LayoutDashboard },
  { id: 'tracker',     label: 'Session Tracker',   to: '/tracker',      Icon: Timer },
  { id: 'blog',        label: 'Build Log',         to: '/blog',         Icon: FileText },
  { id: 'inventory',   label: 'Parts Inventory',   to: '/inventory',    Icon: PackageSearch },
  { id: 'expenses',    label: 'Project Expenses',  to: '/expenses',     Icon: Wallet },
  { id: 'inspections', label: 'Inspections',       to: '/inspections',  Icon: ClipboardCheck },
  { id: 'wiring',      label: 'Wiring Diagrams',   to: '/wiring',       Icon: Cable },
  { id: 'plans',       label: 'Plans Library',     to: '/plans',        Icon: FileSearch },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface PaletteData {
  sessions: WorkSession[];
  posts: BlogPost[];
  parts: InvPart[];
  locations: InvLocation[];
  expenses: Expense[];
  plans: PlanFile[];
  partRefs: PlanPartRef[];
}

const EMPTY_DATA: PaletteData = { sessions: [], posts: [], parts: [], locations: [], expenses: [], plans: [], partRefs: [] };

// ─── Scope filter ───────────────────────────────────────────────────
// Pill row under the input. Single-select. 'all' is the default and
// shows every group. Picking a specific scope hides everything else,
// the same way the PDF-scope toggle works for in-PDF results.
//
// The order here drives the visual order of the pills — left to right
// matches the order Builders reach for them in practice: pages first
// (cheapest navigation), then tracker/blog (most-visited features),
// then the data-heavy stuff.
type Scope = 'all' | 'pages' | 'tracker' | 'blog' | 'inventory' | 'expenses' | 'plans';

const SCOPE_PILLS: Array<{ id: Scope; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'all',       label: 'All',       Icon: LayoutDashboard },
  { id: 'pages',     label: 'Pages',     Icon: LayoutDashboard },
  { id: 'tracker',   label: 'Tracker',   Icon: Timer },
  { id: 'blog',      label: 'Blog',      Icon: FileText },
  { id: 'inventory', label: 'Inventory', Icon: Box },
  { id: 'expenses',  label: 'Expenses',  Icon: Wallet },
  { id: 'plans',     label: 'Plans',     Icon: FileSearch },
];

/**
 * Global command palette — opens with Cmd/Ctrl+K from anywhere in the app.
 * Searches across navigation targets, sessions, blog posts, inventory parts,
 * and locations. Results render in grouped sections; pressing Enter on a result
 * navigates to the relevant page (and where useful, deep-links via query params
 * the destination page can pick up).
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<PaletteData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  // Currently-selected scope pill. 'all' is the default and shows
  // every category; the others hide everything except their own
  // group. Resets to 'all' when the dialog closes so each open
  // starts fresh; if the user wants a remembered scope they can
  // pick it again, but persisting it would surprise people who
  // expect Ctrl+K to always show the same thing.
  const [scope, setScope] = useState<Scope>('all');
  // Server-returned part refs for the active query. Bypasses the
  // alphabetical preload cap so any indexed part can be found.
  const [queryPartRefs, setQueryPartRefs] = useState<PlanPartRef[]>([]);

  // ─── In-PDF scope ────────────────────────────────────────────────
  // When a PlanReader is mounted it registers itself in the bridge.
  // The toggle here flips the palette into "search inside the open
  // PDF only" mode: globals are hidden, results come from running
  // `searchPdfDocument` directly against the same PDFDocumentProxy the
  // reader is using.
  const activePdf = useActivePdf();
  const [pdfScopeActive, setPdfScopeActive] = useState(false);
  const [pdfMatches, setPdfMatches] = useState<PdfSearchMatch[]>([]);
  const [pdfSearching, setPdfSearching] = useState(false);

  useEffect(() => {
    if (!pdfScopeActive || !activePdf) {
      setPdfMatches([]);
      setPdfSearching(false);
      return;
    }
    const q = searchValue.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setPdfMatches([]);
      setPdfSearching(false);
      return;
    }
    let cancelled = false;
    setPdfSearching(true);
    const handle = setTimeout(() => {
      searchPdfDocument(activePdf.pdf, q)
        .then(found => { if (!cancelled) { setPdfMatches(found); setPdfSearching(false); } })
        .catch(() => { if (!cancelled) { setPdfMatches([]); setPdfSearching(false); } });
    }, 200);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [pdfScopeActive, searchValue, activePdf]);

  // If the active PDF goes away (route change), drop the scope.
  useEffect(() => {
    if (!activePdf && pdfScopeActive) setPdfScopeActive(false);
  }, [activePdf, pdfScopeActive]);

  // Lazy-load the corpus on first open. The palette caches results for the
  // session — this is fine because the corpus changes slowly and the lists
  // we use are bounded (sessions: 50, posts: 25, parts: 200, locations: all).
  // For part refs we only preload 200 as a browse aid for the no-query
  // case — once the user types ≥2 chars we hit the server (see below) so
  // alphabetical cutoff doesn't matter.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      const [sessionsRes, postsRes, parts, locations, expenses, plans, refs] = await Promise.allSettled([
        fetchSessions({ limit: 50 }),
        fetchBlogPosts({ limit: 25 }),
        fetchInvParts(),
        fetchInvLocations(),
        fetchExpenses(),
        listPlans(),
        searchPlanPartRefs('', 200),
      ]);
      if (cancelled) return;
      setData({
        sessions:  sessionsRes.status === 'fulfilled' ? sessionsRes.value.sessions : [],
        posts:     postsRes.status   === 'fulfilled' ? postsRes.value.posts        : [],
        parts:     parts.status      === 'fulfilled' ? parts.value.slice(0, 200)   : [],
        locations: locations.status  === 'fulfilled' ? locations.value             : [],
        expenses:  expenses.status   === 'fulfilled' ? expenses.value.slice(0, 200) : [],
        plans:     plans.status      === 'fulfilled' ? plans.value                 : [],
        partRefs:  refs.status       === 'fulfilled' ? refs.value.refs             : [],
      });
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [open, loaded]);

  // Server-side part-ref search, debounced. Triggers when the input has
  // at least 2 chars (avoids querying on every keystroke and on noisy
  // single-letter inputs). Empty/short input falls back to the preloaded
  // alphabetical list. We don't dedupe vs preload — cmdk's own filter
  // hides duplicates by value.
  useEffect(() => {
    if (!open) return;
    const q = searchValue.trim();
    if (q.length < 2) {
      setQueryPartRefs([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      searchPlanPartRefs(q, 100)
        .then(res => { if (!cancelled) setQueryPartRefs(res.refs); })
        .catch(() => { /* silent — preload still covers the common case */ });
    }, 150);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [searchValue, open]);

  // Reset the query state when the dialog closes so a fresh open starts
  // from the preload list, not stale server hits.
  useEffect(() => {
    if (!open) {
      setSearchValue('');
      setQueryPartRefs([]);
      setPdfMatches([]);
      setScope('all');
      // PDF scope is intentionally NOT reset on close — the user toggled
      // it deliberately, so it should still be on next time they hit
      // Ctrl+K on the same PDF. The category scope IS reset because
      // it's a per-search filter, not a persistent preference.
    }
  }, [open]);

  const go = (to: string) => { onOpenChange(false); navigate(to); };

  // Jump to an in-PDF match: route to the file (same one, but with
  // ?search= so PlanReader opens its own bar pre-filled) and let the
  // reader's deep-link handler pick it up.
  const goToPdfMatch = (match: PdfSearchMatch) => {
    if (!activePdf) return;
    const q = encodeURIComponent(searchValue.trim());
    onOpenChange(false);
    navigate(`/plans/${activePdf.fileId}?page=${match.page}&search=${q}`);
  };

  const sessionResults  = useMemo(() => data.sessions.slice(0, 8),  [data.sessions]);
  const postResults     = useMemo(() => data.posts.slice(0, 8),     [data.posts]);
  const partResults     = useMemo(() => data.parts.slice(0, 12),    [data.parts]);
  const locationResults = useMemo(() => data.locations.slice(0, 8), [data.locations]);
  const expenseResults  = useMemo(() => data.expenses.slice(0, 20), [data.expenses]);
  const planResults     = useMemo(() => data.plans.slice(0, 40),    [data.plans]);
  // Prefer server results when the user is actively searching; otherwise
  // show the alphabetical preload as a browse aid. Cap at 50 either way
  // so the dropdown stays scannable.
  const partRefResults  = useMemo(() => {
    const source = searchValue.trim().length >= 2 ? queryPartRefs : data.partRefs;
    return source.slice(0, 50);
  }, [searchValue, queryPartRefs, data.partRefs]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={pdfScopeActive
          ? `Search inside ${activePdf?.sectionLabel || 'this PDF'}…`
          : 'Search sessions, parts, posts, pages…'}
        value={searchValue}
        onValueChange={setSearchValue}
      />
      {activePdf && (
        <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground truncate">
            <ScanSearch className="inline h-3 w-3 mr-1 -mt-0.5" />
            Current PDF: <span className="font-mono">{activePdf.sectionLabel}</span>
          </span>
          <button
            onClick={() => setPdfScopeActive(v => !v)}
            aria-pressed={pdfScopeActive}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
              pdfScopeActive
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                : 'border border-border hover:bg-muted text-muted-foreground'
            }`}
          >
            {pdfScopeActive ? 'Searching in PDF only' : 'Search in this PDF only'}
          </button>
        </div>
      )}
      {/* Scope pills — hidden when in-PDF scope is active (the two
          filters would fight each other). Picking a non-'all' scope
          narrows the result groups; clicking the active pill again
          goes back to 'all'. */}
      {!pdfScopeActive && (
        <div className="px-2 py-1.5 border-b border-border flex items-center gap-1 overflow-x-auto">
          {SCOPE_PILLS.map(({ id, label, Icon }) => {
            const active = scope === id;
            return (
              <button
                key={id}
                onClick={() => setScope(active && id !== 'all' ? 'all' : id)}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            );
          })}
        </div>
      )}
      <CommandList>
        <CommandEmpty>
          {pdfScopeActive && searchValue.trim().length < MIN_QUERY_LENGTH
            ? `Type at least ${MIN_QUERY_LENGTH} characters to search the PDF.`
            : scope !== 'all'
              ? `No ${SCOPE_PILLS.find(p => p.id === scope)?.label.toLowerCase() ?? ''} results — try clearing the filter or another scope.`
              : 'No results found.'}
        </CommandEmpty>

        {pdfScopeActive && (
          <CommandGroup heading={pdfSearching
            ? 'Searching PDF…'
            : `Matches in PDF (${pdfMatches.length})`}>
            {pdfMatches.slice(0, 100).map(m => (
              <CommandItem
                key={`pdfmatch-${m.index}`}
                // Force cmdk's filter to keep every result — we've already
                // filtered server-side via searchPdfDocument(query).
                value={`pdfmatch ${m.index} ${m.snippet}`}
                onSelect={() => goToPdfMatch(m)}
              >
                <ScanSearch className="mr-2 h-4 w-4 text-amber-600" />
                <span className="font-mono text-[10px] mr-2 text-muted-foreground">p{m.page}</span>
                <span className="truncate text-xs">{m.snippet}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground font-mono">match</span>
              </CommandItem>
            ))}
            {pdfMatches.length > 100 && (
              <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
                Showing first 100 of {pdfMatches.length} matches — refine your query to narrow down.
              </div>
            )}
          </CommandGroup>
        )}

        {!pdfScopeActive && (<>
        {(scope === 'all' || scope === 'pages') && (
        <CommandGroup heading="Navigation">
          {NAV_TARGETS.map(({ id, label, to, Icon }) => (
            <CommandItem
              key={id}
              value={`nav ${label}`}
              onSelect={() => go(to)}
            >
              <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{label}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground font-mono">page</span>
            </CommandItem>
          ))}
        </CommandGroup>
        )}

        {(scope === 'all' || scope === 'tracker') && sessionResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sessions">
              {sessionResults.map((s) => {
                const hours = (s.durationMinutes / 60).toFixed(1);
                const date = s.startTime ? new Date(s.startTime).toLocaleDateString() : '';
                const label = `${date} · ${s.section} · ${hours}h${s.notes ? ' · ' + s.notes.slice(0, 60) : ''}`;
                return (
                  <CommandItem
                    key={s.id}
                    value={`session ${s.id} ${s.section} ${s.notes ?? ''}`}
                    onSelect={() => go(`/tracker?session=${encodeURIComponent(s.id)}`)}
                  >
                    <Timer className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{label}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground font-mono">tracker</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {(scope === 'all' || scope === 'blog') && postResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Build log">
              {postResults.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`post ${p.title} ${p.section ?? ''} ${p.excerpt ?? ''}`}
                  onSelect={() => go(`/blog?post=${encodeURIComponent(p.id)}`)}
                >
                  <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{p.title}</span>
                  {p.section && (
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{p.section}</span>
                  )}
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground font-mono">blog</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(scope === 'all' || scope === 'inventory') && partResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Parts">
              {partResults.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`part ${p.partNumber} ${p.name} ${p.manufacturer} ${p.kit} ${p.bag}`}
                  onSelect={() => go(`/inventory?q=${encodeURIComponent(p.partNumber)}`)}
                >
                  <Box className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs mr-2">{p.partNumber}</span>
                  <span className="truncate">{p.name}</span>
                  {p.kit && <span className="ml-2 text-xs text-muted-foreground">{p.kit}</span>}
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground font-mono">inv</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(scope === 'all' || scope === 'inventory') && locationResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Locations">
              {locationResults.map((l) => (
                <CommandItem
                  key={l.id}
                  value={`location ${l.name} ${l.description ?? ''}`}
                  onSelect={() => go(`/inventory?location=${encodeURIComponent(l.id)}`)}
                >
                  <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{l.name}</span>
                  {l.description && <span className="ml-2 text-xs text-muted-foreground truncate">{l.description}</span>}
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground font-mono">loc</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(scope === 'all' || scope === 'expenses') && expenseResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Expenses">
              {expenseResults.map(e => {
                // Build a label that surfaces the things builders
                // actually scan for: date + vendor + amount in their
                // home currency, with description as the searchable
                // body. cmdk's filter uses the `value` prop for the
                // match, so cram every queryable field into it.
                const date = e.date ? new Date(e.date).toLocaleDateString() : '';
                const amt  = `${e.amountHome.toFixed(2)} ${e.currency || ''}`.trim();
                return (
                  <CommandItem
                    key={e.id}
                    value={`expense ${e.vendor} ${e.description} ${e.category} ${e.partNumber} ${e.notes ?? ''} ${(e.tags ?? []).join(' ')}`}
                    onSelect={() => go(`/expenses?expense=${encodeURIComponent(e.id)}`)}
                  >
                    <Wallet className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="truncate flex-1">
                      <span className="text-xs text-muted-foreground mr-2">{date}</span>
                      {e.vendor && <span className="font-medium mr-2">{e.vendor}</span>}
                      <span className="text-muted-foreground">{e.description}</span>
                    </span>
                    <span className="ml-2 font-mono text-xs tabular-nums">{amt}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">exp</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {(scope === 'all' || scope === 'plans') && planResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Plans">
              {planResults.map(p => (
                <CommandItem
                  key={p.id}
                  value={`plan ${p.sectionId} ${p.sectionTitle} ${p.originalName} ${p.phase}`}
                  onSelect={() => go(`/plans/${p.id}`)}
                >
                  <FileSearch className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs mr-2">{p.sectionId || '—'}</span>
                  <span className="truncate">{p.sectionTitle || p.originalName}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{p.phase}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(scope === 'all' || scope === 'plans') && partRefResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Parts in plans">
              {partRefResults.map((r, idx) => (
                <CommandItem
                  key={`${r.fileId}-${r.pageNumber}-${r.partNumber}-${idx}`}
                  value={`partref ${r.partNumber} ${r.file.sectionId} ${r.file.sectionTitle} ${r.snippet}`}
                  onSelect={() => go(`/plans/${r.fileId}?page=${r.pageNumber}`)}
                >
                  <Box className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs mr-2">{r.partNumber}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1" title={r.snippet}>
                    {r.file.sectionId} · {r.file.sectionTitle} · p{r.pageNumber}
                  </span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">plan</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        </>)}
      </CommandList>
    </CommandDialog>
  );
}

/** Hook: registers the global Cmd/Ctrl+K shortcut and exposes open state. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}
