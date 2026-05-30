import type { PlacedDevice, ConnectorInstance, Point, Orientation, HarnessGraph, Bundle } from './types';
import { isJunctionKey, junctionIdFromKey } from './types';

/**
 * Harness-view geometry helpers.
 *
 * The harness topology itself is derived by `deriveHarness`
 * (`deriveHarness.ts`) into a `HarnessGraph`. This module keeps only the
 * pure geometry the renderer needs — cable-curve math, the harness
 * device-block layout constants, connector-port resolution, and the
 * node-id helpers shared with `deriveHarness`.
 */

/** Layout constants shared between the harness device block renderer and the
 *  bundle renderer so connector ports line up exactly with the rows the block
 *  draws. Kept here (with the rest of the harness model) so non-render code
 *  paths can compute port positions without importing React components. */
export const HARNESS_BLOCK_HEADER_H = 24;
export const HARNESS_BLOCK_ROW_H    = 18;

/** Horizontal pitch of one connector column when the strip runs along a
 *  horizontal edge (90° / 270°). */
export const HARNESS_BLOCK_COL_W = 44;

/** Padding added beyond the connector strip on the block's far edge. */
export const HARNESS_BLOCK_PAD = 8;

/**
 * Bounding box + connector dock positions for a device block at a given
 * orientation.
 *
 * `0°`/`180°` are the tall one-row-per-connector layout (connector strip on
 * the left or right edge). `90°`/`270°` are the wide one-column-per-connector
 * layout (connector strip on the top or bottom edge).
 *
 * All coordinates are **block-local** (origin at the block's top-left corner).
 * Translate by `placement.position` to get world space — see
 * `connectorDockPoints`.
 */
export interface HarnessBlockLayout {
  /** Block bounding box; top-left is at placement.position. */
  width: number;
  height: number;
  /** Edge the connector strip + ports sit on. */
  connectorEdge: 'left' | 'right' | 'top' | 'bottom';
  /** Edge the header bar sits on. */
  headerEdge: 'top' | 'bottom';
  /** Local (block-relative) dock point per logical connector name, in the
   *  same order as `logicalConnectorsOf`. */
  localDocks: Map<string, Point>;
}

/**
 * Block geometry for a placement at a given orientation. `0°`/`180°` keep
 * the tall one-row-per-connector block; `90°`/`270°` are a wide
 * one-column-per-connector block. Header text + connector text stay
 * horizontal throughout (the *content* never physically rotates — only the
 * edge the connector strip appears on changes).
 *
 * This is the single source of truth for connector port positions. Both the
 * harness derivation and the device-block renderer call it so they can never
 * drift apart.
 */
export function harnessBlockLayout(placement: PlacedDevice, orientation: Orientation, connectorOrder?: string[]): HarnessBlockLayout {
  const logConns = orderedLogicalConnectors(placement, connectorOrder);
  const n = Math.max(logConns.length, 1);

  if (orientation === 0 || orientation === 180) {
    // ── Vertical strip — one row per connector ──────────────────────
    const width  = placement.width;
    const height = HARNESS_BLOCK_HEADER_H + n * HARNESS_BLOCK_ROW_H + HARNESS_BLOCK_PAD;
    const connectorEdge: 'left' | 'right' = orientation === 0 ? 'left' : 'right';
    const localDocks = new Map<string, Point>();
    logConns.forEach((lc, i) => {
      localDocks.set(lc.name, {
        x: connectorEdge === 'left' ? 0 : width,
        y: HARNESS_BLOCK_HEADER_H + i * HARNESS_BLOCK_ROW_H + HARNESS_BLOCK_ROW_H / 2,
      });
    });
    return { width, height, connectorEdge, headerEdge: 'top', localDocks };
  }

  // ── Horizontal strip — one column per connector ─────────────────
  // orientation === 90 || orientation === 270
  const width  = Math.max(placement.width, n * HARNESS_BLOCK_COL_W + HARNESS_BLOCK_PAD);
  const height = HARNESS_BLOCK_HEADER_H + HARNESS_BLOCK_ROW_H + HARNESS_BLOCK_PAD;
  const connectorEdge: 'top' | 'bottom' = orientation === 90 ? 'top' : 'bottom';
  // Header is on the OPPOSITE edge to the connector strip.
  const headerEdge: 'top' | 'bottom'   = orientation === 90 ? 'bottom' : 'top';
  const localDocks = new Map<string, Point>();
  logConns.forEach((lc, i) => {
    localDocks.set(lc.name, {
      x: HARNESS_BLOCK_PAD / 2 + i * HARNESS_BLOCK_COL_W + HARNESS_BLOCK_COL_W / 2, // col centre = symmetric left inset (half block padding) + col index × pitch + half pitch
      y: connectorEdge === 'top' ? 0 : height,
    });
  });
  return { width, height, connectorEdge, headerEdge, localDocks };
}

/**
 * World-space dock point per logical connector name — `harnessBlockLayout`'s
 * local docks translated by the placement position.
 *
 * The cable docks here and the device block draws the connector port here,
 * so they never drift apart regardless of orientation.
 */
export function connectorDockPoints(placement: PlacedDevice, orientation: Orientation, connectorOrder?: string[]): Map<string, Point> {
  const layout = harnessBlockLayout(placement, orientation, connectorOrder);
  const out = new Map<string, Point>();
  for (const [name, local] of layout.localDocks) {
    out.set(name, {
      x: placement.position.x + local.x,
      y: placement.position.y + local.y,
    });
  }
  return out;
}

/**
 * Geometry helpers for a cable rendered as a polyline. Each cable is a
 * polyline from a `start` Point through zero or more interior `bends` to an
 * `end` Point. Once built, the helper exposes everything the renderer needs:
 * total arclength, a point/tangent at fraction t ∈ [0,1], the polyline slice
 * spanning a sub-range [s, e], and the closest point on the cable to an
 * arbitrary world-space cursor.
 */
export interface CablePath {
  /** Ordered Points along the polyline. Always `length >= 2`. */
  pathPoints: Point[];
  /** Length of each segment between consecutive `pathPoints`. */
  segLens: number[];
  /** Sum of `segLens`. */
  totalLen: number;
  /** Cumulative arclength fraction at each `pathPoints[i]`. */
  pointArcs: number[];
  /** World coord + unit tangent at fraction `t` of total arclength. */
  pointOnPath(t: number): { x: number; y: number; dirX: number; dirY: number };
  /** Polyline points for the slice spanning `[s, e]` — start point, any
   *  interior `pathPoints` whose arclength fraction falls strictly inside
   *  `(s, e)`, and end point. So slices follow the cable's bends correctly. */
  sectionPolyline(s: number, e: number): Point[];
  /** Closest point on the polyline to `(px, py)`, returned along with its
   *  arclength fraction and the squared distance. Walks every segment. */
  closestPoint(px: number, py: number): { x: number; y: number; t: number; distSq: number };
}

export function buildCablePath(pathPoints: Point[]): CablePath {
  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const dx = pathPoints[i + 1].x - pathPoints[i].x;
    const dy = pathPoints[i + 1].y - pathPoints[i].y;
    segLens.push(Math.hypot(dx, dy));
    totalLen += segLens[i];
  }
  const safeTotal = totalLen || 1;
  const pointArcs: number[] = [0];
  {
    let acc = 0;
    for (const L of segLens) {
      acc += L;
      pointArcs.push(acc / safeTotal);
    }
  }
  function pointOnPath(t: number) {
    const target = Math.max(0, Math.min(1, t)) * safeTotal;
    let cumul = 0;
    for (let i = 0; i < segLens.length; i++) {
      const L = segLens[i];
      if (cumul + L >= target || i === segLens.length - 1) {
        const local = L > 0 ? (target - cumul) / L : 0;
        const a = pathPoints[i];
        const b = pathPoints[i + 1];
        const x = a.x + (b.x - a.x) * local;
        const y = a.y + (b.y - a.y) * local;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x, y, dirX: (b.x - a.x) / len, dirY: (b.y - a.y) / len };
      }
      cumul += L;
    }
    const a = pathPoints[pathPoints.length - 2];
    const b = pathPoints[pathPoints.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: b.x, y: b.y, dirX: (b.x - a.x) / len, dirY: (b.y - a.y) / len };
  }
  function sectionPolyline(s: number, e: number): Point[] {
    const out: Point[] = [];
    const startInfo = pointOnPath(s);
    out.push({ x: startInfo.x, y: startInfo.y });
    for (let i = 1; i < pathPoints.length - 1; i++) {
      const frac = pointArcs[i];
      if (frac > s + 1e-9 && frac < e - 1e-9) out.push(pathPoints[i]);
    }
    const endInfo = pointOnPath(e);
    out.push({ x: endInfo.x, y: endInfo.y });
    return out;
  }
  function closestPoint(px: number, py: number) {
    let bestX = pathPoints[0].x;
    let bestY = pathPoints[0].y;
    let bestT = 0;
    let bestDistSq = Infinity;
    let cumul = 0;
    for (let i = 0; i < segLens.length; i++) {
      const a = pathPoints[i];
      const b = pathPoints[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      const tRaw = L2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / L2 : 0;
      const t = Math.max(0, Math.min(1, tRaw));
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      const d2 = (px - cx) ** 2 + (py - cy) ** 2;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestX = cx;
        bestY = cy;
        const segLen = segLens[i];
        bestT = safeTotal > 0 ? (cumul + t * segLen) / safeTotal : 0;
      }
      cumul += segLens[i];
    }
    return { x: bestX, y: bestY, t: bestT, distSq: bestDistSq };
  }
  return { pathPoints, segLens, totalLen, pointArcs, pointOnPath, sectionPolyline, closestPoint };
}

/**
 * Build a cable's polyline from its start, end, user bend points, and child
 * taps.
 *
 * Waypoints are kept in their STORED ARRAY ORDER — that order is the user's
 * intent and the only stable source of truth.
 *
 * Child taps — points that bend the cable through a fixed world point —
 * carry no array order, so they're interleaved by projecting each onto the
 * waypoint-ordered polyline and splicing it in at that arclength.
 */
export function orderedCablePathPoints(
  start: Point,
  end: Point,
  ownWaypoints: Point[],
  childTaps: Point[],
): Point[] {
  if (childTaps.length === 0) {
    return [start, ...ownWaypoints, end];
  }
  const base = buildCablePath([start, ...ownWaypoints, end]);
  const bends: { point: Point; arc: number }[] = [];
  ownWaypoints.forEach((wp, i) => bends.push({ point: wp, arc: base.pointArcs[i + 1] }));
  for (const tap of childTaps) {
    bends.push({ point: tap, arc: base.closestPoint(tap.x, tap.y).t });
  }
  bends.sort((a, b) => a.arc - b.arc);
  return [start, ...bends.map(b => b.point), end];
}

/**
 * The harness grid pitch — matches the schematic canvas's 10-unit grid
 * (`useGroupDrag` / `useHarnessNodeDrag`). Node drags and cable bend-point
 * drags snap to this so harness geometry stays clean and aligned.
 */
export const HARNESS_GRID = 10;

/** Default harness drawing scale — millimetres of cable per canvas unit.
 *  With the 10-unit grid this is 1 grid square = 100 mm. */
export const DEFAULT_MM_PER_UNIT = 10;

/** Snap a single coordinate to the nearest `HARNESS_GRID` multiple. */
export function snapToGrid(v: number): number {
  return Math.round(v / HARNESS_GRID) * HARNESS_GRID;
}

/** Snap a point to the harness grid (both axes). */
export function snapPointToGrid(p: Point): Point {
  return { x: snapToGrid(p.x), y: snapToGrid(p.y) };
}

/**
 * Phase 4 — alignment guides for harness-node dragging.
 *
 * Given the dragged node's candidate position and the positions of the other
 * harness nodes, find the nearest neighbour x and y within `threshold`. When
 * one is found the dragged node snaps to that coordinate and a guide line is
 * surfaced so the user sees what they aligned to.
 *
 * Pure + deterministic — the drag hook calls it per pointer-move.
 */
export interface AlignmentResult {
  /** The position to commit — snapped to any neighbour coordinate within range. */
  position: Point;
  /** Neighbour x to draw a vertical guide at, or null when none is in range. */
  guideX: number | null;
  /** Neighbour y to draw a horizontal guide at, or null when none is in range. */
  guideY: number | null;
}

export function computeAlignmentSnap(
  candidate: Point,
  others: Point[],
  threshold = 6,
): AlignmentResult {
  let bestX: number | null = null;
  let bestXd = threshold;
  let bestY: number | null = null;
  let bestYd = threshold;
  for (const o of others) {
    const dx = Math.abs(o.x - candidate.x);
    if (dx <= bestXd) { bestXd = dx; bestX = o.x; }
    const dy = Math.abs(o.y - candidate.y);
    if (dy <= bestYd) { bestYd = dy; bestY = o.y; }
  }
  return {
    position: {
      x: bestX !== null ? bestX : candidate.x,
      y: bestY !== null ? bestY : candidate.y,
    },
    guideX: bestX,
    guideY: bestY,
  };
}

/**
 * Insert a new bend point into a waypoint array at the slot that keeps the
 * rendered polyline sensible: the slot of the polyline segment the new point
 * is physically nearest to.
 */
export function insertWaypointAtNearestSegment(
  existing: Point[],
  newPt: Point,
  start: Point,
  end: Point,
): Point[] {
  const polyline = [start, ...existing, end];
  let bestSeg = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0
      ? Math.max(0, Math.min(1, ((newPt.x - a.x) * dx + (newPt.y - a.y) * dy) / len2))
      : 0;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const distSq = (newPt.x - cx) ** 2 + (newPt.y - cy) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestSeg = i;
    }
  }
  const out = existing.slice();
  out.splice(bestSeg, 0, newPt);
  return out;
}

/** A schematic connector instance may be split across L/R sides for layout
 *  readability. In the harness view we want one row per *physical* connector
 *  — the L/R views collapse into a single entry keyed by logicalConnectorName.
 *  Order follows first appearance in placement.connectors. */
export interface LogicalConnector {
  /** Physical connector name, e.g. "D15". */
  name: string;
  /** Total pin count across all instances (L + R + …). */
  pinCount: number;
  /** All ConnectorInstances belonging to this logical connector. */
  instances: ConnectorInstance[];
}

export function logicalConnectorsOf(placement: PlacedDevice): LogicalConnector[] {
  const order: string[] = [];
  const byName = new Map<string, LogicalConnector>();
  for (const c of placement.connectors) {
    const ln = c.logicalConnectorName ?? c.name;
    let entry = byName.get(ln);
    if (!entry) {
      entry = { name: ln, pinCount: 0, instances: [] };
      byName.set(ln, entry);
      order.push(ln);
    }
    entry.pinCount += c.pinIds.length;
    entry.instances.push(c);
  }
  return order.map(n => byName.get(n)!);
}

/** A placement's logical connectors in the user-set order. Names in `order`
 *  the device no longer has are ignored; connectors not named in `order` are
 *  appended in their natural `logicalConnectorsOf` order — so editing the
 *  device's connectors never breaks a saved order. */
export function orderedLogicalConnectors(
  placement: PlacedDevice,
  order?: string[],
): LogicalConnector[] {
  const lcs = logicalConnectorsOf(placement);
  if (!order || order.length === 0) return lcs;
  const byName = new Map(lcs.map(lc => [lc.name, lc]));
  const out: LogicalConnector[] = [];
  for (const name of order) {
    const lc = byName.get(name);
    if (lc) { out.push(lc); byName.delete(name); }
  }
  for (const lc of lcs) if (byName.has(lc.name)) out.push(lc);
  return out;
}

// ── Harness graph node-id helpers ───────────────────────────────────
//
// Shared with `deriveHarness` so wire-endpoint keys resolve to the same
// `HarnessNode` ids the derivation produces.

/** From a pin key like 'U1:C1-P3', return the connector id 'U1:C1'.
 *  Returns null for non-pin keys ('#labelId', 'junction:<id>').
 *
 *  ASSUMPTION: the pin-number suffix is the LAST `-`-delimited segment of the
 *  key, so splitting on `lastIndexOf('-')` strips exactly that suffix. This
 *  holds because the pin-id builder (`pinIdFor`) always appends `-P<number>`
 *  last, and the connector name + device id are slugified — any other `-`
 *  characters belong to those earlier segments and are kept. If the suffix
 *  format ever changes, this split must change with it. */
function connectorIdFromPin(pinKey: string): string | null {
  if (pinKey.startsWith('#') || isJunctionKey(pinKey)) return null;
  const dashIdx = pinKey.lastIndexOf('-');
  return dashIdx > 0 ? pinKey.slice(0, dashIdx) : pinKey;
}

/** Harness graph-node id for a junction endpoint key (`junction:<id>`).
 *  Identity is explicit — the node id is just `J:<id>`, no coordinate
 *  rounding. Returns null for non-junction keys. */
export function junctionNodeId(pinKey: string): string | null {
  const id = junctionIdFromKey(pinKey);
  return id ? `J:${id}` : null;
}

/** True when `id` is a junction node id produced by `junctionNodeId`. */
export function isJunctionNodeId(id: string): boolean {
  return id.startsWith('J:');
}

/** Harness-node id for the branch point that fans out for `connectorNodeId`.
 *  The inverse relationship is read with `isBranchPointNodeId`. */
export function branchPointNodeId(connectorNodeId: string): string {
  return `bp:${connectorNodeId}`;
}

/** True when `id` is a branch-point node id produced by `branchPointNodeId`. */
export function isBranchPointNodeId(id: string): boolean {
  return id.startsWith('bp:');
}

/** Classify a bundle-ENDPOINT node id. Bundle endpoints are only ever
 *  connector / splice / branchPoint nodes — a `component` node is never a
 *  bundle endpoint, so its id is never passed here. */
export function harnessNodeIdKind(id: string): 'connector' | 'splice' | 'branchPoint' {
  if (isJunctionNodeId(id)) return 'splice';
  if (isBranchPointNodeId(id)) return 'branchPoint';
  return 'connector';
}

/** Assemble a `connector` harness-node id from a placement id + logical
 *  connector name. The inverse of `splitConnectorNodeId`. */
export function connectorNodeId(placementId: string, connector: string): string {
  return `${placementId}:${connector}`;
}

/** Split a `connector` harness-node id back into [placementId, connector].
 *  The placement id never contains ':', so the FIRST colon is the boundary. */
export function splitConnectorNodeId(id: string): [string, string] {
  const i = id.indexOf(':');
  return i < 0 ? [id, ''] : [id.slice(0, i), id.slice(i + 1)];
}

/** Resolve a wire-endpoint key to a harness graph-node id:
 *    'U1:C1-P3'      → 'U1:C1'  (connector)
 *    'junction:<id>' → 'J:<id>' (junction)
 *    '#labelId'      → null     (label — grouped at net level, not a node) */
export function endpointNodeId(pinKey: string): string | null {
  if (isJunctionKey(pinKey)) return junctionNodeId(pinKey);
  if (pinKey.startsWith('#')) return null;
  return connectorIdFromPin(pinKey);
}

// ── Smooth cable geometry (splice-cad style) ────────────────────────────────
//
// Two helpers that replace the old hard-right-angle polylines:
//   `cableCurvePath`   — SVG path `d` string (used by the renderer).
//   `sampleCableCurve` — Polyline approximation (used for hit-testing /
//                        label placement / nearest-segment math).
//
// Both are built on the same internal span representation so they can never
// drift apart.

/** Number of evenly-spaced `t` samples taken per cubic-Bézier span when
 *  flattening a curve to a polyline. 16 gives sub-pixel accuracy at typical
 *  harness canvas scales while keeping the point count manageable. */
const CURVE_SAMPLES_PER_SPAN = 16;

/** Catmull-Rom to cubic Bézier tension factor (standard uniform parameterisation). */
const CATMULL_ROM_TENSION = 1 / 6;

/**
 * Evaluate the cubic Bézier defined by four control points at parameter `t`.
 * Uses the explicit Bernstein polynomial form.
 */
function evalCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2  = t * t;
  const t3  = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

/**
 * Build the list of cubic-Bézier spans for a cable running from `start`
 * through optional `waypoints` to `end`.
 *
 * No waypoints → one span, a single cubic whose control points sit at the
 * horizontal midpoint x of the two endpoints (the splice-cad look):
 *   cp1 = { x: mid, y: start.y }
 *   cp2 = { x: mid, y: end.y   }
 *
 * With waypoints → Catmull-Rom spline through pts = [start, ...waypoints,
 * end]. Each span between consecutive control points is converted to a cubic
 * Bézier using the standard formula (tension = 1/6). End tangents are clamped
 * by treating the phantom neighbour as the real endpoint itself.
 *
 * Returns an array of spans, each span carrying { p0, cp1, cp2, p3 } — the
 * four points of one cubic Bézier. (p0 / p3 are the span's endpoints; cp1 /
 * cp2 are the Bézier control points.)
 */
function buildCurveSpans(
  start: Point,
  end: Point,
  waypoints?: Point[],
): Array<{ p0: Point; cp1: Point; cp2: Point; p3: Point }> {
  if (!waypoints || waypoints.length === 0) {
    // Single cubic — control points at horizontal midpoint x.
    const midX = (start.x + end.x) / 2;
    return [{
      p0:  start,
      cp1: { x: midX, y: start.y },
      cp2: { x: midX, y: end.y   },
      p3:  end,
    }];
  }

  // Catmull-Rom → cubic Bézier conversion.
  const pts = [start, ...waypoints, end];
  const spans: Array<{ p0: Point; cp1: Point; cp2: Point; p3: Point }> = [];

  for (let i = 0; i < pts.length - 1; i++) {
    // Neighbours: clamp phantom neighbours at the start/end.
    const prev  = pts[i - 1] ?? pts[i];     // phantom before first span = cur
    const cur   = pts[i];
    const next  = pts[i + 1];
    const after = pts[i + 2] ?? pts[i + 1]; // phantom after last span  = next

    // Standard Catmull-Rom → Bézier control-point formula.
    const cp1: Point = {
      x: cur.x + (next.x - prev.x) * CATMULL_ROM_TENSION,
      y: cur.y + (next.y - prev.y) * CATMULL_ROM_TENSION,
    };
    const cp2: Point = {
      x: next.x - (after.x - cur.x) * CATMULL_ROM_TENSION,
      y: next.y - (after.y - cur.y) * CATMULL_ROM_TENSION,
    };
    spans.push({ p0: cur, cp1, cp2, p3: next });
  }
  return spans;
}

/**
 * SVG path `d` string for a smooth cable from `start` to `end` through
 * optional `waypoints`. No waypoints → a single cubic Bézier whose control
 * points sit at the horizontal midpoint x of the two endpoints, giving gentle
 * roughly-horizontal tangents (the splice-cad look). With waypoints → a
 * smooth Catmull-Rom spline through start → waypoints → end.
 */
export function cableCurvePath(start: Point, end: Point, waypoints?: Point[]): string {
  const spans = buildCurveSpans(start, end, waypoints);
  // Emit M for the very first point, then one C command per span.
  const parts: string[] = [`M ${spans[0].p0.x},${spans[0].p0.y}`];
  for (const { cp1, cp2, p3 } of spans) {
    parts.push(`C ${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${p3.x},${p3.y}`);
  }
  return parts.join(' ');
}

/**
 * Flatten the same curve to a polyline. Used for hit-testing, label placement
 * and nearest-segment math — geometry that needs a polyline. Always starts at
 * `start` and ends at `end`.
 *
 * Each span is sampled at `CURVE_SAMPLES_PER_SPAN` evenly-spaced `t` values.
 * Consecutive duplicate points are dropped. The returned array's first element
 * is set to `start` and the last to `end` exactly (not sampled approximations).
 */
export function sampleCableCurve(start: Point, end: Point, waypoints?: Point[]): Point[] {
  const spans = buildCurveSpans(start, end, waypoints);
  const pts: Point[] = [];

  for (let s = 0; s < spans.length; s++) {
    const { p0, cp1, cp2, p3 } = spans[s];
    // For all spans except the last, sample t ∈ [0, 1) to avoid duplicating
    // the shared endpoint with the next span's t=0.
    const isLast = s === spans.length - 1;
    const limit  = isLast ? CURVE_SAMPLES_PER_SPAN + 1 : CURVE_SAMPLES_PER_SPAN; // inclusive of t=1 only on last span

    for (let k = 0; k < limit; k++) {
      const t = k / CURVE_SAMPLES_PER_SPAN;
      const pt = evalCubicBezier(p0, cp1, cp2, p3, t);
      // Drop consecutive duplicates (degenerate spans).
      const prev = pts[pts.length - 1];
      if (!prev || prev.x !== pt.x || prev.y !== pt.y) {
        pts.push(pt);
      }
    }
  }

  // Guarantee exact start / end values regardless of floating-point drift.
  if (pts.length === 0) return [start, end];
  pts[0] = start;
  pts[pts.length - 1] = end;
  // Ensure at minimum two points.
  if (pts.length < 2) return [start, end];
  return pts;
}

/**
 * Geometric length of a bundle's cable, in millimetres: the arc length of its
 * rendered curve (through any waypoints) × `mmPerUnit`. Returns 0 when either
 * endpoint node is missing from the graph.
 */
export function bundleGeometricLengthMm(
  bundle: Bundle,
  graph: HarnessGraph,
  mmPerUnit: number,
): number {
  const a = graph.nodes.find(n => n.id === bundle.endpoints[0]);
  const b = graph.nodes.find(n => n.id === bundle.endpoints[1]);
  if (!a || !b) return 0;
  const poly = sampleCableCurve(a.position, b.position, bundle.waypoints);
  let units = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    units += Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y);
  }
  return units * mmPerUnit;
}

/**
 * The connected harness tree containing `seedBundleId` — every bundle id and
 * node id reachable from it. A BFS over the `HarnessGraph` (nodes joined by
 * bundles). The seed bundle absent from the graph → empty arrays.
 */
export function harnessTreeOf(
  seedBundleId: string,
  graph: HarnessGraph,
): { bundleIds: string[]; nodeIds: string[] } {
  const seed = graph.bundles.find(b => b.id === seedBundleId);
  if (!seed) return { bundleIds: [], nodeIds: [] };
  // Adjacency: node id → incident bundles.
  const incident = new Map<string, Bundle[]>();
  for (const b of graph.bundles) {
    for (const ep of b.endpoints) {
      const list = incident.get(ep) ?? [];
      list.push(b);
      incident.set(ep, list);
    }
  }
  const bundleIds = new Set<string>();
  const nodeIds = new Set<string>();
  const queue: string[] = [...seed.endpoints];
  seed.endpoints.forEach(ep => nodeIds.add(ep));
  bundleIds.add(seed.id);
  while (queue.length) {
    const node = queue.shift()!;
    for (const b of incident.get(node) ?? []) {
      bundleIds.add(b.id);
      for (const ep of b.endpoints) {
        if (!nodeIds.has(ep)) { nodeIds.add(ep); queue.push(ep); }
      }
    }
  }
  // A connector node belongs to a component (device) block — add that
  // component node's id (the placement id) so the harness tree includes
  // its devices. Splice (J:…) / branchPoint (bp:…) ids have no component.
  for (const id of Array.from(nodeIds)) {
    if (!isJunctionNodeId(id) && !isBranchPointNodeId(id)) {
      nodeIds.add(splitConnectorNodeId(id)[0]);
    }
  }
  return {
    bundleIds: Array.from(bundleIds).sort(),
    nodeIds: Array.from(nodeIds).sort(),
  };
}
