import type { PlacedDevice, Wire, Point, NetLabel, Junction } from './types';
import { isJunctionKey, junctionIdFromKey } from './types';
import { computePinInfo, layoutDevice, OutwardDir } from './layout';
import { getSymbolDef } from './symbols';
import { routeWire } from './routing';

const HOP_RADIUS = 5;
const EPSILON    = 0.5;
/** Vertical clearance the auto-router keeps between a re-routed wire and the
 *  device body it's going around. A little more than ROUTE_STUB_LENGTH so
 *  stub tips don't graze the next device. */
const AVOID_PAD  = 20;

export interface WireEndpoints {
  from: Point;
  to: Point;
  fromDir?: OutwardDir;
  toDir?: OutwardDir;
}

export function getWireEndpoints(placedDevices: PlacedDevice[], wire: Wire): WireEndpoints | null {
  const from = resolveEndpoint(placedDevices, wire.fromPin);
  const to   = resolveEndpoint(placedDevices, wire.toPin);
  if (!from || !to) return null;
  return { from: from.point, to: to.point, fromDir: from.outwardDir, toDir: to.outwardDir };
}

interface ResolvedEndpoint { point: Point; outwardDir?: OutwardDir; }

// Net-label registry — the store registers the live `netLabels` array via
// `setNetLabelRegistry()` on every state update so wirePaths can resolve
// `#labelId` endpoints without taking a direct dependency on the store
// (which would create a circular import).
let netLabelRegistry: readonly NetLabel[] = [];
export function setNetLabelRegistry(labels: readonly NetLabel[]) {
  netLabelRegistry = labels;
}

// Junction registry — same pattern as the net-label registry. The store
// keeps the live `junctions` array here so wirePaths can resolve a
// `junction:<id>` endpoint to its world position without importing the
// store (circular import).
let junctionRegistry: readonly Junction[] = [];
export function setJunctionRegistry(junctions: readonly Junction[]) {
  junctionRegistry = junctions;
}
/** Resolve a `junction:<id>` endpoint key to its world position, or null
 *  when the junction id is unknown / the key isn't a junction key. Reads
 *  the live registry — used by the SVG exporter, which has no store access. */
export function resolveJunctionPos(key: string): Point | null {
  const id = junctionIdFromKey(key);
  if (!id) return null;
  const j = junctionRegistry.find(jj => jj.id === id);
  return j ? { x: j.position.x, y: j.position.y } : null;
}

// Shield-pin registry — populated by the ShieldBlock renderer on each
// render via `setShieldPinPos`. Stores world-space positions of the
// `pin`-termination dots so wires that endpoint at `#shield:<id>` can
// resolve to the correct point. Unlike net labels, the position depends
// on routed wire geometry, so it has to be sourced from the renderer
// rather than directly from store data.
const shieldPinRegistry = new Map<string, Point>();
export function setShieldPinPos(id: string, pos: Point | null) {
  if (pos === null) shieldPinRegistry.delete(id);
  else shieldPinRegistry.set(id, pos);
}
export function getShieldPinPos(id: string): Point | null {
  return shieldPinRegistry.get(id) ?? null;
}

/** Parse a wire endpoint key and resolve it to a world point (+ outward
 *  direction when it's a pin). Supports three key formats:
 *    "deviceId:pinId"     — a pin on a placed device
 *    "junction:<id>"      — a Junction entity (a tap/splice point)
 *    "#labelId"           — the flag tip of a net label
 *  Returns null on dangling references (caller skips rendering). */
function resolveEndpoint(placedDevices: PlacedDevice[], key: string): ResolvedEndpoint | null {
  const junctionId = junctionIdFromKey(key);
  if (junctionId) {
    const j = junctionRegistry.find(jj => jj.id === junctionId);
    return j ? { point: { x: j.position.x, y: j.position.y } } : null;
  }
  if (key.startsWith('#')) {
    const labelId = key.slice(1);
    const lbl = netLabelRegistry.find(n => n.id === labelId);
    if (!lbl) return null;
    const base = resolveEndpoint(placedDevices, lbl.attachedTo);
    if (!base) return null;
    const dx = lbl.offset?.dx ?? 0;
    const dy = lbl.offset?.dy ?? 0;
    return { point: { x: base.point.x + dx, y: base.point.y + dy } };
  }
  const [deviceId, pinId] = key.split(':');
  const pd = placedDevices.find(p =>
    p.deviceId === deviceId && p.connectors.some(c => c.pinIds.includes(pinId)));
  if (!pd) return null;
  const info = computePinInfo(pd, pinId);
  return info ? { point: info.point, outwardDir: info.outwardDir } : null;
}

interface Rect { x: number; y: number; width: number; height: number; }

/** Bounding rectangles of every device body on the given sheet. Pin stubs are
 *  NOT included — the router wants to treat body-only as the obstacle so a
 *  pin tip (which sits outside the body) doesn't register as a self-collision.
 *
 *  For schematic-symbol devices we use the SYMBOL's width/height rather than
 *  layoutDevice's — layoutDevice assumes a connector-block layout and ends up
 *  adding header + per-connector padding, which produces a much larger box
 *  than the symbol actually occupies (e.g. a 50-px-tall switch reports as
 *  ~150 px, creating invisible obstacle padding below it). */
function obstacleRects(placedDevices: PlacedDevice[], sheetId: string): Rect[] {
  const rects: Rect[] = [];
  for (const d of placedDevices) {
    if (d.sheetId !== sheetId) continue;
    const symDef = getSymbolDef(d.symbolType);
    const { width, height } = symDef
      ? { width: symDef.width, height: symDef.height }
      : layoutDevice(d);
    rects.push({ x: d.position.x, y: d.position.y, width, height });
  }
  return rects;
}

/** True if the axis-aligned segment strictly enters the rectangle (touching
 *  the edge doesn't count). We use a small epsilon so a segment running along
 *  a device's edge isn't flagged as crossing it. */
function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  const eps = 1;
  const sx0 = Math.min(a.x, b.x), sx1 = Math.max(a.x, b.x);
  const sy0 = Math.min(a.y, b.y), sy1 = Math.max(a.y, b.y);
  return sx1 > r.x + eps && sx0 < r.x + r.width  - eps
      && sy1 > r.y + eps && sy0 < r.y + r.height - eps;
}

function routeBlockers(points: Point[], rects: Rect[]): Rect[] {
  const hits: Rect[] = [];
  for (const r of rects) {
    for (let i = 0; i < points.length - 1; i++) {
      if (segmentHitsRect(points[i], points[i + 1], r)) {
        hits.push(r);
        break;
      }
    }
  }
  return hits;
}

/**
 * Decide the effective routing overrides for a wire. User-dragged values win;
 * otherwise, if the default route would cross a device body, substitute an
 * avoidance Y that takes the wire above or below the blocking devices.
 *
 * Separated from the polyline generation so the drag handles can be placed on
 * the ACTUAL wire path (otherwise handles for auto-avoided wires would sit on
 * the old pin Y and read as disconnected from the wire).
 */
function effectiveOverrides(ends: WireEndpoints, wire: Wire, obstacles: Rect[]) {
  const overrides = {
    midX: wire.midX, fromY: wire.fromY, toY: wire.toY,
    fromDir: ends.fromDir, toDir: ends.toDir,
    fromJogX: wire.fromJogX, toJogX: wire.toJogX,
  };
  // Auto-avoidance only replaces fromY/toY — a user drag on midX alone should
  // not suppress it (the middle vertical collapses anyway when fromY == toY,
  // so midX is visually a no-op on an around-the-device detour).
  const userCustomizedY = wire.fromY !== undefined || wire.toY !== undefined;
  if (userCustomizedY) return overrides;

  const defaultRoute = routeWire(ends.from, ends.to, overrides);
  const blockers = routeBlockers(defaultRoute, obstacles);
  if (blockers.length === 0) return overrides;

  // Single avoidance Y outside the union of all blocking devices. Pick
  // whichever side is closer to the average of the two endpoint Ys so the
  // detour stays short.
  const unionTop    = Math.min(...blockers.map(r => r.y));
  const unionBottom = Math.max(...blockers.map(r => r.y + r.height));
  const avgY = (ends.from.y + ends.to.y) / 2;
  const midBlockY = (unionTop + unionBottom) / 2;
  const goAbove = avgY < midBlockY;
  const avoidanceY = goAbove ? unionTop - AVOID_PAD : unionBottom + AVOID_PAD;

  return { ...overrides, fromY: avoidanceY, toY: avoidanceY };
}

function routeWireAvoiding(ends: WireEndpoints, wire: Wire, obstacles: Rect[]): Point[] {
  return routeWire(ends.from, ends.to, effectiveOverrides(ends, wire, obstacles));
}

/**
 * The concrete (midX, fromY, toY) the router will use for this wire after
 * resolving user overrides AND auto-avoidance. Consumers that draw drag
 * handles should place them using these values — raw pin Ys are wrong once
 * the wire has been auto-rerouted around a device.
 */
export function computeEffectiveRouting(placedDevices: PlacedDevice[], wire: Wire): {
  midX: number; fromY: number; toY: number;
} {
  const ends = getWireEndpoints(placedDevices,wire);
  if (!ends) return { midX: 0, fromY: 0, toY: 0 };
  const eff = effectiveOverrides(ends, wire, obstacleRects(placedDevices, wire.sheetId));
  return {
    midX:  eff.midX  ?? (ends.from.x + ends.to.x) / 2,
    fromY: eff.fromY ?? ends.from.y,
    toY:   eff.toY   ?? ends.to.y,
  };
}

interface Segment { from: Point; to: Point; horizontal: boolean; }

function toSegments(points: Point[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (a.x === b.x && a.y === b.y) continue;
    segs.push({ from: a, to: b, horizontal: a.y === b.y });
  }
  return segs;
}

export function buildWirePath(placedDevices: PlacedDevice[], wire: Wire, allWiresOnSheet: Wire[]): string {
  const ends = getWireEndpoints(placedDevices,wire);
  if (!ends) return '';

  const obstacles = obstacleRects(placedDevices, wire.sheetId);
  const myPoints = routeWireAvoiding(ends, wire, obstacles);
  const mySegs = toSegments(myPoints);

  const otherVerticals: Segment[] = [];
  for (const o of allWiresOnSheet) {
    if (o.id === wire.id) continue;
    const oe = getWireEndpoints(placedDevices,o);
    if (!oe) continue;
    const segs = toSegments(routeWireAvoiding(oe, o, obstacles));
    for (const s of segs) if (!s.horizontal) otherVerticals.push(s);
  }

  const parts: string[] = [];
  let first = true;
  for (const seg of mySegs) {
    if (first) {
      parts.push(`M ${seg.from.x} ${seg.from.y}`);
      first = false;
    }
    if (!seg.horizontal) {
      parts.push(`L ${seg.to.x} ${seg.to.y}`);
      continue;
    }

    const segMinX = Math.min(seg.from.x, seg.to.x);
    const segMaxX = Math.max(seg.from.x, seg.to.x);
    const y = seg.from.y;
    const crossXs: number[] = [];
    for (const v of otherVerticals) {
      const vMinY = Math.min(v.from.y, v.to.y);
      const vMaxY = Math.max(v.from.y, v.to.y);
      if (v.from.x <= segMinX + EPSILON || v.from.x >= segMaxX - EPSILON) continue;
      if (y <= vMinY + EPSILON || y >= vMaxY - EPSILON) continue;
      crossXs.push(v.from.x);
    }
    const dir = seg.to.x > seg.from.x ? 1 : -1;
    crossXs.sort((a, b) => dir * (a - b));

    for (const cx of crossXs) {
      const beforeX = cx - dir * HOP_RADIUS;
      const afterX  = cx + dir * HOP_RADIUS;
      parts.push(`L ${beforeX} ${y}`);
      const sweep = dir > 0 ? 0 : 1;
      parts.push(`A ${HOP_RADIUS} ${HOP_RADIUS} 0 0 ${sweep} ${afterX} ${y}`);
    }
    parts.push(`L ${seg.to.x} ${seg.to.y}`);
  }
  return parts.join(' ');
}

/** Compute the polyline of a wire (for junction re-projection and SVG export).
 *  Uses the same obstacle-aware routing as the on-canvas renderer so exports
 *  and junctions stay faithful to what the user sees. */
export function computeWirePath(placedDevices: PlacedDevice[], wire: Wire): Point[] {
  const ends = getWireEndpoints(placedDevices,wire);
  if (!ends) return [];
  return routeWireAvoiding(ends, wire, obstacleRects(placedDevices, wire.sheetId));
}

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
 *
 * Pure geometry — pulled out of `Wire.tsx` so the click handler can stay
 * focused on event plumbing.
 */
export function projectClickOntoWire(args: {
  click: Point;
  segments: ReadonlyArray<[number, number, number, number]>;
  hostWireId: string;
  allWiresOnSheet: ReadonlyArray<Wire>;
  grid?: number;
  snapRadius?: number;
}): Point {
  const { click, segments, hostWireId, allWiresOnSheet } = args;
  const grid = args.grid ?? 10;
  const snapRadius = args.snapRadius ?? 14;

  let bestX = click.x, bestY = click.y, bestDistSq = Infinity;
  for (const [x1, y1, x2, y2] of segments) {
    let x: number, y: number;
    if (y1 === y2) {
      // Horizontal segment — snap the free axis (x) to grid. We also snap
      // the fixed axis (y = y1) so that wires whose routed y happens to
      // sit a few px off-grid still produce a grid-aligned junction. The
      // small visual offset between the snapped junction and the wire is
      // negligible at the 10-px grid scale and keeps junctions visually
      // aligned with neighbouring pins.
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
      const j = junctionRegistry.find(jj => jj.id === jid);
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
