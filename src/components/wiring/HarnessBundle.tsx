import { useRef, useState } from 'react';
import type { HarnessGraph, HarnessNode, Bundle, Point } from '@/lib/wiring/types';
import { useWiring } from '@/lib/wiring/store';
import {
  cableCurvePath, sampleCableCurve, snapPointToGrid, harnessTreeOf,
  tubeThickness, polylineMidpoint,
} from '@/lib/wiring/harness';
import { useHarnessNodeDrag, type HarnessNodeRef } from '@/lib/wiring/useHarnessNodeDrag';

/** Convert a pointer event's client coords to SVG world coords. */
function pointerToWorld(e: React.PointerEvent): Point {
  const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}

/**
 * Harness renderer — `HarnessGraphView`.
 *
 * Consumes the derived `HarnessGraph` (a forest of harness trees) produced by
 * `deriveHarness` and draws the whole graph in one pass:
 *
 *   • each `Bundle` → a smooth cubic-Bézier / Catmull-Rom spline cable between
 *     its two endpoint nodes, through any user-set bend points. Thickness
 *     scales with `conductorIds.length`.
 *   • per-bundle on-canvas labels — the conductor count, the cable name
 *     (`Bundle.name`), and the length pill (`Bundle.length`) — small,
 *     non-intrusive, `pointer-events: none` so they never block selection.
 *   • cable bend points (`Bundle.waypoints`) → small draggable handles;
 *     drag re-shapes the cable, double-click removes the bend.
 *   • `splice`      nodes → a ringed dot (an electrical wire-to-wire splice).
 *   • `branchPoint` nodes → a small dot (a derived fan-out — "Branch Point")
 *     labelled with its persisted `node.label` (`"BP1"`, `"BP2"`, … —
 *     assigned once on first sighting by a sync effect in `WiringPage` and
 *     never renumbered afterwards; see `HarnessOverrides.branchPointLabels`,
 *     2026-07). A brand-new branch point renders with no label for one tick
 *     until the effect catches up.
 *   • `component`   nodes → drawn by `HarnessDeviceBlock` (in WiringPage).
 *
 * Phase 4 — terminology: on-canvas labels and tooltips use the normed
 * harness vocabulary (Component, Branch Point, Bundle, Conductor, Splice).
 *
 * Phase 4 — editing: harness nodes carry the `useHarnessNodeDrag` gesture
 * (snap-to-grid, alignment guides, multi-select group move). Splice /
 * branch-point markers shift-select into `selectedHarnessNodeIds`.
 */

interface Props {
  graph: HarnessGraph;
  /** When true, the "Bend" tool is active — clicking a cable inserts a new
   *  bend point instead of selecting the cable. */
  bendMode?: boolean;
  /** When true, cable length labels are shown on every bundle — a user-set
   *  length as a solid value, otherwise the geometric estimate. */
  showLengths?: boolean;
  /** Millimetres of physical cable per on-screen unit — the active sheet's
   *  harness scale. Used to convert the geometric curve length to mm. */
  mmPerUnit: number;
  /** The explicit set of harness-node ids that travel together when one of
   *  them is dragged as part of a whole-harness (double-clicked tree) move.
   *  Forwarded to each node's drag hook. */
  moveGroupIds?: string[];
}

// `tubeThickness` + `polylineMidpoint` moved to @/lib/wiring/harness so the
// PDF/SVG exporter draws identical cables and label placement — one formula,
// canvas and print can't drift.

export function HarnessGraphView({ graph, bendMode = false, showLengths = false, mmPerUnit, moveGroupIds }: Props) {
  const selectedBundleId       = useWiring(s => s.selectedBundleId);
  const selectBundle           = useWiring(s => s.selectBundle);
  const selectedHarnessTree    = useWiring(s => s.selectedHarnessTree);
  const selectWholeHarness     = useWiring(s => s.selectWholeHarness);
  const selectedHarnessNodeIds = useWiring(s => s.selectedHarnessNodeIds);
  const selectHarnessNode      = useWiring(s => s.selectHarnessNode);
  const hoveredWireId          = useWiring(s => s.hoveredWireId);
  const wires                  = useWiring(s => s.wires);
  const activeSheetId          = useWiring(s => s.activeSheetId);
  const addBundleWaypoint      = useWiring(s => s.addBundleWaypoint);
  const harnessAlignGuides     = useWiring(s => s.harnessAlignGuides);

  // Whole-harness tree highlight — computed once per render.
  const harnessTree    = selectedHarnessTree ? harnessTreeOf(selectedHarnessTree, graph) : null;
  const treeBundleIds  = new Set(harnessTree?.bundleIds ?? []);
  const treeNodeIds    = new Set(harnessTree?.nodeIds ?? []);

  const nodeById = new Map<string, HarnessNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  // Every harness node — passed to each node-drag hook so it has the
  // alignment candidates and the multi-select group's geometry.
  const allNodeRefs: HarnessNodeRef[] = graph.nodes.map(n => ({
    id: n.id,
    position: n.position,
  }));

  /** A cable's two world-space dock points, or null if either endpoint node
   *  is missing from the graph. */
  function bundleEndpoints(b: Bundle): [Point, Point] | null {
    const a = nodeById.get(b.endpoints[0]);
    const c = nodeById.get(b.endpoints[1]);
    if (!a || !c) return null;
    return [a.position, c.position];
  }

  return (
    <g>
      {/* ── Alignment guides — thin lines surfaced while a node is dragged. ── */}
      {harnessAlignGuides.x !== null && (
        <line x1={harnessAlignGuides.x} y1={-100000} x2={harnessAlignGuides.x} y2={100000}
              stroke="hsl(var(--primary))" strokeWidth={0.75} strokeDasharray="4 4"
              pointerEvents="none" opacity={0.8} />
      )}
      {harnessAlignGuides.y !== null && (
        <line x1={-100000} y1={harnessAlignGuides.y} x2={100000} y2={harnessAlignGuides.y}
              stroke="hsl(var(--primary))" strokeWidth={0.75} strokeDasharray="4 4"
              pointerEvents="none" opacity={0.8} />
      )}

      {/* ── Cables. One smooth curved path per Bundle. ── */}
      {graph.bundles.map(b => {
        const eps = bundleEndpoints(b);
        if (!eps) return null;
        const waypoints = b.waypoints ?? [];
        // SVG path string for the smooth curve.
        const pathD = cableCurvePath(eps[0], eps[1], waypoints);
        // Polyline approximation — used for label midpoint and waypoint
        // insertion (via addBundleWaypoint → insertWaypointAtNearestSegment).
        const curvePolyline = sampleCableCurve(eps[0], eps[1], waypoints);
        const isSelected = selectedBundleId === b.id || treeBundleIds.has(b.id);
        // Physical conductors, so a two-point net label counts once.
        const thickness = tubeThickness(b.conductors.length);
        const stroke = isSelected
          ? 'hsl(var(--primary))'
          : 'hsl(var(--muted-foreground) / 0.6)';
        // Signal-tracking overlay: when the user hovers a conductor in the
        // Inspector, trace it along every bundle that carries it.
        const carriesHovered = hoveredWireId !== null
          && b.conductorIds.includes(hoveredWireId);
        const hoveredColor = (() => {
          if (!carriesHovered) return undefined;
          const w = wires.find(x => x.id === hoveredWireId);
          // No user-chosen colour ('currentColor' is the schematic default)
          // falls back to black so an uncoloured conductor's trace stays
          // clearly visible against the grey cable body.
          return w && w.color && w.color !== 'currentColor'
            ? w.color : '#000000';
        })();

        const onCableClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (bendMode && activeSheetId) {
            // Bend tool: insert a new bend point at the click, snapped to
            // the grid, routed into the nearest cable segment.
            const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement;
            if (svg) {
              const pt = svg.createSVGPoint();
              pt.x = e.clientX; pt.y = e.clientY;
              const w = pt.matrixTransform(svg.getScreenCTM()!.inverse());
              addBundleWaypoint(activeSheetId, b.id, snapPointToGrid({ x: w.x, y: w.y }), eps[0], eps[1]);
            }
            return;
          }
          selectBundle(b.id);
        };

        const onCableDoubleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!bendMode) selectWholeHarness(b.id);
        };

        return (
          <g key={b.id} style={{ cursor: bendMode ? 'crosshair' : 'pointer' }}>
            <CablePaths
              pathD={pathD}
              thickness={thickness}
              stroke={stroke}
              carriesHovered={carriesHovered}
              hoveredColor={hoveredColor}
              curvePolyline={curvePolyline}
              bundle={b}
              waypoints={waypoints}
              onPathClick={onCableClick}
              onPathDoubleClick={onCableDoubleClick}
              showLengths={showLengths}
              mmPerUnit={mmPerUnit}
            />
          </g>
        );
      })}

      {/* ── Splice + branch-point nodes. Drawn after every cable so the
            markers sit on top of the cables they punctuate. ── */}
      {graph.nodes.map(n => {
        if (n.kind === 'splice') {
          return (
            <SpliceNode
              key={n.id}
              nodeId={n.id}
              position={n.position}
              selected={selectedHarnessNodeIds.has(n.id) || treeNodeIds.has(n.id)}
              allNodes={allNodeRefs}
              moveGroupIds={moveGroupIds}
              onSelect={(additive) => selectHarnessNode(n.id, additive)}
            />
          );
        }
        if (n.kind === 'branchPoint') {
          return (
            <BranchPointNode
              key={n.id}
              nodeId={n.id}
              position={n.position}
              selected={selectedHarnessNodeIds.has(n.id) || treeNodeIds.has(n.id)}
              allNodes={allNodeRefs}
              moveGroupIds={moveGroupIds}
              label={n.label ?? ''}
              onSelect={(additive) => selectHarnessNode(n.id, additive)}
            />
          );
        }
        return null;
      })}
    </g>
  );
}

/**
 * Curved cable rendering: hit-target path, visible-stroke path, optional
 * hovered-color overlay path, bundle labels, and waypoint handles.
 *
 * Uses `<path>` elements with the smooth cubic-Bézier `d` string so the cable
 * renders as a gentle curve rather than an orthogonal polyline. The wide
 * transparent hit-target keeps thin cables clickable/draggable.
 */
function CablePaths({
  pathD, thickness, stroke,
  carriesHovered, hoveredColor,
  curvePolyline, bundle, waypoints,
  onPathClick,
  onPathDoubleClick,
  showLengths,
  mmPerUnit,
}: {
  pathD: string;
  thickness: number;
  stroke: string;
  carriesHovered: boolean;
  hoveredColor: string | undefined;
  curvePolyline: Point[];
  bundle: Bundle;
  waypoints: Point[];
  onPathClick?: (e: React.MouseEvent) => void;
  onPathDoubleClick?: (e: React.MouseEvent) => void;
  showLengths?: boolean;
  mmPerUnit: number;
}) {
  return (
    <>
      {/* Fat transparent hit target so thin cables stay clickable. */}
      <path d={pathD} fill="none"
            stroke="transparent" strokeWidth={Math.max(thickness + 10, 16)}
            strokeLinecap="round"
            onClick={onPathClick}
            onDoubleClick={onPathDoubleClick} />
      <path d={pathD} fill="none"
            stroke={stroke} strokeWidth={thickness}
            strokeLinecap="round"
            onClick={onPathClick}
            onDoubleClick={onPathDoubleClick} />
      {carriesHovered && (
        <path d={pathD} fill="none"
              stroke={hoveredColor} strokeWidth={3}
              strokeLinecap="round"
              pointerEvents="none" />
      )}
      <BundleLabels bundle={bundle} curvePolyline={curvePolyline} showLengths={showLengths} mmPerUnit={mmPerUnit} />
      {/* Bend-point handles — draggable; double-click removes. */}
      {waypoints.map((wp, i) => (
        <WaypointHandle
          key={`${bundle.id}-wp-${i}`}
          bundleId={bundle.id}
          index={i}
          point={wp}
          waypoints={waypoints}
        />
      ))}
    </>
  );
}

/**
 * On-canvas labels for one bundle — drawn at the cable midpoint as small
 * non-intrusive pills. Shows the conductor count always, the cable Name
 * when set, and — when `showLengths` is on — a length pill on EVERY cable:
 * a user-set length as a solid value, otherwise the geometric estimate
 * (curve length × scale) drawn muted with a `~` prefix. `pointer-events:
 * none` so the labels never intercept a cable click.
 *
 * Uses the sampled curve polyline to find the arclength midpoint so the label
 * always sits at the visual centre of the smooth curve.
 */
function BundleLabels({ bundle, curvePolyline, showLengths, mmPerUnit }: { bundle: Bundle; curvePolyline: Point[]; showLengths?: boolean; mmPerUnit: number }) {
  const mid = polylineMidpoint(curvePolyline);

  // Geometric length (mm) from the already-sampled curve polyline.
  let geomUnits = 0;
  for (let i = 0; i < curvePolyline.length - 1; i++) {
    geomUnits += Math.hypot(
      curvePolyline[i + 1].x - curvePolyline[i].x,
      curvePolyline[i + 1].y - curvePolyline[i].y);
  }
  const geomMm = geomUnits * mmPerUnit;
  const hasDefined = bundle.length !== undefined;
  const lengthMm = hasDefined ? bundle.length! : geomMm;

  // Build the label rows top-to-bottom: name (if set), then count, then
  // length (when showLengths is on). Each is a small pill. A `muted` row
  // is drawn with the muted-foreground fill (used for the estimate).
  const rows: { text: string; kind: 'name' | 'count' | 'length'; muted?: boolean }[] = [];
  if (bundle.name) rows.push({ text: bundle.name, kind: 'name' });
  rows.push({
    text: `${bundle.conductors.length}`,
    kind: 'count',
  });
  if (showLengths) {
    rows.push({
      text: hasDefined ? `${Math.round(lengthMm)} mm` : `~${Math.round(lengthMm)} mm`,
      kind: 'length',
      muted: !hasDefined,
    });
  }
  const ROW_H = 14;
  const startY = mid.y - ((rows.length - 1) * ROW_H) / 2;
  return (
    <g pointerEvents="none">
      {rows.map((row, i) => {
        const cy = startY + i * ROW_H;
        // The length row is an editable pill — clicking it opens an inline
        // input. The name/count rows stay inert generic pills.
        if (row.kind === 'length') {
          return (
            <LengthLabel
              key={bundle.id + '-len'}
              bundleId={bundle.id}
              cx={mid.x}
              cy={cy}
              text={row.text}
              muted={!!row.muted}
              lengthMm={lengthMm}
            />
          );
        }
        // Pill width scales with text length — a rough monospace estimate.
        const w = Math.max(18, row.text.length * 6.2 + 8);
        const fill = row.kind === 'name'
          ? 'hsl(var(--primary))'
          : 'hsl(var(--background))';
        const textColor = row.kind === 'name'
          ? 'hsl(var(--primary-foreground))'
          : row.muted
            ? 'hsl(var(--muted-foreground))'
            : 'hsl(var(--foreground))';
        return (
          <g key={i}>
            <rect x={mid.x - w / 2} y={cy - ROW_H / 2 + 1}
                  width={w} height={ROW_H - 2} rx={5} ry={5}
                  fill={fill}
                  stroke="hsl(var(--border))" strokeWidth={0.5} />
            <text x={mid.x} y={cy + 3} fontSize={9}
                  textAnchor="middle"
                  fontWeight={row.kind === 'name' ? 700 : 500}
                  fill={textColor}
                  style={{ userSelect: 'none' }}>
              {row.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * The cable's length pill. Read-only display by default; when `showLengths`
 * is active a click turns it into an inline input (an HTML <input> in an SVG
 * <foreignObject>) so the user can type a measured length without leaving the
 * canvas. Enter / blur commits, Escape cancels. An empty field clears the
 * override (back to the geometric estimate).
 */
function LengthLabel({
  bundleId, cx, cy, text, muted, lengthMm,
}: {
  bundleId: string;
  cx: number; cy: number;
  text: string;
  muted: boolean;
  lengthMm: number;
}) {
  const activeSheetId = useWiring(s => s.activeSheetId);
  const setBundleLength = useWiring(s => s.setBundleLength);
  const [editing, setEditing] = useState(false);
  const W = Math.max(40, text.length * 6.2 + 12);
  const ROW_H = 14;
  if (editing) {
    return (
      <foreignObject x={cx - W / 2} y={cy - ROW_H / 2} width={W} height={ROW_H}
                     pointerEvents="all">
        <input
          autoFocus
          type="number"
          defaultValue={Math.round(lengthMm)}
          style={{
            width: '100%', height: '100%', boxSizing: 'border-box',
            fontSize: 9, textAlign: 'center', padding: 0,
            border: '1px solid hsl(var(--primary))', borderRadius: 4,
          }}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (activeSheetId) {
              setBundleLength(activeSheetId, bundleId,
                raw === '' ? undefined : Number(raw));
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            else if (e.key === 'Escape') setEditing(false);
          }}
        />
      </foreignObject>
    );
  }
  return (
    <g style={{ cursor: 'text', pointerEvents: 'all' }}
       onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
      <rect x={cx - W / 2} y={cy - ROW_H / 2 + 1}
            width={W} height={ROW_H - 2} rx={5} ry={5}
            fill="hsl(var(--background))"
            stroke="hsl(var(--border))" strokeWidth={0.5} />
      <text x={cx} y={cy + 3} fontSize={9} textAnchor="middle" fontWeight={500}
            fill={muted ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))'}
            style={{ userSelect: 'none' }}>
        {text}
      </text>
    </g>
  );
}

/**
 * A draggable cable bend-point handle (Phase 4). Drag re-positions the
 * waypoint in `HarnessOverrides.bundleWaypoints` (grid-snapped, live);
 * double-click removes it.
 */
function WaypointHandle({ bundleId, index, point, waypoints }: {
  bundleId: string;
  index: number;
  point: Point;
  waypoints: Point[];
}) {
  const setBundleWaypoints    = useWiring(s => s.setBundleWaypoints);
  const removeBundleWaypoint  = useWiring(s => s.removeBundleWaypoint);
  const beginTx  = useWiring(s => s.beginTransaction);
  const commitTx = useWiring(s => s.commitTransaction);
  const activeSheetId = useWiring(s => s.activeSheetId);
  const dragRef = useRef<{ offsetX: number; offsetY: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    beginTx();
    const w = pointerToWorld(e);
    dragRef.current = { offsetX: w.x - point.x, offsetY: w.y - point.y, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !activeSheetId) return;
    const w = pointerToWorld(e);
    d.moved = true;
    const snapped = snapPointToGrid({ x: w.x - d.offsetX, y: w.y - d.offsetY });
    const next = waypoints.slice();
    next[index] = snapped;
    setBundleWaypoints(activeSheetId, bundleId, next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ }
    commitTx();
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeSheetId) removeBundleWaypoint(activeSheetId, bundleId, index);
  };

  return (
    <g style={{ cursor: 'grab' }}
       onPointerDown={onPointerDown}
       onPointerMove={onPointerMove}
       onPointerUp={onPointerUp}
       onPointerCancel={onPointerUp}
       onDoubleClick={onDoubleClick}>
      {/* Fat transparent hit target. */}
      <circle cx={point.x} cy={point.y} r={11} fill="transparent" />
      <rect x={point.x - 4} y={point.y - 4} width={8} height={8}
            transform={`rotate(45 ${point.x} ${point.y})`}
            fill="hsl(var(--background))"
            stroke="hsl(var(--primary))" strokeWidth={1.5} />
    </g>
  );
}

/**
 * Splice node marker — drawn where a `Junction` (a wire-to-wire splice) sits
 * on the harness. A ringed dot. Draggable: a drag commits a node-position
 * override; a no-move pointer-up selects it (shift-click adds to the set).
 */
function SpliceNode({ nodeId, position, selected, allNodes, moveGroupIds, onSelect }: {
  nodeId: string;
  position: Point;
  selected: boolean;
  allNodes: HarnessNodeRef[];
  moveGroupIds?: string[];
  onSelect: (additive: boolean) => void;
}) {
  const drag = useHarnessNodeDrag(nodeId, position, allNodes, moveGroupIds);
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.onPointerUp(e)) { e.stopPropagation(); onSelect(e.shiftKey); }
  };
  return (
    <g style={{ cursor: 'grab' }}
       onPointerDown={drag.onPointerDown}
       onPointerMove={drag.onPointerMove}
       onPointerUp={onPointerUp}
       onPointerCancel={onPointerUp}>
      <title>Splice</title>
      <circle cx={position.x} cy={position.y} r={7}
              fill="hsl(var(--background))"
              stroke={selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
              strokeWidth={2} />
      <circle cx={position.x} cy={position.y} r={3}
              fill={selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
    </g>
  );
}

/**
 * Branch-point node marker — a small dot where a branch peels off a parent
 * cable. A derived fan-out ("Branch Point"), so it draws plainer than a
 * splice. Draggable; a no-move pointer-up selects it (shift-click adds).
 *
 * A small `label` pill (e.g. `BP1`) is drawn to the upper-right of the dot,
 * `pointer-events: none`, so the user can correlate markers with the Inspector.
 */
function BranchPointNode({ nodeId, position, selected, allNodes, moveGroupIds, label, onSelect }: {
  nodeId: string;
  position: Point;
  selected: boolean;
  allNodes: HarnessNodeRef[];
  moveGroupIds?: string[];
  label: string;
  onSelect: (additive: boolean) => void;
}) {
  const drag = useHarnessNodeDrag(nodeId, position, allNodes, moveGroupIds);
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.onPointerUp(e)) { e.stopPropagation(); onSelect(e.shiftKey); }
  };
  // Pill dimensions — kept small so the label doesn't crowd the marker.
  const pillW = Math.max(18, label.length * 6 + 6);
  const pillH = 12;
  // Position: slightly above-right of the dot centre.
  const pillX = position.x + 7;
  const pillY = position.y - 12;
  return (
    <g style={{ cursor: 'grab' }}
       onPointerDown={drag.onPointerDown}
       onPointerMove={drag.onPointerMove}
       onPointerUp={onPointerUp}
       onPointerCancel={onPointerUp}>
      <title>Branch Point {label}</title>
      {/* Fat transparent hit target so the small dot is easy to grab. */}
      <circle cx={position.x} cy={position.y} r={12} fill="transparent" />
      <circle cx={position.x} cy={position.y} r={5}
              fill={selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.8)'}
              stroke="hsl(var(--background))" strokeWidth={1.5} />
      {/* BP label pill — non-interactive, drawn above-right of the dot. */}
      {label && (
        <g pointerEvents="none">
          <rect x={pillX} y={pillY - pillH / 2}
                width={pillW} height={pillH} rx={4} ry={4}
                fill="hsl(var(--background))"
                stroke="hsl(var(--border))" strokeWidth={0.5}
                opacity={0.9} />
          <text x={pillX + pillW / 2} y={pillY + 3.5}
                fontSize={8} textAnchor="middle"
                fontWeight={600}
                fill="hsl(var(--muted-foreground))"
                style={{ userSelect: 'none' }}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
