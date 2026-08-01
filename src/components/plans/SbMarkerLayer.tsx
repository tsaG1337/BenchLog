/**
 * Service-Bulletin marker overlay for the plan reader.
 *
 * Renders one marker per SB placement on the currently-visible page.
 * Markers are absolutely positioned inside a wrapper that matches the
 * rendered PDF page size, so they scale with zoom automatically.
 *
 * Click a marker → popover with the SB details + link to Van's.
 */
import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getSbPlacementsForPage } from '@/lib/aircraft';
import type { SbPlacement, ServiceBulletin } from '@/lib/aircraft';

interface Props {
  aircraftSlug: string;
  sectionId: string;
  pageNumber: number;
  /** Rendered page dimensions in CSS pixels (passed from PlanReader). */
  pageSize: { width: number; height: number } | null;
  /** Additional placements staged locally by an admin via the picker.
   *  Rendered with a dashed border to distinguish from committed ones. */
  stagedPlacements?: Array<{ sb: ServiceBulletin; placement: SbPlacement }>;
}

export function SbMarkerLayer({
  aircraftSlug, sectionId, pageNumber, pageSize, stagedPlacements = [],
}: Props) {
  const committed = useMemo(
    () => getSbPlacementsForPage(aircraftSlug, sectionId, pageNumber),
    [aircraftSlug, sectionId, pageNumber],
  );

  if (!pageSize) return null;

  // Combine committed + staged. Each entry carries a flag for visual style.
  const all = [
    ...committed.map(c => ({ ...c, staged: false })),
    ...stagedPlacements.filter(p => p.placement.sectionId === sectionId && p.placement.page === pageNumber).map(c => ({ ...c, staged: true })),
  ];

  // Compute pixel offsets for stacked markers (multiple SBs at near-identical
  // coords). Sort by Y then X, give each successive overlapping marker an
  // 8px shift so they're all clickable. "Near-identical" = within 0.005 in
  // normalized coords.
  const positioned = all.map((entry, i) => {
    const x = clamp01(entry.placement.x);
    const y = clamp01(entry.placement.y);
    // Naive stacking offset — small enough that markers usually don't overlap.
    const stackIdx = all.slice(0, i).filter(prev =>
      Math.abs(clamp01(prev.placement.x) - x) < 0.005 &&
      Math.abs(clamp01(prev.placement.y) - y) < 0.005
    ).length;
    return {
      ...entry,
      pxLeft: x * pageSize.width + stackIdx * 8,
      pxTop:  y * pageSize.height + stackIdx * 8,
    };
  });

  return (
    <div className="absolute inset-0 pointer-events-none">
      {positioned.map((entry, i) => (
        <Popover key={`${entry.sb.sbId}-${i}`}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={`${entry.sb.sbId} — ${entry.sb.title}`}
              /* Stop propagation so clicks on existing markers don't also
                 trigger the admin's place-SB page-click handler in PlanReader,
                 which would otherwise open the placement picker on top of the
                 popover. */
              onClick={e => e.stopPropagation()}
              // z-10: the marker needs to win hit-testing over pdf.js's
              // selectable text layer (z-index:2 via TextLayer.css) wherever
              // a marker sits over a text-covered area — see the matching
              // comment in PlanAnnotationsLayer.tsx.
              className={`
                absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-10
                w-6 h-6 rounded-full flex items-center justify-center
                text-white text-xs font-bold shadow-md cursor-pointer
                transition-transform hover:scale-110
                ${entry.sb.status === 'action-required'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'}
                ${entry.staged ? 'border-2 border-dashed border-white' : 'border-2 border-white'}
              `}
              style={{ left: entry.pxLeft, top: entry.pxTop }}
              aria-label={`Service Bulletin ${entry.sb.sbId}`}
            >
              {entry.sb.status === 'action-required' ? '!' : '✓'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <SbPopoverBody sb={entry.sb} placement={entry.placement} staged={entry.staged} />
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

function SbPopoverBody({
  sb, placement, staged,
}: {
  sb: ServiceBulletin;
  placement: SbPlacement;
  staged: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{sb.sbId}</p>
          <h3 className="text-sm font-semibold leading-tight">{sb.title}</h3>
        </div>
        <span className={`
          text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0
          ${sb.status === 'action-required'
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}
        `}>
          {sb.status === 'action-required' ? 'Action req' : 'Incorporated'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{sb.description}</p>

      {placement.note && (
        <p className="text-xs italic border-l-2 border-amber-500/40 pl-2">
          {placement.note}
        </p>
      )}

      <a
        href={sb.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Read at vansaircraft.com →
      </a>

      {staged && (
        <p className="text-[10px] italic text-muted-foreground">
          Staged locally — not yet committed to the catalog.
        </p>
      )}
    </div>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) { console.warn('[SbMarkerLayer] placement coordinate < 0, clamping'); return 0; }
  if (n > 1) { console.warn('[SbMarkerLayer] placement coordinate > 1, clamping'); return 1; }
  return n;
}
