import type { PlacedDevice, Point } from './types';
import { PIN_STUB_LENGTH } from './constants';

export type SymbolType =
  | 'ground'
  | 'breaker'
  | 'resistor'
  | 'capacitor'
  | 'capacitor-polar'
  | 'switch-spst'
  | 'switch-spdt'
  | 'switch-dpst'
  | 'switch-dpdt'
  | 'switch-momentary'
  | 'switch-momentary-nc'
  | 'diode'
  | 'diode-zener'
  | 'diode-schottky'
  | 'diode-led'
  | 'thermocouple'
  | 'thermocouple-polar'
  | 'solenoid-spst'
  | 'solenoid-spdt'
  | 'solenoid-dpst'
  | 'solenoid-dpdt'
  | 'speaker'
  | 'headphone-jack'
  | 'headphone-jack-mono'
  | 'lemo-6';

export type OutwardDir = 'left' | 'right' | 'up' | 'down';

export interface SymbolPin {
  /** Which pin in Device.pinCatalog this position corresponds to (0-indexed). */
  index: number;
  /** Wire-attach point, in device-local coordinates. */
  tipX: number;
  tipY: number;
  outwardDir: OutwardDir;
}

export interface SymbolAttributeDef {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue: string;
}

export interface SymbolDef {
  type: SymbolType;
  /** Body width (device-local) — does NOT include pin stubs. */
  width: number;
  /** Body height — does NOT include pin stubs. */
  height: number;
  pins: SymbolPin[];
  /** Editable per-instance attributes shown in the inspector. */
  attributes: SymbolAttributeDef[];
  /** Whether the reference designator (device.name) is drawn on the symbol. */
  showName?: boolean;
}

export const SYMBOLS: Record<SymbolType, SymbolDef> = {
  ground: {
    type: 'ground',
    width: 40,
    height: 24,
    // Ground connects at the TOP of the stem. Pin tip is one stub above the top edge.
    pins: [{ index: 0, tipX: 20, tipY: -PIN_STUB_LENGTH, outwardDir: 'up' }],
    attributes: [],
    showName: false,
  },
  breaker: {
    type: 'breaker',
    width: 40,
    height: 24,
    // Horizontal: connects left-middle and right-middle. Dot Y (18) matches
    // the terminal line inside the body so the pin tip lands on the dot.
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 18, outwardDir: 'left'  },
      { index: 1, tipX: 40 + PIN_STUB_LENGTH, tipY: 18, outwardDir: 'right' },
    ],
    attributes: [
      { key: 'rating', label: 'Rating', defaultValue: '5A', placeholder: 'e.g. 5A' },
    ],
    showName: true,
  },
  resistor: {
    type: 'resistor',
    width: 70,
    height: 20,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 10, outwardDir: 'left'  },
      { index: 1, tipX: 70 + PIN_STUB_LENGTH, tipY: 10, outwardDir: 'right' },
    ],
    attributes: [
      { key: 'value', label: 'Value', defaultValue: '10k', placeholder: 'e.g. 10k, 4R7' },
    ],
    showName: true,
  },
  capacitor: {
    type: 'capacitor',
    width: 40,
    height: 28,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 14, outwardDir: 'left'  },
      { index: 1, tipX: 40 + PIN_STUB_LENGTH, tipY: 14, outwardDir: 'right' },
    ],
    attributes: [
      { key: 'value', label: 'Value', defaultValue: '100nF', placeholder: 'e.g. 100nF' },
    ],
    showName: true,
  },
  'capacitor-polar': {
    type: 'capacitor-polar',
    width: 40,
    height: 28,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 14, outwardDir: 'left'  },  // +
      { index: 1, tipX: 40 + PIN_STUB_LENGTH, tipY: 14, outwardDir: 'right' },  // −
    ],
    attributes: [
      { key: 'value', label: 'Value', defaultValue: '100uF', placeholder: 'e.g. 100uF' },
    ],
    showName: true,
  },
  'switch-spst': {
    type: 'switch-spst',
    width: 80,
    height: 30,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 15, outwardDir: 'left'  },
      { index: 1, tipX: 80 + PIN_STUB_LENGTH, tipY: 15, outwardDir: 'right' },
    ],
    attributes: [],
    showName: true,
  },
  'switch-spdt': {
    type: 'switch-spdt',
    width: 80,
    height: 50,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 25, outwardDir: 'left'  }, // Common
      { index: 1, tipX: 80 + PIN_STUB_LENGTH, tipY: 10, outwardDir: 'right' }, // NO (upper)
      { index: 2, tipX: 80 + PIN_STUB_LENGTH, tipY: 40, outwardDir: 'right' }, // NC (lower)
    ],
    attributes: [],
    showName: true,
  },
  'switch-dpst': {
    type: 'switch-dpst',
    width: 80,
    height: 60,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 15, outwardDir: 'left'  }, // Pole-1 in
      { index: 1, tipX: 80 + PIN_STUB_LENGTH, tipY: 15, outwardDir: 'right' }, // Pole-1 out
      { index: 2, tipX: -PIN_STUB_LENGTH,    tipY: 45, outwardDir: 'left'  }, // Pole-2 in
      { index: 3, tipX: 80 + PIN_STUB_LENGTH, tipY: 45, outwardDir: 'right' }, // Pole-2 out
    ],
    attributes: [],
    showName: true,
  },
  'switch-dpdt': {
    type: 'switch-dpdt',
    width: 80,
    height: 100,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 25, outwardDir: 'left'  }, // Pole-1 Common
      { index: 1, tipX: 80 + PIN_STUB_LENGTH, tipY: 10, outwardDir: 'right' }, // Pole-1 NO
      { index: 2, tipX: 80 + PIN_STUB_LENGTH, tipY: 40, outwardDir: 'right' }, // Pole-1 NC
      { index: 3, tipX: -PIN_STUB_LENGTH,    tipY: 75, outwardDir: 'left'  }, // Pole-2 Common
      { index: 4, tipX: 80 + PIN_STUB_LENGTH, tipY: 60, outwardDir: 'right' }, // Pole-2 NO
      { index: 5, tipX: 80 + PIN_STUB_LENGTH, tipY: 90, outwardDir: 'right' }, // Pole-2 NC
    ],
    attributes: [],
    showName: true,
  },
  // Diodes share a body size and anode/cathode placement so the four variants
  // line up visually. Pin 0 = Anode (left), Pin 1 = Cathode (right).
  diode: {
    type: 'diode',
    width: 50,
    height: 20,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 10, outwardDir: 'left'  }, // Anode
      { index: 1, tipX: 50 + PIN_STUB_LENGTH, tipY: 10, outwardDir: 'right' }, // Cathode
    ],
    attributes: [
      { key: 'partNumber', label: 'Part #', defaultValue: '1N4148', placeholder: 'e.g. 1N4148' },
    ],
    showName: true,
  },
  'diode-zener': {
    type: 'diode-zener',
    width: 50,
    height: 20,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 10, outwardDir: 'left'  },
      { index: 1, tipX: 50 + PIN_STUB_LENGTH, tipY: 10, outwardDir: 'right' },
    ],
    attributes: [
      { key: 'voltage',    label: 'Vz',     defaultValue: '5.1V',   placeholder: 'e.g. 5.1V' },
      { key: 'partNumber', label: 'Part #', defaultValue: '1N4733', placeholder: 'e.g. 1N4733' },
    ],
    showName: true,
  },
  'diode-schottky': {
    type: 'diode-schottky',
    width: 50,
    height: 20,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 10, outwardDir: 'left'  },
      { index: 1, tipX: 50 + PIN_STUB_LENGTH, tipY: 10, outwardDir: 'right' },
    ],
    attributes: [
      { key: 'partNumber', label: 'Part #', defaultValue: '1N5817', placeholder: 'e.g. 1N5817' },
    ],
    showName: true,
  },
  'diode-led': {
    type: 'diode-led',
    width: 50,
    height: 28, // extra room for the "light" arrows above the diode body
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,    tipY: 18, outwardDir: 'left'  },
      { index: 1, tipX: 50 + PIN_STUB_LENGTH, tipY: 18, outwardDir: 'right' },
    ],
    attributes: [
      { key: 'color', label: 'Color', defaultValue: 'Red', placeholder: 'e.g. Red' },
    ],
    showName: true,
  },
  // Momentary pushbutton — two variants sharing the same footprint so they
  // drop into the same schematic slot. Both draw a horizontal bridge bar
  // with a vertical actuator stem + cap above it; only the rest state of
  // the contacts differs:
  //
  //   'switch-momentary'    → NO (push to make): bar lifted off terminals
  //   'switch-momentary-nc' → NC (push to break): bar touching terminals
  //
  // Shared geometry — pin tips at y=22 on left/right, body 60x32.
  'switch-momentary': {
    type: 'switch-momentary',
    width: 60,
    height: 32,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,      tipY: 22, outwardDir: 'left'  },
      { index: 1, tipX: 60 + PIN_STUB_LENGTH,  tipY: 22, outwardDir: 'right' },
    ],
    attributes: [],
    showName: true,
  },
  'switch-momentary-nc': {
    type: 'switch-momentary-nc',
    width: 60,
    height: 32,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,      tipY: 22, outwardDir: 'left'  },
      { index: 1, tipX: 60 + PIN_STUB_LENGTH,  tipY: 22, outwardDir: 'right' },
    ],
    attributes: [],
    showName: true,
  },
  // Thermocouple — two leads converging to a junction bead. Non-polar has no
  // +/- marks; polar variant adds them next to the upper/lower lead.
  thermocouple: {
    type: 'thermocouple',
    width: 50,
    height: 40,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH, tipY: 10, outwardDir: 'left' },
      { index: 1, tipX: -PIN_STUB_LENGTH, tipY: 30, outwardDir: 'left' },
    ],
    attributes: [
      { key: 'type', label: 'Type', defaultValue: 'K', placeholder: 'e.g. K, J, T' },
    ],
    showName: true,
  },
  'thermocouple-polar': {
    type: 'thermocouple-polar',
    width: 50,
    height: 40,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH, tipY: 10, outwardDir: 'left' }, // −
      { index: 1, tipX: -PIN_STUB_LENGTH, tipY: 30, outwardDir: 'left' }, // +
    ],
    attributes: [
      { key: 'type', label: 'Type', defaultValue: 'K', placeholder: 'e.g. K, J, T' },
    ],
    showName: true,
  },
  // Solenoid / relay family — geometry matches the standard schematic
  // convention: vertical coil on the left, vertical switch contacts on the
  // right with pins exiting TOP (B/B1/B2) and BOTTOM (A/A1/A2 or commons).
  // Coil pins A1/A2 stay on the left. Each body height is 100 px so all
  // contact terminals line up across the four variants.
  //
  // SPST — 4 pins total. B on top, A on bottom.
  'solenoid-spst': {
    type: 'solenoid-spst',
    width: 70,
    height: 100,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH,        tipY: 30,                    outwardDir: 'left'   }, // coil+ (A1)
      { index: 1, tipX: -PIN_STUB_LENGTH,        tipY: 70,                    outwardDir: 'left'   }, // coil− (A2)
      { index: 2, tipX: 50,                      tipY: 100 + PIN_STUB_LENGTH, outwardDir: 'down'   }, // A (bottom)
      { index: 3, tipX: 50,                      tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'     }, // B (top)
    ],
    attributes: [],
    showName: true,
  },
  // SPDT — 5 pins. Common (C) on bottom, two throws (A left / B right) on top.
  'solenoid-spdt': {
    type: 'solenoid-spdt',
    width: 80,
    height: 100,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH, tipY: 30,                    outwardDir: 'left' }, // coil+
      { index: 1, tipX: -PIN_STUB_LENGTH, tipY: 70,                    outwardDir: 'left' }, // coil−
      { index: 2, tipX: 55,               tipY: 100 + PIN_STUB_LENGTH, outwardDir: 'down' }, // C (common)
      { index: 3, tipX: 47,               tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'   }, // A (NC, top-left)
      { index: 4, tipX: 63,               tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'   }, // B (NO, top-right)
    ],
    attributes: [],
    showName: true,
  },
  // DPST — 6 pins. Two SPST contacts side by side; mechanically linked
  // (dashed line). B1/B2 on top, A1/A2 on bottom.
  'solenoid-dpst': {
    type: 'solenoid-dpst',
    width: 100,
    height: 100,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH, tipY: 30,                    outwardDir: 'left' }, // coil+
      { index: 1, tipX: -PIN_STUB_LENGTH, tipY: 70,                    outwardDir: 'left' }, // coil−
      { index: 2, tipX: 55,               tipY: 100 + PIN_STUB_LENGTH, outwardDir: 'down' }, // A1
      { index: 3, tipX: 85,               tipY: 100 + PIN_STUB_LENGTH, outwardDir: 'down' }, // A2
      { index: 4, tipX: 55,               tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'   }, // B1
      { index: 5, tipX: 85,               tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'   }, // B2
    ],
    attributes: [],
    showName: true,
  },
  // DPDT — 8 pins. Two SPDT contacts side by side; mechanically linked.
  // Top (4): A1, B1, A2, B2. Bottom (2): C1, C2.
  'solenoid-dpdt': {
    type: 'solenoid-dpdt',
    width: 130,
    height: 100,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH, tipY: 30,                    outwardDir: 'left' }, // coil+
      { index: 1, tipX: -PIN_STUB_LENGTH, tipY: 70,                    outwardDir: 'left' }, // coil−
      { index: 2, tipX: 60,               tipY: 100 + PIN_STUB_LENGTH, outwardDir: 'down' }, // C1
      { index: 3, tipX: 100,              tipY: 100 + PIN_STUB_LENGTH, outwardDir: 'down' }, // C2
      { index: 4, tipX: 52,               tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'   }, // A1
      { index: 5, tipX: 68,               tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'   }, // B1
      { index: 6, tipX: 92,               tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'   }, // A2
      { index: 7, tipX: 108,              tipY: -PIN_STUB_LENGTH,      outwardDir: 'up'   }, // B2
    ],
    attributes: [],
    showName: true,
  },
  // Loudspeaker — trapezoid with a small rectangle (driver) on the left and
  // the flared cone to the right. Wires enter from the left.
  speaker: {
    type: 'speaker',
    width: 60,
    height: 40,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH, tipY: 12, outwardDir: 'left' },
      { index: 1, tipX: -PIN_STUB_LENGTH, tipY: 28, outwardDir: 'left' },
    ],
    attributes: [],
    showName: true,
  },
  // Stereo headphone jack (TRS). 3 pins: Tip, Ring, Sleeve. The Ring contact
  // sits noticeably below the Tip contact so the spring-contact zigzags don't
  // overlap visually. The Sleeve drops further down and connects to the
  // barrel with a straight line (no spring kink).
  'headphone-jack': {
    type: 'headphone-jack',
    width: 100,
    height: 55,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH, tipY: 10, outwardDir: 'left' }, // Tip
      { index: 1, tipX: -PIN_STUB_LENGTH, tipY: 28, outwardDir: 'left' }, // Ring (lowered)
      { index: 2, tipX: -PIN_STUB_LENGTH, tipY: 46, outwardDir: 'left' }, // Sleeve
    ],
    attributes: [],
    showName: true,
  },
  // Mono headphone jack (TS). 2 pins: Tip and Sleeve only — no Ring contact.
  // Shares the same body width as the stereo variant so they drop into the
  // same schematic slot.
  'headphone-jack-mono': {
    type: 'headphone-jack-mono',
    width: 100,
    height: 45,
    pins: [
      { index: 0, tipX: -PIN_STUB_LENGTH, tipY: 10, outwardDir: 'left' }, // Tip
      { index: 1, tipX: -PIN_STUB_LENGTH, tipY: 36, outwardDir: 'left' }, // Sleeve
    ],
    attributes: [],
    showName: true,
  },
  // Lemo-style 6-pin circular connector. All pins exit to the RIGHT so the
  // connector reads like a breakout block: body on the left, six stacked
  // labels on the right. Hexagonal pin arrangement inside the body matches
  // the physical connector (pin 1 at 2 o'clock, CCW through 2..6). Keying
  // notch sits on the right between pins 1 and 6.
  'lemo-6': {
    type: 'lemo-6',
    width:  190,
    height: 120,
    // Tips are stacked vertically on the right so wires break out cleanly.
    // Row spacing (18 px) must match Lemo6Body / export.ts, which resolve
    // each internal pin's hexagonal position and draw a lead line to here.
    pins: [
      { index: 0, tipX: 155, tipY: 15,  outwardDir: 'right' }, // 1 — V+
      { index: 1, tipX: 155, tipY: 33,  outwardDir: 'right' }, // 2 — GND
      { index: 2, tipX: 155, tipY: 51,  outwardDir: 'right' }, // 3 — HP L
      { index: 3, tipX: 155, tipY: 69,  outwardDir: 'right' }, // 4 — HP R
      { index: 4, tipX: 155, tipY: 87,  outwardDir: 'right' }, // 5 — Mic +
      { index: 5, tipX: 155, tipY: 105, outwardDir: 'right' }, // 6 — Mic −
    ],
    attributes: [],
    showName: true,
  },
};

export function getSymbolDef(type: string | undefined): SymbolDef | null {
  if (!type) return null;
  const def = SYMBOLS[type as SymbolType];
  return def ?? null;
}

/** World-space pin tip for a device rendered as a symbol. */
export function computeSymbolPinWorldPos(device: PlacedDevice, pinId: string): Point | null {
  const def = getSymbolDef(device.symbolType);
  if (!def) return null;
  const pinIdx = device.pinCatalog.findIndex(p => p.id === pinId);
  if (pinIdx < 0) return null;
  const sp = def.pins.find(p => p.index === pinIdx);
  if (!sp) return null;
  return { x: device.position.x + sp.tipX, y: device.position.y + sp.tipY };
}

export function initSymbolAttributes(def: SymbolDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of def.attributes) out[a.key] = a.defaultValue;
  return out;
}
