import type { NetLabel } from '@/lib/wiring/types';
import { isJunctionKey } from '@/lib/wiring/types';
import { getPinWorldPos, useWiring } from '@/lib/wiring/store';
import { computePinInfo } from '@/lib/wiring/layout';
import { useGroupDrag } from '@/lib/wiring/useGroupDrag';

interface Props {
  label: NetLabel;
  selected: boolean;
  onSelect: (id: string, shift: boolean) => void;
  placedDevices: import('@/lib/wiring/types').PlacedDevice[];
}

// Deterministic color per unique label text so matching labels visually group.
// Returns a hex string so it can flow directly into <input type="color"> as
// the default value when the user opens the Inspector colour picker.
export function colorForText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 70, 50);
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

type OutwardDir = 'left' | 'right' | 'up' | 'down';

/** Resolve which way the pin's stub extends away from the device body so the
 *  label flag can point outward. Junction endpoints (`junction:<id>`) have no
 *  device context and fall back to 'right'. */
function resolveOutwardDir(
  pinKey: string,
  placedDevices: import('@/lib/wiring/types').PlacedDevice[],
): OutwardDir {
  if (isJunctionKey(pinKey)) return 'right';
  const [deviceId, pinId] = pinKey.split(':');
  const pd = placedDevices.find(
    p => p.deviceId === deviceId && p.connectors.some(c => c.pinIds.includes(pinId)),
  );
  if (!pd) return 'right';
  const info = computePinInfo(pd, pinId);
  return info?.outwardDir ?? 'right';
}

/**
 * Flag-style net label: a tiny pointed arrow + the label text, anchored at a
 * pin or wire-endpoint. Labels sharing the same text imply an electrical net
 * without a wire being drawn between them. The flag always points OUTWARD
 * from the device so it sits clear of the connector body.
 */
export function NetLabelView({ label, selected, onSelect, placedDevices }: Props) {
  const wiringFromPin       = useWiring(s => s.wiringFromPin);
  const startWiring         = useWiring(s => s.startWiring);
  const finishWiring        = useWiring(s => s.finishWiring);
  const baseAnchor = getPinWorldPos(placedDevices, label.attachedTo);
  if (!baseAnchor) return null;

  // Drag offset — the user can shift the flag away from its electrical
  // anchor for clarity. The anchor (where the flag *points*) follows the
  // attached pin/wire/point; only the flag body moves with the offset.
  const offset = label.offset ?? { dx: 0, dy: 0 };
  const flagAnchorX = baseAnchor.x + offset.dx;
  const flagAnchorY = baseAnchor.y + offset.dy;
  const anchor = { x: flagAnchorX, y: flagAnchorY };

  // The label's own connection key — wires that finish on this label store
  // `#labelId` as their endpoint, so they follow the flag when the user
  // drags it (resolved via getPinWorldPos in the store).
  const selfPinKey = `#${label.id}`;

  // Unified drag — the hook handles snap-to-grid, multi-select snapshotting,
  // and dispatch to moveSelectionBy (which knows how to translate a delta
  // into an offset bump for net labels). The "position" we hand it is the
  // flag's current visual position (anchor + offset), since that's what the
  // hook treats as the snapping anchor.
  const drag = useGroupDrag({
    kind: 'netLabel',
    id: label.id,
    position: anchor,
  });

  // Suppress the hook's pointer-down when the user is actively wiring, so
  // the click-to-finish-wire path keeps priority. Same condition as before.
  const onPointerDown = (e: React.PointerEvent) => {
    if (wiringFromPin) return;
    drag.onPointerDown(e);
  };
  const onPointerUp = drag.onPointerUp;

  // Rotation override: when the user pinned a specific orientation in the
  // Inspector, derive the outward direction from that instead of the pin
  // side. 0° = right, 90° = down, 180° = left, 270° = up.
  const ROT_TO_DIR: Record<number, OutwardDir> = { 0: 'right', 90: 'down', 180: 'left', 270: 'up' };
  const dir: OutwardDir = label.rotation !== undefined
    ? ROT_TO_DIR[label.rotation]
    : resolveOutwardDir(label.attachedTo, placedDevices);
  // User-chosen colour wins over the text-derived hash so distinct nets can
  // be deliberately re-coloured (e.g. all power rails red, signal blue).
  const fill = label.color ?? colorForText(label.text);
  const textWidth = Math.max(label.text.length * 7 + 8, 24);
  const boxH = 18;
  const stubGap = 4;   // gap between the tip and the anchor point
  const tipDepth = 6;  // pentagon's pointed tip length

  // Compute the pentagon vertices for each outward direction so the flag
  // points away from the device (left pin → flag to the left, etc.).
  // tipX/tipY is the pentagon's pointed end — also the visual connection
  // point for wires that finish at this label.
  let pathD: string;
  let textX: number;
  let textY: number;
  let tipX: number;
  let tipY: number;

  if (dir === 'left' || dir === 'right') {
    const sign = dir === 'right' ? 1 : -1;
    tipX = anchor.x + sign * stubGap;
    tipY = anchor.y;
    const bodyNearX = tipX + sign * tipDepth;
    const bodyFarX  = bodyNearX + sign * textWidth;
    const boxTop = tipY - boxH / 2;
    const boxBottom = tipY + boxH / 2;
    pathD = [
      `M ${tipX} ${tipY}`,
      `L ${bodyNearX} ${boxTop}`,
      `L ${bodyFarX} ${boxTop}`,
      `L ${bodyFarX} ${boxBottom}`,
      `L ${bodyNearX} ${boxBottom}`,
      'Z',
    ].join(' ');
    textX = (bodyNearX + bodyFarX) / 2;
    textY = tipY + 4;
  } else {
    const sign = dir === 'down' ? 1 : -1;
    tipX = anchor.x;
    tipY = anchor.y + sign * stubGap;
    const bodyNearY = tipY + sign * tipDepth;
    const bodyFarY  = bodyNearY + sign * boxH;
    const boxLeft  = tipX - textWidth / 2;
    const boxRight = tipX + textWidth / 2;
    pathD = [
      `M ${tipX} ${tipY}`,
      `L ${boxLeft} ${bodyNearY}`,
      `L ${boxLeft} ${bodyFarY}`,
      `L ${boxRight} ${bodyFarY}`,
      `L ${boxRight} ${bodyNearY}`,
      'Z',
    ].join(' ');
    textX = tipX;
    textY = (bodyNearY + bodyFarY) / 2 + 4;
  }

  return (
    <g
      onPointerDown={onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => {
        e.stopPropagation();
        // Wire-mode docking: clicking a label while a wire is being drawn
        // attaches the wire to the LABEL itself (key `#labelId`), not to
        // the label's underlying anchor pin. The wire follows the flag
        // around the canvas — exactly how a wire to a device pin behaves.
        if (wiringFromPin && wiringFromPin !== selfPinKey) {
          finishWiring(selfPinKey);
          return;
        }
        // Alt-click pulls a new wire out of the label's tip.
        if (!wiringFromPin && e.altKey) {
          startWiring(selfPinKey);
          return;
        }
        onSelect(label.id, e.shiftKey);
      }}
      style={{ cursor: wiringFromPin ? 'crosshair' : 'grab' }}
    >
      <path
        d={pathD}
        fill={fill}
        stroke={selected ? 'hsl(var(--primary))' : fill}
        strokeWidth={selected ? 2 : 0}
        opacity={0.85}
      />
      <text
        x={textX}
        y={textY}
        fontSize={11}
        fontWeight={700}
        textAnchor="middle"
        fill="#ffffff"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {label.text}
      </text>
      {/* Connection point — small open circle at the wire-endpoint
          coordinate (= where `getPinWorldPos('#labelId')` resolves to).
          Matches the visual style of device pins so users recognise it
          as a connectable point. */}
      <circle
        cx={anchor.x} cy={anchor.y} r={2.5}
        fill="hsl(var(--background))"
        stroke="hsl(var(--foreground))"
        strokeWidth={1}
        style={{ pointerEvents: 'none' }}
      />
      {/* Larger invisible hit-circle so wires snap to the connection point
          even when the user clicks slightly off-centre. `pointerEvents="all"`
          forces hit detection on the transparent fill (some browsers skip
          fully-transparent SVG fills under the default `visiblePainted`).
          Click + cursor style are bound directly here so wiring-mode shows
          the same 'crosshair' affordance device pins do — the parent `<g>`
          isn't a paint target itself, so its `cursor` style doesn't apply
          to the empty space inside it. */}
      <circle
        cx={anchor.x} cy={anchor.y} r={10}
        fill="transparent"
        pointerEvents="all"
        style={{ cursor: wiringFromPin ? 'crosshair' : 'pointer' }}
        onPointerDown={(e) => { e.stopPropagation(); }}
        onClick={(e) => {
          e.stopPropagation();
          if (wiringFromPin && wiringFromPin !== selfPinKey) {
            finishWiring(selfPinKey);
            return;
          }
          if (!wiringFromPin) {
            startWiring(selfPinKey);
            return;
          }
        }}
      />
    </g>
  );
}
