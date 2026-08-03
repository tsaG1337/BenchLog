/**
 * Plans Library — annotation overlay for a single page.
 *
 * Two annotation kinds:
 *   text   — a positioned sticky note. Click in 'text' mode to drop one.
 *   stroke — freehand SVG path. Drag in 'stroke' mode to draw.
 *
 * All coordinates are stored normalized (0..1) so annotations follow the
 * page when the user zooms in/out. The overlay is absolutely-positioned
 * over react-pdf's `<Page>` canvas at the exact rendered size.
 *
 * The component fetches its annotations once per (fileId, pageNumber)
 * change. Mutations are sent to the server and the local state is updated
 * optimistically.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { MIcon } from '@/components/AppShell';
import { toast } from 'sonner';
import {
  listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation,
  type PlanAnnotation,
} from '@/lib/api';

export type AnnotationMode = 'view' | 'text' | 'stroke' | 'place-sb';

interface Props {
  fileId: string;
  pageNumber: number;
  /** Rendered page size in CSS pixels — overlay matches it exactly. */
  width: number;
  height: number;
  mode: AnnotationMode;
}

interface NormPoint { x: number; y: number; }

export function PlanAnnotationsLayer({ fileId, pageNumber, width, height, mode }: Props) {
  const [annotations, setAnnotations] = useState<PlanAnnotation[]>([]);
  const [drawing, setDrawing] = useState<NormPoint[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reload annotations whenever file/page changes.
  useEffect(() => {
    let aborted = false;
    listAnnotations(fileId)
      .then(list => {
        if (aborted) return;
        setAnnotations(list.filter(a => a.pageNumber === pageNumber));
      })
      .catch(() => { /* tenant has no annotations yet — fine */ });
    return () => { aborted = true; };
  }, [fileId, pageNumber]);

  // Convert a click event's clientX/Y to normalized page coordinates.
  const toNorm = useCallback((e: { clientX: number; clientY: number }): NormPoint => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  // ─── Text notes ─────────────────────────────────────────────────
  const handleClickOverlay = useCallback(async (e: React.MouseEvent) => {
    if (mode !== 'text') return;
    // Ignore clicks on existing notes
    if ((e.target as HTMLElement).closest('[data-annotation-id]')) return;
    const p = toNorm(e);
    try {
      const created = await createAnnotation(fileId, {
        pageNumber,
        kind: 'text',
        data: { x: p.x, y: p.y, text: '' },
      });
      setAnnotations(prev => [...prev, created]);
      setEditingId(created.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add note');
    }
  }, [mode, fileId, pageNumber, toNorm]);

  const handleEditText = useCallback(async (id: string, text: string) => {
    const current = annotations.find(a => a.id === id);
    if (!current) return;
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, data: { ...a.data, text } } : a));
    try {
      await updateAnnotation(id, { data: { ...current.data, text } });
    } catch {
      toast.error('Failed to save note');
    }
  }, [annotations]);

  const handleDeleteAnno = useCallback(async (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    try { await deleteAnnotation(id); } catch { toast.error('Failed to delete'); }
  }, []);

  // ─── Freehand strokes ───────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (mode !== 'stroke') return;
    if ((e.target as HTMLElement).closest('[data-annotation-id]')) return;
    // Apple Pencil and other styluses report `pen`. On touch we restrict
    // drawing to one finger so a resting palm doesn't smear lines across
    // the page. Mouse always passes through.
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    e.preventDefault();
    overlayRef.current?.setPointerCapture(e.pointerId);
    setDrawing([toNorm(e)]);
  }, [mode, toNorm]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing) return;
    // Throttle very dense touch moves to keep the path manageable —
    // pdf.js + 1000+ point SVG paths can lag on older iPads.
    setDrawing(prev => {
      if (!prev) return prev;
      const next = toNorm(e);
      const last = prev[prev.length - 1];
      // Skip if the new point is sub-pixel close (< 0.001 normalized).
      if (last && Math.abs(last.x - next.x) < 0.001 && Math.abs(last.y - next.y) < 0.001) return prev;
      return [...prev, next];
    });
  }, [drawing, toNorm]);

  const handlePointerUp = useCallback(async (e: React.PointerEvent) => {
    if (!drawing) return;
    overlayRef.current?.releasePointerCapture(e.pointerId);
    const points = drawing;
    setDrawing(null);
    if (points.length < 2) return;  // ignore stray taps
    try {
      const created = await createAnnotation(fileId, {
        pageNumber,
        kind: 'stroke',
        data: { points, color: '#e11d48', width: 0.004 /* normalized */ },
      });
      setAnnotations(prev => [...prev, created]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save stroke');
    }
  }, [drawing, fileId, pageNumber]);

  // Cursor changes by mode.
  const cursor =
    mode === 'text' ? 'crosshair'
    : mode === 'stroke' ? 'crosshair'
    : mode === 'place-sb' ? 'crosshair'
    : 'default';

  // `touchAction: none` while drawing prevents the browser's pan-to-scroll
  // from hijacking the gesture mid-stroke. In view mode we leave it as
  // 'auto' so two-finger scroll/zoom of the PDF page still works.
  const touchAction = mode === 'stroke' ? 'none' : 'auto';

  return (
    <div
      ref={overlayRef}
      // z-10: pdf.js's own TextLayer.css sets the selectable text layer to
      // z-index:2, and react-pdf's Page wrapper doesn't establish a stacking
      // context — so without an explicit z-index here, the (invisible) text
      // layer wins hit-testing over this overlay wherever a text span covers
      // the same pixel, silently swallowing note/stroke clicks in text-dense
      // areas even though pointerEvents below is correctly 'auto'.
      className="absolute inset-0 z-10"
      style={{ width, height, cursor, touchAction, pointerEvents: mode === 'view' ? 'none' : 'auto' }}
      onClick={handleClickOverlay}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Strokes layer (SVG) */}
      <svg
        viewBox={`0 0 1 1`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        {annotations.filter(a => a.kind === 'stroke').map(a => (
          <StrokePath key={a.id} anno={a} onDelete={() => handleDeleteAnno(a.id)} interactive={mode !== 'view'} />
        ))}
        {drawing && drawing.length > 1 && (
          <path
            d={pointsToPath(drawing)}
            stroke="#e11d48"
            strokeWidth={0.004}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </svg>
      {/* Text notes layer */}
      {annotations.filter(a => a.kind === 'text').map(a => (
        <StickyNote
          key={a.id}
          anno={a}
          editing={editingId === a.id}
          onStartEdit={() => setEditingId(a.id)}
          onEndEdit={() => setEditingId(null)}
          onSave={text => handleEditText(a.id, text)}
          onDelete={() => handleDeleteAnno(a.id)}
        />
      ))}
    </div>
  );
}

// ─── Sticky note ─────────────────────────────────────────────────────
function StickyNote({
  anno, editing, onStartEdit, onEndEdit, onSave, onDelete,
}: {
  anno: PlanAnnotation;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const x = Number(anno.data.x) || 0;
  const y = Number(anno.data.y) || 0;
  const text = String(anno.data.text || '');
  const [draft, setDraft] = useState(text);

  useEffect(() => { setDraft(text); }, [text]);

  return (
    <div
      data-annotation-id={anno.id}
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(0, -8px)',
      }}
      className="z-10"
      onClick={e => e.stopPropagation()}
    >
      {editing ? (
        <div className="bg-yellow-100 dark:bg-yellow-900/70 border border-yellow-400 dark:border-yellow-600 rounded shadow-md p-2 w-56">
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim() !== text) onSave(draft.trim());
              onEndEdit();
            }}
            onKeyDown={e => { if (e.key === 'Escape') { setDraft(text); onEndEdit(); } }}
            placeholder="Note…"
            rows={3}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none resize-none"
          />
          <div className="flex justify-end gap-1 mt-1">
            {/* onMouseDown preventDefault stops the textarea's blur from firing
                first — without it, onBlur runs onEndEdit, the editing UI
                unmounts, and this button is gone before its onClick fires. */}
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onDelete}
              title="Delete"
              className="p-1 rounded hover:bg-red-200/40 text-red-600"
            >
              <MIcon name="delete" className="text-sm" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onStartEdit}
          className="group flex items-start gap-1 bg-yellow-100 dark:bg-yellow-900/70 border border-yellow-400 dark:border-yellow-600 rounded shadow-sm px-2 py-1 max-w-xs text-left hover:shadow-md transition"
        >
          <MIcon name="sticky_note_2" className="text-sm text-yellow-700 dark:text-yellow-400 mt-0.5 shrink-0" />
          <span className="text-xs whitespace-pre-wrap text-foreground">{text || <em className="text-muted-foreground">(empty note)</em>}</span>
        </button>
      )}
    </div>
  );
}

// ─── Freehand stroke ─────────────────────────────────────────────────
function StrokePath({ anno, onDelete, interactive }: { anno: PlanAnnotation; onDelete: () => void; interactive: boolean }) {
  const points = (anno.data.points as NormPoint[]) || [];
  const color = String(anno.data.color || '#e11d48');
  const width = Number(anno.data.width) || 0.004;
  return (
    <g data-annotation-id={anno.id} pointerEvents={interactive ? 'auto' : 'none'}>
      <path
        d={pointsToPath(points)}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Invisible wider hit-target for easier clicking */}
      {interactive && (
        <path
          d={pointsToPath(points)}
          stroke="transparent"
          strokeWidth={width * 6}
          fill="none"
          style={{ cursor: 'pointer' }}
          onClick={e => {
            e.stopPropagation();
            if (confirm('Delete this stroke?')) onDelete();
          }}
        />
      )}
    </g>
  );
}

function pointsToPath(points: NormPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(' ');
}
