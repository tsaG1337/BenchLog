import type { PlacedDevice, ConnectorInstance } from '@/lib/wiring/types';
import { useWiring } from '@/lib/wiring/store';
import { Pin } from './Pin';
import type { ConnectorLayout } from '@/lib/wiring/layout';
import { CONN_HEADER, CONN_PAD } from '@/lib/wiring/layout';
import { getPinConnectorCount } from '@/lib/wiring/layout';

interface Props {
  device: PlacedDevice;
  connector: ConnectorInstance;
  layout: ConnectorLayout;
  selected: boolean;
  onSelect: (id: string, shift: boolean) => void;
}

export function ConnectorBlock({ device, connector, layout, selected, onSelect }: Props) {
  const beginConnectorDrag = useWiring(s => s.beginConnectorDrag);
  const isHorizontalSide = connector.side === 'top' || connector.side === 'bottom';
  const rotateLabels = isHorizontalSide;

  const onClickBlock = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(connector.id, e.shiftKey);
  };

  // Begin a connector-drag gesture. Stop propagation so DeviceBlock doesn't
  // also start a placement-drag from the same pointerdown. Canvas listens
  // for pointerup globally to end / cancel the drag.
  const onDragHandlePointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    beginConnectorDrag(device.id, connector.id);
  };

  // Header bar position — top of the block for left/right, one side for top/bottom.
  const headerRect = isHorizontalSide
    ? (connector.side === 'top'
        ? { x: layout.x, y: layout.y + layout.height - CONN_HEADER, w: layout.width, h: CONN_HEADER }
        : { x: layout.x, y: layout.y, w: layout.width, h: CONN_HEADER })
    : { x: layout.x, y: layout.y, w: layout.width, h: CONN_HEADER };

  return (
    <g>
      {/* Outer connector rect */}
      <rect
        x={layout.x} y={layout.y}
        width={layout.width} height={layout.height}
        rx={2}
        fill="hsl(var(--muted) / 0.3)"
        stroke={selected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
        strokeWidth={selected ? 2 : 1}
        onClick={onClickBlock}
        style={{ cursor: 'pointer' }}
      />

      {/* Header bar */}
      <rect
        x={headerRect.x} y={headerRect.y}
        width={headerRect.w} height={headerRect.h}
        fill="hsl(var(--accent))"
        opacity={0.5}
        style={{ pointerEvents: 'none' }}
      />
      {/* Header text: display name, with the physical connector name
          appended in a muted colour so the user can always see which plug
          this view represents — otherwise a custom display name like
          "Blablabla" hides the electrical identity. Suppressed when the
          display name already matches (or starts with) the physical name. */}
      <text
        x={headerRect.x + headerRect.w / 2}
        y={headerRect.y + headerRect.h / 2 + 3}
        fontSize={9}
        fontWeight={600}
        textAnchor="middle"
        fill="hsl(var(--foreground))"
        style={{ pointerEvents: 'none' }}
      >
        {connector.name}
        {connector.logicalConnectorName && connector.logicalConnectorName !== connector.name
          && !connector.name.includes(connector.logicalConnectorName) && (
          <tspan dx={4} fontWeight={400} fill="hsl(var(--muted-foreground))">
            ({connector.logicalConnectorName})
          </tspan>
        )}
      </text>

      {/* Drag handle — small grab area at the right end of the header. The
          user pointer-downs here to start dragging this connector view to
          another sibling placement of the same device. Sized so it fits
          on a 60-px-wide header but doesn't overlap the centered title.
          We render the dotted icon as text so it inherits theme colors. */}
      <g
        onPointerDown={onDragHandlePointerDown}
        style={{ cursor: 'grab' }}
      >
        <rect
          x={headerRect.x + headerRect.w - 14}
          y={headerRect.y + 1}
          width={12}
          height={headerRect.h - 2}
          rx={2}
          fill="transparent"
        />
        <text
          x={headerRect.x + headerRect.w - 8}
          y={headerRect.y + headerRect.h / 2 + 3}
          fontSize={11}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ⋮⋮
        </text>
      </g>

      {/* Pin labels (name text) */}
      {layout.pinLabels.map(pl => (
        <text
          key={pl.pinId}
          x={pl.x} y={pl.y}
          fontSize={9}
          fill="hsl(var(--foreground))"
          textAnchor={rotateLabels ? 'start' : pl.anchor}
          style={{ pointerEvents: 'none' }}
          transform={rotateLabels ? `rotate(-90 ${pl.x} ${pl.y})` : undefined}
        >
          {pl.name}
        </text>
      ))}

      {/* Pins (stubs + circles) */}
      {layout.pinPositions.map(pp => {
        const pin = device.pinCatalog.find(p => p.id === pp.pinId);
        if (!pin) return null;
        const shared = getPinConnectorCount(device, pin.id) > 1;
        return (
          <Pin
            key={pin.id}
            pin={pin}
            deviceId={device.deviceId}
            tipX={pp.x}
            tipY={pp.y}
            outwardDir={layout.outwardDir}
            sharedWithOther={shared}
          />
        );
      })}
    </g>
  );
}
