import { useGroupDrag } from '@/lib/wiring/useGroupDrag';
import type { Shield } from '@/lib/wiring/types';
import { useWiring } from '@/lib/wiring/store';
import { sampleWireYAt, SHIELD_PAD, SHIELD_STEM, SHIELD_PIN_DROP, type WireRoute } from '@/lib/wiring/sheetRoutes';

interface Props {
  shield: Shield;
  /** Sheet-wide routing cache — the shield samples its member wires'
   *  routed polylines from here instead of re-routing them per render. */
  routes: ReadonlyMap<string, WireRoute>;
  selected: boolean;
  onSelect: (id: string, shift: boolean) => void;
}

/** SVG screen-coords → world-coords via the SVG's current CTM inverse.
 *  Same idiom DeviceBlock uses; copied here so the shield can translate
 *  its own pointer events without plumbing through the canvas. */
function screenToWorld(el: SVGElement, clientX: number, clientY: number) {
  const svg = el.ownerSVGElement!;
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}

/**
 * Renders a graphical shield over a horizontal wire bundle. Shape is a
 * vertical "stadium" / "pill" — straight sides on the left and right, half-
 * circle arcs at the top and bottom — to match standard schematic notation.
 * Below the shape, a stem drops to a termination glyph: ground triangle,
 * "S" backshell circle, or nothing (floating shield).
 *
 * The shield is a render-only annotation — it doesn't touch the wires it
 * wraps. Wire y is sampled at the shield's mid-x via the routed polyline,
 * so shields stay aligned even when the wires bend or terminate at
 * far-away devices with different y's.
 */
export function ShieldBlock({ shield, routes, selected, onSelect }: Props) {
  // Shields slide horizontally along their wire bundle. The hook handles
  // multi-select-aware drag, snap-to-grid, and dispatch via moveSelectionBy
  // (which shifts xStart/xEnd in lock-step so the shield's width is
  // preserved). The "position" we hand the hook is (xStart, 0): only the
  // X delta is meaningful for shields, so Y goes through unused.
  const drag = useGroupDrag({
    kind: 'shield',
    id: shield.id,
    position: { x: shield.xStart, y: 0 },
  });
  const onPointerUp = (e: React.PointerEvent<SVGPathElement>) => {
    const wasClick = drag.onPointerUp(e);
    if (wasClick) onSelect(shield.id, e.shiftKey);
  };

  const xStart = shield.xStart;
  const xEnd = shield.xEnd;
  const midX = (xStart + xEnd) / 2;
  const width = xEnd - xStart;

  // The shield wraps EXACTLY the wires the user added — no junction-based
  // expansion. Logical net membership (two wires meeting at a junction) is
  // not the same as physical bundle membership: a wire branching off a net
  // can run a totally different physical route, so pulling it in via BFS
  // would visually rope in unrelated wires that just happen to share a
  // node. The user's explicit wireIds list is the source of truth.
  //
  // Wire ys are sampled from the shared routing cache (same polylines the
  // wires render with), so the stadium hugs exactly what's on screen.
  const inShieldYs: number[] = [];
  for (const wid of shield.wireIds) {
    const r = routes.get(wid);
    if (!r) continue;
    const y = sampleWireYAt(r.points, midX);
    if (y === null) continue;
    inShieldYs.push(y);
  }
  if (inShieldYs.length === 0) return null;
  inShieldYs.sort((a, b) => a - b);
  const groupYs: number[][] = [inShieldYs];

  const stroke = selected ? 'hsl(var(--primary))' : 'hsl(var(--foreground))';
  const strokeWidth = selected ? 2 : 1;
  const PAD = SHIELD_PAD;
  const stemLen = SHIELD_STEM;

  // Render one stadium + stem + termination per contiguous group. All
  // groups share the same x-range and termination style (they're all
  // visual pieces of the same Shield), so dragging or changing
  // termination affects them together.
  const groupNodes = groupYs.map((ys, gi) => {
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const top = minY - PAD;
    const bottom = maxY + PAD;
    const height = bottom - top;
    const r = Math.max(2, Math.min(width / 2, height / 2));
    const straightTop = top + r;
    const straightBottom = bottom - r;
    const stadiumPath =
      `M ${xStart} ${straightTop} ` +
      `A ${r} ${r} 0 0 1 ${xEnd} ${straightTop} ` +
      `L ${xEnd} ${straightBottom} ` +
      `A ${r} ${r} 0 0 1 ${xStart} ${straightBottom} ` +
      `Z`;
    const stemTop = bottom;
    const stemBottom = stemTop + stemLen;
    return (
      <g key={gi}>
        {/* Wider invisible hit area for selection AND drag-to-move. */}
        <path d={stadiumPath} fill="none" stroke="transparent" strokeWidth={10}
              onPointerDown={drag.onPointerDown}
              onPointerMove={drag.onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ cursor: 'move' }} />
        <path d={stadiumPath} fill="none" stroke={stroke} strokeWidth={strokeWidth}
              style={{ pointerEvents: 'none' }} />
        {shield.termination !== 'float' && (
          <line x1={midX} y1={stemTop} x2={midX} y2={stemBottom}
                stroke={stroke} strokeWidth={strokeWidth} pointerEvents="none" />
        )}
        {shield.termination === 'ground' && (
          <g stroke={stroke} strokeWidth={strokeWidth} pointerEvents="none">
            <line x1={midX - 8} y1={stemBottom}     x2={midX + 8} y2={stemBottom}     />
            <line x1={midX - 5} y1={stemBottom + 3} x2={midX + 5} y2={stemBottom + 3} />
            <line x1={midX - 2} y1={stemBottom + 6} x2={midX + 2} y2={stemBottom + 6} />
          </g>
        )}
        {shield.termination === 'backshell' && (() => {
          const half = 7;
          const triHeight = 12;
          const baseY = stemBottom;
          const apexY = stemBottom + triHeight;
          const trianglePath =
            `M ${midX - half} ${baseY} ` +
            `L ${midX + half} ${baseY} ` +
            `L ${midX} ${apexY} Z`;
          return (
            <g pointerEvents="none">
              <path d={trianglePath}
                    fill="hsl(var(--background))" stroke={stroke} strokeWidth={strokeWidth} />
              <text x={midX} y={baseY + 6} fontSize={9} fontWeight={700}
                    textAnchor="middle" fill={stroke}>
                S
              </text>
            </g>
          );
        })()}
        {shield.termination === 'pin' && (
          // Open connection circle a wire can dock onto. Same visual idiom
          // as a device pin so users recognise it as connectable. The dot's
          // position uses the shared SHIELD_PIN_DROP constant so the routing
          // cache resolves `#shield:<id>` endpoints to this exact spot.
          <g>
            <circle cx={midX} cy={stemBottom + SHIELD_PIN_DROP} r={3.5}
                    fill="hsl(var(--background))"
                    stroke={stroke} strokeWidth={strokeWidth}
                    pointerEvents="none" />
            <ShieldPinHit shieldId={shield.id} cx={midX} cy={stemBottom + SHIELD_PIN_DROP} />
          </g>
        )}
      </g>
    );
  });

  return <g>{groupNodes}</g>;
}

/**
 * Invisible hit target for the shield's "pin" termination. Behaves like a
 * device pin: clicking starts a wire from the shield's endpoint, clicking
 * during an in-flight wire finishes it on the shield. The endpoint key
 * `#shield:<id>` is resolved to the dot's world coords by the routing
 * layer (see resolveEndpoint in wirePaths.ts).
 */
function ShieldPinHit({ shieldId, cx, cy }: { shieldId: string; cx: number; cy: number }) {
  const wiringFromPin = useWiring(s => s.wiringFromPin);
  const startWiring   = useWiring(s => s.startWiring);
  const finishWiring  = useWiring(s => s.finishWiring);
  const selfKey = `#shield:${shieldId}`;
  return (
    <circle
      cx={cx} cy={cy} r={10}
      fill="transparent"
      pointerEvents="all"
      style={{ cursor: wiringFromPin ? 'crosshair' : 'pointer' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (wiringFromPin && wiringFromPin !== selfKey) {
          finishWiring(selfKey);
          return;
        }
        if (!wiringFromPin) startWiring(selfKey);
      }}
    />
  );
}
