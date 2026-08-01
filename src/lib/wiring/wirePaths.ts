import type { Point, Wire, Junction } from './types';
import { isJunctionKey, junctionIdFromKey } from './types';

/**
 * Interactive click-geometry helpers for the wiring canvas.
 *
 * All ROUTING lives in `sheetRoutes.ts` now — a one-pass, registry-free
 * cache computed per state change. This module keeps only the pure
 * click-projection utilities used by <Wire>'s pointer handlers, and takes
 * every piece of state it needs as an explicit argument (the old
 * module-level net-label/junction/shield registries are gone).
 */

/**
 * Project a world-space click onto the nearest orthogonal segment of a wire's
 * routed path, with two layers of snap behaviour:
 *
 * 1. The free axis of the winning segment is snapped to the canvas grid so
 *    the resulting junction aligns with pin positions.
 * 2. If the raw click lands within `snapRadius` of an EXISTING junction the
 *    host wire already terminates at, the result snaps onto that exact
 *    junction position so multiple branches converge on the same dot rather
 *    than creating near-miss neighbours.
 */
export function projectClickOntoWire(args: {
  click: Point;
  segments: ReadonlyArray<[number, number, number, number]>;
  hostWireId: string;
  allWiresOnSheet: ReadonlyArray<Wire>;
  /** Live junction list — used for the junction-snap pass. */
  junctions: ReadonlyArray<Junction>;
  grid?: number;
  snapRadius?: number;
}): Point {
  const { click, segments, hostWireId, allWiresOnSheet, junctions } = args;
  const grid = args.grid ?? 10;
  const snapRadius = args.snapRadius ?? 14;

  let bestX = click.x, bestY = click.y, bestDistSq = Infinity;
  for (const [x1, y1, x2, y2] of segments) {
    let x: number, y: number;
    if (y1 === y2) {
      // Horizontal segment — snap the free axis (x) to grid. We also snap
      // the fixed axis (y = y1) so that wires whose routed y happens to
      // sit a few px off-grid still produce a grid-aligned junction.
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      x = Math.max(lo, Math.min(hi, Math.round(click.x / grid) * grid));
      y = Math.round(y1 / grid) * grid;
    } else if (x1 === x2) {
      // Vertical segment — mirror of the horizontal case.
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      y = Math.max(lo, Math.min(hi, Math.round(click.y / grid) * grid));
      x = Math.round(x1 / grid) * grid;
    } else {
      continue;
    }
    const dx = click.x - x, dy = click.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestX = x;
      bestY = y;
    }
  }

  // Junction snap pass: if the host wire already terminates at a Junction,
  // and the click lands near that junction's position, snap onto it so a
  // new branch converges on the same dot.
  let snapDistSq = snapRadius * snapRadius;
  const host = allWiresOnSheet.find(w => w.id === hostWireId);
  if (host) {
    for (const ep of [host.fromPin, host.toPin]) {
      if (!isJunctionKey(ep)) continue;
      const jid = junctionIdFromKey(ep);
      const j = junctions.find(jj => jj.id === jid);
      if (!j) continue;
      const dx = click.x - j.position.x, dy = click.y - j.position.y;
      const dsq = dx * dx + dy * dy;
      if (dsq < snapDistSq) {
        snapDistSq = dsq;
        bestX = j.position.x;
        bestY = j.position.y;
      }
    }
  }

  return { x: bestX, y: bestY };
}

/** Closest point on a polyline (list of waypoints) to the given world point. */
export function closestPointOnPolyline(polyline: Point[], target: Point): Point {
  if (polyline.length < 2) return target;
  let best = polyline[0];
  let bestD = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i], b = polyline[i + 1];
    const p = projectOntoSegment(a, b, target);
    const dx = p.x - target.x, dy = p.y - target.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function projectOntoSegment(a: Point, b: Point, p: Point): Point {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return a;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t };
}
