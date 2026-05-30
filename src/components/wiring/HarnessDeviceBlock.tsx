import { useRef } from 'react';
import type { PlacedDevice, Device, Orientation, Point } from '@/lib/wiring/types';
import { useHarnessNodeDrag, type HarnessNodeRef } from '@/lib/wiring/useHarnessNodeDrag';
import {
  harnessBlockLayout, orderedLogicalConnectors,
  HARNESS_BLOCK_HEADER_H, HARNESS_BLOCK_ROW_H, HARNESS_BLOCK_COL_W,
} from '@/lib/wiring/harness';
import { useWiring } from '@/lib/wiring/store';

interface Props {
  placement: PlacedDevice;
  device: Device;
  selected: boolean;
  onSelect: (id: string, shift: boolean) => void;
  /** Device rotation in the harness view. Drives which edge the connector
   *  strip + header sit on. Defaults to 0° (connectors on the left, header
   *  on top). A later task wires this from `WiringPage` via the override
   *  layer; until then the default keeps the block rendering as before. */
  orientation?: Orientation;
  /** Every harness node on the sheet — fed to the drag hook so a Component
   *  block participates in alignment guides + multi-select group moves. */
  allNodes?: HarnessNodeRef[];
  /** The explicit set of harness-node ids that travel together when this
   *  block is dragged as part of a whole-harness (double-clicked tree) move. */
  moveGroupIds?: string[];
  /** Optional connector ordering from `HarnessOverrides.connectorOrder`. When
   *  present, rows render in this order and the user can drag-reorder them. */
  connectorOrder?: string[];
  /** When true, the block belongs to the currently double-clicked harness tree
   *  and receives the same selection outline as a directly-selected block. */
  inSelectedHarness?: boolean;
}

// HARNESS_BLOCK_HEADER_H + HARNESS_BLOCK_ROW_H live in @/lib/wiring/harness so
// non-render code can reuse the geometry. Re-export for backwards
// compatibility with anything still importing them from this file.
export { HARNESS_BLOCK_HEADER_H, HARNESS_BLOCK_ROW_H };

/**
 * Compact device block for the harness view — the visual for a `component`
 * node of the derived `HarnessGraph`.
 *
 * Visually: one entry per *physical* (logical) connector — the schematic's
 * L/R split is hidden because in a real harness a 15-pin DSUB is one
 * connector, not two.
 *
 * The block rotates in 90° steps: `harnessBlockLayout` is the single source
 * of truth for the bounding box, which edge the connector strip + header sit
 * on, and each connector's block-local dock point. The hexagonal port for
 * every connector is drawn EXACTLY at its `localDocks` point so the derived
 * harness cable (which docks at `connectorDockPoints`, the same points in
 * world space) always lines up with the port.
 *
 *  - `0°`   → connectors on the LEFT edge, header on TOP   — tall row layout
 *  - `180°` → connectors on the RIGHT edge, header on TOP  — tall row layout
 *  - `90°`  → connectors on the TOP edge, header on BOTTOM — wide column layout
 *  - `270°` → connectors on the BOTTOM edge, header on TOP — wide column layout
 *
 * Header text + connector text always stay horizontal and readable; only the
 * edge the strip appears on changes.
 *
 * Phase 3: the block is draggable — the `component` harness node's stable id
 * is its placement id, so a drag commits a `nodePositions` override that
 * survives re-derivation.
 */
export function HarnessDeviceBlock({
  placement, device, selected, onSelect, orientation = 0, allNodes, moveGroupIds, connectorOrder, inSelectedHarness,
}: Props) {
  // The `component` harness node's stable id is the placement id; `placement`
  // here already carries the harness-view (derived/overridden) position.
  const drag = useHarnessNodeDrag(placement.id, placement.position, allNodes, moveGroupIds);
  const onPointerUp = (e: React.PointerEvent) => {
    const wasClick = drag.onPointerUp(e);
    if (wasClick) onSelect(placement.id, e.shiftKey);
  };

  const setConnectorOrder = useWiring(s => s.setConnectorOrder);
  const beginTransaction  = useWiring(s => s.beginTransaction);
  const commitTransaction = useWiring(s => s.commitTransaction);
  const activeSheetId     = useWiring(s => s.activeSheetId);
  const gripDragRef = useRef<{ name: string } | null>(null);

  // Single source of truth for the bounding box + connector dock points.
  const layout = harnessBlockLayout(placement, orientation, connectorOrder);
  const { width, height, connectorEdge, headerEdge, localDocks } = layout;
  const horizontalStrip = connectorEdge === 'top' || connectorEdge === 'bottom';

  // Header strip occupies HARNESS_BLOCK_HEADER_H at the top or bottom edge.
  const headerY0 = headerEdge === 'top' ? 0 : height - HARNESS_BLOCK_HEADER_H;
  // Baseline for the (horizontal) header text — a few px above the strip's
  // bottom edge regardless of which edge the strip sits on.
  // The -6 is a text-baseline nudge: centres the glyphs visually inside the strip.
  const headerBaseline = headerY0 + HARNESS_BLOCK_HEADER_H - 6;
  // Divider line between the header strip and the connector area.
  const headerDividerY = headerEdge === 'top' ? HARNESS_BLOCK_HEADER_H : height - HARNESS_BLOCK_HEADER_H;

  function dockOf(name: string): Point {
    // Every connector name produced by `logicalConnectorsOf` is keyed in
    // `localDocks` by `harnessBlockLayout` — fall back to the origin only to
    // stay type-safe (should never happen in a consistent layout).
    return localDocks.get(name) ?? { x: 0, y: 0 };
  }

  // Ordered list of logical connectors (respects the connectorOrder override).
  const orderedConns = orderedLogicalConnectors(placement, connectorOrder);
  // Show drag grips only when the block is selected and has ≥ 2 connectors in
  // the vertical (row) layout — grips do not apply to the horizontal strip.
  const showGrips = selected && !horizontalStrip && orderedConns.length >= 2;

  // ── Connector-row reorder grip handlers ──────────────────────────────────

  function makeGripHandlers(connName: string) {
    const onGripPointerDown = (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      // CRITICAL: stop the event so `useHarnessNodeDrag` on the outer <g>
      // never sees it — the grip drag and the whole-block drag are mutually
      // exclusive.
      e.stopPropagation();
      beginTransaction();
      gripDragRef.current = { name: connName };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    };

    const onGripPointerMove = (e: React.PointerEvent) => {
      if (!gripDragRef.current || !activeSheetId) return;
      // Convert pointer to SVG world coords (mirrors WaypointHandle pattern).
      const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const world = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      // Block-local Y: world Y minus the block's top-left position.
      const localY = world.y - placement.position.y;
      // Compute the slot the pointer is hovering over.
      const n = orderedLogicalConnectors(placement, connectorOrder).length;
      const slot = Math.max(
        0,
        Math.min(
          n - 1,
          Math.round((localY - HARNESS_BLOCK_HEADER_H - HARNESS_BLOCK_ROW_H / 2) / HARNESS_BLOCK_ROW_H),
        ),
      );
      // Reorder: remove dragged connector and splice it into its new slot.
      const names = orderedLogicalConnectors(placement, connectorOrder).map(lc => lc.name);
      const cur = names.indexOf(gripDragRef.current.name);
      if (cur === slot) return; // already in the right place — no-op
      names.splice(cur, 1);
      names.splice(slot, 0, gripDragRef.current.name);
      setConnectorOrder(activeSheetId, placement.id, names);
    };

    const onGripPointerUp = (e: React.PointerEvent) => {
      if (!gripDragRef.current) return;
      gripDragRef.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ }
      commitTransaction();
    };

    return { onGripPointerDown, onGripPointerMove, onGripPointerUp };
  }

  return (
    <g
      transform={`translate(${placement.position.x}, ${placement.position.y})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: 'grab' }}
    >
      {/* Body */}
      <rect
        x={0} y={0}
        width={width} height={height}
        rx={6} ry={6}
        fill="hsl(var(--background))"
        stroke={selected || inSelectedHarness ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
        strokeWidth={selected || inSelectedHarness ? 2 : 1}
      />

      {/* Header — name + product name, horizontal text, on the header edge. */}
      <text x={8} y={headerBaseline} fontSize={12} fontWeight={700} fill="hsl(var(--foreground))"
            style={{ userSelect: 'none' }}>
        {device.name}
      </text>
      <text x={width - 8} y={headerBaseline} fontSize={10} fill="hsl(var(--muted-foreground))"
            textAnchor="end" style={{ userSelect: 'none' }}>
        {device.productName}
      </text>
      <line x1={0} y1={headerDividerY} x2={width} y2={headerDividerY}
            stroke="hsl(var(--border))" strokeWidth={1} />

      {/* Connectors. */}
      {horizontalStrip
        ? /* ── Horizontal strip — one compact column per connector ──────── */
          orderedConns.map(lc => {
            const dock = dockOf(lc.name);
            // Connector-name label, horizontal, centred under/over the port,
            // truncated to fit one column pitch.
            const labelY = connectorEdge === 'top'
              ? dock.y + 14   // strip on top → label below the port
              : dock.y - 8;   // strip on bottom → label above the port
            return (
              <g key={lc.name}>
                <text x={dock.x} y={labelY} fontSize={9} fill="hsl(var(--foreground))"
                      textAnchor="middle" style={{ userSelect: 'none' }}>
                  {truncateLabel(lc.name)}
                </text>
                {/* Port hexagon drawn at the layout's local dock point — the
                    derived cable docks at the same world point. */}
                <ConnectorPort cx={dock.x} cy={dock.y} />
              </g>
            );
          })
        : /* ── Vertical strip — one row per connector (L/R views collapsed) ── */
          orderedConns.map((lc, i) => {
            const dock = dockOf(lc.name);
            // The dock's y is the connector row centre; the -5 is a
            // text-baseline nudge that seats the glyphs inside the row band.
            const textY = dock.y + HARNESS_BLOCK_ROW_H / 2 - 5;
            // Grip sits at the row's inner edge (opposite the connector port).
            const gripX = connectorEdge === 'left' ? width - 8 : 8;
            const gripY = HARNESS_BLOCK_HEADER_H + i * HARNESS_BLOCK_ROW_H + HARNESS_BLOCK_ROW_H / 2;
            const { onGripPointerDown, onGripPointerMove, onGripPointerUp } = makeGripHandlers(lc.name);
            return (
              <g key={lc.name}>
                <text x={8} y={textY} fontSize={11} fill="hsl(var(--foreground))"
                      style={{ userSelect: 'none' }}>
                  {lc.name}
                </text>
                <text x={width - 8} y={textY} fontSize={10}
                      fill="hsl(var(--muted-foreground))"
                      textAnchor="end" style={{ userSelect: 'none' }}>
                  [{lc.pinCount}]
                </text>
                {/* Port hexagon on the connector edge — drawn at the layout's
                    local dock point so the derived cable always lines up. */}
                <ConnectorPort cx={dock.x} cy={dock.y} />
                {/* Drag grip — only visible when selected and device has ≥ 2
                    connectors. Placed at the row's inner edge so it does not
                    overlap the connector port or labels. */}
                {showGrips && (
                  <g
                    style={{ cursor: 'ns-resize' }}
                    onPointerDown={onGripPointerDown}
                    onPointerMove={onGripPointerMove}
                    onPointerUp={onGripPointerUp}
                    onPointerCancel={onGripPointerUp}
                  >
                    {/* Transparent hit-target for easier grabbing. */}
                    <rect
                      x={gripX - 6} y={gripY - 6}
                      width={12} height={12}
                      fill="transparent"
                    />
                    {/* Subtle 2×3 dot-grid (⠿-style) grip indicator. */}
                    <DragGripDots cx={gripX} cy={gripY} />
                  </g>
                )}
              </g>
            );
          })}
    </g>
  );
}

/** Truncate a connector name to roughly one column pitch (~44px) of 9px text. */
function truncateLabel(name: string): string {
  // ~5px per glyph at fontSize 9 → ~7 glyphs fit one HARNESS_BLOCK_COL_W pitch.
  const maxChars = Math.max(3, Math.floor(HARNESS_BLOCK_COL_W / 5) - 1);
  return name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
}

function ConnectorPort({ cx, cy }: { cx: number; cy: number }) {
  // Small hexagon, centered on (cx, cy).
  const r = 4;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
  return <polygon points={pts} fill="hsl(var(--muted))" stroke="hsl(var(--foreground))" strokeWidth={1} />;
}

/**
 * A subtle 2×3 dot-grid drag-grip indicator (⠿-style), centred on (cx, cy).
 * Low-contrast so the block stays clean; the hit-target rect around it is
 * what makes it easy to grab.
 */
function DragGripDots({ cx, cy }: { cx: number; cy: number }) {
  const r = 1;
  const cols = [-2, 2] as const;
  const rows = [-3, 0, 3] as const;
  return (
    <g pointerEvents="none">
      {rows.map(dy =>
        cols.map(dx => (
          <circle
            key={`${dx},${dy}`}
            cx={cx + dx} cy={cy + dy} r={r}
            fill="hsl(var(--muted-foreground) / 0.4)"
          />
        )),
      )}
    </g>
  );
}
