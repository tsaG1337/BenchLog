/**
 * Plans Library — left sidebar.
 *
 * Top: pinned-sheets tray (the 3–4 a builder is actively working on).
 * Middle: search box (filters by section ID, title, or original filename).
 * Bottom: scrollable tree grouped by build phase → section.
 *
 * Files with an empty section_id appear in a top "Needs assignment" group
 * with a dropdown to classify them inline.
 */
import { useState, useMemo, useDeferredValue, useEffect, useRef, useCallback } from 'react';
import { MIcon } from '@/components/AppShell';
import type { PlanFile } from '@/lib/api';
import type { PlanSection } from '@/lib/aircraft';
import { listCachedFileIds, getCacheBytes, clearPdfCache } from '@/lib/planCache';
import { toast } from 'sonner';

const PHASE_LABELS: Record<string, string> = {
  empennage:       'Empennage',
  wings:           'Wings',
  fuselage:        'Fuselage',
  'finishing-kit': 'Finishing Kit',
  engine:          'Engine',
  avionics:        'Avionics',
  paint:           'Paint',
  other:           'Other',
};
const PHASE_ORDER = ['empennage', 'wings', 'fuselage', 'finishing-kit', 'engine', 'avionics', 'paint', 'other'];

interface Props {
  files: PlanFile[];
  sections: PlanSection[];
  loading: boolean;
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onAssign: (id: string, section: PlanSection) => void;
  onDelete: (id: string) => void;
  aircraftSlug: string;
  /** Phase to scroll into view + highlight (from ?phase= query param). */
  focusPhase?: string | null;
  /** Drawer open state. Sidebar renders as an overlay that slides in from
   *  the left; the PDF reader fills the full main area underneath. */
  open: boolean;
  onClose: () => void;
}

export function PlanSidebar({
  files, sections, loading, activeFileId,
  onSelectFile, onTogglePin, onAssign, onDelete, focusPhase,
  open, onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const phaseRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const [cacheBytes, setCacheBytes] = useState(0);

  // Refresh cache status when the file list changes — a new upload may
  // pre-cache after viewing, and deletes drop entries.
  const refreshCacheStatus = useCallback(async () => {
    const [ids, bytes] = await Promise.all([listCachedFileIds(), getCacheBytes()]);
    setCachedIds(ids);
    setCacheBytes(bytes);
  }, []);

  useEffect(() => { refreshCacheStatus(); }, [files.length, refreshCacheStatus]);

  // Re-poll on visibility change so when the user returns from the
  // reader (which just cached a fresh file) the badge appears.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') refreshCacheStatus(); };
    const onFocus = () => refreshCacheStatus();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshCacheStatus]);

  const handleClearCache = useCallback(async () => {
    if (!confirm('Clear all cached PDFs? Files will be re-downloaded next time you open them online.')) return;
    await clearPdfCache();
    await refreshCacheStatus();
    toast.success('Offline cache cleared');
  }, [refreshCacheStatus]);

  // Wrap the callbacks so that selecting / assigning a file also collapses
  // the drawer — the builder's goal is to read, not to keep the library
  // open. Pin and delete keep the drawer open since they're side-actions.
  const selectAndClose = useCallback((id: string) => { onSelectFile(id); onClose(); }, [onSelectFile, onClose]);
  const assignAndClose = useCallback((id: string, section: PlanSection) => { onAssign(id, section); onClose(); }, [onAssign, onClose]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // When the page is opened with ?phase=<id>, scroll that group into
  // view once the files have loaded.
  useEffect(() => {
    if (!focusPhase || loading) return;
    const el = phaseRefs.current[focusPhase];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusPhase, loading, files.length]);

  // Index sections by ID for quick lookup.
  const sectionMap = useMemo(() => {
    const m = new Map<string, PlanSection>();
    for (const s of sections) m.set(s.id.toUpperCase(), s);
    return m;
  }, [sections]);

  // Filter by search query.
  const filtered = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f =>
      f.originalName.toLowerCase().includes(q) ||
      f.sectionId.toLowerCase().includes(q) ||
      f.sectionTitle.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q)
    );
  }, [files, deferred]);

  // Partition: needs-assignment, pinned, by-phase.
  const { unassigned, pinned, byPhase } = useMemo(() => {
    const unassigned: PlanFile[] = [];
    const pinned: PlanFile[] = [];
    const byPhase: Record<string, PlanFile[]> = {};
    for (const f of filtered) {
      if (!f.sectionId) {
        unassigned.push(f);
        continue;
      }
      if (f.pinned) pinned.push(f);
      const phase = f.phase || 'other';
      (byPhase[phase] ||= []).push(f);
    }
    // Sort each phase by section ID (natural — "5" before "10", "OP-1" before "OP-38").
    for (const list of Object.values(byPhase)) {
      list.sort((a, b) => naturalSectionSort(a.sectionId, b.sectionId));
    }
    pinned.sort((a, b) => naturalSectionSort(a.sectionId, b.sectionId));
    return { unassigned, pinned, byPhase };
  }, [filtered]);

  return (
    <>
      {/* Backdrop — dims the PDF area when the drawer is open, click to close. */}
      <div
        className={`absolute inset-0 bg-black/30 z-20 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer — slides in from the left, overlays the reader.
          Width: full on phones (overlays the whole reader so the file list
          is comfortably tappable), capped on tablet+ so the reader stays
          partially visible underneath. */}
      <aside
        className={`absolute left-0 top-0 bottom-0 w-full sm:w-80 md:w-80 lg:w-96 bg-card border-r border-border shadow-xl z-30 flex flex-col transform transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Plans library"
        aria-hidden={!open}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plans Library</h2>
          <button onClick={onClose} title="Close library (Esc)" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <MIcon name="close" className="text-base" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <MIcon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 text-base text-muted-foreground" />
            <input
              type="text"
              placeholder="Search section, title, filename…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 rounded-md bg-muted/40 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <p className="p-3 text-xs text-muted-foreground">Loading…</p>}

        {/* Needs-assignment */}
        {unassigned.length > 0 && (
          <Group title={`Needs assignment (${unassigned.length})`} tone="warning">
            {unassigned.map(f => (
              <UnassignedRow
                key={f.id}
                file={f}
                sections={sections}
                active={f.id === activeFileId}
                onSelect={() => selectAndClose(f.id)}
                onAssign={section => assignAndClose(f.id, section)}
                onDelete={() => onDelete(f.id)}
              />
            ))}
          </Group>
        )}

        {/* Pinned */}
        {pinned.length > 0 && (
          <Group title={`Active sheets (${pinned.length})`} tone="accent">
            {pinned.map(f => (
              <FileRow
                key={f.id}
                file={f}
                active={f.id === activeFileId}
                cached={cachedIds.has(f.id)}
                onSelect={() => selectAndClose(f.id)}
                onTogglePin={() => onTogglePin(f.id, false)}
                onDelete={() => onDelete(f.id)}
              />
            ))}
          </Group>
        )}

        {/* By phase */}
        {PHASE_ORDER.filter(p => byPhase[p]?.length).map(phase => (
          <div key={phase} ref={el => { phaseRefs.current[phase] = el; }}>
            <Group title={PHASE_LABELS[phase] || phase} highlighted={focusPhase === phase}>
              {byPhase[phase].map(f => (
                <FileRow
                  key={f.id}
                  file={f}
                  active={f.id === activeFileId}
                  cached={cachedIds.has(f.id)}
                  onSelect={() => selectAndClose(f.id)}
                  onTogglePin={() => onTogglePin(f.id, !f.pinned)}
                  onDelete={() => onDelete(f.id)}
                />
              ))}
            </Group>
          </div>
        ))}

        {!loading && files.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">No plans uploaded yet.</p>
        )}
      </div>

        {/* Cache footer — only shows when there's something cached. */}
        {cacheBytes > 0 && (
          <div className="border-t border-border px-3 py-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 truncate" title="Files downloaded for offline reading">
              <MIcon name="download_for_offline" className="text-xs text-emerald-500" />
              {formatBytes(cacheBytes)} offline
            </span>
            <button
              onClick={handleClearCache}
              className="text-primary hover:underline shrink-0"
              title="Remove all cached PDFs from this device"
            >
              Clear
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Group({ title, tone, highlighted, children }: { title: string; tone?: 'warning' | 'accent'; highlighted?: boolean; children: React.ReactNode }) {
  const titleClasses =
    tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'accent' ? 'text-primary'
    : highlighted ? 'text-primary'
    : 'text-muted-foreground';
  return (
    <div className={`mt-2 ${highlighted ? 'bg-primary/5 rounded-md' : ''}`}>
      <h3 className={`px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider ${titleClasses}`}>
        {title}
      </h3>
      <ul className="space-y-0.5 px-1.5 pb-1">{children}</ul>
    </div>
  );
}

function FileRow({
  file, active, cached, onSelect, onTogglePin, onDelete,
}: {
  file: PlanFile; active: boolean; cached: boolean;
  onSelect: () => void; onTogglePin: () => void; onDelete: () => void;
}) {
  return (
    <li>
      <div
        className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition ${
          active ? 'bg-primary/15 text-primary' : 'hover:bg-muted/60 text-foreground'
        }`}
        onClick={onSelect}
      >
        <span className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded ${active ? 'bg-primary/20' : 'bg-muted/60 text-muted-foreground'}`}>
          {file.sectionId || '—'}
        </span>
        <span className="text-xs truncate flex-1" title={`${file.sectionTitle} — ${file.originalName}`}>
          {file.sectionTitle || file.originalName}
        </span>
        {/* Offline-ready indicator. Always visible (not gated on hover) so
            builders can see at a glance which sheets work without wifi. */}
        {cached && (
          <MIcon
            name="download_for_offline"
            className="text-sm text-emerald-500 shrink-0"
            // Title doesn't render on touch — kept for desktop tooltip.
            style={{ /* hint to screen readers */ }}
          />
        )}
        <button
          type="button"
          title={file.pinned ? 'Unpin' : 'Pin'}
          onClick={e => { e.stopPropagation(); onTogglePin(); }}
          className={`opacity-0 group-hover:opacity-100 transition ${file.pinned ? 'opacity-100 text-primary' : 'text-muted-foreground'}`}
        >
          <MIcon name={file.pinned ? 'push_pin' : 'push_pin'} className="text-sm" style={file.pinned ? undefined : { transform: 'rotate(45deg)' }} />
        </button>
        <button
          type="button"
          title="Delete"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"
        >
          <MIcon name="delete" className="text-sm" />
        </button>
      </div>
    </li>
  );
}

function UnassignedRow({
  file, sections, active, onSelect, onAssign, onDelete,
}: {
  file: PlanFile; sections: PlanSection[]; active: boolean;
  onSelect: () => void;
  onAssign: (section: PlanSection) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition ${
          active ? 'bg-primary/15' : 'hover:bg-muted/60'
        }`}
        onClick={onSelect}
      >
        <MIcon name="warning" className="text-sm text-amber-500" />
        <span className="text-xs truncate flex-1 italic text-muted-foreground" title={file.originalName}>
          {file.originalName}
        </span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90"
        >
          Assign
        </button>
        <button
          type="button"
          title="Delete"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-muted-foreground hover:text-destructive"
        >
          <MIcon name="delete" className="text-sm" />
        </button>
      </div>
      {open && (
        <div className="mx-2 mb-2 p-2 rounded-md bg-muted/40 border border-border">
          <select
            autoFocus
            className="w-full px-2 py-1 rounded text-xs bg-card border border-border"
            defaultValue=""
            onChange={e => {
              const section = sections.find(s => s.id === e.target.value);
              if (section) { onAssign(section); setOpen(false); }
            }}
            onClick={e => e.stopPropagation()}
          >
            <option value="" disabled>Pick a section…</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>
                {s.id} — {s.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}

/** Compare section IDs naturally: "5" < "10" < "31Q" < "OP-1" < "OP-38". */
function naturalSectionSort(a: string, b: string): number {
  if (!a) return 1;
  if (!b) return -1;
  const isOpA = a.startsWith('OP'), isOpB = b.startsWith('OP');
  if (isOpA && !isOpB) return 1;
  if (!isOpA && isOpB) return -1;
  // Both same family — split numeric vs letter suffix
  const ma = a.match(/(\d+)(.*)/), mb = b.match(/(\d+)(.*)/);
  if (ma && mb) {
    const n = Number(ma[1]) - Number(mb[1]);
    if (n !== 0) return n;
    return (ma[2] || '').localeCompare(mb[2] || '');
  }
  return a.localeCompare(b);
}
