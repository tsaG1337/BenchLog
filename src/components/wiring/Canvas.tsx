import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Point } from '@/lib/wiring/types';

export interface Rect { x: number; y: number; w: number; h: number; }

/** Imperative handle exposed via ref. Lets the parent fit/zoom the canvas
 *  programmatically (e.g. a "fit to content" toolbar button) without
 *  threading the view state through props. */
export interface CanvasHandle {
  /** Fit the given world-space rectangle into the visible viewport, with
   *  a uniform padding (default 60 px). Zoom is clamped to the canvas's
   *  own [0.25, 4] range. */
  fitToRect(rect: Rect, options?: { padding?: number }): void;
  /** Reset to the origin at zoom 1. */
  resetView(): void;
}

interface CanvasProps {
  children: React.ReactNode;
  onBackgroundClick?: () => void;
  onMouseMoveWorld?: (pt: Point) => void;
  onMarqueeEnd?: (rect: Rect, shift: boolean) => void;
  /** When true, plain background drag draws a rectangle (the same as
   *  shift-drag would normally produce) instead of panning. Used by shield
   *  capture mode in the parent. The marquee callback still fires, and the
   *  caller is expected to disambiguate by checking its own mode flag. */
  rectangleDragMode?: boolean;
}

/**
 * Lightweight SVG canvas:
 *  - wheel zoom toward cursor
 *  - drag background to pan OR shift-drag to marquee-select
 *  - scaled grid pattern
 *  - emits world coords for children
 */
export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  { children, onBackgroundClick, onMouseMoveWorld, onMarqueeEnd, rectangleDragMode }: CanvasProps,
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ w: 1000, h: 600 });

  // Expose fit/reset to the parent. Both reads of `size` happen at call
  // time via the closure — RouterDom-style stale-state isn't a concern
  // here because useImperativeHandle re-creates the handle whenever its
  // dependencies change.
  useImperativeHandle(ref, () => ({
    fitToRect(rect, options = {}) {
      const padding = options.padding ?? 60;
      const w = Math.max(rect.w, 1) + padding * 2;
      const h = Math.max(rect.h, 1) + padding * 2;
      const zoomX = size.w / w;
      const zoomY = size.h / h;
      const newZoom = Math.max(0.25, Math.min(4, Math.min(zoomX, zoomY)));
      // Center the rectangle in the viewport: viewport's top-left in
      // world-space is (centerWorld - viewportSize/zoom / 2).
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      setView({
        x: cx - (size.w / newZoom) / 2,
        y: cy - (size.h / newZoom) / 2,
        zoom: newZoom,
      });
    },
    resetView() {
      setView({ x: 0, y: 0, zoom: 1 });
    },
  }), [size.w, size.h]);
  const panState = useRef<
    | { kind: 'pan'; startX: number; startY: number; moved: boolean }
    | { kind: 'marquee'; startWorld: Point; currentWorld: Point; shift: boolean }
    | null
  >(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = (sx: number, sy: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (sx - rect.left) / view.zoom + view.x,
      y: (sy - rect.top)  / view.zoom + view.y,
    };
  };

  // Wheel zoom needs to call preventDefault to suppress browser page scroll.
  // React attaches `onWheel` as a passive listener by default in modern
  // browsers, which makes preventDefault inside it a no-op and floods the
  // console with "Unable to preventDefault inside passive event listener
  // invocation" warnings. Bypass React's passive-by-default by attaching
  // the native listener ourselves with { passive: false }.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView(v => {
        const nextZoom = Math.max(0.25, Math.min(4, v.zoom * factor));
        if (nextZoom === v.zoom) return v;
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        return {
          zoom: nextZoom,
          x: v.x + cx / v.zoom - cx / nextZoom,
          y: v.y + cy / v.zoom - cy / nextZoom,
        };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return;
    const world = toWorld(e.clientX, e.clientY);
    // Button semantics (file-explorer style):
    //   left  (0)        → marquee select. Shift-drag adds to existing
    //                      selection (forwarded to the marquee callback).
    //   middle (1) / right (2) → pan. Right-click context menu is suppressed
    //                            via onContextMenu so right-drag works cleanly.
    // `rectangleDragMode` is set by the parent during shield capture: any
    // primary drag becomes a rectangle regardless of modifier.
    const isPanButton = e.button === 1 || e.button === 2;
    const wantMarquee = !isPanButton && onMarqueeEnd;
    if (wantMarquee || rectangleDragMode) {
      panState.current = { kind: 'marquee', startWorld: world, currentWorld: world, shift: e.shiftKey };
      setMarqueeRect({ x: world.x, y: world.y, w: 0, h: 0 });
    } else {
      panState.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, moved: false };
    }
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const world = toWorld(e.clientX, e.clientY);
    if (onMouseMoveWorld) onMouseMoveWorld(world);
    if (!panState.current) return;
    if (panState.current.kind === 'pan') {
      const dxPx = e.clientX - panState.current.startX;
      const dyPx = e.clientY - panState.current.startY;
      if (Math.abs(dxPx) + Math.abs(dyPx) > 3) panState.current.moved = true;
      setView(v => ({ ...v, x: v.x - dxPx / v.zoom, y: v.y - dyPx / v.zoom }));
      panState.current.startX = e.clientX;
      panState.current.startY = e.clientY;
    } else {
      panState.current.currentWorld = world;
      const s = panState.current.startWorld;
      setMarqueeRect({
        x: Math.min(s.x, world.x),
        y: Math.min(s.y, world.y),
        w: Math.abs(world.x - s.x),
        h: Math.abs(world.y - s.y),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!panState.current) return;
    const state = panState.current;
    panState.current = null;
    try { (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId); } catch {}
    if (state.kind === 'pan') {
      if (!state.moved && onBackgroundClick) onBackgroundClick();
    } else if (state.kind === 'marquee') {
      if (marqueeRect && marqueeRect.w > 3 && marqueeRect.h > 3) {
        if (onMarqueeEnd) onMarqueeEnd(marqueeRect, state.shift);
      } else {
        // Marquee never grew past the click threshold — treat as a plain
        // background click so "click empty canvas to clear selection /
        // drop pending placement / drop net label" still works.
        if (onBackgroundClick) onBackgroundClick();
      }
      setMarqueeRect(null);
    }
  };

  const viewBox = `${view.x} ${view.y} ${size.w / view.zoom} ${size.h / view.zoom}`;

  return (
    <svg
      ref={svgRef}
      className="w-full h-full bg-background text-foreground select-none touch-none"
      // Cursor reflects the active gesture. Idle uses `default` (left-click
      // marquee is the primary action) and `grabbing` only fires during a
      // right/middle pan drag. The browser still shows the I-beam over text
      // children because they're separate elements.
      style={{ cursor: panState.current?.kind === 'pan' ? 'grabbing' : 'default' }}
      viewBox={viewBox}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Suppress the browser context menu so right-drag pan doesn't pop the
      // OS menu the moment the user releases the right button.
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id="wiring-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.12" />
        </pattern>
      </defs>
      <rect
        x={view.x} y={view.y}
        width={size.w / view.zoom} height={size.h / view.zoom}
        fill="url(#wiring-grid)"
        pointerEvents="none"
      />
      {children}
      {marqueeRect && (
        <rect
          x={marqueeRect.x} y={marqueeRect.y}
          width={marqueeRect.w} height={marqueeRect.h}
          fill="hsl(var(--primary) / 0.1)"
          stroke="hsl(var(--primary))"
          strokeWidth={1}
          strokeDasharray="4 4"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  );
});
