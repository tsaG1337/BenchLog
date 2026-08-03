/**
 * Part-number link overlay for the plan reader.
 *
 * Renders one clickable, link-styled span per detected part-number
 * occurrence on the page (see usePdfPartRefs / detectPartRefs.ts —
 * detection runs live, client-side, against the already-loaded PDF).
 * Every occurrence gets its own span; nothing is deduped or merged
 * into a single marker per part number.
 *
 * Click → popover with the part's name, number, and inventory
 * location(s)/stock — or an explicit "no stock" / "not imported"
 * state, fetched lazily when the popover opens (Radix Popover only
 * mounts PopoverContent's children while open, so this effect only
 * ever runs on-demand, never for every link up front).
 */
import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { lookupInvPart, type InvPartLookup } from '@/lib/api';
import type { PdfPartRefMatch } from '@/lib/plans/detectPartRefs';

interface Props {
  refs: PdfPartRefMatch[];
  /** Rendered page dimensions in CSS pixels (passed from PlanReader). */
  pageSize: { width: number; height: number } | null;
}

export function PlanPartLinkLayer({ refs, pageSize }: Props) {
  if (!pageSize || refs.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {refs.map((ref, i) => (
        <Popover key={`${ref.partNumber}-${i}`}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={ref.partNumber}
              data-part-number={ref.partNumber}
              /* Stop propagation so clicking a part-number link doesn't
                 also trigger the admin's place-SB page-click handler in
                 PlanReader — see the identical comment in SbMarkerLayer. */
              onClick={e => e.stopPropagation()}
              /* z-10: wins hit-testing over pdf.js's selectable text
                 layer (TextLayer.css sets z-index:2, and react-pdf's
                 Page wrapper doesn't establish its own stacking
                 context) — see the matching comment in
                 PlanAnnotationsLayer.tsx / SbMarkerLayer.tsx. */
              className="absolute pointer-events-auto z-10 cursor-pointer
                bg-transparent border-0 p-0 m-0
                text-blue-600 dark:text-blue-400 font-semibold
                underline decoration-2 underline-offset-2
                hover:text-blue-700 dark:hover:text-blue-300"
              style={{
                left: ref.rect.x * pageSize.width,
                top: ref.rect.y * pageSize.height,
                width: ref.rect.width * pageSize.width,
                height: ref.rect.height * pageSize.height,
              }}
              aria-label={`Part ${ref.partNumber}`}
            />
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <PartInfoPopoverBody partNumber={ref.partNumber} />
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

type LookupState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; data: InvPartLookup };

function PartInfoPopoverBody({ partNumber }: { partNumber: string }) {
  const [state, setState] = useState<LookupState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    lookupInvPart(partNumber)
      .then(data => { if (!cancelled) setState({ status: 'done', data }); })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [partNumber]);

  if (state.status === 'loading') {
    return <p className="text-xs text-muted-foreground">Checking inventory…</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-1">
        <p className="font-mono text-xs text-muted-foreground">{partNumber}</p>
        <p className="text-xs text-muted-foreground">Couldn't check inventory.</p>
      </div>
    );
  }

  const { part, stock } = state.data;

  if (!part) {
    return (
      <div className="space-y-1">
        <p className="font-mono text-xs text-muted-foreground">{partNumber}</p>
        <p className="text-xs text-muted-foreground">Not imported into inventory.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{part.partNumber}</p>
        <h3 className="text-sm font-semibold leading-tight">{part.name || partNumber}</h3>
      </div>
      {stock.length === 0 ? (
        <p className="text-xs text-muted-foreground">No stock.</p>
      ) : (
        <ul className="space-y-1">
          {stock.map(s => (
            <li key={s.id} className="text-xs flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{s.locationPath || 'Unknown location'}</span>
              <span className="font-medium">{s.quantity} {s.unit}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
