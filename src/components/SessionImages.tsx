import { useState, useRef, useEffect, useCallback } from 'react';
import { uploadImages, deleteImage } from '@/lib/api';
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { MIcon } from '@/components/AppShell';
import { toast } from 'sonner';
import { thumbUrl, imageUrl } from '@/lib/utils';
import { moveItem, canMove } from '@/lib/reorder';

interface SessionImagesProps {
  sessionId: string;
  imageUrls: string[];
  onImagesChange: (urls: string[]) => void;
  editable?: boolean;
  demoMode?: boolean;
}

/** Hold this long on a touchscreen before a drag begins, so an ordinary
 *  swipe still scrolls the dialog. Matches the feel of iOS Photos. */
const LONG_PRESS_MS = 300;
/** Finger travel that cancels a pending long-press — that's a scroll. */
const SCROLL_CANCEL_PX = 10;
/** Mouse travel that starts a drag, so a plain click still opens the lightbox. */
const MOUSE_DRAG_PX = 5;

export function SessionImages({ sessionId, imageUrls, onImagesChange, editable = true, demoMode = false }: SessionImagesProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Track latest imageUrls to avoid stale closure in async upload handler
  const imageUrlsRef = useRef(imageUrls);
  imageUrlsRef.current = imageUrls;

  // ─── Drag to reorder ────────────────────────────────────────────
  // Pointer events rather than HTML5 drag-and-drop: the latter never
  // fires on touch, and this grid is used on a tablet at the bench.
  //
  // While a drag is live the order is held locally and only handed to
  // onImagesChange on drop — the parents autosave, and reordering
  // through them on every pointer move would fire a save per frame.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingUrl, setDraggingUrl] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Map<string, HTMLElement>>(new Map());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set between pointerdown and either activation or cancellation. */
  const pending = useRef<{ url: string; x: number; y: number; pointerType: string } | null>(null);
  /** Suppresses the lightbox click that would otherwise follow a drag. */
  const didDrag = useRef(false);
  // Read by pointermove without re-binding the handler every reorder.
  const dragOrderRef = useRef<string[] | null>(null);
  dragOrderRef.current = dragOrder;

  const list = dragOrder ?? imageUrls;

  const clearPending = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    pending.current = null;
  };

  const beginDrag = useCallback((url: string) => {
    clearPending();
    didDrag.current = true;
    setDragOrder([...imageUrlsRef.current]);
    setDraggingUrl(url);
  }, []);

  const endDrag = useCallback((commit: boolean) => {
    const finalOrder = dragOrderRef.current;
    setDraggingUrl(null);
    setDragOrder(null);
    clearPending();
    if (commit && finalOrder) {
      const before = imageUrlsRef.current;
      const changed = finalOrder.length !== before.length || finalOrder.some((u, i) => u !== before[i]);
      if (changed) onImagesChange(finalOrder);
    }
  }, [onImagesChange]);

  /** Which tile index the pointer is currently over, or -1. */
  const indexUnderPoint = (x: number, y: number): number => {
    const current = dragOrderRef.current;
    if (!current) return -1;
    for (let i = 0; i < current.length; i++) {
      const node = tileRefs.current.get(current[i]);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return -1;
  };

  // Global listeners while a drag (or a pending long-press) is live, so
  // the gesture survives the pointer leaving the tile it started on.
  useEffect(() => {
    if (!editable) return;

    const onPointerMove = (e: PointerEvent) => {
      // Still deciding whether this is a drag or a scroll/click.
      const p = pending.current;
      if (p) {
        const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (p.pointerType === 'mouse') {
          if (dist > MOUSE_DRAG_PX) beginDrag(p.url);
        } else if (dist > SCROLL_CANCEL_PX) {
          // Moved before the hold completed — they're scrolling, not sorting.
          clearPending();
        }
        return;
      }
      if (!draggingUrl) return;
      const current = dragOrderRef.current;
      if (!current) return;
      const from = current.indexOf(draggingUrl);
      const to = indexUnderPoint(e.clientX, e.clientY);
      if (to === -1 || !canMove(current.length, from, to)) return;
      setDragOrder(moveItem(current, from, to) as string[]);
    };

    const onPointerUp = () => {
      if (draggingUrl) endDrag(true);
      else clearPending();
    };
    const onPointerCancel = () => {
      if (draggingUrl) endDrag(false);
      else clearPending();
    };
    // Non-passive so the page can't scroll out from under a live drag.
    // React's own onTouchMove is registered passively, which is why this
    // is attached natively instead.
    const onTouchMove = (e: TouchEvent) => { if (draggingUrl) e.preventDefault(); };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [editable, draggingUrl, beginDrag, endDrag]);

  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }, []);

  const handlePointerDown = (e: React.PointerEvent, url: string) => {
    if (!editable || imageUrls.length < 2) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    didDrag.current = false;
    pending.current = { url, x: e.clientX, y: e.clientY, pointerType: e.pointerType };
    if (e.pointerType !== 'mouse') {
      longPressTimer.current = setTimeout(() => beginDrag(url), LONG_PRESS_MS);
    }
  };

  /** Move-left / move-right buttons — the keyboard and gloves-on path,
   *  and the only way to reorder without a pointer at all. */
  const nudge = (url: string, delta: number) => {
    const from = imageUrls.indexOf(url);
    const to = from + delta;
    if (!canMove(imageUrls.length, from, to)) return;
    onImagesChange(moveItem(imageUrls, from, to) as string[]);
  };

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_SIZE) { toast.error(`"${f.name}" exceeds 25 MB limit`); return; }
    }
    if (demoMode) {
      const localUrls = Array.from(files).map(f => URL.createObjectURL(f));
      onImagesChange([...imageUrls, ...localUrls]);
      toast.success(`${localUrls.length} image(s) attached`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const newUrls = await uploadImages(sessionId, files);
      onImagesChange([...imageUrlsRef.current, ...newUrls]);
      toast.success(`${newUrls.length} image(s) attached`);
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async (url: string) => {
    if (!demoMode) { try { await deleteImage(url); } catch {} }
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    onImagesChange(imageUrls.filter(u => u !== url));
  };

  if (!editable && imageUrls.length === 0) return null;

  const reorderable = editable && imageUrls.length > 1;

  return (
    <div>
      {reorderable && (
        <p className="text-[11px] text-muted-foreground mb-1.5">
          Hold and drag a photo to reorder. The first one is used as the cover.
        </p>
      )}
      <div
        ref={gridRef}
        className="grid grid-cols-2 gap-2"
        // Stops the browser claiming the gesture mid-drag on touch.
        style={draggingUrl ? { touchAction: 'none' } : undefined}
      >
        {list.map((url, index) => {
          const isDragging = draggingUrl === url;
          return (
            <div
              key={url}
              ref={el => { if (el) tileRefs.current.set(url, el); else tileRefs.current.delete(url); }}
              onPointerDown={e => handlePointerDown(e, url)}
              className={`aspect-square rounded-lg overflow-hidden relative group bg-muted transition-shadow ${
                isDragging
                  ? 'ring-2 ring-primary shadow-lg opacity-80 z-10'
                  : draggingUrl ? 'opacity-60' : ''
              } ${reorderable ? 'select-none' : ''}`}
            >
              <img
                src={thumbUrl(url)}
                onError={(e) => { e.currentTarget.src = imageUrl(url); }}
                alt="Session photo"
                draggable={false}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => {
                  // A drag ends with a click on most browsers — don't open
                  // the lightbox on top of a reorder the user just made.
                  if (didDrag.current) { didDrag.current = false; return; }
                  setPreviewUrl(imageUrl(url));
                }}
              />
              {index === 0 && imageUrls.length > 1 && (
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium pointer-events-none">
                  Cover
                </span>
              )}
              {!draggingUrl && (
                <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <MIcon name="zoom_in" className="text-white text-2xl" />
                </div>
              )}
              {editable && !draggingUrl && (
                <button
                  onClick={() => handleRemove(url)}
                  aria-label="Remove photo"
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {reorderable && !draggingUrl && (
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex justify-between opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() => nudge(url, -1)}
                    disabled={index === 0}
                    aria-label="Move photo earlier"
                    className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => nudge(url, 1)}
                    disabled={index === list.length - 1}
                    aria-label="Move photo later"
                    className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {editable && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-all"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <MIcon name="add_a_photo" className="text-3xl" />
                <span className="font-label text-[10px] font-bold uppercase">Add Photo</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {/* Lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="" className="max-w-full max-h-[90vh] rounded-lg object-contain block" />
          <div className="absolute top-4 right-4">
            <button
              onClick={() => setPreviewUrl(null)}
              className="w-10 h-10 bg-card/80 rounded-full flex items-center justify-center text-foreground hover:bg-card transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
