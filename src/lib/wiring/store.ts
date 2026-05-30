import { create } from 'zustand';
import type { Device, Placement, PlacedDevice, Wire, Sheet, Point, PinKey, ConnectorInstance, Side, Pin, NetLabel, Shield, ShieldTermination, Annotation, HarnessView, HarnessOverrides, Junction, Orientation } from './types';
import { isJunctionKey, makeJunctionKey, junctionIdFromKey, emptyHarnessOverrides } from './types';
import { computePinWorldPos } from './layout';
import { setNetLabelRegistry, setJunctionRegistry } from './wirePaths';
import { insertWaypointAtNearestSegment } from './harness';
import { slugifyDesignator, pinIdFor, connectorIdFor, nextDesignator } from './library/types';
import { wiresInNet } from './nets';

/** Compute the set of pin keys ("deviceId:pinId") currently visible on at
 *  least one placement.connector — i.e. drawable on the canvas. Pins still
 *  in pinCatalog but not referenced by any connector view are "hidden" and
 *  any wires anchored to them are orphans. Junction endpoints
 *  ("junction:<id>") are not included here — callers keep those untouched. */
/** Shared toggle helper used by all selection slots. Returns a fresh Set so
 *  React/Zustand sees a referential change and re-renders subscribers. */
function toggleInSet<T>(current: Set<T>, id: T): Set<T> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

function visiblePinKeys(placements: Placement[]): Set<string> {
  const out = new Set<string>();
  for (const p of placements) {
    for (const c of p.connectors) {
      for (const pid of c.pinIds) {
        out.add(`${p.deviceId}:${pid}`);
      }
    }
  }
  return out;
}

/** Drop wires and net labels whose pin endpoints are no longer visible on
 *  any connector view. Junction endpoints ("junction:<id>") are preserved
 *  verbatim. Apply this after every mutation that hides pins (toggle off,
 *  replace pinIds, remove a connector view, remove a placement). */
function pruneOrphanedConnections(
  placements: Placement[],
  wires: Wire[],
  netLabels: NetLabel[],
): { wires: Wire[]; netLabels: NetLabel[] } {
  const visible = visiblePinKeys(placements);
  const labelIds = new Set(netLabels.map(n => n.id));
  // `#labelId` endpoints are valid as long as the referenced label exists.
  // `junction:<id>` keys are junction endpoints; those don't have a
  // placement to validate against (junction GC handles their lifecycle).
  const isPinVisible = (key: string) => {
    if (isJunctionKey(key)) return true;
    if (key.startsWith('#')) return labelIds.has(key.slice(1));
    return visible.has(key);
  };
  return {
    wires: wires.filter(w => isPinVisible(w.fromPin) && isPinVisible(w.toPin)),
    netLabels: netLabels.filter(n => isPinVisible(n.attachedTo)),
  };
}

/** Pick the next free unit letter (A, B, C, …) for a device across its
 *  existing placements. Gap-fills: ["U1A", "U1C"] → "U1B". */
function nextUnitLetter(deviceId: string, placements: Placement[]): string {
  const used = new Set<string>();
  for (const p of placements) {
    if (p.deviceId !== deviceId) continue;
    const m = p.id.match(/([A-Z])$/);
    if (m) used.add(m[1]);
  }
  for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return letter;
  }
  // 26 placements is well beyond any realistic design. Fall through to 'A'
  // rather than crashing — duplicate-id protection catches it downstream.
  return 'A';
}

function placementIdFor(deviceId: string, letter: string): string {
  return `${deviceId}${letter}`;
}

/** Extract the letter prefix of a designator ("U1" → "U", "SW12" → "SW").
 *  Used by paste to pick a collision-free next number for the copied device. */
function designatorPrefix(name: string): string {
  const m = name.match(/^([A-Za-z]+)/);
  return m ? m[1] : 'U';
}

/** Rebuild pin ids for a device (for rename or paste). Connectors live on
 *  Placements, so their ids are rebuilt separately in `remapPlacementConnectors`
 *  which uses the returned pinIdMap to rewrite each placement's connector.pinIds. */
function remapDevicePins(
  device: Device | Omit<Device, 'sheetId'>,
  _newDeviceId: string,
): { pinCatalog: Pin[]; pinIdMap: Map<string, string> } {
  const pinIdMap = new Map<string, string>();
  const posIndexByConnector = new Map<string, number>();
  const pinCatalog: Pin[] = device.pinCatalog.map((p) => {
    const pos = posIndexByConnector.get(p.logicalConnectorName) ?? 0;
    posIndexByConnector.set(p.logicalConnectorName, pos + 1);
    const newId = pinIdFor(p.logicalConnectorName, p.pinNumber, pos);
    pinIdMap.set(p.id, newId);
    return { ...p, id: newId };
  });
  return { pinCatalog, pinIdMap };
}

/** Rebuild ConnectorInstance ids on a placement given its device's new id,
 *  and remap the placement's connector.pinIds through the pinIdMap. */
function remapPlacementConnectors(
  connectors: ConnectorInstance[],
  newDeviceId: string,
  pinIdMap: Map<string, string>,
): ConnectorInstance[] {
  // sidesUsed-per-logical-connector detection looks at this placement alone;
  // a single placement never splits one logical connector across more than
  // its assigned sides.
  const sideCountByConn = new Map<string, number>();
  for (const c of connectors) {
    sideCountByConn.set(c.logicalConnectorName, (sideCountByConn.get(c.logicalConnectorName) ?? 0) + 1);
  }
  return connectors.map((c) => ({
    ...c,
    id: connectorIdFor(newDeviceId, c.logicalConnectorName, c.side, (sideCountByConn.get(c.logicalConnectorName) ?? 1) > 1),
    pinIds: c.pinIds.map(oldId => pinIdMap.get(oldId) ?? oldId),
  }));
}

// ── Snapshot used by the history stack ──────────────────────────────
interface Snapshot {
  devices: Device[];
  placements: Placement[];
  wires:   Wire[];
  sheets:  Sheet[];
  activeSheetId: string;
  netLabels: NetLabel[];
  junctions: Junction[];
  shields: Shield[];
  annotations: Annotation[];
}

/** Drop any Junction no longer referenced by a surviving wire or net-label
 *  endpoint. Junctions are first-class entities, so an unreferenced one is
 *  garbage — this runs inside the mutations that delete wires/labels. */
function gcJunctions(junctions: Junction[], wires: Wire[], netLabels: NetLabel[]): Junction[] {
  const referenced = new Set<string>();
  for (const w of wires) {
    const f = junctionIdFromKey(w.fromPin);
    const t = junctionIdFromKey(w.toPin);
    if (f) referenced.add(f);
    if (t) referenced.add(t);
  }
  for (const n of netLabels) {
    const a = junctionIdFromKey(n.attachedTo);
    if (a) referenced.add(a);
  }
  const next = junctions.filter(j => referenced.has(j.id));
  return next.length === junctions.length ? junctions : next;
}

interface WiringState extends Snapshot {
  // interaction state (NOT recorded in history — transient)
  wiringFromPin: PinKey | null;
  /** Active editor tool. Drives Pin / Wire / Canvas click semantics:
   *   'wire'     — clicks on pins start/finish a wire, on wires create junctions
   *   'netLabel' — clicks tag the target with a net name
   *   'shield'   — drag-rectangle on the canvas wraps wires in a shield
   *  Stored on the store so all consumers (Pin, Wire, WiringPage) read from
   *  one source of truth. */
  toolMode: 'wire' | 'junction' | 'netLabel' | 'shield' | 'text' | 'note';
  setToolMode: (m: 'wire' | 'junction' | 'netLabel' | 'shield' | 'text' | 'note') => void;
  selectedDeviceIds: Set<string>;
  selectedWireIds:   Set<string>;
  selectedConnectorIds: Set<string>;
  selectedShieldIds: Set<string>;
  /** Clipboard holds a snapshot of (device, placement) pairs chosen by the
   *  user plus any wires fully between selected devices. On paste, each
   *  entry becomes a new device with a fresh designator and one placement
   *  on the active sheet. */
  clipboardEntries:  { device: Device; placement: Placement }[] | null;
  clipboardWires:    Wire[] | null;
  clipboardLabels:   NetLabel[] | null;
  clipboardJunctions: Junction[] | null;
  clipboardAnnotations: Annotation[] | null;

  // history
  past:   Snapshot[];
  future: Snapshot[];
  /** When non-null, every mutation inside the transaction is collapsed into
   *  a single undo step whose "before" state is this snapshot. Set by
   *  beginTransaction() (drag pointerDown) and flushed by commitTransaction()
   *  (drag pointerUp). See the mutate() helper for the actual folding logic. */
  _txSnapshot: Snapshot | null;

  // ── Transactions ─────────────────────────────────────────────────
  /** Start grouping subsequent mutations into a single undo step. Idempotent
   *  — nested begins share the first snapshot so nested transactions don't
   *  create extra history entries. */
  beginTransaction: () => void;
  /** Close the current transaction, recording ONE undo step whose "before"
   *  state is the snapshot captured at begin. No-op if no transaction active. */
  commitTransaction: () => void;

  // ── Device + Placement actions ───────────────────────────────────
  // `addDevice` creates a NEW logical Device (with a fresh designator) plus
  // its first Placement on the active sheet. Both are stamped automatically.
  addDevice: (template: { device: Omit<Device, 'id'> & { id?: string }; placement: Omit<Placement, 'id' | 'deviceId' | 'sheetId'> }) => void;
  addDevices: (entries: { device: Omit<Device, 'id'> & { id?: string }; placement: Omit<Placement, 'id' | 'deviceId' | 'sheetId'> }[]) => void;
  /** Move an existing PLACEMENT (the visible unit on a sheet). */
  movePlacement: (placementId: string, position: Point) => void;
  /** Shift several placements by the same (dx, dy) delta in one mutation.
   *  Used by the canvas for multi-select drag — keeps the relative geometry
   *  of the selection intact. Junctions are fixed entities, so wires
   *  re-route to them automatically. Pass an empty list or a zero delta as
   *  a no-op. */
  movePlacementsBy: (delta: Point, placementIds: readonly string[]) => void;
  /** Shift an arbitrary mix of selectable items (placements, annotations,
   *  net labels, shields) by the same (dx, dy) delta in a single mutation.
   *  Use this for the canvas's general-purpose multi-select drag so the
   *  group preserves its relative geometry. Each id list is optional. The
   *  rules per type are documented at the implementation. */
  moveSelectionBy: (delta: Point, ids: {
    placementIds?: readonly string[];
    annotationIds?: readonly string[];
    netLabelIds?: readonly string[];
    shieldIds?: readonly string[];
  }) => void;
  removeSelected: () => void;
  /** Patch logical device fields (name is rename — prefer renameDevice;
   *  width/height are per-placement and live on Placement, not Device). */
  updateDevice: (id: string, patch: Partial<Pick<Device, 'name' | 'manufacturer' | 'partNumber' | 'productName'>>) => void;
  /** Patch user-editable metadata on a single pin (name, current rating,
   *  AWG, comment). The pin id and logicalConnectorName are immutable. */
  updatePin: (deviceId: string, pinId: string, patch: Partial<Pick<Pin, 'name' | 'current' | 'wireGauge' | 'comment'>>) => void;
  /** Patch per-placement geometry (width/height). */
  updatePlacement: (placementId: string, patch: Partial<Pick<Placement, 'width' | 'height'>>) => void;
  /** Rename a device and atomically rewrite every reference (its pin/connector
   *  ids, placement ids, wires, net labels, selection sets). Returns false on
   *  collision/empty/no-op. */
  renameDevice: (id: string, newName: string) => boolean;
  setDeviceAttribute: (id: string, key: string, value: string) => void;
  setWireLabelPosition: (id: string, x: number | undefined, y: number | undefined) => void;
  /** Add a second/third/... placement of an existing device on the active sheet.
   *  The new placement starts with no connector-views; the user populates them
   *  via the Inspector. Returns the new placement id, or null if the device
   *  has reached the 26-letter cap. */
  addPlacementOnActiveSheet: (deviceId: string, position: Point) => string | null;
  /** Move selected pins (by pin-id) from one placement to another. If the
   *  target sheet has no placement of this device, one is created. */
  movePinsToSheet: (deviceId: string, pinIds: string[], fromPlacementId: string, targetSheetId: string) => void;
  /** Split selected connector-views off into a NEW sibling placement on the
   *  same sheet — used for breaking up a big device (GTN 650, ACM, etc.) into
   *  separate sections side-by-side. The new placement reuses the device's
   *  pinCatalog, so wires anchored to those pins follow the move automatically.
   *  When `position` is omitted, the sibling lands just to the right of the
   *  source placement. Returns the new placement id, or null on invalid input
   *  / 26-letter cap. */
  splitConnectorsToNewPlacement: (fromPlacementId: string, connectorIds: string[], position?: Point) => string | null;
  /** Move a single connector-view from one placement to another. Both
   *  placements must belong to the same logical Device. Returns true on
   *  success, false on cross-device, missing-connector, or same-placement. */
  moveConnectorToPlacement: (fromPlacementId: string, connectorId: string, toPlacementId: string) => boolean;
  /** Merge a sibling placement back into another placement of the same
   *  device — moves every connector view from `fromPlacementId` to
   *  `toPlacementId`, then deletes the (now-empty) source placement.
   *  Inverse of splitConnectorsToNewPlacement. Returns true on success. */
  mergePlacementInto: (fromPlacementId: string, toPlacementId: string) => boolean;

  /** Transient drag-state for the on-canvas "drag a connector to a sibling
   *  placement" gesture. Set by ConnectorBlock on pointerdown of the drag
   *  handle, read by DeviceBlock to highlight valid drop targets, and
   *  cleared by Canvas on pointerup. Not persisted. */
  connectorDrag: { fromPlacementId: string; connectorId: string; deviceId: string } | null;
  beginConnectorDrag: (fromPlacementId: string, connectorId: string) => void;
  endConnectorDrag: () => void;

  // ── Junctions ─────────────────────────────────────────────────────
  /** Create a standalone Junction entity at `(x, y)` on the active sheet
   *  and return its `junction:<id>` endpoint key. Used when a net label is
   *  dropped on empty canvas (a free anchor a wire can later dock onto).
   *  Junction GC keeps it alive as long as something references it. */
  addJunction: (x: number, y: number) => string;

  // ── Net labels ────────────────────────────────────────────────────
  addNetLabel: (attachedTo: PinKey, text: string) => void;
  /** Create a label that's been placed *on a pin* — the label itself is
   *  positioned (free-floating) at the pin's world coords, AND a real Wire
   *  is added from the pin to the new label. So the user can later select
   *  / restyle / delete the wire like any other connection. */
  addNetLabelOnPin: (pinKey: PinKey, text: string) => void;
  updateNetLabel: (id: string, patch: Partial<Pick<NetLabel, 'text' | 'rotation' | 'offset' | 'color'>>) => void;
  removeNetLabel: (id: string) => void;
  /** Transient selection for net labels. */
  selectedNetLabelIds: Set<string>;
  toggleNetLabel: (id: string) => void;

  // ── Shields (graphical wire-bundle annotations) ─────────────────
  /** Add a new shield wrapping the given wires across [xStart, xEnd] on
   *  the active sheet. Returns the new shield id, or null if no wireIds
   *  were provided (a shield with zero wires has nothing to enclose). */
  addShield: (wireIds: string[], xStart: number, xEnd: number, termination: ShieldTermination) => string | null;
  /** Patch a shield (termination, x-range, wire membership). */
  updateShield: (id: string, patch: Partial<Pick<Shield, 'termination' | 'xStart' | 'xEnd' | 'wireIds'>>) => void;
  removeShield: (id: string) => void;
  toggleShield: (id: string) => void;

  // ── Annotations (text + numbered notes) ──────────────────────────
  /** Create a free-text annotation at a position. */
  addTextAnnotation: (position: Point, text: string) => string;
  /** Create a numbered note marker. Number auto-assigned as the next
   *  unused integer across notes on the active sheet. */
  addNoteAnnotation: (position: Point, text: string) => string;
  /** Patch an annotation — text content, position, fontSize, or number. */
  updateAnnotation: (id: string, patch: Partial<Pick<Annotation, 'position' | 'text'>> & Partial<{ fontSize: number; number: number }>) => void;
  removeAnnotation: (id: string) => void;
  toggleAnnotation: (id: string) => void;
  selectedAnnotationIds: Set<string>;
  /** Append a wire to a shield's wireIds list, deduped. No-op if the wire
   *  is already in the shield. */
  addWireToShield: (shieldId: string, wireId: string) => void;

  /** Transient state for the "click on a wire to add it to this shield"
   *  picker mode. When set to a shield id, the next wire click on the
   *  canvas appends to that shield instead of doing normal selection. */
  shieldPickingId: string | null;
  beginShieldPicking: (shieldId: string) => void;
  endShieldPicking: () => void;

  /** Wire id currently hovered from an external UI surface (e.g. the
   *  Inspector's shield wires list). Drives a glow halo on the canvas so
   *  the user can see which physical wire a list entry refers to. Pure
   *  UI state — never persisted, not in the undo history. */
  hoveredWireId: string | null;
  setHoveredWireId: (wireId: string | null) => void;

  // ── Harness selection (Phase 2 — derived HarnessGraph) ────────────
  /** Transient: id of the currently selected derived `Bundle`, or null.
   *  Exclusive with every other selection. Never persisted. */
  selectedBundleId: string | null;
  selectBundle: (id: string | null) => void;
  /** Transient: the root bundle id of a whole-harness-tree selection, or null.
   *  Set by a double-click on a bundle; exclusive with every other selection.
   *  Never persisted. */
  selectedHarnessTree: string | null;
  /** Highlight the whole harness tree that `bundleId` belongs to. */
  selectWholeHarness: (bundleId: string) => void;

  /** Transient: ids of the currently selected `HarnessNode`s (`splice`,
   *  `branchPoint`, or `component` nodes). A Set so harness nodes support
   *  multi-select (Phase 4) — shift-click toggles, a plain click selects
   *  one. Exclusive with every other selection. Never persisted. */
  selectedHarnessNodeIds: Set<string>;
  /** Select a harness node. `additive` (shift-click) toggles it in the set;
   *  otherwise the set becomes exactly `{id}`. `null` clears the set. */
  selectHarnessNode: (id: string | null, additive?: boolean) => void;

  /** Transient: the active alignment-guide coordinates while a harness node
   *  is being dragged (Phase 4). `x`/`y` are the neighbour coordinate the
   *  drag snapped to, or null when nothing is aligned. The harness renderer
   *  draws a thin guide line at each non-null axis. Cleared on drop. Never
   *  persisted, not in undo history. */
  harnessAlignGuides: { x: number | null; y: number | null };
  setHarnessAlignGuides: (x: number | null, y: number | null) => void;

  // ── Connector actions (operate on a Placement's connectors) ─────
  addConnector: (placementId: string, side: Side, logicalConnectorName?: string) => void;
  removeConnector: (placementId: string, connectorId: string) => void;
  updateConnector: (placementId: string, connectorId: string, patch: Partial<Pick<ConnectorInstance, 'name' | 'side' | 'logicalConnectorName' | 'gender' | 'connectorType'>>) => void;
  setConnectorPins: (placementId: string, connectorId: string, pinIds: string[]) => void;
  togglePinInConnector: (placementId: string, connectorId: string, pinId: string) => void;
  /** Remove a pin from all connectors on THIS placement (hides it on this sheet). */
  hidePin: (placementId: string, pinId: string) => void;

  // ── Wiring ────────────────────────────────────────────────────────
  startWiring: (pinKey: PinKey) => void;
  /** Start a new wire from a point on an existing wire: split that wire at
   *  `(x, y)` into a shared junction, then begin wiring from the junction. */
  startWiringFromWire: (wireId: string, x: number, y: number) => void;
  cancelWiring: () => void;
  finishWiring: (toPinKey: PinKey) => void;
  /** Finish the current wiring as a junction on an existing wire.
   *  `onWireId` is the wire the user clicked — that wire is split at the
   *  junction so every meeting wire references the same `junction:<id>`. */
  finishWiringAtPoint: (x: number, y: number, onWireId?: string) => void;
  /** Split a wire into two halves meeting at the given point. Creates a
   *  `Junction` entity at `(x, y)`; both halves end at `junction:<id>` so
   *  any branch wire created at that point references the same junction.
   *  The original wire is removed. Returns the junction endpoint key, or
   *  null if the wire id is unknown. Routing parameters reset on each half
   *  — the router picks fresh paths from each half's pin to the junction. */
  splitWireAtPoint: (wireId: string, x: number, y: number) => string | null;
  updateWire: (id: string, patch: Partial<Wire>) => void;
  /** Apply `patch` to every wire in `wireId`'s net — one undo step. `patch`
   *  should hold only net-level fields (label / color / stripeColor / awg). */
  updateNet: (wireId: string, patch: Partial<Wire>) => void;
  setWireMidX: (id: string, midX: number | undefined) => void;
  setWireFromY: (id: string, fromY: number | undefined) => void;
  setWireToY:   (id: string, toY: number | undefined) => void;
  /** Set fromY and toY together as a single undoable operation. Used by the
   *  detour-Y drag handle on wires that auto-routed around a device. */
  setWireDetourY: (id: string, y: number | undefined) => void;
  /** X of the source-side vertical jog — user-draggable so the "left vertical"
   *  of a detour can be shifted horizontally. */
  setWireFromJogX: (id: string, x: number | undefined) => void;
  /** X of the dest-side vertical jog. */
  setWireToJogX:   (id: string, x: number | undefined) => void;
  resetWireRouting: (id: string) => void;

  // ── Sheets ────────────────────────────────────────────────────────
  addSheet: () => void;
  renameSheet: (id: string, name: string) => void;
  removeSheet: (id: string) => void;
  setActiveSheet: (id: string) => void;
  ensureHarnessView: (sheetId: string) => void;
  setSheetViewMode: (sheetId: string, viewMode: 'schematic' | 'harness') => void;
  // ── Harness overrides (Phase 3 — persistent topology-free layer) ──
  /** Set several harness node positions at once — one undo step. Used by the
   *  whole-harness group drag. */
  setHarnessNodePositions: (sheetId: string, positions: Record<string, Point>) => void;
  /** Set a device's harness connector row order. Undoable. */
  setConnectorOrder: (sheetId: string, placementId: string, order: string[]) => void;
  /** Set (or, with `undefined`, clear) a derived `Bundle`'s physical cable
   *  length in mm. `bundleId` is the bundle's stable sorted-pair id. Undoable. */
  setBundleLength: (sheetId: string, bundleId: string, mm: number | undefined) => void;
  /** Replace a derived `Bundle`'s cable bend points (Phase 4). An empty array
   *  clears the override. `bundleId` is the stable sorted-pair id. Undoable. */
  setBundleWaypoints: (sheetId: string, bundleId: string, waypoints: Point[]) => void;
  /** Add a cable bend point to a bundle, inserted at the nearest polyline
   *  segment. `start`/`end` are the bundle's current endpoint dock points
   *  (the renderer supplies them). Undoable. */
  addBundleWaypoint: (sheetId: string, bundleId: string, point: Point, start: Point, end: Point) => void;
  /** Remove the bend point at `index` from a bundle's waypoint list. Undoable. */
  removeBundleWaypoint: (sheetId: string, bundleId: string, index: number) => void;
  /** Set (or, with `undefined`/blank, clear) a derived `Bundle`'s user-given
   *  cable name. `bundleId` is the stable sorted-pair id. Undoable. */
  setBundleName: (sheetId: string, bundleId: string, name: string | undefined) => void;
  /** Set every selected `component` harness node's orientation so its
   *  connectors face the left edge (`dir === 'left'`, orientation 0°) or
   *  the right edge (`dir === 'right'`, orientation 180°). One undo step. */
  rotateHarnessNode: (sheetId: string, dir: 'left' | 'right') => void;
  /** Set the active sheet's harness drawing scale (mm of cable per canvas
   *  unit). Ignores non-finite / non-positive input. Undoable. */
  setHarnessScale: (sheetId: string, mmPerUnit: number) => void;
  // ── Selection ─────────────────────────────────────────────────────
  selectOnly: (deviceIds?: string[], wireIds?: string[], connectorIds?: string[], netLabelIds?: string[], shieldIds?: string[], annotationIds?: string[]) => void;
  /** Select every wire in the given wire's net. */
  selectWholeNet: (wireId: string) => void;
  toggleDevice: (id: string) => void;
  toggleWire: (id: string) => void;
  toggleConnector: (id: string) => void;
  clearSelection: () => void;

  // ── Clipboard ─────────────────────────────────────────────────────
  copySelection: () => void;
  /**
   * Paste the clipboard contents centred at the supplied world position.
   * Called by the WiringPage when the user clicks to commit a paste preview
   * (or on Ctrl/Cmd+V with the live cursor coords). When `cursorWorld` is
   * omitted, falls back to the legacy fixed `+40,+40` offset so existing
   * callers keep working.
   */
  pasteClipboard: (cursorWorld?: Point) => void;

  // ── History ───────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;

  // ── Persistence ───────────────────────────────────────────────────
  serialize: () => string;
  loadFromJson: (json: string) => boolean;
  reset: () => void;
}

/**
 * Patch the harness override layer of one sheet. `patch` receives the sheet's
 * current `HarnessOverrides` and returns the fields to merge in. Returns the
 * `mutate` state-patch; an empty object when the sheet has no harness slice.
 */
function patchHarnessOverrides(
  s: WiringState,
  sheetId: string,
  patch: (current: HarnessOverrides) => Partial<HarnessOverrides>,
): Partial<Snapshot> {
  const sheet = s.sheets.find(sh => sh.id === sheetId);
  if (!sheet || !sheet.harness) return {};
  const current = sheet.harness.overrides ?? emptyHarnessOverrides();
  const next: HarnessOverrides = { ...current, ...patch(current) };
  return {
    sheets: s.sheets.map(sh => sh.id === sheetId
      ? { ...sh, harness: { ...sh.harness!, overrides: next } }
      : sh),
  };
}

const initialSheet: Sheet = { id: 'sheet-main', name: 'Main', order: 0 };
const HISTORY_LIMIT = 200;

const takeSnapshot = (s: WiringState): Snapshot => ({
  devices: s.devices,
  placements: s.placements,
  wires:   s.wires,
  sheets:  s.sheets,
  activeSheetId: s.activeSheetId,
  netLabels: s.netLabels,
  junctions: s.junctions,
  shields: s.shields,
  annotations: s.annotations,
});

export const useWiring = create<WiringState>((set, get) => {
  function mutate(mutator: (s: WiringState) => Partial<Snapshot>) {
    set((s) => {
      const patch = mutator(s);
      // In a transaction, the "before" snapshot was already captured by
      // beginTransaction — subsequent mutations just apply state without
      // pushing another history entry. commitTransaction() will push exactly
      // one undo step when the drag ends.
      if (s._txSnapshot) {
        return { ...patch, future: [] };
      }
      const prev = takeSnapshot(s);
      const past = [...s.past.slice(-HISTORY_LIMIT + 1), prev];
      return { ...patch, past, future: [] };
    });
  }

  // Helper to update a specific device within the devices array.
  function patchDevice(s: WiringState, deviceId: string, fn: (d: Device) => Device): Device[] {
    return s.devices.map(d => d.id === deviceId ? fn(d) : d);
  }

  return {
    sheets: [initialSheet],
    activeSheetId: initialSheet.id,
    devices: [],
    placements: [],
    wires: [],
    netLabels: [],
    junctions: [],
    shields: [],
    annotations: [],

    wiringFromPin: null,
    toolMode: 'wire',
    setToolMode: (m) => set({ toolMode: m }),
    selectedDeviceIds: new Set(),
    selectedWireIds: new Set(),
    selectedConnectorIds: new Set(),
    selectedNetLabelIds: new Set(),
    selectedShieldIds: new Set(),
    selectedAnnotationIds: new Set(),
    shieldPickingId: null,
    hoveredWireId: null,
    clipboardEntries: null,
    clipboardWires: null,
    clipboardLabels: null,
    clipboardJunctions: null,
    clipboardAnnotations: null,
    connectorDrag: null,
    selectedBundleId: null,
    selectedHarnessTree: null,
    selectedHarnessNodeIds: new Set(),
    harnessAlignGuides: { x: null, y: null },

    past: [],
    future: [],
    _txSnapshot: null,

    // ── Transactions ────────────────────────────────────────────────
    beginTransaction: () => set((s) => s._txSnapshot
      ? s
      : { _txSnapshot: takeSnapshot(s) }),
    commitTransaction: () => set((s) => {
      if (!s._txSnapshot) return s;
      const start = s._txSnapshot;
      const changed = start.devices !== s.devices
                   || start.placements !== s.placements
                   || start.wires !== s.wires
                   || start.sheets !== s.sheets
                   || start.netLabels !== s.netLabels
                   || start.junctions !== s.junctions
                   || start.activeSheetId !== s.activeSheetId;
      if (!changed) return { _txSnapshot: null };
      const past = [...s.past.slice(-HISTORY_LIMIT + 1), start];
      return { _txSnapshot: null, past, future: [] };
    }),

    // ── Device + Placement ──────────────────────────────────────────
    // Callers pass a {device, placement} pair; placement.sheetId is set from
    // the active sheet, and both are appended. The caller is responsible for
    // providing a globally-unique device.id (nextDesignator + instantiateDevice
    // handle that). The first placement gets unit letter 'A'.
    addDevice: ({ device, placement }) => mutate((s) => {
      const devId = device.id ?? slugifyDesignator(device.name);
      const placementId = placementIdFor(devId, nextUnitLetter(devId, s.placements));
      return {
        devices: [...s.devices, { ...device, id: devId } as Device],
        placements: [...s.placements, {
          ...placement,
          id: placementId,
          deviceId: devId,
          sheetId: s.activeSheetId,
        } as Placement],
      };
    }),
    addDevices: (entries) => mutate((s) => {
      const newDevices: Device[] = [];
      const newPlacements: Placement[] = [];
      let runningPlacements = s.placements;
      for (const { device, placement } of entries) {
        const devId = device.id ?? slugifyDesignator(device.name);
        const placementId = placementIdFor(devId, nextUnitLetter(devId, runningPlacements));
        newDevices.push({ ...device, id: devId } as Device);
        const pl: Placement = {
          ...placement,
          id: placementId,
          deviceId: devId,
          sheetId: s.activeSheetId,
        } as Placement;
        newPlacements.push(pl);
        runningPlacements = [...runningPlacements, pl];
      }
      return {
        devices: [...s.devices, ...newDevices],
        placements: [...s.placements, ...newPlacements],
      };
    }),

    movePlacement: (placementId, position) => mutate((s) => {
      const target = s.placements.find(p => p.id === placementId);
      if (!target) return {};
      // Junctions are fixed entities — moving a device just re-routes its
      // wires to the (unchanged) junction positions. No reprojection needed.
      return {
        placements: s.placements.map(p => p.id === placementId ? { ...p, position } : p),
      };
    }),

    moveSelectionBy: (delta, ids) => mutate((s) => {
      if (delta.x === 0 && delta.y === 0) return {};
      const placementIds  = ids.placementIds  ?? [];
      const annotationIds = ids.annotationIds ?? [];
      const netLabelIds   = ids.netLabelIds   ?? [];
      const shieldIds     = ids.shieldIds     ?? [];
      if (placementIds.length + annotationIds.length + netLabelIds.length + shieldIds.length === 0) {
        return {};
      }

      // ── Placements: shift position, then reproject affected wire junctions.
      const placementIdSet = new Set(placementIds);
      const movedDeviceIds = new Set<string>();
      const nextPlacements = s.placements.map(p => {
        if (!placementIdSet.has(p.id)) return p;
        movedDeviceIds.add(p.deviceId);
        return { ...p, position: { x: p.position.x + delta.x, y: p.position.y + delta.y } };
      });

      // ── Annotations: free-positioned, just shift.
      const annotationIdSet = new Set(annotationIds);
      const nextAnnotations = s.annotations.map(a => (
        annotationIdSet.has(a.id)
          ? { ...a, position: { x: a.position.x + delta.x, y: a.position.y + delta.y } }
          : a
      ));

      // ── Net labels: skip labels whose anchor pin's device is ALSO in the
      // moving set — the pin already shifts with the device, so bumping the
      // offset would double-move the flag. Free-point / cross-device anchors
      // get their offset shifted by the delta (initializing if absent).
      const netLabelIdSet = new Set(netLabelIds);
      const nextNetLabels = s.netLabels.map(nl => {
        if (!netLabelIdSet.has(nl.id)) return nl;
        // attachedTo is `deviceId:pinId`, `junction:<id>`, or `#labelId`.
        // Only the device-pin form triggers the auto-move-with-device skip.
        if (nl.attachedTo && !isJunctionKey(nl.attachedTo) && !nl.attachedTo.startsWith('#')) {
          const [anchorDeviceId] = nl.attachedTo.split(':');
          if (movedDeviceIds.has(anchorDeviceId)) return nl;
        }
        const offset = nl.offset ?? { dx: 0, dy: 0 };
        return { ...nl, offset: { dx: offset.dx + delta.x, dy: offset.dy + delta.y } };
      });

      // ── Shields: X-only. The Y extent is rederived at render time from
      // the wires they wrap; if those wires move with their devices the
      // shield follows automatically.
      const shieldIdSet = new Set(shieldIds);
      const nextShields = s.shields.map(sh => (
        shieldIdSet.has(sh.id)
          ? { ...sh, xStart: sh.xStart + delta.x, xEnd: sh.xEnd + delta.x }
          : sh
      ));

      // ── Wires: shift user-set routing overrides for wires whose BOTH
      // endpoints are anchored to moving devices. The wire ends themselves
      // are pin-anchored so they follow automatically — but the midX /
      // fromY / toY / fromJogX / toJogX / labelX / labelY are absolute
      // world coordinates the user dragged into place, so we have to
      // translate them by the same delta or the routing visibly tears.
      //
      // Single-endpoint moves (one device in the set, other not) leave
      // routing alone: the geometry between a moving and a stationary
      // device is genuinely changing, so any prior override is now stale
      // regardless. The router will auto-route from the new geometry.
      let nextWires = s.wires;
      if (movedDeviceIds.size > 0) {
        const dx = delta.x, dy = delta.y;
        const endpointDeviceId = (key: string): string | null => {
          if (!key || isJunctionKey(key) || key.startsWith('#')) return null;
          const [devId] = key.split(':');
          return devId || null;
        };
        nextWires = nextWires.map(w => {
          const fromDev = endpointDeviceId(w.fromPin);
          const toDev   = endpointDeviceId(w.toPin);
          if (!fromDev || !toDev) return w;
          if (!movedDeviceIds.has(fromDev) || !movedDeviceIds.has(toDev)) return w;
          // Both ends moving by (dx, dy) — translate every absolute routing
          // override. Spread into a fresh object so React+Zustand see the
          // mutation. Only patch fields that are actually set so we don't
          // accidentally turn an "auto" override into a fixed value.
          const next: Wire = { ...w };
          if (w.midX     !== undefined) next.midX     = w.midX     + dx;
          if (w.fromY    !== undefined) next.fromY    = w.fromY    + dy;
          if (w.toY      !== undefined) next.toY      = w.toY      + dy;
          if (w.fromJogX !== undefined) next.fromJogX = w.fromJogX + dx;
          if (w.toJogX   !== undefined) next.toJogX   = w.toJogX   + dx;
          if (w.labelX   !== undefined) next.labelX   = w.labelX   + dx;
          if (w.labelY   !== undefined) next.labelY   = w.labelY   + dy;
          return next;
        });
        // Junctions are fixed entities — no reprojection needed; the router
        // re-routes each wire to the unchanged junction positions.
      }

      return {
        placements: nextPlacements,
        annotations: nextAnnotations,
        netLabels: nextNetLabels,
        shields: nextShields,
        wires: nextWires,
      };
    }),

    movePlacementsBy: (delta, placementIds) => mutate((s) => {
      // Empty-list / zero-delta fast-paths: skip the work AND skip the
      // transaction record so undo history doesn't fill with no-ops.
      if (placementIds.length === 0) return {};
      if (delta.x === 0 && delta.y === 0) return {};
      const idSet = new Set(placementIds);
      const nextPlacements = s.placements.map(p => (
        idSet.has(p.id)
          ? { ...p, position: { x: p.position.x + delta.x, y: p.position.y + delta.y } }
          : p
      ));
      // Junctions are fixed entities — wires re-route to them automatically.
      return { placements: nextPlacements };
    }),

    updateDevice: (id, patch) => mutate((s) => ({
      devices: patchDevice(s, id, d => ({ ...d, ...patch })),
    })),

    updatePin: (deviceId, pinId, patch) => mutate((s) => ({
      // Empty strings clear the field rather than persisting "" — keeps the
      // BOM tidy and treats blank input as "no value".
      devices: patchDevice(s, deviceId, d => ({
        ...d,
        pinCatalog: d.pinCatalog.map(p => {
          if (p.id !== pinId) return p;
          const next = { ...p } as unknown as Record<string, unknown>;
          for (const k of Object.keys(patch) as Array<keyof typeof patch>) {
            const v = patch[k];
            if (v === undefined || v === '') delete next[k as string];
            else next[k as string] = v;
          }
          return next as unknown as Pin;
        }),
      })),
    })),

    updatePlacement: (placementId, patch) => mutate((s) => ({
      placements: s.placements.map(p => p.id === placementId ? { ...p, ...patch } : p),
    })),

    addPlacementOnActiveSheet: (deviceId, position) => {
      const s = get();
      const device = s.devices.find(d => d.id === deviceId);
      if (!device) return null;
      const letter = nextUnitLetter(deviceId, s.placements);
      if (s.placements.some(p => p.deviceId === deviceId && p.id.endsWith(letter))) return null;
      const placementId = placementIdFor(deviceId, letter);
      mutate((cur) => ({
        placements: [...cur.placements, {
          id: placementId,
          deviceId,
          sheetId: cur.activeSheetId,
          position,
          // Empty-placement default size; resized by layoutDevice-driven width
          // once connectors are added.
          width: 120,
          height: 60,
          connectors: [],
        }],
      }));
      return placementId;
    },

    movePinsToSheet: (deviceId, pinIds, fromPlacementId, targetSheetId) => {
      const s = get();
      const fromPlacement = s.placements.find(p => p.id === fromPlacementId);
      if (!fromPlacement) return;
      const movedPinSet = new Set(pinIds);

      // Remove the pins from the source placement's connectors.
      const fromConnectors = fromPlacement.connectors
        .map(c => ({ ...c, pinIds: c.pinIds.filter(pid => !movedPinSet.has(pid)) }))
        .filter(c => c.pinIds.length > 0);

      // Find or create a placement of this device on the target sheet.
      let target = s.placements.find(p => p.deviceId === deviceId && p.sheetId === targetSheetId);
      const pinsByConnector = new Map<string, { side: Side; pinIds: string[] }>();
      const device = s.devices.find(d => d.id === deviceId);
      if (!device) return;
      for (const pid of pinIds) {
        const pin = device.pinCatalog.find(p => p.id === pid);
        if (!pin) continue;
        const existing = fromPlacement.connectors.find(c => c.pinIds.includes(pid));
        const side: Side = existing?.side ?? 'left';
        const bucket = pinsByConnector.get(pin.logicalConnectorName) ?? { side, pinIds: [] };
        bucket.pinIds.push(pid);
        pinsByConnector.set(pin.logicalConnectorName, bucket);
      }

      let nextPlacements = s.placements.map(p => p.id === fromPlacementId ? { ...p, connectors: fromConnectors } : p);
      if (!target) {
        // Create new placement on target sheet, with one connector-view per
        // logical connector among the moved pins.
        const letter = nextUnitLetter(deviceId, nextPlacements);
        const newId = placementIdFor(deviceId, letter);
        const newConnectors: ConnectorInstance[] = [];
        for (const [lname, { side, pinIds: pids }] of pinsByConnector) {
          newConnectors.push({
            id: connectorIdFor(deviceId, lname, side, false),
            name: lname,
            logicalConnectorName: lname,
            side,
            pinIds: pids,
          });
        }
        nextPlacements = [...nextPlacements, {
          id: newId,
          deviceId,
          sheetId: targetSheetId,
          position: { x: 100, y: 100 },
          width: 160,
          height: 60,
          connectors: newConnectors,
        }];
      } else {
        // Add pins into existing target placement — one connector-view per
        // logical connector, creating any missing view.
        nextPlacements = nextPlacements.map(p => {
          if (p.id !== target!.id) return p;
          const conns = [...p.connectors];
          for (const [lname, { side, pinIds: pids }] of pinsByConnector) {
            const idx = conns.findIndex(c => c.logicalConnectorName === lname && c.side === side);
            if (idx >= 0) {
              conns[idx] = { ...conns[idx], pinIds: [...conns[idx].pinIds, ...pids] };
            } else {
              conns.push({
                id: connectorIdFor(deviceId, lname, side, false),
                name: lname,
                logicalConnectorName: lname,
                side,
                pinIds: pids,
              });
            }
          }
          return { ...p, connectors: conns };
        });
      }

      mutate(() => ({ placements: nextPlacements }));
    },

    splitConnectorsToNewPlacement: (fromPlacementId, connectorIds, position) => {
      const s = get();
      const fromPlacement = s.placements.find(p => p.id === fromPlacementId);
      if (!fromPlacement) return null;
      const connectorIdSet = new Set(connectorIds);
      const movedConnectors = fromPlacement.connectors.filter(c => connectorIdSet.has(c.id));
      if (movedConnectors.length === 0) return null;

      // Reserve a new unit letter on this device. Reuses the same 26-letter
      // pool that movePinsToSheet draws from — once you hit Z, no more.
      const letter = nextUnitLetter(fromPlacement.deviceId, s.placements);
      if (s.placements.some(p => p.deviceId === fromPlacement.deviceId && p.id.endsWith(letter))) return null;
      const newId = placementIdFor(fromPlacement.deviceId, letter);

      // Drop the moved connectors from the source placement.
      const remainingConnectors = fromPlacement.connectors.filter(c => !connectorIdSet.has(c.id));

      // Default the sibling to sit just to the right of the source. The user
      // can drag it from there; we only need a sensible non-overlapping start.
      const offsetX = (fromPlacement.width || 200) + 60;
      const newPosition: Point = position ?? {
        x: fromPlacement.position.x + offsetX,
        y: fromPlacement.position.y,
      };

      const nextPlacements: Placement[] = [
        ...s.placements.map(p => p.id === fromPlacementId ? { ...p, connectors: remainingConnectors } : p),
        {
          id: newId,
          deviceId: fromPlacement.deviceId,
          sheetId: fromPlacement.sheetId,
          position: newPosition,
          width: 160,
          height: 60,
          connectors: movedConnectors,
        },
      ];

      mutate(() => ({ placements: nextPlacements }));
      return newId;
    },

    moveConnectorToPlacement: (fromPlacementId, connectorId, toPlacementId) => {
      if (fromPlacementId === toPlacementId) return false;
      const s = get();
      const from = s.placements.find(p => p.id === fromPlacementId);
      const to = s.placements.find(p => p.id === toPlacementId);
      if (!from || !to) return false;
      // Cross-device moves don't make sense — pin ids belong to one Device's
      // catalog, and the wires anchored to those pins assume that.
      if (from.deviceId !== to.deviceId) return false;
      const conn = from.connectors.find(c => c.id === connectorId);
      if (!conn) return false;
      // Defensive: target shouldn't already have a view with the same id.
      // (Shouldn't happen — connector ids are unique per device — but guard
      // anyway so we never silently drop the move.)
      if (to.connectors.some(c => c.id === connectorId)) return false;

      mutate((cur) => ({
        placements: cur.placements.map(p => {
          if (p.id === fromPlacementId) {
            return { ...p, connectors: p.connectors.filter(c => c.id !== connectorId) };
          }
          if (p.id === toPlacementId) {
            return { ...p, connectors: [...p.connectors, conn] };
          }
          return p;
        }),
      }));
      return true;
    },

    mergePlacementInto: (fromPlacementId, toPlacementId) => {
      if (fromPlacementId === toPlacementId) return false;
      const s = get();
      const from = s.placements.find(p => p.id === fromPlacementId);
      const to = s.placements.find(p => p.id === toPlacementId);
      if (!from || !to) return false;
      if (from.deviceId !== to.deviceId) return false;
      // Defensive: a connector id should exist on at most one placement at
      // a time, but skip any duplicates rather than corrupt the target.
      const targetIds = new Set(to.connectors.map(c => c.id));
      const incoming = from.connectors.filter(c => !targetIds.has(c.id));

      mutate((cur) => ({
        placements: cur.placements
          .filter(p => p.id !== fromPlacementId)
          .map(p => p.id === toPlacementId
            ? { ...p, connectors: [...p.connectors, ...incoming] }
            : p),
        // Drop the source placement from any active selection.
      }));
      const next = get();
      if (next.selectedDeviceIds.has(fromPlacementId)) {
        const sel = new Set(next.selectedDeviceIds);
        sel.delete(fromPlacementId);
        set({ selectedDeviceIds: sel });
      }
      return true;
    },

    beginConnectorDrag: (fromPlacementId, connectorId) => set((s) => {
      const from = s.placements.find(p => p.id === fromPlacementId);
      if (!from) return s;
      return { connectorDrag: { fromPlacementId, connectorId, deviceId: from.deviceId } };
    }),
    endConnectorDrag: () => set({ connectorDrag: null }),

    renameDevice: (id, newName) => {
      const s = get();
      const target = s.devices.find(d => d.id === id);
      if (!target) return false;
      const trimmed = (newName || '').trim();
      if (!trimmed || trimmed === target.name) return false;
      // Globally-unique designator: refuse if another device already uses it.
      if (s.devices.some(d => d.id !== id && d.name === trimmed)) return false;
      const newId = slugifyDesignator(trimmed);
      if (s.devices.some(d => d.id !== id && d.id === newId)) return false;

      const { pinCatalog, pinIdMap } = remapDevicePins(target, newId);
      const remapPinKey = (key: PinKey): PinKey => {
        if (!key || isJunctionKey(key) || key.startsWith('#')) return key;
        const [devId, pinId] = key.split(':');
        if (devId !== id) return key;
        const newPin = pinIdMap.get(pinId);
        return newPin ? `${newId}:${newPin}` : `${newId}:${pinId}`;
      };
      // Remap each placement of this device: new placement id (same letter),
      // new connector ids, remapped pinIds in those connectors.
      const oldToNewPlacementId = new Map<string, string>();
      const oldToNewConnIdPerPlacement = new Map<string, Map<string, string>>();
      const nextPlacements = s.placements.map(p => {
        if (p.deviceId !== id) return p;
        const letter = p.id.slice(target.id.length) || 'A';
        const newPlId = placementIdFor(newId, letter);
        oldToNewPlacementId.set(p.id, newPlId);
        const newConnectors = remapPlacementConnectors(p.connectors, newId, pinIdMap);
        const connMap = new Map<string, string>();
        for (let i = 0; i < p.connectors.length; i++) {
          connMap.set(p.connectors[i].id, newConnectors[i].id);
        }
        oldToNewConnIdPerPlacement.set(p.id, connMap);
        return { ...p, id: newPlId, deviceId: newId, connectors: newConnectors };
      });

      mutate(() => ({
        devices: s.devices.map(d => d.id === id
          ? { ...d, id: newId, name: trimmed, pinCatalog }
          : d),
        placements: nextPlacements,
        wires: s.wires.map(w => ({
          ...w,
          fromPin: remapPinKey(w.fromPin),
          toPin:   remapPinKey(w.toPin),
        })),
        netLabels: s.netLabels.map(n => ({
          ...n,
          attachedTo: remapPinKey(n.attachedTo),
        })),
      }));
      set((cur) => {
        const rewriteSet = (src: Set<string>, map: Map<string, string>) => {
          let changed = false;
          const next = new Set<string>();
          for (const v of src) {
            const mapped = map.get(v);
            if (mapped) { next.add(mapped); changed = true; } else next.add(v);
          }
          return changed ? next : src;
        };
        const allConnMap = new Map<string, string>();
        for (const m of oldToNewConnIdPerPlacement.values()) {
          for (const [a, b] of m) allConnMap.set(a, b);
        }
        return {
          selectedDeviceIds:    rewriteSet(cur.selectedDeviceIds, oldToNewPlacementId),
          selectedConnectorIds: rewriteSet(cur.selectedConnectorIds, allConnMap),
        };
      });
      return true;
    },

    setDeviceAttribute: (id, key, value) => mutate((s) => ({
      devices: patchDevice(s, id, d => ({
        ...d,
        attributes: { ...(d.attributes ?? {}), [key]: value },
      })),
    })),

    setWireLabelPosition: (id, x, y) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id ? { ...w, labelX: x, labelY: y } : w),
    })),

    // ── Junctions ─────────────────────────────────────────────────────
    addJunction: (x, y) => {
      const id = `jct-${Math.random().toString(36).slice(2, 10)}`;
      mutate((s) => ({
        junctions: [...s.junctions, {
          id,
          sheetId: s.activeSheetId,
          position: { x, y },
        }],
      }));
      return makeJunctionKey(id);
    },

    // ── Net labels ────────────────────────────────────────────────────
    addNetLabel: (attachedTo, text) => mutate((s) => ({
      netLabels: [...s.netLabels, {
        id: `netlabel-${Math.random().toString(36).slice(2, 10)}`,
        text: text.trim() || 'NET',
        attachedTo,
        sheetId: s.activeSheetId,
      }],
    })),
    addNetLabelOnPin: (pinKey, text) => {
      // Unified label-on-pin model: store the pin key as `attachedTo` so the
      // label is rendered at the pin's live position (follows the device when
      // it's moved), and create a real Wire from pin → label so the user can
      // select / restyle / split / delete the connection like any other wire.
      const labelId = `netlabel-${Math.random().toString(36).slice(2, 10)}`;
      const wireId  = `wire-${Math.random().toString(36).slice(2, 10)}`;
      const trimmed = text.trim() || 'NET';
      mutate((s) => ({
        netLabels: [...s.netLabels, {
          id: labelId,
          text: trimmed,
          attachedTo: pinKey,
          sheetId: s.activeSheetId,
        }],
        wires: [...s.wires, {
          id: wireId,
          fromPin: pinKey,
          toPin: `#${labelId}`,
          color: 'currentColor',
          sheetId: s.activeSheetId,
          label: trimmed,
        }],
      }));
    },
    updateNetLabel: (id, patch) => mutate((s) => ({
      netLabels: s.netLabels.map(n => n.id === id ? { ...n, ...patch } : n),
    })),
    removeNetLabel: (id) => mutate((s) => {
      const nextNetLabels = s.netLabels.filter(n => n.id !== id);
      return {
        netLabels: nextNetLabels,
        // A junction the label was attached to may now be unreferenced.
        junctions: gcJunctions(s.junctions, s.wires, nextNetLabels),
      };
    }),
    toggleNetLabel: (id) => set((s) => ({ selectedNetLabelIds: toggleInSet(s.selectedNetLabelIds, id), selectedBundleId: null, selectedHarnessTree: null, selectedHarnessNodeIds: new Set<string>() })),

    // ── Shields ─────────────────────────────────────────────────────
    addShield: (wireIds, xStart, xEnd, termination) => {
      // Refuse zero-wire shields — they'd render with no vertical extent.
      if (wireIds.length === 0) return null;
      // Normalize: xEnd must be > xStart so the arc has positive width.
      const x0 = Math.min(xStart, xEnd);
      const x1 = Math.max(xStart, xEnd);
      if (x1 - x0 < 10) return null;
      const id = `shield-${Math.random().toString(36).slice(2, 10)}`;
      mutate((s) => ({
        shields: [...s.shields, {
          id,
          sheetId: s.activeSheetId,
          wireIds: [...wireIds],
          xStart: x0,
          xEnd: x1,
          termination,
        }],
      }));
      return id;
    },
    updateShield: (id, patch) => mutate((s) => ({
      shields: s.shields.map(sh => sh.id === id ? { ...sh, ...patch } : sh),
    })),
    removeShield: (id) => mutate((s) => ({
      shields: s.shields.filter(sh => sh.id !== id),
    })),
    toggleShield: (id) => set((s) => ({ selectedShieldIds: toggleInSet(s.selectedShieldIds, id), selectedBundleId: null, selectedHarnessTree: null, selectedHarnessNodeIds: new Set<string>() })),
    addWireToShield: (shieldId, wireId) => mutate((s) => ({
      shields: s.shields.map(sh => sh.id === shieldId
        ? (sh.wireIds.includes(wireId)
            ? sh
            : { ...sh, wireIds: [...sh.wireIds, wireId] })
        : sh),
    })),
    beginShieldPicking: (shieldId) => set({ shieldPickingId: shieldId }),
    endShieldPicking: () => set({ shieldPickingId: null }),
    setHoveredWireId: (wireId) => set({ hoveredWireId: wireId }),

    // ── Harness selection (Phase 2 — derived HarnessGraph) ──────────────
    // Both harness selections are exclusive — selecting a bundle or a node
    // clears every other selection so the Inspector shows only that item.
    // Conversely the schematic selection actions below clear them, so a
    // harness selection never gets stranded as a stale top-priority pick.
    selectBundle: (id) => set(id === null
      ? { selectedBundleId: null, selectedHarnessTree: null }
      : {
          selectedBundleId: id,
          selectedHarnessTree: null,
          selectedHarnessNodeIds: new Set<string>(),
          selectedDeviceIds: new Set<string>(),
          selectedWireIds: new Set<string>(),
          selectedConnectorIds: new Set<string>(),
          selectedNetLabelIds: new Set<string>(),
          selectedShieldIds: new Set<string>(),
          selectedAnnotationIds: new Set<string>(),
        }),

    selectWholeHarness: (bundleId) => set({
      selectedHarnessTree: bundleId,
      selectedBundleId: null,
      selectedHarnessNodeIds: new Set<string>(),
      selectedDeviceIds: new Set<string>(),
      selectedWireIds: new Set<string>(),
      selectedConnectorIds: new Set<string>(),
      selectedNetLabelIds: new Set<string>(),
      selectedShieldIds: new Set<string>(),
      selectedAnnotationIds: new Set<string>(),
    }),

    // Phase 4 — harness-node selection is a Set for multi-select. A plain
    // click (`additive` false) replaces the set with exactly `{id}`; a
    // shift-click toggles `id` in/out of the existing set. `null` clears it.
    // Either way every other selection is cleared so the Inspector shows
    // only the harness picks.
    selectHarnessNode: (id, additive = false) => set((s) => {
      if (id === null) return { selectedHarnessNodeIds: new Set<string>(), selectedHarnessTree: null };
      const next = additive
        ? toggleInSet(s.selectedHarnessNodeIds, id)
        : new Set<string>([id]);
      return {
        selectedHarnessNodeIds: next,
        selectedBundleId: null,
        selectedHarnessTree: null,
        selectedDeviceIds: new Set<string>(),
        selectedWireIds: new Set<string>(),
        selectedConnectorIds: new Set<string>(),
        selectedNetLabelIds: new Set<string>(),
        selectedShieldIds: new Set<string>(),
        selectedAnnotationIds: new Set<string>(),
      };
    }),

    // Transient alignment-guide coordinates surfaced by the harness node
    // drag — pure UI state, never persisted, not in the undo history.
    setHarnessAlignGuides: (x, y) => set((s) => (
      s.harnessAlignGuides.x === x && s.harnessAlignGuides.y === y
        ? s
        : { harnessAlignGuides: { x, y } }
    )),

    // ── Annotations ────────────────────────────────────────────────────
    addTextAnnotation: (position, text) => {
      const id = `annot-${Math.random().toString(36).slice(2, 10)}`;
      mutate((s) => ({
        annotations: [...s.annotations, {
          id,
          kind: 'text',
          sheetId: s.activeSheetId,
          position,
          text: text || 'Text',
        }],
      }));
      return id;
    },
    addNoteAnnotation: (position, text) => {
      const id = `annot-${Math.random().toString(36).slice(2, 10)}`;
      // Auto-assign the next free integer across notes on the active sheet
      // so the user gets 1, 2, 3, … without manual numbering.
      const state = get();
      const sheetNotes = state.annotations.filter(
        a => a.kind === 'note' && a.sheetId === state.activeSheetId,
      ) as Extract<Annotation, { kind: 'note' }>[];
      const used = new Set(sheetNotes.map(n => n.number));
      let next = 1;
      while (used.has(next)) next++;
      mutate((s) => ({
        annotations: [...s.annotations, {
          id,
          kind: 'note',
          sheetId: s.activeSheetId,
          position,
          number: next,
          text: text || '',
        }],
      }));
      return id;
    },
    updateAnnotation: (id, patch) => mutate((s) => ({
      annotations: s.annotations.map(a => a.id === id ? { ...a, ...patch } as Annotation : a),
    })),
    removeAnnotation: (id) => mutate((s) => ({
      annotations: s.annotations.filter(a => a.id !== id),
    })),
    toggleAnnotation: (id) => set((s) => ({ selectedAnnotationIds: toggleInSet(s.selectedAnnotationIds, id), selectedBundleId: null, selectedHarnessTree: null, selectedHarnessNodeIds: new Set<string>() })),

    removeSelected: () => {
      const { selectedDeviceIds, selectedWireIds, selectedNetLabelIds, selectedShieldIds, selectedAnnotationIds } = get();
      if (selectedDeviceIds.size === 0 && selectedWireIds.size === 0
       && selectedNetLabelIds.size === 0 && selectedShieldIds.size === 0
       && selectedAnnotationIds.size === 0) return;
      // selectedDeviceIds actually holds PLACEMENT ids (what the user clicks).
      mutate((s) => {
        // Remove selected placements.
        const nextPlacements = s.placements.filter(p => !selectedDeviceIds.has(p.id));
        // If a device has no more placements, remove it too.
        const survivingDeviceIds = new Set(nextPlacements.map(p => p.deviceId));
        const nextDevices = s.devices.filter(d => survivingDeviceIds.has(d.id));
        const orphanedDeviceIds = new Set(
          s.devices.filter(d => !survivingDeviceIds.has(d.id)).map(d => d.id)
        );
        // Wires: drop those the user selected, AND those whose endpoints now
        // reference a device that no longer has any placement (orphaned).
        const nextWires = s.wires.filter(w => {
          if (selectedWireIds.has(w.id)) return false;
          for (const end of [w.fromPin, w.toPin]) {
            if (isJunctionKey(end) || end.startsWith('#')) continue;
            const devId = end.split(':')[0];
            if (orphanedDeviceIds.has(devId)) return false;
          }
          return true;
        });
        const nextNetLabels = s.netLabels.filter(n => {
          if (selectedNetLabelIds.has(n.id)) return false;
          if (!isJunctionKey(n.attachedTo) && !n.attachedTo.startsWith('#')) {
            const devId = n.attachedTo.split(':')[0];
            if (orphanedDeviceIds.has(devId)) return false;
          }
          return true;
        });
        // After dropping placements + their devices, additionally prune any
        // wire whose pin-endpoint is no longer visible on a connector view.
        // This catches the case where the user removes ONE placement of a
        // multi-placement device — the device survives, but the pins that
        // lived only on that placement are now hidden.
        const cleaned = pruneOrphanedConnections(nextPlacements, nextWires, nextNetLabels);
        // Shields: drop user-selected ones, drop any wireIds that no longer
        // exist, drop the whole shield if it ends up wrapping zero wires.
        const survivingWireIds = new Set(cleaned.wires.map(w => w.id));
        const nextShields = s.shields
          .filter(sh => !selectedShieldIds.has(sh.id))
          .map(sh => ({ ...sh, wireIds: sh.wireIds.filter(id => survivingWireIds.has(id)) }))
          .filter(sh => sh.wireIds.length > 0);
        const nextAnnotations = s.annotations.filter(a => !selectedAnnotationIds.has(a.id));
        // Drop any Junction no longer referenced by a surviving wire/label.
        const nextJunctions = gcJunctions(s.junctions, cleaned.wires, cleaned.netLabels);
        return {
          devices: nextDevices,
          placements: nextPlacements,
          wires: cleaned.wires,
          netLabels: cleaned.netLabels,
          junctions: nextJunctions,
          shields: nextShields,
          annotations: nextAnnotations,
        };
      });
      set({
        selectedDeviceIds: new Set(),
        selectedWireIds: new Set(),
        selectedConnectorIds: new Set(),
        selectedNetLabelIds: new Set(),
        selectedShieldIds: new Set(),
        selectedAnnotationIds: new Set(),
      });
    },

    // ── Connectors (live on Placements now) ──────────────────────────
    // All connector mutations are keyed by (placementId, connectorId). The
    // patchPlacement helper maps over s.placements. We look up the parent
    // device via placement.deviceId when the mutation needs the pinCatalog.
    addConnector: (placementId, side, logicalConnectorName) => mutate((s) => ({
      placements: s.placements.map(p => {
        if (p.id !== placementId) return p;
        const dev = s.devices.find(d => d.id === p.deviceId);
        const fallback = dev?.pinCatalog[0]?.logicalConnectorName ?? 'J1';
        const lc = logicalConnectorName ?? fallback;
        const newId = connectorIdFor(p.deviceId, lc, side,
          p.connectors.some(c => c.logicalConnectorName === lc));
        return {
          ...p,
          connectors: [...p.connectors, {
            id: newId,
            name: lc,
            logicalConnectorName: lc,
            side,
            pinIds: [],
          }],
        };
      }),
    })),

    removeConnector: (placementId, connectorId) => mutate((s) => {
      const placements = s.placements.map(p => p.id === placementId
        ? { ...p, connectors: p.connectors.filter(c => c.id !== connectorId) }
        : p);
      const cleaned = pruneOrphanedConnections(placements, s.wires, s.netLabels);
      return { placements, ...cleaned, junctions: gcJunctions(s.junctions, cleaned.wires, cleaned.netLabels) };
    }),

    updateConnector: (placementId, connectorId, patch) => mutate((s) => {
      // Locate the edited connector so we know its physical-connector key,
      // which we need to propagate cross-section fields across split sides.
      const sourceP = s.placements.find(pp => pp.id === placementId);
      const sourceC = sourceP?.connectors.find(cc => cc.id === connectorId);
      const sourceLogicalName = sourceC?.logicalConnectorName;

      // Both `gender` and `connectorType` are properties of the *physical*
      // connector, so changing either must propagate to every ConnectorInstance
      // that views the same logical connector (split-side views on the same
      // placement AND sibling placements like U1A/U1B that share a deviceId).
      const physicalFields = ['gender', 'connectorType'] as const;
      const physicalPatch: Pick<Partial<ConnectorInstance>, typeof physicalFields[number]> = {};
      for (const k of physicalFields) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) {
          (physicalPatch as Record<string, unknown>)[k] = (patch as Record<string, unknown>)[k];
        }
      }
      const hasPhysicalPatch = Object.keys(physicalPatch).length > 0;

      return {
        placements: s.placements.map(p => {
          // Other placements: only touch them when a physical-connector field
          // changed, and only if they belong to the same device.
          if (p.id !== placementId) {
            if (!hasPhysicalPatch || !sourceLogicalName) return p;
            if (sourceP && p.deviceId !== sourceP.deviceId) return p;
            return {
              ...p,
              connectors: p.connectors.map(c => (
                c.logicalConnectorName === sourceLogicalName
                  ? { ...c, ...physicalPatch }
                  : c
              )),
            };
          }
          const dev = s.devices.find(d => d.id === p.deviceId);
          return {
            ...p,
            connectors: p.connectors.map(c => {
              // Same-placement sibling views of the same physical connector
              // get the physical-field sync. Other fields stay local to `c`.
              if (c.id !== connectorId) {
                if (hasPhysicalPatch && c.logicalConnectorName === sourceLogicalName) {
                  return { ...c, ...physicalPatch };
                }
                return c;
              }
              const next: ConnectorInstance = { ...c, ...patch };
              if (patch.logicalConnectorName && patch.logicalConnectorName !== c.logicalConnectorName) {
                next.pinIds = next.pinIds.filter(pid => {
                  const pin = dev?.pinCatalog.find(pp => pp.id === pid);
                  return pin?.logicalConnectorName === next.logicalConnectorName;
                });
                const base = c.name.replace(/\s*\([LRTB]\)\s*$/i, '').trim();
                if (patch.name === undefined && base === c.logicalConnectorName) {
                  next.name = next.logicalConnectorName;
                }
              }
              return next;
            }),
          };
        }),
      };
    }),

    togglePinInConnector: (placementId, connectorId, pinId) => mutate((s) => {
      const placements = s.placements.map(p => {
        if (p.id !== placementId) return p;
        const dev = s.devices.find(d => d.id === p.deviceId);
        // Guard: refuse to add a pin that's already visible on another
        // placement of the same device (the "each pin on one sheet" invariant).
        const pin = dev?.pinCatalog.find(pp => pp.id === pinId);
        if (!pin) return p;
        const alreadyHere = p.connectors.some(c => c.id === connectorId && c.pinIds.includes(pinId));
        if (!alreadyHere) {
          const visibleElsewhere = s.placements.some(other =>
            other.id !== placementId
            && other.deviceId === p.deviceId
            && other.connectors.some(c => c.pinIds.includes(pinId))
          );
          if (visibleElsewhere) return p;
        }
        return {
          ...p,
          connectors: p.connectors.map(c => {
            if (c.id !== connectorId) return c;
            if (pin.logicalConnectorName !== c.logicalConnectorName) return c;
            if (c.pinIds.includes(pinId)) {
              return { ...c, pinIds: c.pinIds.filter(id => id !== pinId) };
            }
            return { ...c, pinIds: [...c.pinIds, pinId] };
          }),
        };
      });
      // Prune wires/net-labels referencing any pin that just got hidden.
      // Re-checking is a small cost vs. silently-orphaned wires.
      const cleaned = pruneOrphanedConnections(placements, s.wires, s.netLabels);
      return { placements, ...cleaned, junctions: gcJunctions(s.junctions, cleaned.wires, cleaned.netLabels) };
    }),

    setConnectorPins: (placementId, connectorId, pinIds) => mutate((s) => {
      const placements = s.placements.map(p => p.id === placementId
        ? { ...p, connectors: p.connectors.map(c => c.id === connectorId ? { ...c, pinIds: [...pinIds] } : c) }
        : p);
      const cleaned = pruneOrphanedConnections(placements, s.wires, s.netLabels);
      return { placements, ...cleaned, junctions: gcJunctions(s.junctions, cleaned.wires, cleaned.netLabels) };
    }),

    hidePin: (placementId, pinId) => mutate((s) => {
      const target = s.placements.find(p => p.id === placementId);
      if (!target) return {};
      // Hiding a pin removes it from this placement's connectors. Any wires
      // or net labels pointing at "deviceId:pinId" are also dropped — without
      // that cleanup, re-adding the pin later would silently re-attach the
      // stale connection, which is surprising.
      const pinKey = `${target.deviceId}:${pinId}`;
      const nextWires = s.wires.filter(w => w.fromPin !== pinKey && w.toPin !== pinKey);
      const nextNetLabels = s.netLabels.filter(n => n.attachedTo !== pinKey);
      return {
        placements: s.placements.map(p => p.id === placementId
          ? {
              ...p,
              connectors: p.connectors.map(c => ({
                ...c,
                pinIds: c.pinIds.filter(id => id !== pinId),
              })),
            }
          : p),
        wires: nextWires,
        netLabels: nextNetLabels,
        junctions: gcJunctions(s.junctions, nextWires, nextNetLabels),
      };
    }),

    // ── Wiring ────────────────────────────────────────────────────────
    startWiring: (pinKey) => set({
      wiringFromPin: pinKey,
      selectedDeviceIds: new Set(),
      selectedWireIds: new Set(),
      selectedConnectorIds: new Set(),
    }),

    cancelWiring: () => set({ wiringFromPin: null }),

    startWiringFromWire: (wireId, x, y) => {
      // splitWireAtPoint cuts the host wire in two, creating a Junction
      // entity, and returns its `junction:<id>` key; startWiring then
      // begins a new wire from it. No-op if the split fails (wire deleted
      // between click and dispatch).
      const junctionKey = get().splitWireAtPoint(wireId, x, y);
      if (junctionKey) get().startWiring(junctionKey);
    },

    finishWiring: (toPinKey) => {
      const { wiringFromPin, wires, activeSheetId, devices, netLabels } = get();
      if (!wiringFromPin || wiringFromPin === toPinKey) {
        set({ wiringFromPin: null });
        return;
      }
      const dup = wires.some(w =>
        (w.fromPin === wiringFromPin && w.toPin === toPinKey) ||
        (w.fromPin === toPinKey && w.toPin === wiringFromPin)
      );
      if (dup) {
        set({ wiringFromPin: null });
        return;
      }
      const label = defaultNetLabel(wiringFromPin, toPinKey, devices, netLabels);
      mutate((s) => ({
        wires: [...s.wires, {
          id: `wire-${Math.random().toString(36).slice(2, 10)}`,
          fromPin: wiringFromPin,
          toPin: toPinKey,
          color: 'currentColor',
          sheetId: activeSheetId,
          ...(label ? { label } : {}),
        }],
      }));
      set({ wiringFromPin: null });
    },

    finishWiringAtPoint: (x, y, onWireId) => {
      const { wiringFromPin, activeSheetId, devices, netLabels } = get();
      if (!wiringFromPin) return;
      // Finishing a wire on the canvas always lands ON an existing wire —
      // split that wire at the click, creating a Junction entity. The two
      // halves and the new branch all reference the same `junction:<id>`.
      // A click on empty space isn't a junction (a free point with no host
      // wire) and the Wire-tool click handler never dispatches that case,
      // so a missing `onWireId` / failed split aborts without a new wire.
      if (!onWireId) { set({ wiringFromPin: null }); return; }
      const junctionKey = get().splitWireAtPoint(onWireId, x, y);
      if (!junctionKey) { set({ wiringFromPin: null }); return; }
      const label = defaultNetLabel(wiringFromPin, junctionKey, devices, netLabels);
      mutate((s) => ({
        wires: [...s.wires, {
          id: `wire-${Math.random().toString(36).slice(2, 10)}`,
          fromPin: wiringFromPin,
          toPin: junctionKey,
          color: 'currentColor',
          sheetId: activeSheetId,
          ...(label ? { label } : {}),
        }],
      }));
      set({ wiringFromPin: null });
    },

    splitWireAtPoint: (wireId, x, y) => {
      const s = get();
      const wire = s.wires.find(w => w.id === wireId);
      if (!wire) return null;
      // Refuse to split when the click already lies AT one of the wire's
      // junction endpoints — there's no "before" half to create, and the
      // click is meant to converge on that existing junction. Returning its
      // key lets a branch wire reference the same Junction entity.
      for (const end of [wire.fromPin, wire.toPin]) {
        const jid = junctionIdFromKey(end);
        if (!jid) continue;
        const j = s.junctions.find(jj => jj.id === jid);
        if (j && Math.abs(j.position.x - x) < 0.5 && Math.abs(j.position.y - y) < 0.5) {
          return end;
        }
      }

      // Create the first-class Junction entity at the split point. Both wire
      // halves — and any branch wire created here — reference it by id.
      const junctionId = `jct-${Math.random().toString(36).slice(2, 10)}`;
      const junctionKey = makeJunctionKey(junctionId);
      const newJunction: Junction = {
        id: junctionId,
        sheetId: wire.sheetId,
        position: { x, y },
      };

      const firstId  = `wire-${Math.random().toString(36).slice(2, 10)}`;
      const secondId = `wire-${Math.random().toString(36).slice(2, 10)}`;

      // Each half inherits identity (color, style, label, awg, sheet) but
      // resets routing — the router will pick fresh orthogonal paths from
      // each half's pin to the shared junction. Preserving the old midX/
      // fromY/toY parameters wouldn't make geometric sense across the cut.
      const inherit = {
        color: wire.color,
        label: wire.label,
        showLabel: wire.showLabel,
        awg: wire.awg,
        sheetId: wire.sheetId,
      };
      const firstWire: Wire = { id: firstId,  fromPin: wire.fromPin, toPin: junctionKey, ...inherit };
      const secondWire: Wire = { id: secondId, fromPin: junctionKey,  toPin: wire.toPin, ...inherit };

      mutate((cur) => ({
        wires: cur.wires
          .filter(w => w.id !== wireId)
          .concat([firstWire, secondWire]),
        junctions: [...cur.junctions, newJunction],
      }));
      return junctionKey;
    },

    updateWire: (id, patch) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id ? { ...w, ...patch } : w),
    })),

    updateNet: (wireId, patch) => mutate((s) => {
      const netIds = new Set(wiresInNet(wireId, s.wires, s.netLabels));
      return { wires: s.wires.map(w => netIds.has(w.id) ? { ...w, ...patch } : w) };
    }),

    // Wire-routing setters: junctions are fixed entities, so reshaping a
    // wire just re-routes it to the (unchanged) junction position.
    setWireMidX: (id, midX) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id ? { ...w, midX } : w),
    })),

    setWireFromY: (id, fromY) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id ? { ...w, fromY } : w),
    })),

    setWireToY: (id, toY) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id ? { ...w, toY } : w),
    })),

    setWireDetourY: (id, y) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id ? { ...w, fromY: y, toY: y } : w),
    })),

    setWireFromJogX: (id, x) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id ? { ...w, fromJogX: x } : w),
    })),

    setWireToJogX: (id, x) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id ? { ...w, toJogX: x } : w),
    })),

    resetWireRouting: (id) => mutate((s) => ({
      wires: s.wires.map(w => w.id === id
        ? { ...w, midX: undefined, fromY: undefined, toY: undefined, fromJogX: undefined, toJogX: undefined }
        : w),
    })),

    // ── Sheets ────────────────────────────────────────────────────────
    addSheet: () => mutate((s) => {
      const nextOrder = Math.max(0, ...s.sheets.map(x => x.order)) + 1;
      const sheet: Sheet = {
        id: `sheet-${Math.random().toString(36).slice(2, 10)}`,
        name: `Sheet ${nextOrder + 1}`,
        order: nextOrder,
      };
      return { sheets: [...s.sheets, sheet], activeSheetId: sheet.id };
    }),

    renameSheet: (id, name) => mutate((s) => ({
      sheets: s.sheets.map(sh => sh.id === id ? { ...sh, name } : sh),
    })),

    removeSheet: (id) => {
      const { sheets } = get();
      if (sheets.length <= 1) return;
      mutate((s) => {
        const remaining = s.sheets.filter(sh => sh.id !== id);
        // Placements on this sheet go away. If a device has no more placements
        // left anywhere, garbage-collect the device too.
        const keptPlacements = s.placements.filter(p => p.sheetId !== id);
        const survivingDeviceIds = new Set(keptPlacements.map(p => p.deviceId));
        const keptDevices = s.devices.filter(d => survivingDeviceIds.has(d.id));
        const orphanedDeviceIds = new Set(
          s.devices.filter(d => !survivingDeviceIds.has(d.id)).map(d => d.id)
        );
        const nextWires = s.wires.filter(w => {
          if (w.sheetId === id) return false;
          for (const end of [w.fromPin, w.toPin]) {
            if (isJunctionKey(end) || end.startsWith('#')) continue;
            if (orphanedDeviceIds.has(end.split(':')[0])) return false;
          }
          return true;
        });
        const nextNetLabels = s.netLabels.filter(n => {
          if (n.sheetId === id) return false;
          if (isJunctionKey(n.attachedTo) || n.attachedTo.startsWith('#')) return true;
          const devId = n.attachedTo.split(':')[0];
          return !orphanedDeviceIds.has(devId);
        });
        return {
          sheets: remaining,
          devices: keptDevices,
          placements: keptPlacements,
          wires: nextWires,
          netLabels: nextNetLabels,
          // Junctions on the removed sheet go away with it; GC then drops any
          // others left unreferenced by the surviving wires/labels.
          junctions: gcJunctions(
            s.junctions.filter(j => j.sheetId !== id),
            nextWires, nextNetLabels,
          ),
          activeSheetId: s.activeSheetId === id ? remaining[0].id : s.activeSheetId,
        };
      });
    },

    setActiveSheet: (id) => set({
      activeSheetId: id,
      selectedDeviceIds: new Set(),
      selectedWireIds: new Set(),
      selectedConnectorIds: new Set(),
      selectedNetLabelIds: new Set(),
      wiringFromPin: null,
    }),

    /** Ensure the active sheet has a HarnessView slice, creating a default if missing. */
    ensureHarnessView: (sheetId: string) => mutate((s) => {
      const sheet = s.sheets.find(sh => sh.id === sheetId);
      if (!sheet || sheet.harness) return {};
      return {
        sheets: s.sheets.map(sh => sh.id === sheetId
          ? { ...sh, harness: { viewMode: 'schematic', overrides: emptyHarnessOverrides() } as HarnessView }
          : sh),
      };
    }),

    setSheetViewMode: (sheetId: string, viewMode: 'schematic' | 'harness') => mutate((s) => {
      const sheet = s.sheets.find(sh => sh.id === sheetId);
      if (!sheet) return {};
      const current: HarnessView = sheet.harness ?? { viewMode: 'schematic', overrides: emptyHarnessOverrides() };
      return {
        sheets: s.sheets.map(sh => sh.id === sheetId
          ? { ...sh, harness: { ...current, viewMode } }
          : sh),
      };
    }),

    // ── Harness overrides (Phase 3) ─────────────────────────────────
    // The override layer is per-sheet, topology-free (positions + lengths
    // only), and keyed by stable ids. Each action patches the sheet's
    // `HarnessView.overrides` through `mutate` so it is undoable and
    // serialized. `deriveHarness` re-applies overrides by id on every
    // re-derivation — an orphaned entry (key no longer in the graph) is
    // simply never read.
    setHarnessNodePositions: (sheetId, positions) => mutate((s) =>
      patchHarnessOverrides(s, sheetId, (o) => ({
        nodePositions: { ...o.nodePositions, ...positions },
      }))),

    setConnectorOrder: (sheetId, placementId, order) => mutate((s) =>
      patchHarnessOverrides(s, sheetId, (o) => ({
        connectorOrder: { ...(o.connectorOrder ?? {}), [placementId]: order },
      }))),

    setBundleLength: (sheetId: string, bundleId: string, mm: number | undefined) => mutate((s) =>
      patchHarnessOverrides(s, sheetId, (o) => {
        const bundleLengths = { ...o.bundleLengths };
        // `undefined` (or a non-finite value) clears the override rather than
        // persisting a junk length — keeps the override map tidy.
        if (mm === undefined || !Number.isFinite(mm)) delete bundleLengths[bundleId];
        else bundleLengths[bundleId] = mm;
        return { bundleLengths };
      })),

    // ── Harness overrides (Phase 4 — cable bend points + names) ──────
    // Same discipline as the Phase-3 overrides: per-sheet, topology-free,
    // keyed by stable bundle id, undoable via `mutate`. `deriveHarness`
    // re-applies them by id; an entry for a bundle no longer in the graph
    // is harmlessly ignored.
    setBundleWaypoints: (sheetId: string, bundleId: string, waypoints: Point[]) => mutate((s) =>
      patchHarnessOverrides(s, sheetId, (o) => {
        const bundleWaypoints = { ...o.bundleWaypoints };
        // An empty list clears the override rather than persisting `[]` —
        // keeps the override map tidy and treats "no bends" as "no entry".
        if (waypoints.length === 0) delete bundleWaypoints[bundleId];
        else bundleWaypoints[bundleId] = waypoints.map(p => ({ x: p.x, y: p.y }));
        return { bundleWaypoints };
      })),

    addBundleWaypoint: (sheetId: string, bundleId: string, point: Point, start: Point, end: Point) => mutate((s) =>
      patchHarnessOverrides(s, sheetId, (o) => {
        const existing = o.bundleWaypoints[bundleId] ?? [];
        // Insert at the slot of the polyline segment the click is nearest to,
        // so the new bend lands in a sensible place along the cable run.
        const nextList = insertWaypointAtNearestSegment(existing, point, start, end);
        return { bundleWaypoints: { ...o.bundleWaypoints, [bundleId]: nextList } };
      })),

    removeBundleWaypoint: (sheetId: string, bundleId: string, index: number) => mutate((s) => {
      const sheet = s.sheets.find(sh => sh.id === sheetId);
      const existing = sheet?.harness?.overrides?.bundleWaypoints[bundleId];
      if (!existing || index < 0 || index >= existing.length) return {};
      return patchHarnessOverrides(s, sheetId, (o) => {
        const remaining = existing.filter((_, i) => i !== index);
        const bundleWaypoints = { ...o.bundleWaypoints };
        // No bends left → drop the entry entirely.
        if (remaining.length === 0) delete bundleWaypoints[bundleId];
        else bundleWaypoints[bundleId] = remaining;
        return { bundleWaypoints };
      });
    }),

    setBundleName: (sheetId: string, bundleId: string, name: string | undefined) => mutate((s) =>
      patchHarnessOverrides(s, sheetId, (o) => {
        const bundleNames = { ...o.bundleNames };
        const trimmed = (name ?? '').trim();
        // Blank clears the name override; a non-empty string sets it.
        if (!trimmed) delete bundleNames[bundleId];
        else bundleNames[bundleId] = trimmed;
        return { bundleNames };
      })),

    rotateHarnessNode: (sheetId, dir) => mutate((s) => {
      // Set orientation on the selected devices. In the harness view a device
      // block selects into `selectedDeviceIds` (the shared device-selection
      // set), not `selectedHarnessNodeIds` (which only splice / branch-point
      // markers use). Splices / branch points have no orientation, so the
      // device set is exactly the target.
      const componentIds = Array.from(s.selectedDeviceIds).filter(id =>
        s.placements.some(p => p.id === id));
      if (componentIds.length === 0) return {};
      return patchHarnessOverrides(s, sheetId, (o) => {
        const nodeOrientations: Record<string, Orientation> = { ...o.nodeOrientations };
        for (const id of componentIds) {
          if (dir === 'left') delete nodeOrientations[id];   // 0° — the identity, drop the entry
          else nodeOrientations[id] = 180;
        }
        return { nodeOrientations };
      });
    }),

    setHarnessScale: (sheetId, mmPerUnit) => mutate((s) => {
      if (!Number.isFinite(mmPerUnit) || mmPerUnit <= 0) return {};
      const sheet = s.sheets.find(sh => sh.id === sheetId);
      if (!sheet || !sheet.harness) return {};
      return {
        sheets: s.sheets.map(sh => sh.id === sheetId
          ? { ...sh, harness: { ...sh.harness!, mmPerUnit } }
          : sh),
      };
    }),

    // ── Selection ─────────────────────────────────────────────────────
    selectOnly: (deviceIds = [], wireIds = [], connectorIds = [], netLabelIds = [], shieldIds = [], annotationIds = []) => set({
      selectedDeviceIds: new Set(deviceIds),
      selectedWireIds: new Set(wireIds),
      selectedConnectorIds: new Set(connectorIds),
      selectedNetLabelIds: new Set(netLabelIds),
      selectedShieldIds: new Set(shieldIds),
      selectedAnnotationIds: new Set(annotationIds),
      selectedBundleId: null,
      selectedHarnessTree: null,
      selectedHarnessNodeIds: new Set<string>(),
      wiringFromPin: null,
    }),

    selectWholeNet: (wireId) => set((s) => ({
      selectedWireIds: new Set(wiresInNet(wireId, s.wires, s.netLabels)),
      selectedDeviceIds: new Set<string>(),
      selectedConnectorIds: new Set<string>(),
      selectedNetLabelIds: new Set<string>(),
      selectedShieldIds: new Set<string>(),
      selectedAnnotationIds: new Set<string>(),
      selectedBundleId: null,
      selectedHarnessTree: null,
      selectedHarnessNodeIds: new Set<string>(),
      wiringFromPin: null,
    })),

    // All toggles share the same shape (clone Set, add/remove id) so a
    // single helper drives them — keeps behaviour identical and removes the
    // copy-paste fan-out the audit flagged.
    toggleDevice:          (id) => set((s) => ({ selectedDeviceIds:    toggleInSet(s.selectedDeviceIds,    id), selectedBundleId: null, selectedHarnessTree: null, selectedHarnessNodeIds: new Set<string>() })),
    toggleWire:            (id) => set((s) => ({ selectedWireIds:      toggleInSet(s.selectedWireIds,      id), selectedBundleId: null, selectedHarnessTree: null, selectedHarnessNodeIds: new Set<string>() })),
    toggleConnector:       (id) => set((s) => ({ selectedConnectorIds: toggleInSet(s.selectedConnectorIds, id), selectedBundleId: null, selectedHarnessTree: null, selectedHarnessNodeIds: new Set<string>() })),

    clearSelection: () => set({
      selectedDeviceIds: new Set(),
      selectedWireIds: new Set(),
      selectedConnectorIds: new Set(),
      selectedNetLabelIds: new Set(),
      selectedShieldIds: new Set(),
      selectedAnnotationIds: new Set(),
      selectedBundleId: null,
      selectedHarnessTree: null,
      selectedHarnessNodeIds: new Set<string>(),
      wiringFromPin: null,
    }),

    // ── Clipboard ─────────────────────────────────────────────────────
    // selectedDeviceIds holds PLACEMENT ids. We copy each selected placement
    // along with its parent Device (deep-cloned). On paste every entry turns
    // into a brand-new Device (fresh designator) with one Placement on the
    // active sheet — so pasting a U1A yields a new U2A (displayed as U2).
    copySelection: () => {
      const { devices, placements, wires, netLabels, annotations, junctions,
              selectedDeviceIds, selectedWireIds, selectedNetLabelIds, selectedAnnotationIds } = get();
      const selPlacements = placements.filter(p => selectedDeviceIds.has(p.id));
      const entries: { device: Device; placement: Placement }[] = [];
      for (const p of selPlacements) {
        const dev = devices.find(d => d.id === p.deviceId);
        if (dev) entries.push({
          device: JSON.parse(JSON.stringify(dev)),
          placement: JSON.parse(JSON.stringify(p)),
        });
      }
      // Only copy wires whose BOTH endpoints are on copied placements' pins
      // (plus any wires the user explicitly selected). Point endpoints on
      // arbitrary wires aren't remapped on paste, so we keep them if the wire
      // itself was explicitly selected.
      const visiblePins = new Set<string>();
      for (const e of entries) {
        for (const c of e.placement.connectors) {
          for (const pid of c.pinIds) visiblePins.add(`${e.placement.deviceId}:${pid}`);
        }
      }
      const ws = wires.filter(w => {
        if (selectedWireIds.has(w.id)) return true;
        return visiblePins.has(w.fromPin) && visiblePins.has(w.toPin);
      });
      // Net labels: explicitly-selected ones are always copied. Their
      // attachedTo gets remapped on paste (see remapEnd below).
      const nls = netLabels.filter(n => selectedNetLabelIds.has(n.id));
      // Annotations: any selected ones are part of the copy set.
      const anns = annotations.filter(a => selectedAnnotationIds.has(a.id));
      // Junctions: capture every Junction referenced by a copied wire or
      // net-label endpoint so the paste is self-contained.
      const referencedJunctionIds = new Set<string>();
      for (const w of ws) {
        const f = junctionIdFromKey(w.fromPin);
        const t = junctionIdFromKey(w.toPin);
        if (f) referencedJunctionIds.add(f);
        if (t) referencedJunctionIds.add(t);
      }
      for (const n of nls) {
        const a = junctionIdFromKey(n.attachedTo);
        if (a) referencedJunctionIds.add(a);
      }
      const jns = junctions.filter(j => referencedJunctionIds.has(j.id));
      set({
        clipboardEntries: entries,
        clipboardWires: JSON.parse(JSON.stringify(ws)),
        clipboardLabels: JSON.parse(JSON.stringify(nls)),
        clipboardJunctions: JSON.parse(JSON.stringify(jns)),
        clipboardAnnotations: JSON.parse(JSON.stringify(anns)),
      });
    },

    pasteClipboard: (cursorWorld) => {
      const { clipboardEntries, clipboardWires, clipboardLabels, clipboardJunctions,
              clipboardAnnotations,
              activeSheetId, devices: allDevices, placements: allPlacements } = get();
      const hasAnything = (clipboardEntries && clipboardEntries.length > 0)
        || (clipboardLabels && clipboardLabels.length > 0)
        || (clipboardAnnotations && clipboardAnnotations.length > 0);
      if (!hasAnything) return;

      // Compute the offset that translates the clipboard's centroid to the
      // cursor. Without a cursor, fall back to the legacy fixed +40,+40 nudge
      // so paste-via-keyboard-without-cursor still produces a visible result.
      const SNAP = 10;
      let offX = 40, offY = 40;
      if (cursorWorld) {
        let minX =  Infinity, minY =  Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const e of clipboardEntries ?? []) {
          minX = Math.min(minX, e.placement.position.x);
          minY = Math.min(minY, e.placement.position.y);
          maxX = Math.max(maxX, e.placement.position.x + e.placement.width);
          maxY = Math.max(maxY, e.placement.position.y + e.placement.height);
        }
        for (const a of clipboardAnnotations ?? []) {
          minX = Math.min(minX, a.position.x);
          minY = Math.min(minY, a.position.y);
          maxX = Math.max(maxX, a.position.x);
          maxY = Math.max(maxY, a.position.y);
        }
        if (Number.isFinite(minX) && Number.isFinite(minY)) {
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          offX = Math.round((cursorWorld.x - cx) / SNAP) * SNAP;
          offY = Math.round((cursorWorld.y - cy) / SNAP) * SNAP;
        }
      }

      const newDevices: Device[] = [];
      const newPlacements: Placement[] = [];
      const pinKeyMap = new Map<string, string>();
      const takenNames: { name: string }[] = allDevices.map(d => ({ name: d.name }));
      let runningPlacements = [...allPlacements];

      for (const { device: oldDev, placement: oldPl } of (clipboardEntries ?? [])) {
        const newName = nextDesignator(designatorPrefix(oldDev.name), takenNames);
        takenNames.push({ name: newName });
        const newDevId = slugifyDesignator(newName);
        const { pinCatalog: newPinCatalog, pinIdMap } = remapDevicePins(oldDev, newDevId);
        for (const [oldPinId, newPinId] of pinIdMap) {
          pinKeyMap.set(`${oldDev.id}:${oldPinId}`, `${newDevId}:${newPinId}`);
        }
        const newConnectors = remapPlacementConnectors(oldPl.connectors, newDevId, pinIdMap);
        const letter = nextUnitLetter(newDevId, runningPlacements);
        const newPlId = placementIdFor(newDevId, letter);
        const newPl: Placement = {
          id: newPlId,
          deviceId: newDevId,
          sheetId: activeSheetId,
          position: { x: oldPl.position.x + offX, y: oldPl.position.y + offY },
          width: oldPl.width,
          height: oldPl.height,
          connectors: newConnectors,
        };
        runningPlacements = [...runningPlacements, newPl];
        newDevices.push({
          ...oldDev,
          id: newDevId,
          name: newName,
          pinCatalog: newPinCatalog,
        });
        newPlacements.push(newPl);
      }
      // Junctions — clone each with a fresh id and the same translation
      // offset applied to its position. junctionIdMap remaps endpoint keys
      // (`junction:<oldId>` → `junction:<newId>`) so the copy is independent.
      const junctionIdMap = new Map<string, string>();
      const newJunctions: Junction[] = (clipboardJunctions ?? []).map(orig => {
        const newId = `jct-${Math.random().toString(36).slice(2, 10)}`;
        junctionIdMap.set(orig.id, newId);
        return {
          id: newId,
          sheetId: activeSheetId,
          position: { x: orig.position.x + offX, y: orig.position.y + offY },
        };
      });

      // Net labels — duplicate with fresh ids and the same translation offset
      // as the devices. Build labelIdMap so wires referencing the OLD
      // `#labelId` retarget the NEW one.
      const labelIdMap = new Map<string, string>();
      const newLabels: NetLabel[] = (clipboardLabels ?? []).map(orig => {
        const newId = `netlabel-${Math.random().toString(36).slice(2, 10)}`;
        labelIdMap.set(orig.id, newId);
        let newAnchor: PinKey | null = orig.attachedTo;
        const origJctId = junctionIdFromKey(orig.attachedTo);
        if (origJctId) {
          // Junction anchor — remap to the cloned junction's id.
          const mapped = junctionIdMap.get(origJctId);
          newAnchor = mapped ? makeJunctionKey(mapped) : orig.attachedTo;
        } else if (pinKeyMap.has(orig.attachedTo)) {
          newAnchor = pinKeyMap.get(orig.attachedTo)!;
        }
        return { ...orig, id: newId, attachedTo: newAnchor!, sheetId: activeSheetId };
      });

      // Annotations — duplicate with fresh ids; note numbers re-assigned per
      // sheet so pasting doesn't collide with existing numbering.
      const usedNumbers = new Set<number>();
      for (const a of get().annotations) {
        if (a.kind === 'note' && a.sheetId === activeSheetId) usedNumbers.add(a.number);
      }
      let nextNote = 1;
      const newAnnotations: Annotation[] = (clipboardAnnotations ?? []).map(orig => {
        const newId = `annot-${Math.random().toString(36).slice(2, 10)}`;
        const pos = { x: orig.position.x + offX, y: orig.position.y + offY };
        if (orig.kind === 'note') {
          while (usedNumbers.has(nextNote)) nextNote++;
          const number = nextNote;
          usedNumbers.add(number);
          nextNote++;
          return { ...orig, id: newId, sheetId: activeSheetId, position: pos, number };
        }
        return { ...orig, id: newId, sheetId: activeSheetId, position: pos };
      });

      const remapEnd = (key: string): string | null => {
        const jctId = junctionIdFromKey(key);
        if (jctId) {
          const newId = junctionIdMap.get(jctId);
          return newId ? makeJunctionKey(newId) : null;
        }
        if (key.startsWith('#')) {
          const oldId = key.slice(1);
          const newId = labelIdMap.get(oldId);
          return newId ? `#${newId}` : null;
        }
        return pinKeyMap.get(key) ?? null;
      };
      const newWires: Wire[] = (clipboardWires || [])
        .map(w => {
          const fromRemap = remapEnd(w.fromPin);
          const toRemap   = remapEnd(w.toPin);
          if (!fromRemap || !toRemap) return null;
          return {
            ...w,
            id: `wire-${Math.random().toString(36).slice(2, 10)}`,
            sheetId: activeSheetId,
            fromPin: fromRemap,
            toPin:   toRemap,
          };
        })
        .filter((w): w is Wire => w !== null);

      // Only keep cloned junctions that some pasted wire/label still
      // references — a junction whose touching wires all failed to remap
      // would otherwise paste in as an orphan.
      const survivingJunctions = gcJunctions(newJunctions, newWires, newLabels);

      mutate((s) => ({
        devices: [...s.devices, ...newDevices],
        placements: [...s.placements, ...newPlacements],
        wires: [...s.wires, ...newWires],
        netLabels: [...s.netLabels, ...newLabels],
        junctions: [...s.junctions, ...survivingJunctions],
        annotations: [...s.annotations, ...newAnnotations],
      }));
      set({
        selectedDeviceIds: new Set(newPlacements.map(p => p.id)),
        selectedWireIds: new Set(),
        selectedConnectorIds: new Set(),
        selectedNetLabelIds: new Set(newLabels.map(l => l.id)),
        selectedAnnotationIds: new Set(newAnnotations.map(a => a.id)),
      });
    },

    // ── History ───────────────────────────────────────────────────────
    undo: () => set((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      const newPast = s.past.slice(0, -1);
      const newFuture = [takeSnapshot(s), ...s.future].slice(0, HISTORY_LIMIT);
      // Abandon any in-flight transaction — undo is a fresh starting point.
      return { ...prev, past: newPast, future: newFuture, _txSnapshot: null };
    }),

    redo: () => set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      const newFuture = s.future.slice(1);
      const newPast = [...s.past, takeSnapshot(s)].slice(-HISTORY_LIMIT);
      return { ...next, past: newPast, future: newFuture, _txSnapshot: null };
    }),

    // ── Persistence ───────────────────────────────────────────────────
    serialize: () => {
      const { devices, placements, wires, sheets, activeSheetId, netLabels, junctions, shields, annotations } = get();
      // v13: Bumped from v12 which added `nodeOrientations`
      // (device rotation per component node). All serialise as part of `sheets`.
      return JSON.stringify({ version: 13, devices, placements, wires, sheets, activeSheetId, netLabels, junctions, shields, annotations }, null, 2);
    },

    loadFromJson: (json) => {
      try {
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object') return false;
        // Resolve the sheet list first so we can backfill device.sheetId
        // onto legacy projects that didn't scope devices by sheet.
        // Normalize each sheet's harness slice to the Phase-3 shape: only
        // `viewMode` + `overrides` (node positions + bundle lengths) persist.
        // Pre-Phase-3 files carried a parked `devicePositions` map (and
        // earlier `customBundles` / `labels` / `junctionPositions`) — all
        // now 100%-derived or replaced by the override layer, so a legacy
        // harness slice's `overrides` defaults to empty (no v1 migration).
        const rawSheets: any[] = Array.isArray(parsed.sheets) && parsed.sheets.length > 0
          ? parsed.sheets : [initialSheet];
        const normalizeOverrides = (raw: any): HarnessOverrides => {
          if (!raw || typeof raw !== 'object') return emptyHarnessOverrides();
          const nodePositions: Record<string, Point> = {};
          if (raw.nodePositions && typeof raw.nodePositions === 'object') {
            for (const [k, v] of Object.entries(raw.nodePositions as Record<string, any>)) {
              if (v && typeof v.x === 'number' && typeof v.y === 'number') {
                nodePositions[k] = { x: v.x, y: v.y };
              }
            }
          }
          const bundleLengths: Record<string, number> = {};
          if (raw.bundleLengths && typeof raw.bundleLengths === 'object') {
            for (const [k, v] of Object.entries(raw.bundleLengths as Record<string, any>)) {
              if (typeof v === 'number' && Number.isFinite(v)) bundleLengths[k] = v;
            }
          }
          // v11 — Phase-4 cable bend points + names. Missing on pre-v11
          // files; default to empty (no migration). Each waypoint list is
          // validated point-by-point so a corrupt entry can't poison the
          // override layer.
          const bundleWaypoints: Record<string, Point[]> = {};
          if (raw.bundleWaypoints && typeof raw.bundleWaypoints === 'object') {
            for (const [k, v] of Object.entries(raw.bundleWaypoints as Record<string, any>)) {
              if (!Array.isArray(v)) continue;
              const pts: Point[] = [];
              for (const p of v) {
                if (p && typeof p.x === 'number' && typeof p.y === 'number') {
                  pts.push({ x: p.x, y: p.y });
                }
              }
              if (pts.length > 0) bundleWaypoints[k] = pts;
            }
          }
          const bundleNames: Record<string, string> = {};
          if (raw.bundleNames && typeof raw.bundleNames === 'object') {
            for (const [k, v] of Object.entries(raw.bundleNames as Record<string, any>)) {
              if (typeof v === 'string' && v.trim()) bundleNames[k] = v;
            }
          }
          // v12 — node orientations. Missing on pre-v12 files; default to empty.
          const nodeOrientations: Record<string, Orientation> = {};
          if (raw.nodeOrientations && typeof raw.nodeOrientations === 'object') {
            for (const [k, v] of Object.entries(raw.nodeOrientations as Record<string, any>)) {
              if (v === 0 || v === 90 || v === 180 || v === 270) nodeOrientations[k] = v;
            }
          }
          // v13 — per-device connector row order. Missing on pre-v13 files; default to empty.
          const connectorOrder: Record<string, string[]> = {};
          if (raw.connectorOrder && typeof raw.connectorOrder === 'object') {
            for (const [k, v] of Object.entries(raw.connectorOrder as Record<string, any>)) {
              if (Array.isArray(v) && v.every((s: unknown) => typeof s === 'string')) {
                connectorOrder[k] = v;
              }
            }
          }
          return { nodePositions, bundleLengths, bundleWaypoints, bundleNames, nodeOrientations, connectorOrder };
        };
        const resolvedSheets: Sheet[] = rawSheets.map((sh: any) => {
          if (!sh || typeof sh !== 'object' || !sh.harness) return sh as Sheet;
          const h = sh.harness;
          return {
            ...sh,
            harness: {
              viewMode: h.viewMode === 'harness' ? 'harness' : 'schematic',
              overrides: normalizeOverrides(h.overrides),
              mmPerUnit: typeof h.mmPerUnit === 'number' && h.mmPerUnit > 0 ? h.mmPerUnit : undefined,
            } as HarnessView,
          } as Sheet;
        });
        const fallbackSheetId = resolvedSheets[0].id;
        // v1 → v2 → v3 → v4 → v5 → v6 migration.
        //   v1: connectors had pins[] inline (pre-refactor)
        //   v2: pinCatalog + connectors without logicalConnectorName
        //   v3: pins + ConnectorInstances carry logicalConnectorName
        //   v4: devices carry sheetId for per-sheet isolation
        //   v5: device/pin/connector ids are derived from the designator and
        //       pin number (readable, hand-editable).
        //   v6 (current): Device is pure identity; Placement is a separate
        //       top-level array holding sheetId/position/width/height/connectors.
        const devices: Device[] = (parsed.devices ?? []).map((d: any) => {
          let pinCatalog: any[];
          let connectors: any[];

          if (d.pinCatalog) {
            pinCatalog = [...d.pinCatalog];
            connectors = (d.connectors ?? []).map((c: any) => ({ ...c }));
          } else {
            // v1 legacy: flatten template-style connectors into catalog + split by side.
            pinCatalog = [];
            connectors = [];
            const connectorsRaw: any[] = d.connectors ?? [];
            for (let ci = 0; ci < connectorsRaw.length; ci++) {
              const c = connectorsRaw[ci];
              const bySide = new Map<Side, string[]>();
              for (const p of (c.pins ?? [])) {
                pinCatalog.push({ id: p.id, name: p.name, pinNumber: p.pinNumber, logicalConnectorName: c.name });
                const side = (p.side as Side) ?? 'left';
                const arr = bySide.get(side) ?? [];
                arr.push(p.id);
                bySide.set(side, arr);
              }
              const sidesUsed = bySide.size;
              for (const [side, pinIds] of bySide) {
                connectors.push({
                  id: `${d.id}-mconn${ci}-${side}`,
                  name: sidesUsed > 1 ? `${c.name} (${side[0].toUpperCase()})` : c.name,
                  logicalConnectorName: c.name,
                  side,
                  pinIds,
                });
              }
            }
          }

          // v2 → v3: backfill logicalConnectorName on pins and ConnectorInstances.
          // Pin's logical connector is inferred from: (a) whichever ConnectorInstance
          // contains it, with its suffixed " (L)"/" (R)" stripped; (b) fallback 'J1'.
          const pinOwner = new Map<string, string>();
          for (const c of connectors) {
            const rawName = String(c.name ?? 'J1');
            const base = rawName.replace(/\s*\([LRTB]\)\s*$/i, '').trim() || 'J1';
            if (!c.logicalConnectorName) c.logicalConnectorName = base;
            for (const pid of (c.pinIds ?? [])) {
              if (!pinOwner.has(pid)) pinOwner.set(pid, c.logicalConnectorName);
            }
          }
          pinCatalog = pinCatalog.map((p: any) => ({
            ...p,
            logicalConnectorName: p.logicalConnectorName ?? pinOwner.get(p.id) ?? 'J1',
          }));
          // Drop pins that don't belong to a connector's logical plug — cleans
          // up the "mixed pins from J1 and J2" situation created by older UX.
          connectors = connectors.map((c: any) => ({
            ...c,
            pinIds: (c.pinIds ?? []).filter((pid: string) => {
              const pin = pinCatalog.find((p: any) => p.id === pid);
              return pin?.logicalConnectorName === c.logicalConnectorName;
            }),
          }));
          return {
            ...d,
            sheetId: typeof d.sheetId === 'string' ? d.sheetId : fallbackSheetId,
            pinCatalog,
            connectors,
          };
        });

        // ── v4 → v5: rewrite ids to readable form ────────────────────────
        // Load files from v4 with random ids like "dev-06hj3jay" still work —
        // we slugify the designator, remap pin/connector ids, then chase
        // through every wire + net-label reference so nothing dangles.
        const rawVersion = typeof parsed.version === 'number' ? parsed.version : 0;
        const needsIdMigration = rawVersion < 5;
        let workingDevices: any[] = devices;
        const pinKeyMap = new Map<string, string>();
        if (needsIdMigration) {
          const takenIds = new Set<string>();
          const migrated: any[] = [];
          for (const d of devices as any[]) {
            let newId = slugifyDesignator(d.name ?? d.id ?? 'U1');
            if (takenIds.has(newId)) {
              let n = 2;
              while (takenIds.has(`${newId}-${n}`)) n++;
              newId = `${newId}-${n}`;
            }
            takenIds.add(newId);
            const { pinCatalog: newPinCatalog, pinIdMap } = remapDevicePins(d, newId);
            const newConnectors = remapPlacementConnectors(d.connectors ?? [], newId, pinIdMap);
            for (const [oldPinId, newPinId] of pinIdMap) {
              pinKeyMap.set(`${d.id}:${oldPinId}`, `${newId}:${newPinId}`);
            }
            migrated.push({
              ...d,
              id: newId,
              pinCatalog: newPinCatalog,
              connectors: newConnectors,
            });
          }
          workingDevices = migrated;
        }

        const remapEndpoint = (key: any): string => {
          if (typeof key !== 'string') return key;
          if (isJunctionKey(key) || key.startsWith('#')) return key;
          return pinKeyMap.get(key) ?? key;
        };

        const rawWires = Array.isArray(parsed.wires) ? parsed.wires : [];
        const wires = needsIdMigration
          ? rawWires.map((w: any) => ({ ...w, fromPin: remapEndpoint(w.fromPin), toPin: remapEndpoint(w.toPin) }))
          : rawWires;

        const rawNetLabels: NetLabel[] = Array.isArray(parsed.netLabels) ? parsed.netLabels : [];
        const netLabels = needsIdMigration
          ? rawNetLabels.map(n => ({ ...n, attachedTo: remapEndpoint(n.attachedTo) }))
          : rawNetLabels;

        // ── v5 → v6: split embedded placement fields into a Placement array ──
        // v5 devices still carry sheetId/position/width/height/connectors
        // inline. v6 moves those to a separate `placements` entry per device.
        // A v5 file yields one placement per device (letter 'A'). Already-v6
        // files have a parsed.placements array and a stripped devices array.
        const finalDevices: Device[] = [];
        const finalPlacements: Placement[] = [];
        if (rawVersion >= 6 && Array.isArray(parsed.placements)) {
          // Already v6: devices are pure identity, placements are separate.
          for (const d of workingDevices as any[]) {
            finalDevices.push({
              id: d.id,
              templateId: d.templateId,
              name: d.name,
              productName: d.productName,
              manufacturer: d.manufacturer,
              partNumber: d.partNumber,
              pinCatalog: d.pinCatalog ?? [],
              symbolType: d.symbolType,
              attributes: d.attributes,
            });
          }
          for (const p of parsed.placements as any[]) {
            finalPlacements.push({
              id: p.id,
              deviceId: p.deviceId,
              sheetId: typeof p.sheetId === 'string' ? p.sheetId : fallbackSheetId,
              position: p.position ?? { x: 100, y: 100 },
              width: typeof p.width === 'number' ? p.width : 120,
              height: typeof p.height === 'number' ? p.height : 60,
              connectors: Array.isArray(p.connectors) ? p.connectors : [],
            });
          }
        } else {
          // <v6: extract one placement per device from the inlined fields.
          for (const d of workingDevices as any[]) {
            finalDevices.push({
              id: d.id,
              templateId: d.templateId,
              name: d.name,
              productName: d.productName,
              manufacturer: d.manufacturer,
              partNumber: d.partNumber,
              pinCatalog: d.pinCatalog ?? [],
              symbolType: d.symbolType,
              attributes: d.attributes,
            });
            finalPlacements.push({
              id: placementIdFor(d.id, 'A'),
              deviceId: d.id,
              sheetId: typeof d.sheetId === 'string' ? d.sheetId : fallbackSheetId,
              position: d.position ?? { x: 100, y: 100 },
              width: typeof d.width === 'number' ? d.width : 120,
              height: typeof d.height === 'number' ? d.height : 60,
              connectors: Array.isArray(d.connectors) ? d.connectors : [],
            });
          }
        }

        const sheets = resolvedSheets;
        const activeSheetId = typeof parsed.activeSheetId === 'string' ? parsed.activeSheetId : sheets[0].id;

        // Defensive cleanup: enforce "each pin on at most one placement AND
        // at most one connector per placement". Older data (or the pre-v6
        // code paths) could have duplicates that would show up in the
        // Inspector as "shared" warnings that the user can't resolve.
        const seenPinPerDevice = new Map<string, Set<string>>();
        for (const p of finalPlacements) {
          const seen = seenPinPerDevice.get(p.deviceId) ?? new Set<string>();
          p.connectors = p.connectors.map(c => ({
            ...c,
            pinIds: c.pinIds.filter(pid => {
              if (seen.has(pid)) return false;  // dedupe
              seen.add(pid);
              return true;
            }),
          }));
          seenPinPerDevice.set(p.deviceId, seen);
        }

        // Shields are a render-only annotation introduced after v6; older
        // projects simply have no `shields` field and we treat them as [].
        const rawShields = Array.isArray(parsed.shields) ? parsed.shields : [];
        const shields: Shield[] = rawShields
          .filter((sh: unknown): sh is Shield =>
            !!sh && typeof sh === 'object'
            && typeof (sh as Shield).id === 'string'
            && Array.isArray((sh as Shield).wireIds)
            && typeof (sh as Shield).xStart === 'number'
            && typeof (sh as Shield).xEnd === 'number'
            && ['ground', 'float', 'backshell'].includes((sh as Shield).termination))
          .map(sh => ({
            id: sh.id,
            sheetId: typeof sh.sheetId === 'string' ? sh.sheetId : fallbackSheetId,
            wireIds: sh.wireIds,
            xStart: sh.xStart,
            xEnd: sh.xEnd,
            termination: sh.termination,
          }));

        // Annotations were introduced after v6; older projects simply omit
        // the field and we treat them as []. Discriminator is `kind`.
        const rawAnnotations = Array.isArray(parsed.annotations) ? parsed.annotations : [];
        const annotations: Annotation[] = rawAnnotations
          .filter((a: any) =>
            !!a && typeof a === 'object'
            && typeof a.id === 'string'
            && (a.kind === 'text' || a.kind === 'note')
            && a.position && typeof a.position.x === 'number' && typeof a.position.y === 'number')
          .map((a: any) => {
            const sheetId = typeof a.sheetId === 'string' ? a.sheetId : fallbackSheetId;
            if (a.kind === 'note') {
              return {
                id: a.id, kind: 'note', sheetId,
                position: { x: a.position.x, y: a.position.y },
                number: typeof a.number === 'number' ? a.number : 1,
                text: typeof a.text === 'string' ? a.text : '',
              };
            }
            return {
              id: a.id, kind: 'text', sheetId,
              position: { x: a.position.x, y: a.position.y },
              text: typeof a.text === 'string' ? a.text : '',
              ...(typeof a.fontSize === 'number' ? { fontSize: a.fontSize } : {}),
            };
          });

        // Junctions (v8+): first-class splice entities. Older files have no
        // `junctions` field — treat as []. No migration from the old `@x,y`
        // endpoint strings (per the v1 scaffold: no backward compatibility).
        const rawJunctions = Array.isArray(parsed.junctions) ? parsed.junctions : [];
        const junctions: Junction[] = rawJunctions
          .filter((j: any) =>
            !!j && typeof j === 'object'
            && typeof j.id === 'string'
            && j.position && typeof j.position.x === 'number' && typeof j.position.y === 'number')
          .map((j: any) => ({
            id: j.id,
            sheetId: typeof j.sheetId === 'string' ? j.sheetId : fallbackSheetId,
            position: { x: j.position.x, y: j.position.y },
          }));

        set({
          devices: finalDevices,
          placements: finalPlacements,
          wires, sheets, activeSheetId, netLabels, junctions, shields, annotations,
          past: [], future: [], _txSnapshot: null,
          selectedDeviceIds: new Set(),
          selectedWireIds: new Set(),
          selectedConnectorIds: new Set(),
          selectedNetLabelIds: new Set(),
          selectedShieldIds: new Set(),
          selectedAnnotationIds: new Set(),
          selectedBundleId: null,
          selectedHarnessNodeIds: new Set<string>(),
          wiringFromPin: null,
        });
        return true;
      } catch {
        return false;
      }
    },

    reset: () => set({
      devices: [], placements: [], wires: [], netLabels: [], junctions: [], shields: [], annotations: [],
      sheets: [initialSheet],
      activeSheetId: initialSheet.id,
      past: [], future: [], _txSnapshot: null,
      selectedDeviceIds: new Set(),
      selectedWireIds: new Set(),
      selectedConnectorIds: new Set(),
      selectedNetLabelIds: new Set(),
      selectedAnnotationIds: new Set(),
      selectedBundleId: null,
      selectedHarnessNodeIds: new Set<string>(),
      wiringFromPin: null,
    }),
  };
});

// Keep wirePaths' net-label + junction registries in sync with the store so
// `#labelId` and `junction:<id>` endpoints resolve correctly during routing
// without forcing a circular import. The arrays keep the same reference
// between unrelated updates, so each subscriber only fires when its slice
// actually changes.
setNetLabelRegistry(useWiring.getState().netLabels);
setJunctionRegistry(useWiring.getState().junctions);
useWiring.subscribe((state, prev) => {
  if (state.netLabels !== prev.netLabels) {
    setNetLabelRegistry(state.netLabels);
  }
  if (state.junctions !== prev.junctions) {
    setJunctionRegistry(state.junctions);
  }
});

// Resolves any endpoint key (pin, junction, or net label) to world coords.
//   "junction:<id>" — looked up in the store's `junctions` array.
//   "#labelId"      — the flag tip of a net label.
//   "deviceId:pinId"— a device pin; we find the placement currently showing
//                     the pin (at most one across all placements of its
//                     device — the "each pin on one sheet" invariant).
export function getPinWorldPos(placedDevices: PlacedDevice[], pinKey: PinKey): Point | null {
  const junctionId = junctionIdFromKey(pinKey);
  if (junctionId) {
    const j = useWiring.getState().junctions.find(jj => jj.id === junctionId);
    return j ? { x: j.position.x, y: j.position.y } : null;
  }
  // `#labelId` — resolves to the flag tip of a net label so labels can act
  // as wire endpoints. Wires that reference a label follow it when the user
  // drags the flag, just like wires on a device follow the device.
  if (pinKey.startsWith('#')) {
    const labelId = pinKey.slice(1);
    const lbl = useWiring.getState().netLabels.find(n => n.id === labelId);
    if (!lbl) return null;
    const base = getPinWorldPos(placedDevices, lbl.attachedTo);
    if (!base) return null;
    const dx = lbl.offset?.dx ?? 0;
    const dy = lbl.offset?.dy ?? 0;
    return { x: base.x + dx, y: base.y + dy };
  }
  const [deviceId, pinId] = pinKey.split(':');
  const pd = placedDevices.find(p =>
    p.deviceId === deviceId && p.connectors.some(c => c.pinIds.includes(pinId)));
  if (!pd) return null;
  return computePinWorldPos(pd, pinId);
}

/** Default wire-label heuristic:
 *    1. Net label on dest (if any) → its text
 *    2. Net label on source       → its text
 *    3. Source pin's name
 *    4. Nothing (undefined)
 */
function defaultNetLabel(fromPin: PinKey, toPin: PinKey, devices: Device[], netLabels: NetLabel[]): string | undefined {
  const matchTo = netLabels.find(n => n.attachedTo === toPin);
  if (matchTo) return matchTo.text;
  const matchFrom = netLabels.find(n => n.attachedTo === fromPin);
  if (matchFrom) return matchFrom.text;
  if (!isJunctionKey(fromPin) && !fromPin.startsWith('#')) {
    const [deviceId, pinId] = fromPin.split(':');
    const dev = devices.find(d => d.id === deviceId);
    const pin = dev?.pinCatalog.find(p => p.id === pinId);
    if (pin?.name) return pin.name;
  }
  return undefined;
}

// Legacy exports kept so files importing these still compile. The actual
// values live in layout.ts now.
export { PIN_SPACING, PIN_STUB_LENGTH } from './layout';
export const PIN_Y_OFFSET = 0; // unused with the new layout; kept as export for legacy imports
