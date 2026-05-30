import { useRef } from 'react';
import type { Point } from './types';
import { useWiring } from './store';
import { snapToGrid, computeAlignmentSnap } from './harness';

/**
 * Harness-node drag gesture.
 *
 * One hook drives the drag of every harness-graph node — `component`
 * (device block), `splice`, and `branchPoint`. It commits
 * `HarnessOverrides.nodePositions` entries via `setHarnessNodePositions`,
 * keyed by the node's STABLE id, so the move survives every re-derivation.
 *
 * Why a dedicated hook (not `useGroupDrag`)?
 *   `useGroupDrag` is the schematic-canvas multi-select gesture: it shifts
 *   placements/annotations/labels/shields together through `moveSelectionBy`.
 *   A harness node writes to the per-sheet override layer, not schematic
 *   coordinates — different store action, different commit target.
 *
 * Phase 4 — editing polish:
 *   - **Snap-to-grid**: the committed position snaps to the 10-unit grid.
 *   - **Alignment guides**: while dragging, if the node's x (or y) lands
 *     within a few px of another harness node's x (or y) the coordinate
 *     snaps to it and a guide line is surfaced via the store's
 *     `harnessAlignGuides` so the renderer can draw it. Cleared on drop.
 *   - **Multi-select drag**: when the dragged node is in
 *     `selectedHarnessNodeIds` (and the set has more than one member) every
 *     selected node moves by the same delta, in one undo transaction.
 *   - **Whole-harness drag**: when `moveGroupIds` is supplied and contains
 *     the dragged node, that explicit set of nodes travels together. It takes
 *     priority over the multi-select group so a double-clicked harness tree
 *     moves as one even when only part of it is in `selectedHarnessNodeIds`.
 *
 * Live feedback:
 *   The whole drag runs inside one undo transaction. Each pointer-move
 *   writes the override(s) straight to the store, so the harness graph
 *   RE-DERIVES every frame. A pointer-up with no movement is reported back
 *   so the caller can treat it as a click (node selection).
 */

function screenToWorld(el: Element, clientX: number, clientY: number): Point {
  const svg = (el as SVGGraphicsElement).ownerSVGElement!;
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}

export interface HarnessNodeDragHandlers {
  onPointerDown: (e: React.PointerEvent<Element>) => void;
  onPointerMove: (e: React.PointerEvent<Element>) => void;
  /** Returns `true` when the gesture ended without moving — the caller routes
   *  that to a click (node selection). */
  onPointerUp: (e: React.PointerEvent<Element>) => boolean;
}

/** A harness node the drag hook can move / align against. */
export interface HarnessNodeRef {
  id: string;
  position: Point;
}

/**
 * @param nodeId       the harness node's stable id (placement id / `J:<id>` /
 *                     `bp:<servedNodeId>`).
 * @param position     the node's current derived position — the snap anchor.
 * @param allNodes     every harness node on the sheet — used as the source of
 *                     alignment candidates and for multi-select group moves.
 *                     Omitted → no alignment guides, single-node drag only.
 * @param moveGroupIds the explicit set of node ids that travel together when
 *                     this node is dragged as part of a whole-harness
 *                     selection. When supplied and it contains `nodeId`, it
 *                     takes priority over the multi-select group.
 */
export function useHarnessNodeDrag(
  nodeId: string,
  position: Point,
  allNodes?: HarnessNodeRef[],
  moveGroupIds?: string[],
): HarnessNodeDragHandlers {
  const setHarnessNodePositions = useWiring(s => s.setHarnessNodePositions);
  const setHarnessAlignGuides  = useWiring(s => s.setHarnessAlignGuides);
  const beginTx  = useWiring(s => s.beginTransaction);
  const commitTx = useWiring(s => s.commitTransaction);
  const activeSheetId = useWiring(s => s.activeSheetId);

  // The gesture is self-contained: pointer-down captures the grab offset
  // from the at-grab anchor; every move computes the absolute target from
  // that offset, so the handler never needs the (lagging) render-time prop.
  // `members` holds the set of nodes that move together (this node, plus the
  // rest of the selection when this node is part of a multi-select), each
  // with its at-grab position so a group delta translates them all.
  const dragRef = useRef<{
    offsetX: number; offsetY: number; moved: boolean; last: Point;
    members: { id: string; startX: number; startY: number }[];
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<Element>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    beginTx();
    const world = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    // Group move — priority: an explicit whole-harness group (when the
    // dragged node is part of it) beats the multi-select group, which beats
    // a plain single-node move.
    const selected = useWiring.getState().selectedHarnessNodeIds;
    const wholeHarness = moveGroupIds ?? [];
    let groupIds: string[];
    if (wholeHarness.length > 0 && wholeHarness.includes(nodeId)) {
      groupIds = wholeHarness;                       // whole-harness group move
    } else if (selected.has(nodeId) && selected.size > 1) {
      groupIds = Array.from(selected);               // multi-select group move
    } else {
      groupIds = [nodeId];                           // single-node move
    }
    const posById = new Map<string, Point>();
    for (const n of allNodes ?? []) posById.set(n.id, n.position);
    posById.set(nodeId, position); // ensure the dragged node is present
    const members = groupIds.map(id => {
      const p = posById.get(id) ?? position;
      return { id, startX: p.x, startY: p.y };
    });
    dragRef.current = {
      offsetX: world.x - position.x,
      offsetY: world.y - position.y,
      moved: false,
      last: { x: position.x, y: position.y },
      members,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  };

  const onPointerMove = (e: React.PointerEvent<Element>) => {
    const d = dragRef.current;
    if (!d) return;
    const world = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    // Raw grid-snapped target for the dragged node.
    let next = { x: snapToGrid(world.x - d.offsetX), y: snapToGrid(world.y - d.offsetY) };

    // Alignment guides — only for a single-node drag (a group move keeps the
    // selection's relative geometry, so per-node alignment would tear it).
    let guides: { x: number | null; y: number | null } = { x: null, y: null };
    if (d.members.length === 1 && allNodes) {
      const movingIds = new Set(d.members.map(m => m.id));
      const others = allNodes
        .filter(n => !movingIds.has(n.id))
        .map(n => n.position);
      const aligned = computeAlignmentSnap(next, others);
      next = aligned.position;
      guides = { x: aligned.guideX, y: aligned.guideY };
    }

    if (next.x === d.last.x && next.y === d.last.y) return;
    d.moved = true;
    d.last = next;
    if (!activeSheetId) return;
    setHarnessAlignGuides(guides.x, guides.y);
    // Translate every member by the delta the dragged node travelled (from
    // its own at-grab start). Write each override every frame — the harness
    // graph re-derives so the nodes + incident cables follow the cursor.
    const anchor = d.members.find(m => m.id === nodeId)!;
    const dx = next.x - anchor.startX;
    const dy = next.y - anchor.startY;
    const record: Record<string, Point> = {};
    for (const m of d.members) record[m.id] = { x: m.startX + dx, y: m.startY + dy };
    setHarnessNodePositions(activeSheetId, record);
  };

  const onPointerUp = (e: React.PointerEvent<Element>): boolean => {
    const d = dragRef.current;
    if (!d) return false;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    setHarnessAlignGuides(null, null);
    commitTx();
    return !d.moved;
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}
