import type { PlacedDevice, Wire, Point, NetLabel, Junction, Shield } from './types';
import { junctionIdFromKey } from './types';
import { computePinInfo, layoutDevice, OutwardDir } from './layout';
import { getSymbolDef } from './symbols';
import { routeWire } from './routing';

/**
 * One-pass routing cache for a whole wiring project.
 *
 * Previously every <Wire> component re-routed EVERY other wire on its sheet
 * per render just to find hop crossings — O(n²) route computations per frame,
 * re-run continuously while dragging. This module routes each wire exactly
 * once per state change and computes all crossings in a single pass over the
 * cached segments. Wire/ShieldBlock/export all read from the same result, so
 * the editor and every export are guaranteed to agree.
 *
 * It is also registry-free: net labels, junctions, and shields are explicit
 * inputs instead of module-level mutable state, which removes the hidden
 * "store must register arrays before anything routes" temporal coupling.
 */

const HOP_RADIUS = 5;
const EPSILON    = 0.5;
/** Vertical clearance the auto-router keeps between a re-routed wire and the
 *  device body it's going around. */
const AVOID_PAD  = 20;

// Shield geometry constants — shared with ShieldBlock.tsx and the SVG
// exporter so the on-canvas shield, the exported shield, and the routed
// position of `#shield:<id>` drain-wire endpoints all agree.
export const SHIELD_PAD  = 12;
export const SHIELD_STEM = 12;
/** Offset of the pin-termination dot below the stem's bottom end. */
export const SHIELD_PIN_DROP = 4;

export interface RouteContext {
  placedDevices: PlacedDevice[];
  wires: Wire[];
  netLabels: readonly NetLabel[];
  junctions: readonly Junction[];
  shields?: readonly Shield[];
}

export interface WireEndpoints {
  from: Point;
  to: Point;
  fromDir?: OutwardDir;
  toDir?: OutwardDir;
}

export interface WireRoute {
  wire: Wire;
  ends: WireEndpoints;
  /** Routed orthogonal polyline (no hop arcs). */
  points: Point[];
  /** Effective routing values after user overrides + auto-avoidance —
   *  where drag handles must sit. */
  eff: { midX: number; fromY: number; toY: number };
  /** SVG path string WITH hop arcs over crossing wires. */
  pathD: string;
}

export interface SheetRoutesResult {
  /** wireId → route. Wires with unresolvable endpoints are absent. */
  routes: Map<string, WireRoute>;
  /** shieldId → world position of its pin-termination dot (only shields
   *  with termination 'pin'). */
  shieldPinPos: Map<string, Point>;
  /** Resolve any endpoint key to a world point using this result's indexes.
   *  Useful for consumers (export bbox, net-label flags) that need ad-hoc
   *  resolution without re-deriving the indexes. */
  resolveEndpoint: (key: string) => Point | null;
}

interface Rect { x: number; y: number; width: number; height: number; }
interface Segment { from: Point; to: Point; horizontal: boolean; }
interface VSeg { x: number; y0: number; y1: number; wireId: string; }

function toSegments(points: Point[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (a.x === b.x && a.y === b.y) continue;
    segs.push({ from: a, to: b, horizontal: a.y === b.y });
  }
  return segs;
}

function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  const eps = 1;
  const sx0 = Math.min(a.x, b.x), sx1 = Math.max(a.x, b.x);
  const sy0 = Math.min(a.y, b.y), sy1 = Math.max(a.y, b.y);
  return sx1 > r.x + eps && sx0 < r.x + r.width  - eps
      && sy1 > r.y + eps && sy0 < r.y + r.height - eps;
}

/** Sample a routed polyline's y at the given world x. Used by shields to
 *  find where their member wires run. Falls back to the nearer endpoint's y
 *  when x is outside the path's range. */
export function sampleWireYAt(path: Point[], targetX: number): number | null {
  if (path.length < 2) return null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const xLo = Math.min(a.x, b.x), xHi = Math.max(a.x, b.x);
    if (targetX < xLo || targetX > xHi) continue;
    if (a.x === b.x) continue;
    const t = (targetX - a.x) / (b.x - a.x);
    return a.y + t * (b.y - a.y);
  }
  const first = path[0], last = path[path.length - 1];
  return Math.abs(targetX - first.x) <= Math.abs(targetX - last.x) ? first.y : last.y;
}

/** Vertical span of a shield's stadium over the given member-wire polylines.
 *  Shared by ShieldBlock, the exporter, and the drain-pin position math. */
export function shieldSpan(
  shield: Shield,
  routes: ReadonlyMap<string, WireRoute>,
): { top: number; bottom: number; midX: number } | null {
  const midX = (shield.xStart + shield.xEnd) / 2;
  const ys: number[] = [];
  for (const wid of shield.wireIds) {
    const r = routes.get(wid);
    if (!r) continue;
    const y = sampleWireYAt(r.points, midX);
    if (y !== null) ys.push(y);
  }
  if (ys.length === 0) return null;
  return { top: Math.min(...ys) - SHIELD_PAD, bottom: Math.max(...ys) + SHIELD_PAD, midX };
}

export function computeSheetRoutes(ctx: RouteContext): SheetRoutesResult {
  const { placedDevices, wires, netLabels, junctions } = ctx;
  const shields = ctx.shields ?? [];

  // ── Indexes (built once) ─────────────────────────────────────────────
  // Pin index. A pin appears on at most one placement ("each pin on one
  // sheet" invariant), so deviceId:pinId is a unique key.
  const pinIndex = new Map<string, { point: Point; outwardDir?: OutwardDir }>();
  for (const pd of placedDevices) {
    for (const c of pd.connectors) {
      for (const pinId of c.pinIds) {
        const info = computePinInfo(pd, pinId);
        if (info) pinIndex.set(`${pd.deviceId}:${pinId}`, { point: info.point, outwardDir: info.outwardDir });
      }
    }
  }
  const junctionIndex = new Map<string, Point>();
  for (const j of junctions) junctionIndex.set(j.id, { x: j.position.x, y: j.position.y });
  const labelIndex = new Map<string, NetLabel>();
  for (const l of netLabels) labelIndex.set(l.id, l);

  const shieldPinPos = new Map<string, Point>();

  /** Resolve an endpoint key to a world point (+ outward dir for pins).
   *  `#shield:` keys resolve only after phase A has populated shieldPinPos. */
  function resolve(key: string): { point: Point; outwardDir?: OutwardDir } | null {
    const junctionId = junctionIdFromKey(key);
    if (junctionId) {
      const p = junctionIndex.get(junctionId);
      return p ? { point: p } : null;
    }
    if (key.startsWith('#shield:')) {
      const p = shieldPinPos.get(key.slice('#shield:'.length));
      return p ? { point: p } : null;
    }
    if (key.startsWith('#')) {
      const lbl = labelIndex.get(key.slice(1));
      if (!lbl) return null;
      // Labels anchor to a pin or a junction — resolve that base, then apply
      // the flag's drag offset.
      const base = resolve(lbl.attachedTo);
      if (!base) return null;
      return { point: { x: base.point.x + (lbl.offset?.dx ?? 0), y: base.point.y + (lbl.offset?.dy ?? 0) } };
    }
    const pin = pinIndex.get(key);
    return pin ? { point: pin.point, outwardDir: pin.outwardDir } : null;
  }

  // ── Obstacles per sheet (device bodies only, symbol-aware) ───────────
  const obstaclesBySheet = new Map<string, Rect[]>();
  for (const d of placedDevices) {
    const symDef = getSymbolDef(d.symbolType);
    const { width, height } = symDef
      ? { width: symDef.width, height: symDef.height }
      : layoutDevice(d);
    let rects = obstaclesBySheet.get(d.sheetId);
    if (!rects) { rects = []; obstaclesBySheet.set(d.sheetId, rects); }
    rects.push({ x: d.position.x, y: d.position.y, width, height });
  }

  // ── Routing (identical semantics to the old per-wire path) ───────────
  function routeOne(wire: Wire, ends: WireEndpoints): { points: Point[]; eff: WireRoute['eff'] } {
    const overrides = {
      midX: wire.midX, fromY: wire.fromY, toY: wire.toY,
      fromDir: ends.fromDir, toDir: ends.toDir,
      fromJogX: wire.fromJogX, toJogX: wire.toJogX,
    };
    const obstacles = obstaclesBySheet.get(wire.sheetId) ?? [];
    // Auto-avoidance only when the user hasn't pinned either Y.
    const userCustomizedY = wire.fromY !== undefined || wire.toY !== undefined;
    let effOverrides = overrides;
    if (!userCustomizedY) {
      const defaultRoute = routeWire(ends.from, ends.to, overrides);
      const blockers: Rect[] = [];
      for (const r of obstacles) {
        for (let i = 0; i < defaultRoute.length - 1; i++) {
          if (segmentHitsRect(defaultRoute[i], defaultRoute[i + 1], r)) { blockers.push(r); break; }
        }
      }
      if (blockers.length > 0) {
        const unionTop    = Math.min(...blockers.map(r => r.y));
        const unionBottom = Math.max(...blockers.map(r => r.y + r.height));
        const avgY = (ends.from.y + ends.to.y) / 2;
        const goAbove = avgY < (unionTop + unionBottom) / 2;
        const avoidanceY = goAbove ? unionTop - AVOID_PAD : unionBottom + AVOID_PAD;
        effOverrides = { ...overrides, fromY: avoidanceY, toY: avoidanceY };
      }
    }
    const points = routeWire(ends.from, ends.to, effOverrides);
    return {
      points,
      eff: {
        midX:  effOverrides.midX  ?? (ends.from.x + ends.to.x) / 2,
        fromY: effOverrides.fromY ?? ends.from.y,
        toY:   effOverrides.toY   ?? ends.to.y,
      },
    };
  }

  const routes = new Map<string, WireRoute>();

  const routeWires = (list: Wire[]) => {
    for (const w of list) {
      const from = resolve(w.fromPin);
      const to   = resolve(w.toPin);
      if (!from || !to) continue;
      const ends: WireEndpoints = { from: from.point, to: to.point, fromDir: from.outwardDir, toDir: to.outwardDir };
      const { points, eff } = routeOne(w, ends);
      routes.set(w.id, { wire: w, ends, points, eff, pathD: '' });
    }
  };

  // Phase A: everything that doesn't hang off a shield pin. Phase B: shield
  // drain wires, whose endpoint position depends on where phase-A routes run
  // (the shield samples its member wires' ys). This two-phase order is what
  // lets `#shield:<id>` endpoints resolve deterministically instead of
  // depending on a previous render's registry snapshot.
  const isShieldWire = (w: Wire) => w.fromPin.startsWith('#shield:') || w.toPin.startsWith('#shield:');
  routeWires(wires.filter(w => !isShieldWire(w)));

  for (const sh of shields) {
    if (sh.termination !== 'pin') continue;
    const span = shieldSpan(sh, routes);
    if (!span) continue;
    shieldPinPos.set(sh.id, { x: span.midX, y: span.bottom + SHIELD_STEM + SHIELD_PIN_DROP });
  }
  routeWires(wires.filter(isShieldWire));

  // ── Crossings + hop-arc path strings, one pass per sheet ─────────────
  const verticalsBySheet = new Map<string, VSeg[]>();
  for (const r of routes.values()) {
    for (const seg of toSegments(r.points)) {
      if (seg.horizontal) continue;
      let list = verticalsBySheet.get(r.wire.sheetId);
      if (!list) { list = []; verticalsBySheet.set(r.wire.sheetId, list); }
      list.push({
        x: seg.from.x,
        y0: Math.min(seg.from.y, seg.to.y),
        y1: Math.max(seg.from.y, seg.to.y),
        wireId: r.wire.id,
      });
    }
  }

  for (const r of routes.values()) {
    const verticals = verticalsBySheet.get(r.wire.sheetId) ?? [];
    const parts: string[] = [];
    let first = true;
    for (const seg of toSegments(r.points)) {
      if (first) { parts.push(`M ${seg.from.x} ${seg.from.y}`); first = false; }
      if (!seg.horizontal) { parts.push(`L ${seg.to.x} ${seg.to.y}`); continue; }

      const segMinX = Math.min(seg.from.x, seg.to.x);
      const segMaxX = Math.max(seg.from.x, seg.to.x);
      const y = seg.from.y;
      const crossXs: number[] = [];
      for (const v of verticals) {
        if (v.wireId === r.wire.id) continue;
        if (v.x <= segMinX + EPSILON || v.x >= segMaxX - EPSILON) continue;
        if (y <= v.y0 + EPSILON || y >= v.y1 - EPSILON) continue;
        crossXs.push(v.x);
      }
      const dir = seg.to.x > seg.from.x ? 1 : -1;
      crossXs.sort((a, b) => dir * (a - b));
      for (const cx of crossXs) {
        parts.push(`L ${cx - dir * HOP_RADIUS} ${y}`);
        const sweep = dir > 0 ? 0 : 1;
        parts.push(`A ${HOP_RADIUS} ${HOP_RADIUS} 0 0 ${sweep} ${cx + dir * HOP_RADIUS} ${y}`);
      }
      parts.push(`L ${seg.to.x} ${seg.to.y}`);
    }
    r.pathD = parts.join(' ');
  }

  return {
    routes,
    shieldPinPos,
    resolveEndpoint: (key: string) => resolve(key)?.point ?? null,
  };
}
