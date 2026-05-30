import type { Point } from './types';
import type { OutwardDir } from './layout';

// Short stub + jog inserted near a pin when the main horizontal is dragged
// to a different Y than the pin itself. The stub keeps the pin anchor stable.
export const ROUTE_STUB_LENGTH = 10;

interface RouteOverrides {
  midX?: number;
  fromY?: number;
  toY?: number;
  /** Outward direction of the source-pin — defaults based on wire travel when
   *  absent (e.g. a junction on another wire). */
  fromDir?: OutwardDir;
  toDir?: OutwardDir;
  /** X-position of the source-side vertical jog (the "left vertical" when the
   *  router has added a jog). Defaults to one stub-length past the pin. */
  fromJogX?: number;
  /** X-position of the dest-side vertical jog — same pattern. */
  toJogX?: number;
}

/** Convert an outward direction to a horizontal stub sign (+1 right, -1 left).
 *  Falls back to the supplied travel-direction sign when the pin isn't
 *  horizontal (up/down) or has no direction at all (point endpoints). */
function horizontalStubSign(dir: OutwardDir | undefined, fallback: number): number {
  if (dir === 'right') return 1;
  if (dir === 'left')  return -1;
  return fallback;
}

/**
 * Manhattan routing with optional per-segment overrides.
 *
 * The stub direction at each pin is determined by that pin's OUTWARD facing —
 * so a right-side pin always has its stub poking to the right regardless of
 * where the wire's other end sits. If no direction is known (e.g. a junction
 * on another wire) the stub falls back to matching the wire's travel
 * direction.
 */
export function routeWire(
  from: Point,
  to: Point,
  overrides: RouteOverrides | number = {},
): Point[] {
  // Back-compat: accept a single number as midX (older callers).
  const opts: RouteOverrides = typeof overrides === 'number' ? { midX: overrides } : overrides;

  const fromY = opts.fromY ?? from.y;
  const toY   = opts.toY   ?? to.y;
  const midX  = opts.midX  ?? (from.x + to.x) / 2;

  const travelDir = Math.sign(to.x - from.x) || 1;
  const fromStubSign = horizontalStubSign(opts.fromDir, travelDir);
  // For the dest we approach from OPPOSITE the travel direction when no pin
  // direction is known (point endpoints); pinned endpoints use their own
  // outward direction so the stub always lands outside the device.
  const toStubSign   = horizontalStubSign(opts.toDir, -travelDir);

  const sourceJog = fromY !== from.y;
  const destJog   = toY   !== to.y;

  const points: Point[] = [from];

  if (sourceJog) {
    // X of the source vertical jog: user override wins; default is one
    // stub-length past the pin in the outward direction.
    const stubEndX = opts.fromJogX ?? (from.x + fromStubSign * ROUTE_STUB_LENGTH);
    points.push({ x: stubEndX, y: from.y }); // end of source stub
    points.push({ x: stubEndX, y: fromY });  // vertical jog to new Y
  }

  // Main horizontal at fromY to the middle vertical's X
  points.push({ x: midX, y: fromY });
  // Main vertical at midX from fromY to toY
  points.push({ x: midX, y: toY });

  if (destJog) {
    // stubStartX sits OUTSIDE the dest pin's device so the final approach comes
    // in from the correct side. User override wins.
    const stubStartX = opts.toJogX ?? (to.x + toStubSign * ROUTE_STUB_LENGTH);
    points.push({ x: stubStartX, y: toY });   // horizontal at toY up to dest stub
    points.push({ x: stubStartX, y: to.y });  // vertical jog to dest pin Y
  }

  points.push(to);
  return points;
}

export function pathFromPoints(points: Point[]): string {
  if (points.length === 0) return '';
  return 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
}
