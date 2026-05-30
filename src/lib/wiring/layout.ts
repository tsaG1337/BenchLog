import type { Device, PlacedDevice, ConnectorInstance, Pin, Point, Side } from './types';
import { isJunctionKey } from './types';
import {
  PIN_SPACING, PIN_STUB_LENGTH, CONN_HEADER, CONN_PAD,
  DEVICE_HEADER, SIDE_MARGIN, MIN_DEV_WIDTH, MIN_DEV_HEIGHT,
} from './constants';
import { computeSymbolPinWorldPos, getSymbolDef } from './symbols';

// Re-export for back-compat — existing callers import these from layout.
export {
  PIN_SPACING, PIN_STUB_LENGTH, CONN_HEADER, CONN_PAD,
  DEVICE_HEADER, SIDE_MARGIN, MIN_DEV_WIDTH, MIN_DEV_HEIGHT,
};

/**
 * Returns the bounding box of a connector in the device's LOCAL coordinate
 * system (0,0 is the top-left of the device body). Size is driven by pin count.
 *
 * Connectors stack along their side in array order; all connectors on the
 * same side split the available space evenly.
 */
export interface ConnectorLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The direction pins extend from the connector (and away from the device). */
  outwardDir: 'left' | 'right' | 'up' | 'down';
  /** Pin positions in device-local coords. */
  pinPositions: { pinId: string; x: number; y: number }[];
  /** Pin-label positions (where the text goes). */
  pinLabels: { pinId: string; x: number; y: number; anchor: 'start' | 'end'; name: string; pinNumber?: string }[];
}

/**
 * Compute the layout of every connector on a device. Returns a map keyed by
 * connector id, plus the effective device dimensions (connectors may push
 * the device larger than the template declared).
 */
export function layoutDevice(device: PlacedDevice): {
  width: number;
  height: number;
  connectors: Map<string, ConnectorLayout>;
} {
  // Group connectors by side in their array order.
  const bySide: Record<Side, ConnectorInstance[]> = { left: [], right: [], top: [], bottom: [] };
  for (const c of device.connectors) bySide[c.side].push(c);

  // Required device dimensions to hold all the connectors.
  const leftPinsTotal   = bySide.left  .reduce((s, c) => s + c.pinIds.length, 0);
  const rightPinsTotal  = bySide.right .reduce((s, c) => s + c.pinIds.length, 0);
  const topPinsTotal    = bySide.top   .reduce((s, c) => s + c.pinIds.length, 0);
  const bottomPinsTotal = bySide.bottom.reduce((s, c) => s + c.pinIds.length, 0);

  // ── Per-connector vertical width driven by its longest pin label ──
  // Uppercase-heavy labels push the average char width up; 6.8 px/char
  // plus 18-px side pad keeps labels away from the pin stubs.
  const CHAR_PX = 6.8;
  const CONN_LABEL_PAD = 18;
  const MIN_CONN_WIDTH = 90;
  const labelWidthFor = (conn: ConnectorInstance): number => {
    let longest = 0;
    for (const pinId of conn.pinIds) {
      const pin = device.pinCatalog.find(p => p.id === pinId);
      if (!pin) continue;
      const text = pin.name ?? '';
      if (text.length > longest) longest = text.length;
    }
    // Header text: "display (physical)" if the two differ — same rule the
    // renderer uses. Count BOTH lengths plus " ()" so the box fits the hint.
    const displayName = conn.name ?? '';
    const physName    = conn.logicalConnectorName ?? '';
    const showHint = physName && physName !== displayName && !displayName.includes(physName);
    const titleLen = displayName.length + (showHint ? physName.length + 3 : 0);
    if (titleLen > longest) longest = titleLen;
    return Math.max(MIN_CONN_WIDTH, Math.ceil(longest * CHAR_PX + CONN_LABEL_PAD));
  };
  const vertConnWidth = (conn: ConnectorInstance): number => labelWidthFor(conn);

  // Horizontal (top/bottom) connectors get a dynamic height so their
  // rotated pin labels have room to breathe. Height budget is
  // CONN_HEADER + label-length + padding so labels stay inside the body
  // area; before this the labels bled up past the header into the device.
  const HORIZ_CONN_MIN_HEIGHT = 50;
  const HORIZ_LABEL_BODY_PAD  = 14;
  const horizConnHeight = (conn: ConnectorInstance): number => {
    let longest = 0;
    for (const pinId of conn.pinIds) {
      const pin = device.pinCatalog.find(p => p.id === pinId);
      const len = pin?.name?.length ?? 0;
      if (len > longest) longest = len;
    }
    return Math.max(
      HORIZ_CONN_MIN_HEIGHT,
      CONN_HEADER + Math.ceil(longest * CHAR_PX) + HORIZ_LABEL_BODY_PAD,
    );
  };

  const widestLeft   = bySide.left  .reduce((w, c) => Math.max(w, vertConnWidth(c)), 0);
  const widestRight  = bySide.right .reduce((w, c) => Math.max(w, vertConnWidth(c)), 0);
  const widestTop    = bySide.top   .reduce((h, c) => Math.max(h, horizConnHeight(c)), 0);
  const widestBottom = bySide.bottom.reduce((h, c) => Math.max(h, horizConnHeight(c)), 0);

  // Height of a single side's connector stack: one header + pin rows per
  // connector, with SIDE_MARGIN between adjacent connectors (no trailing
  // margin after the last). Previously this counted (nLeft + nRight)
  // headers which double-counted — left and right are side-by-side, not
  // stacked, so only the TALLER one drives vertical sizing.
  const sideStackHeight = (nConns: number, totalPins: number): number => {
    if (nConns === 0) return 0;
    return nConns * CONN_HEADER
      + totalPins * PIN_SPACING
      + (nConns - 1) * SIDE_MARGIN
      + 2 * CONN_PAD;
  };
  const leftStack  = sideStackHeight(bySide.left.length,  leftPinsTotal);
  const rightStack = sideStackHeight(bySide.right.length, rightPinsTotal);

  const neededForVertical = DEVICE_HEADER
    + (widestTop    > 0 ? widestTop    + SIDE_MARGIN : 0)
    + Math.max(leftStack, rightStack)
    + (widestBottom > 0 ? widestBottom + SIDE_MARGIN : 0);

  // Width needs to fit two independent constraints:
  //   1. Left + right connector sides with some title breathing room.
  //   2. The widest top/bottom connector content must fit inside the device.
  //
  // Top/bottom connectors live on their OWN rows (above/below the left/right
  // stacks — the vertical height-formula guarantees that), so horizontally
  // they can share space with the left/right connectors. We only need the
  // device to be wide enough for the widest constraint, not their sum.
  const horizContent = Math.max(topPinsTotal, bottomPinsTotal) * PIN_SPACING
    + (bySide.top.length + bySide.bottom.length) * (CONN_HEADER + SIDE_MARGIN);
  const MIN_TITLE_PAD = 40;
  const neededForHorizontal = Math.max(
    widestLeft + widestRight + MIN_TITLE_PAD,
    horizContent,
  );

  // Size is always driven by content (+ MIN floors). We deliberately do NOT
  // use placement.width / placement.height as a lower bound — that would
  // leave empty space after the user hides pins or splits a big device
  // across sheets. Placements auto-shrink to fit their visible connectors.
  const width  = Math.max(MIN_DEV_WIDTH,  neededForHorizontal);
  const height = Math.max(MIN_DEV_HEIGHT, neededForVertical);

  const layout = new Map<string, ConnectorLayout>();

  // ── Vertical sides (left, right) — stack connectors top to bottom ─────
  // Start below any top connector so they don't overlap.
  const verticalStart = DEVICE_HEADER + CONN_PAD + (widestTop > 0 ? widestTop + SIDE_MARGIN : 0);
  for (const side of ['left', 'right'] as const) {
    const connsOnSide = bySide[side];
    let cursorY = verticalStart;
    for (const conn of connsOnSide) {
      const pinCount = conn.pinIds.length;
      const connHeight = CONN_HEADER + pinCount * PIN_SPACING + CONN_PAD * 2;
      // Width scales with the longest pin label so the text never bleeds
      // past the connector box (or into the pin stub area).
      const connWidth  = vertConnWidth(conn);

      const isLeft = side === 'left';
      const connX = isLeft ? 0 : width - connWidth;

      const pinPositions: ConnectorLayout['pinPositions'] = [];
      const pinLabels: ConnectorLayout['pinLabels'] = [];
      for (let i = 0; i < conn.pinIds.length; i++) {
        const pinId = conn.pinIds[i];
        const pin = device.pinCatalog.find(p => p.id === pinId);
        if (!pin) continue;
        // Pin tip sits one stub-length past the device edge, aligned with its row inside the connector.
        const yInConnector = cursorY + CONN_HEADER + CONN_PAD + i * PIN_SPACING + PIN_SPACING / 2;
        const tipX = isLeft ? -PIN_STUB_LENGTH : width + PIN_STUB_LENGTH;
        pinPositions.push({ pinId, x: tipX, y: yInConnector });
        // 8-px inset from the pin-side edge (used to be 4; bumped so long
        // labels don't visually touch the pin stub / pin-number text).
        const labelX = isLeft ? connWidth - 8 : connX + 8;
        pinLabels.push({
          pinId,
          x: labelX,
          y: yInConnector + 3,
          anchor: isLeft ? 'end' : 'start',
          name: pin.name,
          pinNumber: pin.pinNumber,
        });
      }

      layout.set(conn.id, {
        x: connX,
        y: cursorY,
        width: connWidth,
        height: connHeight,
        outwardDir: isLeft ? 'left' : 'right',
        pinPositions,
        pinLabels,
      });
      cursorY += connHeight + SIDE_MARGIN;
    }
  }

  // ── Horizontal sides (top, bottom) — stack connectors left to right ──
  // Start past the left connectors (and the title area) so labels don't
  // overlap. The overall width calc above guarantees there's enough room
  // between left and right connectors for the top/bottom content.
  const horizontalStart = Math.max(40, widestLeft + SIDE_MARGIN);
  for (const side of ['top', 'bottom'] as const) {
    const connsOnSide = bySide[side];
    let cursorX = horizontalStart;
    for (const conn of connsOnSide) {
      const pinCount = conn.pinIds.length;
      const connWidth  = CONN_HEADER + pinCount * PIN_SPACING + CONN_PAD * 2;
      // Per-connector height driven by the longest pin label (rotated text).
      const connHeight = horizConnHeight(conn);

      const isTop = side === 'top';
      const connY = isTop ? 0 : height - connHeight;

      const pinPositions: ConnectorLayout['pinPositions'] = [];
      const pinLabels: ConnectorLayout['pinLabels'] = [];
      for (let i = 0; i < conn.pinIds.length; i++) {
        const pinId = conn.pinIds[i];
        const pin = device.pinCatalog.find(p => p.id === pinId);
        if (!pin) continue;
        const xInConnector = cursorX + CONN_HEADER + CONN_PAD + i * PIN_SPACING + PIN_SPACING / 2;
        const tipY = isTop ? -PIN_STUB_LENGTH : height + PIN_STUB_LENGTH;
        pinPositions.push({ pinId, x: xInConnector, y: tipY });
        // Labels are rotated -90° so text extends UPWARD (toward lower y)
        // from the anchor. Anchor at the body-bottom edge so the text fills
        // the body area without bleeding past the header.
        // - TOP:    header sits at the bottom of the rect; body is above it.
        //   Body bottom = connY + connHeight - CONN_HEADER.
        // - BOTTOM: header sits at the top; body fills the rest below it.
        //   Body bottom = connY + connHeight.
        const labelY = isTop
          ? connY + connHeight - CONN_HEADER - 4
          : connY + connHeight - 4;
        pinLabels.push({
          pinId,
          x: xInConnector,
          y: labelY,
          anchor: 'start', // treated specially — rotated labels used for top/bottom
          name: pin.name,
          pinNumber: pin.pinNumber,
        });
      }

      layout.set(conn.id, {
        x: cursorX,
        y: connY,
        width: connWidth,
        height: connHeight,
        outwardDir: isTop ? 'up' : 'down',
        pinPositions,
        pinLabels,
      });
      cursorX += connWidth + SIDE_MARGIN;
    }
  }

  return { width, height, connectors: layout };
}

/**
 * Convenience: given a Device + pinKey, return the world-space position of the
 * pin's connection point (the tip of its stub, where wires attach).
 */
export function computePinWorldPos(device: PlacedDevice, pinId: string): Point | null {
  const info = computePinInfo(device, pinId);
  return info ? info.point : null;
}

export type OutwardDir = 'left' | 'right' | 'up' | 'down';
export interface PinInfo { point: Point; outwardDir: OutwardDir; }

/** Like computePinWorldPos but also returns the pin's outward direction — used
 *  by the router so stubs always extend AWAY from the device body. */
export function computePinInfo(device: PlacedDevice, pinId: string): PinInfo | null {
  if (device.symbolType) {
    const def = getSymbolDef(device.symbolType);
    if (!def) return null;
    const pinIdx = device.pinCatalog.findIndex(p => p.id === pinId);
    if (pinIdx < 0) return null;
    const sp = def.pins.find(p => p.index === pinIdx);
    if (!sp) return null;
    return {
      point: { x: device.position.x + sp.tipX, y: device.position.y + sp.tipY },
      outwardDir: sp.outwardDir,
    };
  }
  const { connectors } = layoutDevice(device);
  for (const [, l] of connectors) {
    const pp = l.pinPositions.find(p => p.pinId === pinId);
    if (pp) {
      return {
        point: { x: device.position.x + pp.x, y: device.position.y + pp.y },
        outwardDir: l.outwardDir === 'up' ? 'up' : l.outwardDir === 'down' ? 'down' :
                    l.outwardDir === 'left' ? 'left' : 'right',
      };
    }
  }
  return null;
}

/** Pins in this PlacedDevice's catalog that are NOT currently shown in any
 *  of its connectors. Note: "hidden on THIS placement" — a pin visible on
 *  another placement of the same logical device is still hidden here. Use
 *  store helpers when you need the device-level hidden set. */
export function getHiddenPins(device: PlacedDevice): Pin[] {
  const assigned = new Set<string>();
  for (const c of device.connectors) for (const pid of c.pinIds) assigned.add(pid);
  return device.pinCatalog.filter(p => !assigned.has(p.id));
}

export function getPinConnectorCount(device: PlacedDevice, pinId: string): number {
  let n = 0;
  for (const c of device.connectors) if (c.pinIds.includes(pinId)) n++;
  return n;
}

/**
 * Distinct logical-connector names present on a device, preserving first-seen
 * order (useful for dropdowns and "group by logical connector" views).
 */
export function getLogicalConnectorNames(device: Device | PlacedDevice): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of device.pinCatalog) {
    if (!seen.has(p.logicalConnectorName)) {
      seen.add(p.logicalConnectorName);
      out.push(p.logicalConnectorName);
    }
  }
  return out;
}

/**
 * Pin designator for text display.
 *   1. If the pin has a pinNumber from its template (the real datasheet number,
 *      e.g. "15", "27"), use that — matches what's drawn next to the pin on
 *      the canvas.
 *   2. Otherwise fall back to a 0-based position within the pin's logical
 *      connector — e.g. P0, P1 — stable even if the pin appears on multiple
 *      connector views.
 */
export function getPinDesignator(device: Device | PlacedDevice, pinId: string): string {
  const pin = device.pinCatalog.find(p => p.id === pinId);
  if (!pin) return 'P?';
  if (pin.pinNumber && pin.pinNumber.trim()) {
    return `P${pin.pinNumber.trim()}`;
  }
  let idx = 0;
  for (const p of device.pinCatalog) {
    if (p.logicalConnectorName !== pin.logicalConnectorName) continue;
    if (p.id === pinId) return `P${idx}`;
    idx++;
  }
  return 'P?';
}

/** Human-readable pin reference: "U1:J1:P7" — or a compact "J#" for junctions.
 *  When `wires` is provided, junction endpoints get a stable number based on
 *  the first appearance of their `junction:<id>` key in the wires array. */
export function formatPinRef(devices: Device[], pinKey: string, wires?: { fromPin: string; toPin: string }[]): string {
  if (isJunctionKey(pinKey)) {
    if (wires) {
      const seen = new Set<string>();
      let idx = 0;
      for (const w of wires) {
        for (const end of [w.fromPin, w.toPin]) {
          if (isJunctionKey(end) && !seen.has(end)) {
            idx++;
            seen.add(end);
            if (end === pinKey) return `J${idx}`;
          }
        }
      }
    }
    return 'J?';
  }
  const [deviceId, pinId] = pinKey.split(':');
  const dev = devices.find(d => d.id === deviceId);
  if (!dev) return pinKey;
  const pin = dev.pinCatalog.find(p => p.id === pinId);
  if (!pin) return `${dev.name}:?:?`;
  return `${dev.name}:${pin.logicalConnectorName}:${getPinDesignator(dev, pinId)}`;
}
