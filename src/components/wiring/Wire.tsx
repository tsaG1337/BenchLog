import { useRef, useState } from 'react';
import type { Wire as WireModel } from '@/lib/wiring/types';
import { isJunctionKey } from '@/lib/wiring/types';
import { useWiring } from '@/lib/wiring/store';
import { projectClickOntoWire } from '@/lib/wiring/wirePaths';
import type { WireRoute } from '@/lib/wiring/sheetRoutes';
import { ROUTE_STUB_LENGTH } from '@/lib/wiring/routing';

interface Props {
  wire: WireModel;
  selected: boolean;
  onSelect: (id: string, shift: boolean) => void;
  allWiresOnSheet: WireModel[];
  /** Precomputed route from the sheet-wide routing cache — geometry (with
   *  hop arcs), endpoints, and effective handle positions. Computing this
   *  per-wire here was O(n²) per frame; the cache does it once per change. */
  route: WireRoute;
}

import { askForNetLabel } from './NetLabelPickerDialog';

export function Wire({ wire, selected, onSelect, allWiresOnSheet, route }: Props) {
  const wiringFromPin = useWiring(s => s.wiringFromPin);
  const finishWiringAtPoint = useWiring(s => s.finishWiringAtPoint);
  const startWiringFromWire = useWiring(s => s.startWiringFromWire);
  // Subscribed (not getState) so the wire's cursor re-renders when the tool
  // toggles. The onClick handler still reads getState().toolMode at click time.
  const toolMode = useWiring(s => s.toolMode);
  const shieldPickingId = useWiring(s => s.shieldPickingId);
  const addWireToShield = useWiring(s => s.addWireToShield);
  const endShieldPicking = useWiring(s => s.endShieldPicking);
  const addNetLabel = useWiring(s => s.addNetLabel);
  const splitWireAtPoint = useWiring(s => s.splitWireAtPoint);
  // Hover-from-elsewhere highlight. Other UI surfaces (currently the
  // shield Inspector's wire list rows) can set this to focus a specific
  // wire on the canvas — useful when scanning the list to figure out
  // which physical wire each entry corresponds to.
  const hoveredFromElsewhereId = useWiring(s => s.hoveredWireId);
  const isHoveredFromElsewhere = hoveredFromElsewhereId === wire.id;
  const setWireMidX  = useWiring(s => s.setWireMidX);
  const setWireFromY = useWiring(s => s.setWireFromY);
  const setWireToY   = useWiring(s => s.setWireToY);
  const setWireDetourY = useWiring(s => s.setWireDetourY);
  const setWireFromJogX = useWiring(s => s.setWireFromJogX);
  const setWireToJogX   = useWiring(s => s.setWireToJogX);
  const setWireLabelPosition = useWiring(s => s.setWireLabelPosition);
  const selectWholeNet = useWiring(s => s.selectWholeNet);
  // Drag pointerDown opens a transaction; pointerUp commits it. Every
  // per-pixel mutation in between folds into a single undo step.
  const beginTx = useWiring(s => s.beginTransaction);
  const commitTx = useWiring(s => s.commitTransaction);

  const [hovered, setHovered] = useState(false);
  const midDragRef       = useRef<{ offset: number } | null>(null);
  const fromDragRef      = useRef<{ offset: number } | null>(null);
  const toDragRef        = useRef<{ offset: number } | null>(null);
  const fromJogDragRef   = useRef<{ offset: number } | null>(null);
  const toJogDragRef     = useRef<{ offset: number } | null>(null);
  const labelDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const { ends, pathD: d, eff } = route;
  if (!d) return null;

  // Effective routing values from the cache. Falls back to the
  // obstacle-avoidance Y when the auto-router deflected this wire around a
  // device — otherwise handles would sit on the (invisible, unused) pin Y
  // instead of the wire.
  const effectiveMidX  = eff.midX;
  const effectiveFromY = eff.fromY;
  const effectiveToY   = eff.toY;
  const travelDir = Math.sign(ends.to.x - ends.from.x) || 1;
  // Stub sign at each pin: driven by the pin's outward direction so stubs
  // always extend AWAY from the device body. Point endpoints (junctions) have
  // no outward dir — fall back to the wire's travel direction.
  const fromStubSign = ends.fromDir === 'right' ?  1 : ends.fromDir === 'left' ? -1 :  travelDir;
  const toStubSign   = ends.toDir   === 'right' ?  1 : ends.toDir   === 'left' ? -1 : -travelDir;

  // Where the main horizontal on each side starts/ends. If the effective Y
  // differs from the pin's Y the router inserted a source/dest jog, so the
  // main horizontal begins ROUTE_STUB_LENGTH past the pin (or at the user's
  // overridden jog X).
  const sourceHStart = effectiveFromY !== ends.from.y
    ? (wire.fromJogX ?? ends.from.x + fromStubSign * ROUTE_STUB_LENGTH)
    : ends.from.x;
  const destHEnd = effectiveToY !== ends.to.y
    ? (wire.toJogX ?? ends.to.x + toStubSign * ROUTE_STUB_LENGTH)
    : ends.to.x;

  // Has the router added a vertical jog on each side? A jog is a short
  // vertical segment between the pin stub and the main horizontal; it's
  // present exactly when the main horizontal's Y differs from the pin Y.
  const hasFromJog = effectiveFromY !== ends.from.y;
  const hasToJog   = effectiveToY   !== ends.to.y;

  // Auto-avoidance mode: the router pulled both ends to the same Y to route
  // around a device (neither wire.fromY nor wire.toY is user-set, but both
  // effective Ys differ from the pin Ys). In this mode, dragging one end
  // should drag both so the top bar stays level — independent drags would
  // visually tear the wire. Once the user explicitly sets one end, they get
  // independent control.
  const isAutoAvoidance = wire.fromY === undefined
                       && wire.toY   === undefined
                       && hasFromJog
                       && hasToJog
                       && effectiveFromY === effectiveToY;

  // Handle positions: midpoint of each draggable segment.
  const sourceHandle = { x: (sourceHStart + effectiveMidX) / 2, y: effectiveFromY };
  const midHandle    = { x: effectiveMidX, y: (effectiveFromY + effectiveToY) / 2 };
  const destHandle   = { x: (effectiveMidX + destHEnd) / 2, y: effectiveToY };
  // Vertical-jog handles — only meaningful in detour mode (normal H-V-H has
  // no source/dest jog verticals). Midpoint of each vertical; drag horizontally
  // to shift the "left" and "right" vertical inward/outward.
  const fromJogHandle = { x: sourceHStart, y: (ends.from.y + effectiveFromY) / 2 };
  const toJogHandle   = { x: destHEnd,     y: (ends.to.y   + effectiveToY)   / 2 };

  // Label default position: midpoint of the middle vertical segment.
  // No Y offset — the label rect + text are centred on labelY, so the wire
  // passes through the label's visual centre in any rotation.
  const defaultLabelX = effectiveMidX;
  const defaultLabelY = midHandle.y;
  const labelX = wire.labelX ?? defaultLabelX;
  const labelY = wire.labelY ?? defaultLabelY;

  // Auto label orientation: if the label sits on a segment that's
  // predominantly vertical, rotate 90° clockwise so the text reads
  // top-to-bottom. Otherwise keep horizontal. User can override via
  // wire.labelRotation.
  const middleVertLength = Math.abs(effectiveFromY - effectiveToY);
  const labelAtDefault = wire.labelX === undefined && wire.labelY === undefined;
  const autoLabelRotation = (labelAtDefault && middleVertLength > 10) ? 90 : 0;
  const labelRotation = wire.labelRotation ?? autoLabelRotation;

  const screenToWorld = (el: SVGElement, clientX: number, clientY: number) => {
    const svg = el.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  // ── Mid vertical (horizontal drag) ──────────────────────────────────
  const midDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    beginTx();
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    midDragRef.current = { offset: w.x - effectiveMidX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const midMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!midDragRef.current) return;
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    setWireMidX(wire.id, Math.round((w.x - midDragRef.current.offset) / 10) * 10);
  };
  const midUp = (e: React.PointerEvent<SVGCircleElement>) => {
    midDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    commitTx();
  };

  // ── Source horizontal (vertical drag) ───────────────────────────────
  const fromDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    beginTx();
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    fromDragRef.current = { offset: w.y - effectiveFromY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const fromMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!fromDragRef.current) return;
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    const nextY = Math.round((w.y - fromDragRef.current.offset) / 10) * 10;
    // In detour mode both ends track the same Y so the top bar stays level —
    // moving only one would tear the wire visually. Otherwise: if the user
    // drags back to the pin's Y, clear the override so the wire collapses
    // back to 3 segments (no jog).
    if (isAutoAvoidance) {
      setWireDetourY(wire.id, nextY);
    } else {
      setWireFromY(wire.id, nextY === ends.from.y ? undefined : nextY);
    }
  };
  const fromUp = (e: React.PointerEvent<SVGCircleElement>) => {
    fromDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    commitTx();
  };

  // ── Dest horizontal (vertical drag) ─────────────────────────────────
  const toDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    beginTx();
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    toDragRef.current = { offset: w.y - effectiveToY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const toMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!toDragRef.current) return;
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    const nextY = Math.round((w.y - toDragRef.current.offset) / 10) * 10;
    if (isAutoAvoidance) {
      setWireDetourY(wire.id, nextY);
    } else {
      setWireToY(wire.id, nextY === ends.to.y ? undefined : nextY);
    }
  };
  const toUp = (e: React.PointerEvent<SVGCircleElement>) => {
    toDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    commitTx();
  };

  // ── Source-side vertical jog (horizontal drag) ─────────────────────
  const fromJogDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    beginTx();
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    fromJogDragRef.current = { offset: w.x - sourceHStart };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const fromJogMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!fromJogDragRef.current) return;
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    const nextX = Math.round((w.x - fromJogDragRef.current.offset) / 10) * 10;
    setWireFromJogX(wire.id, nextX);
  };
  const fromJogUp = (e: React.PointerEvent<SVGCircleElement>) => {
    fromJogDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    commitTx();
  };

  // ── Dest-side vertical jog (horizontal drag) ───────────────────────
  const toJogDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    beginTx();
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    toJogDragRef.current = { offset: w.x - destHEnd };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const toJogMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!toJogDragRef.current) return;
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    const nextX = Math.round((w.x - toJogDragRef.current.offset) / 10) * 10;
    setWireToJogX(wire.id, nextX);
  };
  const toJogUp = (e: React.PointerEvent<SVGCircleElement>) => {
    toJogDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    commitTx();
  };

  // ── Label drag ──────────────────────────────────────────────────────
  const labelDown = (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    beginTx();
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    labelDragRef.current = { offsetX: w.x - labelX, offsetY: w.y - labelY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const labelMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!labelDragRef.current) return;
    const w = screenToWorld(e.currentTarget, e.clientX, e.clientY);
    setWireLabelPosition(
      wire.id,
      Math.round((w.x - labelDragRef.current.offsetX) / 5) * 5,
      Math.round((w.y - labelDragRef.current.offsetY) / 5) * 5,
    );
  };
  const labelUp = (e: React.PointerEvent<SVGGElement>) => {
    labelDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    commitTx();
  };

  // Hide reshape handles while a wire is being drawn — they sit on the
  // path and would otherwise intercept clicks the user means to land on
  // existing junctions, which makes "connect to junction" feel impossible.
  const showHandles = (selected || hovered) && !wiringFromPin;
  const labelWidth  = wire.label ? Math.max(wire.label.length * 6 + 8, 20) : 0;

  /** Project a click on this wire onto its orthogonal segments so a junction
   *  created here sits exactly on the wire. Shared by "start a junction wire"
   *  and "finish a wire on this wire". */
  function projectClick(e: React.MouseEvent): { x: number; y: number } {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const wp = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    // Order matches the rendered path: source stub → optional from-jog →
    // main H-V-H body → optional to-jog → dest stub.
    const segments: Array<[number, number, number, number]> = [];
    if (sourceHStart !== ends.from.x) {
      segments.push([ends.from.x, ends.from.y, sourceHStart, ends.from.y]);
    }
    if (hasFromJog) {
      segments.push([sourceHStart, ends.from.y, sourceHStart, effectiveFromY]);
    }
    segments.push([sourceHStart, effectiveFromY, effectiveMidX, effectiveFromY]);
    segments.push([effectiveMidX, effectiveFromY, effectiveMidX, effectiveToY]);
    segments.push([effectiveMidX, effectiveToY, destHEnd, effectiveToY]);
    if (hasToJog) {
      segments.push([destHEnd, effectiveToY, destHEnd, ends.to.y]);
    }
    if (destHEnd !== ends.to.x) {
      segments.push([destHEnd, ends.to.y, ends.to.x, ends.to.y]);
    }
    return projectClickOntoWire({
      click: { x: wp.x, y: wp.y },
      segments,
      hostWireId: wire.id,
      allWiresOnSheet,
      junctions: useWiring.getState().junctions,
    });
  }

  return (
    <g
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Wider invisible hit path — click-to-select, or during wiring mode,
          click-to-connect-here (creates a junction on this wire). */}
      <path
        d={d} fill="none"
        stroke="transparent" strokeWidth={12}
        onClick={(e) => {
          e.stopPropagation();
          // Shield "add wire by clicking" picker — the Inspector armed it
          // and the user is now clicking a wire to pick. Append to that
          // shield (no duplicates), then exit pick mode so the next click
          // is a normal selection again.
          if (shieldPickingId) {
            addWireToShield(shieldPickingId, wire.id);
            endShieldPicking();
            return;
          }
          // Net-label tool active — drop a label on this wire. A label on a
          // wire is a tap: split the wire (creating a Junction entity), then
          // attach the label to that `junction:<id>`. Electrically identical
          // to the old wire-tracked behaviour, but the junction is now a
          // first-class, shareable entity.
          if (useWiring.getState().toolMode === 'netLabel' && !wiringFromPin) {
            const snapped = projectClick(e);
            const junctionKey = splitWireAtPoint(wire.id, snapped.x, snapped.y);
            if (junctionKey) {
              askForNetLabel().then((text) => {
                if (text) addNetLabel(junctionKey, text);
              });
            }
            return;
          }
          if (wiringFromPin) {
            // Mid-draw: finish the wire ON this wire (splits it at the
            // junction so it stays attached when the wire reshapes).
            const snapped = projectClick(e);
            finishWiringAtPoint(snapped.x, snapped.y, wire.id);
          } else if (useWiring.getState().toolMode === 'junction') {
            // Wire tool active: start a NEW wire from a junction on this wire.
            const snapped = projectClick(e);
            startWiringFromWire(wire.id, snapped.x, snapped.y);
          } else {
            onSelect(wire.id, e.shiftKey);
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // Only in plain wire mode — not mid-wiring, shield-picking, or with
          // the net-label / junction / shield / text / note tool active.
          if (wiringFromPin || shieldPickingId) return;
          const mode = useWiring.getState().toolMode;
          if (mode !== 'wire') return;
          selectWholeNet(wire.id);
        }}
        style={{ cursor: shieldPickingId ? 'copy' : (wiringFromPin || toolMode === 'junction') ? 'crosshair' : 'pointer' }}
      />
      {/* External-hover halo. Drawn behind the visible stroke so it reads
          as a glow around the wire when something off-canvas (the shield
          Inspector list) wants to point at this specific wire. Stays out
          of pointer events so it doesn't intercept clicks. */}
      {isHoveredFromElsewhere && (
        <path d={d} fill="none"
              stroke="hsl(var(--primary))" strokeWidth={6}
              opacity={0.35}
              style={{ pointerEvents: 'none' }} />
      )}
      <path
        d={d} fill="none"
        stroke={selected ? 'hsl(var(--primary))' : wire.color}
        strokeWidth={selected ? 2.5 : 1.5}
        style={{ pointerEvents: 'none' }}
      />
      {wire.stripeColor && (
        <path
          d={d} fill="none"
          stroke={wire.stripeColor}
          strokeWidth={selected ? 2.5 : 1.5}
          strokeDasharray="7 7"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Junction dots — filled circles at any junction endpoint so
          T-junctions against other wires are visually unambiguous. */}
      {isJunctionKey(wire.fromPin) && (
        <circle cx={ends.from.x} cy={ends.from.y} r={3.5}
                fill="hsl(var(--foreground))" style={{ pointerEvents: 'none' }} />
      )}
      {isJunctionKey(wire.toPin) && (
        <circle cx={ends.to.x} cy={ends.to.y} r={3.5}
                fill="hsl(var(--foreground))" style={{ pointerEvents: 'none' }} />
      )}

      {/* Label — rotation applied to the whole group so the drag hit-area
          rotates with the text. labelX/labelY is the rotation centre. */}
      {wire.label && wire.showLabel && (
        <g
          onPointerDown={labelDown}
          onPointerMove={labelMove}
          onPointerUp={labelUp}
          onPointerCancel={labelUp}
          transform={labelRotation ? `rotate(${labelRotation} ${labelX} ${labelY})` : undefined}
          style={{ cursor: 'move' }}
        >
          {/* Rect is vertically centred on labelY (spans -8..+8 instead of
              -12..+4) so that rotating the group around labelX/labelY keeps
              the wire bisecting the label, not grazing one edge. */}
          <rect
            x={labelX - labelWidth / 2}
            y={labelY - 8}
            width={labelWidth}
            height={16}
            rx={2}
            fill="hsl(var(--background))"
            opacity={0.9}
            stroke={selected || hovered ? 'hsl(var(--primary))' : 'transparent'}
            strokeWidth={0.75}
          />
          <text
            x={labelX} y={labelY}
            fontSize={10}
            fill="hsl(var(--foreground))"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {wire.label}
          </text>
        </g>
      )}

      {/* Drag handles — same layout in normal AND detour mode. In detour
          mode the source/dest Y drags move both ends together (see
          fromMove/toMove) so the top bar stays level. */}
      {showHandles && (
        <>
          {/* Middle vertical — horizontal drag (shifts the whole mid vertical,
              or in detour mode: shifts where the two top-horizontal halves
              meet). */}
          <circle
            cx={midHandle.x} cy={midHandle.y}
            r={6}
            fill="hsl(var(--primary))"
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
            style={{ cursor: 'ew-resize' }}
            onPointerDown={midDown}
            onPointerMove={midMove}
            onPointerUp={midUp}
            onPointerCancel={midUp}
          />

          {/* Source horizontal — vertical drag */}
          <circle
            cx={sourceHandle.x} cy={sourceHandle.y}
            r={5}
            fill="hsl(var(--primary))"
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
            style={{ cursor: 'ns-resize' }}
            onPointerDown={fromDown}
            onPointerMove={fromMove}
            onPointerUp={fromUp}
            onPointerCancel={fromUp}
          />

          {/* Dest horizontal — vertical drag */}
          <circle
            cx={destHandle.x} cy={destHandle.y}
            r={5}
            fill="hsl(var(--primary))"
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
            style={{ cursor: 'ns-resize' }}
            onPointerDown={toDown}
            onPointerMove={toMove}
            onPointerUp={toUp}
            onPointerCancel={toUp}
          />

          {/* Vertical-jog handles — rendered per-side only when THAT side
              actually has a jog. Otherwise the handle would land at the pin
              tip (since sourceHStart/destHEnd collapse to ends.*.x when no
              jog exists) and look like a duplicate. */}
          {hasFromJog && (
            <circle
              cx={fromJogHandle.x} cy={fromJogHandle.y}
              r={5}
              fill="hsl(var(--primary))"
              stroke="hsl(var(--background))"
              strokeWidth={1.5}
              style={{ cursor: 'ew-resize' }}
              onPointerDown={fromJogDown}
              onPointerMove={fromJogMove}
              onPointerUp={fromJogUp}
              onPointerCancel={fromJogUp}
            />
          )}
          {hasToJog && (
            <circle
              cx={toJogHandle.x} cy={toJogHandle.y}
              r={5}
              fill="hsl(var(--primary))"
              stroke="hsl(var(--background))"
              strokeWidth={1.5}
              style={{ cursor: 'ew-resize' }}
              onPointerDown={toJogDown}
              onPointerMove={toJogMove}
              onPointerUp={toJogUp}
              onPointerCancel={toJogUp}
            />
          )}
        </>
      )}
    </g>
  );
}
