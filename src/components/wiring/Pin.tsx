import type { Pin as PinType } from '@/lib/wiring/types';
import { useWiring } from '@/lib/wiring/store';
import { PIN_STUB_LENGTH } from '@/lib/wiring/layout';
import { askForNetLabel } from './NetLabelPickerDialog';

interface PinProps {
  pin: PinType;
  deviceId: string;
  /** World-local (device-local) position of the pin tip (where wires attach). */
  tipX: number;
  tipY: number;
  /** Direction the stub extends FROM the device: 'left', 'right', 'up', 'down'. */
  outwardDir: 'left' | 'right' | 'up' | 'down';
  /** Whether this pin also appears on another connector (warning state). */
  sharedWithOther?: boolean;
}

/**
 * A pin is rendered as a stub line pointing outward + a small connection
 * circle at the tip. The pin number, if present, sits along the stub.
 * Name labels are drawn by the ConnectorBlock, not here — the pin owns only
 * the stub + circle + pin-number glyph.
 */
export function Pin({ pin, deviceId, tipX, tipY, outwardDir, sharedWithOther }: PinProps) {
  const wiringFromPin    = useWiring(s => s.wiringFromPin);
  const startWiring      = useWiring(s => s.startWiring);
  const finishWiring     = useWiring(s => s.finishWiring);
  const addNetLabelOnPin = useWiring(s => s.addNetLabelOnPin);

  const pinKey = `${deviceId}:${pin.id}`;
  const active = wiringFromPin === pinKey;

  // Compute the stub's "root" = where it meets the device edge.
  let rootX = tipX, rootY = tipY;
  switch (outwardDir) {
    case 'left':  rootX = tipX + PIN_STUB_LENGTH; break;
    case 'right': rootX = tipX - PIN_STUB_LENGTH; break;
    case 'up':    rootY = tipY + PIN_STUB_LENGTH; break;
    case 'down':  rootY = tipY - PIN_STUB_LENGTH; break;
  }

  // Pin-number label placement (midway along the stub, offset perpendicular).
  const midX = (rootX + tipX) / 2;
  const midY = (rootY + tipY) / 2;
  const horizontal = outwardDir === 'left' || outwardDir === 'right';

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (useWiring.getState().toolMode === 'netLabel') {
      const text = await askForNetLabel();
      if (text) addNetLabelOnPin(pinKey, text);
      return;
    }
    if (wiringFromPin === null) startWiring(pinKey);
    else finishWiring(pinKey);
  };

  return (
    <g className="pin" style={{ cursor: 'pointer' }} onPointerDown={onPointerDown} onClick={onClick}>
      <line x1={rootX} y1={rootY} x2={tipX} y2={tipY} stroke="hsl(var(--foreground))" strokeWidth={1} />
      {pin.pinNumber && (
        <text
          x={midX}
          y={horizontal ? midY - 3 : midY}
          fontSize={8}
          fill="hsl(var(--muted-foreground))"
          textAnchor={horizontal ? 'middle' : 'middle'}
          style={{ pointerEvents: 'none' }}
          transform={horizontal ? undefined : `rotate(-90 ${midX} ${midY})`}
        >
          {pin.pinNumber}
        </text>
      )}
      {/* Invisible hit area for easier clicking */}
      <circle cx={tipX} cy={tipY} r={10} fill="transparent" />
      {/* Connection circle */}
      <circle
        cx={tipX} cy={tipY}
        r={active ? 5 : 3}
        fill={active ? 'hsl(var(--primary))' : 'hsl(var(--background))'}
        stroke={active ? 'hsl(var(--primary))' : (sharedWithOther ? '#f59e0b' : 'hsl(var(--foreground))')}
        strokeWidth={sharedWithOther ? 1.8 : 1.25}
      />
      {sharedWithOther && (
        <circle cx={tipX} cy={tipY} r={8} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.5} />
      )}
    </g>
  );
}
