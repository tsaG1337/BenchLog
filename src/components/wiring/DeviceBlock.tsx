import { useMemo } from 'react';
import type { PlacedDevice } from '@/lib/wiring/types';
import { useWiring } from '@/lib/wiring/store';
import { layoutDevice, DEVICE_HEADER } from '@/lib/wiring/layout';
import { getSymbolDef } from '@/lib/wiring/symbols';
import { useGroupDrag } from '@/lib/wiring/useGroupDrag';
import { ConnectorBlock } from './ConnectorBlock';
import { SymbolBlock } from './SymbolBlock';

/**
 * Renders a single PlacedDevice (one unit of a logical Device on a sheet).
 * The `id` we expose to click handlers and the store is the PLACEMENT id
 * (e.g. "U1A") — that's the unit the user interacts with on this sheet.
 *
 * The parent is expected to set `device.name` to the correct per-placement
 * display value (e.g. "U1" for single-placement devices, "U1A" when the
 * device has multiple placements). That's just a render-time override of
 * the logical device's `name` field — the underlying Device is unchanged.
 */
export function DeviceBlock({ device, selected, selectedConnectorIds, onSelectDevice, onSelectConnector }: {
  device: PlacedDevice;
  selected: boolean;
  selectedConnectorIds: Set<string>;
  onSelectDevice: (id: string, shift: boolean) => void;
  onSelectConnector: (id: string, shift: boolean) => void;
}) {
  const connectorDrag = useWiring(s => s.connectorDrag);
  const moveConnectorToPlacement = useWiring(s => s.moveConnectorToPlacement);
  const endConnectorDrag = useWiring(s => s.endConnectorDrag);
  const drag = useGroupDrag({ kind: 'placement', id: device.id, position: device.position });

  // Is THIS placement a valid drop target for the active connector-drag?
  // True when a drag is in progress, the dragged connector belongs to the
  // same logical device, and we're not dropping back onto the source.
  const isDropTarget =
    !!connectorDrag &&
    connectorDrag.deviceId === device.deviceId &&
    connectorDrag.fromPlacementId !== device.id;

  // pointer-up handler used while a connector-drag is active. Drops the
  // moved connector onto this placement and ends the gesture.
  const onConnectorDrop = (e: React.PointerEvent<SVGRectElement>) => {
    if (!connectorDrag || !isDropTarget) return;
    e.stopPropagation();
    moveConnectorToPlacement(
      connectorDrag.fromPlacementId,
      connectorDrag.connectorId,
      device.id
    );
    endConnectorDrag();
  };

  const symbolDef = getSymbolDef(device.symbolType);

  // Compute the layout once per render (connector-based path only).
  const { width, height, connectors: connLayout } = useMemo(
    () => symbolDef
      ? { width: symbolDef.width, height: symbolDef.height, connectors: new Map() }
      : layoutDevice(device),
    [device, symbolDef]
  );

  const onPointerUp = (e: React.PointerEvent<SVGGElement>) => {
    const wasClick = drag.onPointerUp(e);
    if (wasClick) onSelectDevice(device.id, e.shiftKey);
  };

  // ── Symbol-rendered devices get a compact frame + custom body ─────────
  if (symbolDef) {
    return (
      <g transform={`translate(${device.position.x} ${device.position.y})`}>
        {/* Invisible hit rect — gives the symbol a reliably draggable area without
            obscuring its artwork. Clicking anywhere inside drags/selects. */}
        <rect
          x={-4} y={-4}
          width={width + 8} height={height + 8}
          fill="transparent"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: 'move' }}
        />
        {selected && (
          <rect
            x={-4} y={-4}
            width={width + 8} height={height + 8}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={1.2}
            strokeDasharray="4 3"
            style={{ pointerEvents: 'none' }}
          />
        )}
        <SymbolBlock device={device} def={symbolDef} />
      </g>
    );
  }

  return (
    <g
      transform={`translate(${device.position.x} ${device.position.y})`}
      // Drop handler at the parent <g> so a release on ANY child element
      // (body rect, connector view, header, …) ends the drag here. This is
      // the only handler that calls moveConnectorToPlacement; the body
      // rect's regular onPointerUp is a no-op during a connector-drag
      // because dragState is never primed (drag-handle pointerDown stops
      // propagation before the body sees it).
      onPointerUp={isDropTarget ? onConnectorDrop : undefined}
    >
      {/* Device body — the large container. Clicking here drags/selects the device. */}
      <rect
        width={width} height={height}
        rx={4}
        fill="hsl(var(--card))"
        stroke={isDropTarget
          ? 'hsl(142 70% 45%)'
          : selected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
        strokeWidth={isDropTarget ? 3 : selected ? 2 : 1}
        strokeDasharray={isDropTarget ? '6 4' : undefined}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: isDropTarget ? 'copy' : 'move' }}
      />
      {/* Title bar */}
      <rect
        width={width} height={DEVICE_HEADER}
        rx={4}
        fill="hsl(var(--accent))"
        opacity={0.35}
        style={{ pointerEvents: 'none' }}
      />
      <text
        x={10} y={16}
        fontSize={12} fontWeight={700}
        fill="hsl(var(--foreground))"
        style={{ pointerEvents: 'none' }}
      >
        {device.name}
      </text>
      {device.productName && (
        <text
          x={10} y={26}
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
          style={{ pointerEvents: 'none' }}
        >
          {device.productName}
        </text>
      )}

      {/* Connectors */}
      {device.connectors.map(c => {
        const layout = connLayout.get(c.id);
        if (!layout) return null;
        return (
          <ConnectorBlock
            key={c.id}
            device={device}
            connector={c}
            layout={layout}
            selected={selectedConnectorIds.has(c.id)}
            onSelect={onSelectConnector}
          />
        );
      })}
    </g>
  );
}
