import { useRef } from 'react';
import { useWiring } from './store';

/**
 * Unified drag gesture for every selectable, position-bearing entity on the
 * canvas: device placements, annotations, net labels, shields. One hook to
 * rule them all — each component just spreads the returned `{ onPointerDown,
 * onPointerMove, onPointerUp }` onto its drag-target element.
 *
 * Why one hook?
 *   • Per-component drag handlers all need the same logic (screen→world,
 *     snap-to-grid, multi-vs-single selection branch, transaction begin/commit).
 *     Copying that into every component made the multi-select wiring brittle
 *     — every new draggable type needed all four updates to stay in lock-step.
 *   • Centralising it here means the multi-select behaviour is consistent by
 *     construction: every component sees the same snapshot rules, the same
 *     snapping behaviour, and dispatches to the same `moveSelectionBy` store
 *     action.
 *
 * Behaviour:
 *   • On pointer-down, the hook records the dragged item's current position
 *     and (if the item is part of a multi-selection) snapshots every selected
 *     id across all four entity types. A multi-selection is "this item's
 *     selected set contains its id AND the total selection size is > 1".
 *   • On pointer-move, the hook snaps the *anchor* (this item) to the 10-unit
 *     grid and dispatches `moveSelectionBy` with the resulting incremental
 *     delta. Other items in the snapshot shift by the same delta, preserving
 *     their relative geometry — they may end up off-grid if they started
 *     off-grid. Single-item drags use the snapshot too, just with one id.
 *   • On pointer-up, the hook commits the transaction and reports whether
 *     the gesture actually moved (so callers can route a no-move pointer-up
 *     to a click handler).
 */
export type DraggableKind = 'placement' | 'annotation' | 'netLabel' | 'shield';

interface SelectionSnapshot {
  placementIds:  string[];
  annotationIds: string[];
  netLabelIds:   string[];
  shieldIds:     string[];
}

/** Snap an arbitrary value to the canvas's 10-unit grid. Kept inline so the
 *  hook has zero external dependencies on layout constants. */
function snap(v: number): number {
  return Math.round(v / 10) * 10;
}

function screenToWorld(el: Element, clientX: number, clientY: number): { x: number; y: number } {
  const svg = (el as SVGGraphicsElement).ownerSVGElement!;
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}

export interface UseGroupDragArgs {
  /** Type of the dragged item. Drives which "selected set" decides
   *  membership and which id list it lands in for moveSelectionBy. */
  kind: DraggableKind;
  /** Id of the dragged item (placement id, annotation id, etc.). */
  id: string;
  /** Current on-canvas position of the dragged item — used as the snapping
   *  anchor. For shields the X is xStart and the Y is whatever the renderer
   *  derives (Y won't actually move; only delta.x is meaningful). */
  position: { x: number; y: number };
}

export interface GroupDragHandlers {
  onPointerDown: (e: React.PointerEvent<Element>) => void;
  onPointerMove: (e: React.PointerEvent<Element>) => void;
  /** Returns `true` if the gesture ended without actually moving — callers
   *  use this to route a no-move pointer-up to a click handler. */
  onPointerUp:   (e: React.PointerEvent<Element>) => boolean;
}

export function useGroupDrag({ kind, id, position }: UseGroupDragArgs): GroupDragHandlers {
  const moveSelectionBy = useWiring(s => s.moveSelectionBy);
  const beginTx         = useWiring(s => s.beginTransaction);
  const commitTx        = useWiring(s => s.commitTransaction);
  const selectedDeviceIds     = useWiring(s => s.selectedDeviceIds);
  const selectedAnnotationIds = useWiring(s => s.selectedAnnotationIds);
  const selectedNetLabelIds   = useWiring(s => s.selectedNetLabelIds);
  const selectedShieldIds     = useWiring(s => s.selectedShieldIds);

  // Live latest position via a ref so the move handler always sees the most
  // recent post-move anchor without depending on render-time props (which lag
  // by one frame and would make every move sub-pixel jittery).
  const anchorRef = useRef(position);
  anchorRef.current = position;

  const dragRef = useRef<{
    /** Pointer-world coordinate at pointer-down minus the anchor position.
     *  Subtract from current world coord during move → snap-aligned new anchor. */
    offsetX: number;
    offsetY: number;
    moved: boolean;
    /** Selection captured at pointer-down. Single-mode is just `{ kind: [id] }`. */
    group: SelectionSnapshot;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<Element>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    beginTx();
    const world = screenToWorld(e.currentTarget, e.clientX, e.clientY);

    // Decide single vs multi. Membership rule: the dragged item must be in
    // its own selected set AND the total selection (across all types) must
    // exceed 1. If not, fall back to a single-item snapshot.
    const ownSet =
      kind === 'placement'       ? selectedDeviceIds :
      kind === 'annotation'      ? selectedAnnotationIds :
      kind === 'netLabel'        ? selectedNetLabelIds :
      /* shield */                 selectedShieldIds;
    const totalSelected =
      selectedDeviceIds.size + selectedAnnotationIds.size +
      selectedNetLabelIds.size + selectedShieldIds.size;
    const isMultiSelectMember = ownSet.has(id) && totalSelected > 1;

    const group: SelectionSnapshot = isMultiSelectMember
      ? {
          placementIds:  Array.from(selectedDeviceIds),
          annotationIds: Array.from(selectedAnnotationIds),
          netLabelIds:   Array.from(selectedNetLabelIds),
          shieldIds:     Array.from(selectedShieldIds),
        }
      : {
          placementIds:  kind === 'placement'  ? [id] : [],
          annotationIds: kind === 'annotation' ? [id] : [],
          netLabelIds:   kind === 'netLabel'   ? [id] : [],
          shieldIds:     kind === 'shield'     ? [id] : [],
        };

    dragRef.current = {
      offsetX: world.x - position.x,
      offsetY: world.y - position.y,
      moved: false,
      group,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e: React.PointerEvent<Element>) => {
    const d = dragRef.current;
    if (!d) return;
    const world = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    const targetX = snap(world.x - d.offsetX);
    const targetY = snap(world.y - d.offsetY);
    const anchor = anchorRef.current;
    const dx = targetX - anchor.x;
    const dy = targetY - anchor.y;
    if (dx === 0 && dy === 0) return;
    d.moved = true;
    moveSelectionBy({ x: dx, y: dy }, d.group);
  };

  const onPointerUp = (e: React.PointerEvent<Element>): boolean => {
    const d = dragRef.current;
    if (!d) return false;
    const wasClick = !d.moved;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    commitTx();
    return wasClick;
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}
