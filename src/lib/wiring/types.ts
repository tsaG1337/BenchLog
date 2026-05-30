export interface Point { x: number; y: number; }

export type Side = 'left' | 'right' | 'top' | 'bottom';

/**
 * Electrical role of a pin. Drives lint rules and (later) ERC-style checks.
 *  - `power`  : power-supply input (needs a power net connection)
 *  - `ground` : ground/return (needs a ground net connection)
 *  - `signal` : any data/analog signal — default, no mandatory connection
 *  - `nc`     : no-connect / reserved — suppresses unconnected-pin warnings
 *
 * Omitted = treated as `signal`. Kept optional so existing data migrates
 * without a schema bump.
 */
export type PinRole = 'power' | 'ground' | 'signal' | 'nc';

/**
 * Gender of the connector on the *unit* (LRU) side. The mating harness-side
 * connector is the opposite gender, derived on demand by `harnessGender()`.
 * Optional — leave unset when unknown, so we don't fabricate part numbers
 * the user hasn't verified.
 */
export type ConnectorGender = 'M' | 'F';

/** Harness-side gender opposite to the unit-side, or undefined if unknown. */
export function harnessGender(unitGender: ConnectorGender | undefined): ConnectorGender | undefined {
  if (unitGender === 'M') return 'F';
  if (unitGender === 'F') return 'M';
  return undefined;
}

/** Plain-English role of the harness-side connector — "Jack" for a female
 *  (socket) shell, "Plug" for a male (pin) shell. Undefined when the unit
 *  gender isn't known. */
export function harnessRoleLabel(unitGender: ConnectorGender | undefined): 'Jack' | 'Plug' | undefined {
  const hg = harnessGender(unitGender);
  if (hg === 'F') return 'Jack';
  if (hg === 'M') return 'Plug';
  return undefined;
}

/**
 * Physical connector family. Drives BOM lookups (shell P/N, crimp pin P/N,
 * backshell) and informs the user which tooling they'll need. Kept as a
 * string union of common avionics families with `'other'` as the escape
 * hatch — keep adding entries as new families show up in the library.
 */
export type ConnectorType =
  | 'dsub'              // D-subminiature shells (D9/D15/D25/D37 etc.)
  | 'molex-microfit'    // 3.0 mm pitch — Dynon OAT, SV-BAT-320
  | 'molex-minifit'     // 4.2 mm pitch — Mini-Fit Jr.
  | 'matenlok'          // TE / AMP Mate-N-Lok
  | 'circular-mil'      // MS-style circular (MIL-DTL-26482 / 38999)
  | 'ring-lug'          // ring terminal to stud
  | 'spade-lug'         // forked spade / U-terminal
  | 'fast-on'           // 1/4" / 3/16" quick-connect tab
  | 'pigtail'           // bare unterminated wires (servos, GPS antennas)
  | 'rj45'              // 8P8C — Ethernet
  | 'usb'               // USB Type A / B / C
  | 'bnc'               // 50 Ω BNC
  | 'tnc'               // 50 Ω TNC (Dynon transponder antenna)
  | 'sma'               // 50 Ω SMA
  | 'phone-jack'        // 1/4" / 3.5 mm audio jacks
  | 'other';

export const CONNECTOR_TYPE_LABELS: Record<ConnectorType, string> = {
  'dsub':           'D-Sub',
  'molex-microfit': 'Molex Micro-Fit',
  'molex-minifit':  'Molex Mini-Fit Jr.',
  'matenlok':       'Mate-N-Lok',
  'circular-mil':   'Circular (MIL)',
  'ring-lug':       'Ring lug',
  'spade-lug':      'Spade lug',
  'fast-on':        'Fast-on (quick-connect)',
  'pigtail':        'Pigtail (unterminated)',
  'rj45':           'RJ45 (Ethernet)',
  'usb':            'USB',
  'bnc':            'BNC',
  'tnc':            'TNC',
  'sma':            'SMA',
  'phone-jack':     'Phone jack (audio)',
  'other':          'Other',
};

/**
 * A pin exists in the Device's pinCatalog as a pure identity (name + optional
 * pin number). It also knows which *physical* connector it belongs to
 * (e.g. "J1", "J2") — this is immutable and comes from the device template
 * or manufacturer spec. ConnectorInstances on the canvas represent a VIEW of
 * a single physical connector; pins cannot jump between physical connectors.
 */
export interface Pin {
  id: string;
  name: string;
  pinNumber?: string;
  /** Name of the physical connector this pin belongs to (e.g. "J1001"). */
  logicalConnectorName: string;
  /** Electrical role. Undefined = `signal`. See PinRole for semantics. */
  role?: PinRole;
  /** Max current the pin is rated for, free-text incl. unit. e.g. "5A", "75 mA". */
  current?: string;
  /** Recommended wire gauge for this pin in AWG, free-text. e.g. "20", "22". */
  wireGauge?: string;
  /** Free-form per-pin note shown in the Inspector and BOM. */
  comment?: string;
  /** Twisted-pair group identifier. Pins that share the same string (e.g.
   *  "NET1") carry signals that must be twisted together in the harness.
   *  The Excel pin-list export populates its "Twist Group" column from this
   *  when both endpoints of a wire's net agree on the value. Free-form, but
   *  keep it short — common: "NET1", "NET2", "PWR1". */
  twistGroup?: string;
}

/**
 * A ConnectorInstance is the on-canvas visual block for a connector. It lives
 * on one of the four sides of its parent device and draws a subset of the
 * device's pinCatalog (the pinIds list, in order).
 */
export interface ConnectorInstance {
  id: string;
  name: string;                  // e.g. "J1001" or "J1001 (L)" — display label only
  /** Which physical connector this instance is a view of. Must match the
   * `logicalConnectorName` of every pin referenced in pinIds. */
  logicalConnectorName: string;
  side: Side;
  /** Ordered list of pin IDs from Device.pinCatalog. Determines draw order.
   * All referenced pins must have matching logicalConnectorName. */
  pinIds: string[];
  /** Gender of the connector on the *unit* (device) side. The harness mates
   *  with the opposite gender — derived via `harnessGender()` for BOM/labels.
   *  All ConnectorInstances that share the same `logicalConnectorName` MUST
   *  share the same gender (enforced by the store's updateConnector action).
   */
  gender?: ConnectorGender;
  /** Physical connector family — D-Sub, Molex Micro-Fit, ring lug, etc.
   *  Same propagation rule as `gender`: ConnectorInstances sharing a
   *  `logicalConnectorName` are kept in sync by `updateConnector`. */
  connectorType?: ConnectorType;
}

/**
 * A logical device — what a BOM row would represent. One Device can have
 * multiple Placements (one per sheet it's visible on); pins are shared
 * across those placements via pinCatalog.
 *
 * Invariant: across all placements of this device, each pin id appears in
 * at most one ConnectorInstance's pinIds list. I.e. every pin is visible
 * on at most one sheet at a time.
 */
export interface Device {
  id: string;
  templateId?: string;
  /** Reference designator — "U1", "U2", etc. Auto-assigned on add; user-editable. */
  name: string;
  /** The device's product name from its template (e.g. "GTN 750Xi").
   * Kept alongside the designator so renaming the device doesn't lose product identity. */
  productName?: string;
  /** Per-instance BOM metadata. Populated from the template on add, but the
   *  Inspector lets the user override either field. Generic symbol templates
   *  (breaker, resistor, thermocouple, …) start blank so the user's BOM stays
   *  clean of placeholder "Generic" strings. */
  manufacturer?: string;
  partNumber?: string;
  /** All pins this device can expose. Source of truth for pin identity. */
  pinCatalog: Pin[];
  /** When set, the device is rendered as a fixed schematic symbol instead of the
   * generic box+connectors layout. Pins come from pinCatalog in order. */
  symbolType?: string;
  /** Per-instance symbol attributes (e.g. breaker rating "5A", resistor value "10k"). */
  attributes?: Record<string, string>;
}

/**
 * A visible instance of a Device on a specific sheet. A device with one
 * placement renders as just "U1"; two or more placements render as
 * "U1A", "U1B", ... (see placement-display helpers).
 */
export interface Placement {
  /** "U1A", "U1B", ... — device id + unit letter. Globally unique. */
  id: string;
  /** Parent Device.id. */
  deviceId: string;
  /** Which sheet this placement lives on. */
  sheetId: string;
  position: Point;
  width: number;
  height: number;
  /** The connector-views drawn on this placement. A given pin from the
   * device's pinCatalog appears in the pinIds of at most ONE connector
   * across ALL of the device's placements (the "each pin on one sheet"
   * invariant). */
  connectors: ConnectorInstance[];
}

/**
 * A Placement merged with its parent Device — the currency passed to
 * rendering / layout / routing code so one value carries both the visual
 * attributes (position, connectors) and the electrical identity (pinCatalog,
 * designator). `id` is the placement id (what the user clicks and selects);
 * `deviceId` is the logical device id (what wire endpoints reference).
 *
 * This type is derived on demand from `(Device, Placement)` pairs; it is
 * never stored as-is.
 */
export interface PlacedDevice {
  // ── From Placement ─────────────────────────────────────────────
  /** Placement id, e.g. "U1A". Used by selection, click handlers, the
   *  placement-preview ghost, and as the React key. */
  id: string;
  deviceId: string;
  sheetId: string;
  position: Point;
  width: number;
  height: number;
  connectors: ConnectorInstance[];
  // ── From Device ────────────────────────────────────────────────
  templateId?: string;
  /** The logical designator (e.g. "U1"). Display code decides whether to
   *  append the placement letter ("U1A") based on the device's placement count. */
  name: string;
  productName?: string;
  manufacturer?: string;
  partNumber?: string;
  pinCatalog: Pin[];
  symbolType?: string;
  attributes?: Record<string, string>;
}

/** Zip a Placement with its parent Device. Returns null if the device id
 *  can't be resolved (should not happen in a consistent store). */
export function mergePlacement(placement: Placement, devices: Device[]): PlacedDevice | null {
  const dev = devices.find(d => d.id === placement.deviceId);
  if (!dev) return null;
  return {
    id: placement.id,
    deviceId: dev.id,
    sheetId: placement.sheetId,
    position: placement.position,
    width: placement.width,
    height: placement.height,
    connectors: placement.connectors,
    templateId: dev.templateId,
    name: dev.name,
    productName: dev.productName,
    manufacturer: dev.manufacturer,
    partNumber: dev.partNumber,
    pinCatalog: dev.pinCatalog,
    symbolType: dev.symbolType,
    attributes: dev.attributes,
  };
}

export interface Wire {
  id: string;
  fromPin: string;  // "deviceId:pinId"
  toPin: string;
  color: string;
  /** Optional stripe / second colour. When set, the wire renders striped —
   *  base `color` plus a dashed overlay in this colour. Net-level. */
  stripeColor?: string;
  /** Signal name carried on this net. Always stored (useful for netlists) —
   *  the `showLabel` flag controls whether it's drawn on the canvas. */
  label?: string;
  /** When true, the signal name is rendered on the wire with a draggable
   *  label handle. Default (undefined/false) = signal name hidden from the
   *  canvas. */
  showLabel?: boolean;
  /** Wire gauge in AWG, free-text (e.g. "20", "22"). Used for the wire BOM
   *  and any future ampacity / drop checks. Optional — leave blank when
   *  unspecified. */
  awg?: string;
  sheetId: string;
  /** User-dragged X coord of the wire's middle vertical segment. If undefined
   * the route is auto-computed as the midpoint between from.x and to.x. */
  midX?: number;
  /** User-dragged Y of the horizontal segment near the SOURCE pin. If set and
   * different from the pin's Y, the router inserts a short stub + vertical jog
   * at the source so the pin anchor itself doesn't move. */
  fromY?: number;
  /** User-dragged Y of the horizontal segment near the DEST pin — same pattern. */
  toY?: number;
  /** User-dragged X of the source-side vertical jog (set when going around a
   *  device). Overrides the router's default "one stub-length past the pin". */
  fromJogX?: number;
  /** User-dragged X of the dest-side vertical jog — same pattern. */
  toJogX?: number;
  /** User-dragged world position of the wire's label text. If undefined the
   * label sits at the middle of the vertical segment. */
  labelX?: number;
  labelY?: number;
  /** Label rotation in degrees, clockwise. Undefined = auto: horizontal when
   *  the label sits on a horizontal segment, 90° (read top-to-bottom) when it
   *  sits on a vertical segment. Explicit values override the heuristic. */
  labelRotation?: number;
}

export interface Sheet {
  id: string;
  name: string;
  order: number;
  /** Per-sheet harness-view state. Lazily created on first toggle into
   *  harness mode. Sheets without this field default to schematic mode. */
  harness?: HarnessView;
}

/**
 * A junction (splice point) on the schematic — a point where a wire is tapped
 * onto another wire. A first-class entity with a stable id: every wire and
 * net-label endpoint that meets here references it by `junction:<id>`.
 * A free point — moving a device re-routes its wires to the (fixed) junction.
 */
export interface Junction {
  id: string;
  sheetId: string;
  position: Point;
}

/**
 * A graphical shield wrapping one or more wires over a horizontal stretch.
 * Shields are pure annotations — they don't change electrical connectivity
 * and don't appear in the netlist, EXCEPT for the `pin` termination which
 * exposes a connection point a wire can dock onto (the wire then carries
 * the shield's drain electrically into wherever the user routes it).
 *
 * Termination styles:
 *   ground    — half-ellipse + stem dropping into a ground triangle
 *   float     — half-ellipse only, no termination drawn
 *   backshell — half-ellipse + stem ending in a downward triangle (connector backshell)
 *   pin       — half-ellipse + stem ending in an open connection circle a
 *               wire can attach to (`#shield:<shieldId>`). Lets the user
 *               wire the drain to a specific pin or another shield.
 *
 * The shield captures every wire whose route passes through the world
 * x-range [xStart, xEnd] at a y inside the shield's vertical extent. The
 * vertical extent is derived from the wires (topmost − bottommost run);
 * we only persist the wireIds + the x-range. Click-drag in shield mode
 * sets all of these in one go.
 */
export type ShieldTermination = 'ground' | 'float' | 'backshell' | 'pin';

export interface Shield {
  id: string;
  sheetId: string;
  /** Wires this shield wraps. Order doesn't matter — the renderer derives
   *  the vertical extent from each wire's current y. Wires that no longer
   *  exist are silently skipped at render time. */
  wireIds: string[];
  /** World x at which the shielded run begins. Snapped to the 10-px grid. */
  xStart: number;
  /** World x at which the shielded run ends (and where the termination is
   *  drawn). xEnd > xStart. Snapped to the 10-px grid. */
  xEnd: number;
  termination: ShieldTermination;
}

/**
 * A net label tags a specific pin or wire-junction with a text identifier
 * ("5V", "GND", "RESET"…). Labels sharing the same text form an implicit
 * electrical net — no wire is required between them.
 *
 * The `attachedTo` key follows the same shape as a wire endpoint, so the
 * resolution logic is shared with `getPinWorldPos`:
 *
 *   • `deviceId:pinId` — anchored to a device pin. The flag follows the
 *      device when it's moved, and `addNetLabelOnPin` also creates a real
 *      Wire from the pin to `#labelId` so the connection is selectable.
 *   • `junction:<id>` — anchored to a Junction entity (a tap on a wire).
 *      Dropping a net label on a wire splits the wire and creates the
 *      junction (a label-on-wire is a tap; see `Wire.tsx`).
 *
 * Wire endpoints can also be `#labelId`, which resolves to the label's flag
 * tip — that lets wires connect to a label and follow it when the user
 * drags the flag.
 */
export interface NetLabel {
  id: string;
  text: string;
  attachedTo: PinKey;
  sheetId: string;
  /** Optional rotation in degrees (0/90/180/270) applied to the rendered
   *  flag. When omitted the flag uses the pin's outward direction. */
  rotation?: 0 | 90 | 180 | 270;
  /** Drag offset from the attachment anchor. Lets the user reposition the
   *  flag freely while keeping the electrical attachment intact. */
  offset?: { dx: number; dy: number };
  /** Optional user-chosen flag color (hex or any CSS color string). When
   *  unset, the renderer derives a deterministic colour from `text` via
   *  `colorForText` so labels with the same name match by default. */
  color?: string;
}

/**
 * A non-electrical annotation on the sheet. Two kinds:
 *   • `text` — free-form text label, like a designer's comment ("All wires
 *      24 AWG unless otherwise specified")
 *   • `note` — numbered triangle marker for cross-referencing notes from
 *      other parts of the drawing (1, 2, 3…). Carries its own description
 *      text that renders next to the triangle.
 * Both kinds share the same positioning + drag + grid-snap behaviour.
 */
interface AnnotationBase {
  id: string;
  sheetId: string;
  position: Point;
}
export interface TextAnnotation extends AnnotationBase {
  kind: 'text';
  text: string;
  fontSize?: number;
}
export interface NoteAnnotation extends AnnotationBase {
  kind: 'note';
  number: number;
  text: string;
}
export type Annotation = TextAnnotation | NoteAnnotation;

// Wire-endpoint key. Three forms:
//   "deviceId:pinId"  — a pin on a device
//   "junction:<id>"   — a Junction entity (a tap/splice point)
//   "#labelId"        — a net label
export type PinKey = string;

export function makePinKey(deviceId: string, pinId: string): PinKey {
  return `${deviceId}:${pinId}`;
}

export function parsePinKey(key: PinKey): { deviceId: string; pinId: string } {
  const [deviceId, pinId] = key.split(':');
  return { deviceId, pinId };
}

export function isLabelKey(key: PinKey): boolean {
  return key.startsWith('#');
}

const JUNCTION_KEY_PREFIX = 'junction:';

/** True when `key` references a Junction entity. */
export function isJunctionKey(key: PinKey): boolean {
  return key.startsWith(JUNCTION_KEY_PREFIX);
}

/** Build the endpoint key for a junction id. */
export function makeJunctionKey(id: string): PinKey {
  return `${JUNCTION_KEY_PREFIX}${id}`;
}

/** The junction id inside a `junction:<id>` key, or null for any other key. */
export function junctionIdFromKey(key: PinKey): string | null {
  return key.startsWith(JUNCTION_KEY_PREFIX) ? key.slice(JUNCTION_KEY_PREFIX.length) : null;
}

// ── Harness planner ────────────────────────────────────────────────

/** Device rotation in the harness view — 90° steps, clockwise. */
export type Orientation = 0 | 90 | 180 | 270;

/**
 * Per-sheet harness re-alignment — the Phase-3 override layer.
 *
 * Presentation / physical attributes ONLY — never topology (the scaffold
 * §5.2 iron rule). Applied on top of the freshly-derived `HarnessGraph`:
 * topology is always re-derived, overrides re-position / re-size by stable
 * id. The shape deliberately admits no wire / branch / endpoint field, so
 * drift is structurally impossible — an override can only move a node or
 * set a cable length.
 *
 * Keys are the STABLE harness ids:
 *  - a `component` node → its placement id;
 *  - a `splice` node    → its junction node id (`J:<id>`);
 *  - a `branchPoint`    → `bp:<servedNodeId>` (the node it taps for);
 *  - a `Bundle`         → its two endpoint node ids sorted (`<a>|<b>`).
 * An override whose key isn't in the derived graph is harmlessly ignored.
 *
 * `nodeOrientations` is keyed by component placement id.
 */
export interface HarnessOverrides {
  /** Node id → user-placed position. Node id is a stable id (above). */
  nodePositions: Record<string, Point>;
  /** Bundle id → user-set cable length (mm). */
  bundleLengths: Record<string, number>;
  /** Bundle id → ordered cable bend points (Phase 4). Each entry is the list
   *  of interior waypoints the cable's polyline routes through, in user
   *  intent order. Absolute world points — purely presentation, never
   *  topology. An entry for a bundle id not in the derived graph is ignored. */
  bundleWaypoints: Record<string, Point[]>;
  /** Bundle id → user-given cable name (Phase 4). Shown on the canvas and in
   *  the Inspector. Presentation only — keyed by stable bundle id. */
  bundleNames: Record<string, string>;
  /** Component (placement) id → device orientation. Topology-free. */
  nodeOrientations: Record<string, Orientation>;
  /** Per-device connector row order — placement id → ordered logical
   *  connector names. Topology-free presentation; absent = natural order. */
  connectorOrder?: Record<string, string[]>;
}

/** An empty override layer — the pure auto-derived state. */
export function emptyHarnessOverrides(): HarnessOverrides {
  return {
    nodePositions: {}, bundleLengths: {}, bundleWaypoints: {},
    bundleNames: {}, nodeOrientations: {},
  };
}

/**
 * Per-sheet harness-view state. Lives alongside the existing sheet data.
 *
 * Phase 2: the harness graph itself is 100% derived (`deriveHarness`) and
 * never stored — bundling, branch points and splices are computed fresh on
 * entering the harness view.
 *
 * Phase 3: a persistent, topology-free `overrides` layer — the user's node
 * re-positions and cable lengths — replaces the parked Phase-2
 * `devicePositions`. Overrides are keyed by stable id and re-applied on top
 * of every fresh derivation.
 */
export interface HarnessView {
  viewMode: 'schematic' | 'harness';
  /** Persistent harness re-alignment — node positions + bundle lengths,
   *  keyed by stable id. Topology-free; see `HarnessOverrides`. */
  overrides: HarnessOverrides;
  /** Millimetres of real cable per one canvas unit — the harness drawing
   *  scale. Optional; absent → DEFAULT_MM_PER_UNIT. Used to turn a cable's
   *  geometric length into a physical length. */
  mmPerUnit?: number;
}

// ── Phase 2 — derived harness graph ────────────────────────────────
//
// `HarnessGraph` is the Phase-2 harness model: a real harness graph of
// Components, Branch Points and Splices, with conductors routed through a
// SHARED trunk. It replaced the old one-cable-per-net model. Computed
// fresh per sheet by `deriveHarness`, never persisted.

/**
 * A vertex of a harness tree.
 *  - `component`  → a placed device; `refId` is the placement id.
 *  - `connector`  → a device connector termination; `refId` is `<placementId>:<logicalConnector>`.
 *  - `splice`     → a `Junction`; `refId` is the junction node id (`J:<id>`).
 *  - `branchPoint`→ a derived fan-out point on a parent cable; `refId` unset.
 */
export interface HarnessNode {
  id: string;
  kind: 'component' | 'connector' | 'splice' | 'branchPoint';
  /** Harness-view world coordinates. */
  position: Point;
  /** kind 'component'  → the placement id it represents.
   *  kind 'connector'  → "<placementId>:<logicalConnector>" (also its id).
   *  kind 'splice'     → the junction node id (`J:<id>`).
   *  kind 'branchPoint'→ undefined. */
  refId?: string;
  /** kind 'component' only — device rotation, from `HarnessOverrides`.
   *  Undefined elsewhere; treat a missing value as `0`. */
  orientation?: Orientation;
}

/**
 * A physical cable segment — one edge of a harness tree. Carries the
 * conductors of many nets: a segment lists every wire whose route crosses it,
 * so wires that run together share ONE bundle (and a thicker cable). Cable
 * thickness = `conductorIds.length`.
 */
export interface Bundle {
  /** Stable id — the two endpoint node ids sorted, joined `<a>|<b>`. Stable
   *  because the node ids are; used to key a `HarnessOverrides.bundleLengths`
   *  entry. */
  id: string;
  /** The two `HarnessNode` ids this segment connects. */
  endpoints: [string, string];
  /** Every wire (conductor) whose route crosses this segment. */
  conductorIds: string[];
  /** User-set physical cable length in mm, from `HarnessOverrides`. Undefined
   *  when the user hasn't set one — purely a presentation/physical attribute,
   *  never affects topology or routing. */
  length?: number;
  /** Ordered cable bend points, from `HarnessOverrides.bundleWaypoints`
   *  (Phase 4). The renderer routes the cable endpoint → waypoints → endpoint.
   *  Undefined when the user hasn't shaped this cable. Presentation only. */
  waypoints?: Point[];
  /** User-given cable name, from `HarnessOverrides.bundleNames` (Phase 4).
   *  Undefined when unnamed. Presentation only. */
  name?: string;
}

/**
 * The derived harness for one sheet — a forest of harness trees (one tree
 * per connected component of the wire graph). Computed by `deriveHarness`,
 * never stored.
 */
export interface HarnessGraph {
  nodes: HarnessNode[];
  bundles: Bundle[];
}
