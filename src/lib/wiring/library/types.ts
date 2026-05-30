import type { Device, Placement, PlacedDevice, Point, Side, Pin, PinRole, ConnectorInstance, ConnectorGender, ConnectorType } from '../types';
import type { SymbolType } from '../symbols';
import { getSymbolDef, initSymbolAttributes } from '../symbols';

export type DeviceCategory =
  | 'nav-com'
  | 'audio'
  | 'transponder'
  | 'display'
  | 'ahrs'
  | 'autopilot'
  | 'engine'
  | 'ads-b'
  | 'diodes'
  | 'generic';

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  'nav-com':     'Nav / Com',
  'audio':       'Audio Panel',
  'transponder': 'Transponder',
  'display':     'Display',
  'ahrs':        'AHRS / ADC',
  'autopilot':   'Autopilot',
  'engine':      'Engine Monitor',
  'ads-b':       'ADS-B',
  'diodes':      'Diodes',
  'generic':     'Generic',
};

/**
 * Template-level pin description. The `side` is a *default placement hint* —
 * instantiation uses it to split pins across connector instances, but once the
 * device is on the canvas the user can freely move pins between connectors.
 */
export interface LibraryPin {
  name: string;
  pinNumber?: string;
  side: Side;
  /** Electrical role — drives lint rules. Omit for ordinary signal pins. */
  role?: PinRole;
  /** Max current the pin is rated for, free-text incl. unit (e.g. "5A"). */
  current?: string;
  /** Recommended AWG wire gauge, free-text (e.g. "20"). */
  wireGauge?: string;
  /** Free-form note copied to the Pin instance on add. */
  comment?: string;
  /** Twisted-pair group identifier. Pins on the same template that share the
   *  same string belong to the same twisted pair in the harness (e.g. SkyView
   *  Network Data 1A + Data 1B → "NET1"). Exported to the pin-list's
   *  "Twist Group" column when both endpoints of a wire's net agree. */
  twistGroup?: string;
}

export interface LibraryConnector {
  name: string;                  // e.g. "J1001"
  pins: LibraryPin[];
  /** Gender of the connector on the *unit* (LRU) side, per the manufacturer's
   *  install guide. The harness mates with the opposite gender — derived in
   *  the BOM. Optional: leave unset when the source datasheet doesn't say. */
  gender?: ConnectorGender;
  /** Physical connector family (D-Sub, Molex Micro-Fit, ring lug, …).
   *  Drives BOM lookups and tells the user which crimp tooling they need. */
  connectorType?: ConnectorType;
}

/**
 * A single manual/datasheet/reference URL for a device. We keep both the
 * label and the URL as user-facing strings — for avionics a single device
 * often has several relevant documents (install manual, STC, wiring diagram,
 * pilot guide), so this is always stored as a list.
 */
export interface ManualLink {
  label: string;
  url: string;
}

/**
 * Optional default-layout entry for a multi-section device. Each entry maps
 * to one ConnectorInstance group (one on-canvas placement) — pins live in
 * the device's pinCatalog regardless of how the views are split.
 *
 * Use this for big LRUs (GTN 650, GEA 24, AFS ACM, …) that you want to drop
 * onto the canvas pre-split into sensible sections. Without this, the device
 * always lands as a single placement holding every connector — the user can
 * still split sections manually via the Inspector ("Split to new section").
 */
export interface LibraryPlacement {
  /**
   * Pixel offset from the cursor's drop position. The first placement is the
   * anchor at the user's drop location; subsequent placements offset from
   * there. Omit on the first entry to drop at the cursor.
   */
  offset?: Point;
  /**
   * Names of the template's connectors that belong on this placement. Must
   * match a `name` in the template's `connectors[]` array. Connectors not
   * referenced by any LibraryPlacement land on the first placement.
   */
  connectorNames: string[];
}

export interface DeviceTemplate {
  id: string;
  manufacturer: string;
  partNumber: string;
  name: string;
  category: DeviceCategory;
  /** Reference-designator prefix used when auto-naming instances.
   * Default is "U". Typical values: "U" (generic LRU), "SW" (switch),
   * "CB" (breaker), "J" (connector/jack), "R" (resistor), etc. */
  designatorPrefix?: string;
  width: number;
  height: number;
  connectors: LibraryConnector[];
  /**
   * Default multi-section layout. When omitted, the device drops as a single
   * placement with every connector. When set, the device drops as N sibling
   * placements (one per entry, in order) — letters U1A, U1B, …
   */
  placements?: LibraryPlacement[];
  /** Legacy single-link field. New templates should use `manuals` instead,
   *  but this remains for backward compat and surfaces in the UI alongside
   *  the manuals list. */
  datasheetUrl?: string;
  /** Named manual/datasheet/reference links shown in the Inspector and
   *  picker preview. Order is preserved. */
  manuals?: ManualLink[];
  description?: string;
  /** If set, instances of this template are rendered as a fixed schematic
   * symbol (ground, breaker, resistor, capacitor, capacitor-polar) rather
   * than the standard box+connector layout. */
  symbolType?: SymbolType;
}

/**
 * Collect all manual links for a template, merging the legacy `datasheetUrl`
 * field into the `manuals` array. Callers always get a unified list — legacy
 * entries are labeled "Datasheet" unless already present by URL.
 */
export function getManualLinks(template: DeviceTemplate | null | undefined): ManualLink[] {
  if (!template) return [];
  const out: ManualLink[] = [];
  const seen = new Set<string>();
  for (const m of template.manuals ?? []) {
    if (!m?.url || seen.has(m.url)) continue;
    seen.add(m.url);
    out.push({ label: m.label?.trim() || 'Manual', url: m.url });
  }
  if (template.datasheetUrl && !seen.has(template.datasheetUrl)) {
    out.push({ label: 'Datasheet', url: template.datasheetUrl });
  }
  return out;
}

export function getDesignatorPrefix(template: DeviceTemplate): string {
  return template.designatorPrefix?.trim() || 'U';
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Turn a user-facing designator ("U1", "SW 1", "R-47") into a safe id string.
 * Strips anything that isn't alphanumeric, hyphen, or underscore. Empty input
 * falls back to a random id so we never produce an empty-string id.
 */
export function slugifyDesignator(designator: string): string {
  const cleaned = (designator || '').trim().replace(/[^A-Za-z0-9_-]/g, '-');
  return cleaned || randomId('dev');
}

/**
 * Deterministic pin id: `{connectorName}-P{pinNumber}` when the pin has a
 * datasheet pin number, otherwise a positional fallback `{connectorName}-P{idx}`
 * using the pin's 0-based order within its connector. Wire endpoints store
 * the full key as `{deviceId}:{pinId}` so readability compounds — e.g.
 * `U1:J1001-P77`.
 */
export function pinIdFor(connectorName: string, pinNumber: string | undefined, positionalIndex: number): string {
  const conn = slugifyDesignator(connectorName);
  const num = (pinNumber ?? '').trim();
  const suffix = num ? `P${num.replace(/[^A-Za-z0-9_-]/g, '-')}` : `P${positionalIndex}`;
  return `${conn}-${suffix}`;
}

/**
 * Deterministic connector-instance id. When a template connector gets split
 * across multiple sides (e.g. "J1001" with pins on left AND right → two
 * ConnectorInstances, one per side), we suffix the side letter so each id
 * stays unique within a device.
 */
export function connectorIdFor(deviceId: string, connectorName: string, side: Side, multiSided: boolean): string {
  const conn = slugifyDesignator(connectorName);
  return multiSided ? `${deviceId}-${conn}-${side[0].toUpperCase()}` : `${deviceId}-${conn}`;
}

/**
 * Turn a template into a live Device instance:
 *  - every library pin becomes a single Pin in pinCatalog
 *  - each (template connector × unique side) produces one ConnectorInstance
 *
 * Pins within a template connector that sit on DIFFERENT sides get split into
 * separate ConnectorInstances with a suffix, e.g. "J1001" → "J1001 (L)" and
 * "J1001 (R)". User can then re-distribute pins via the inspector.
 */
/** Returns a (Device, Placement) pair. Device is pure identity; Placement
 *  carries the visual geometry + the connector-views for this placement.
 *  The placement lacks id, deviceId, and sheetId — the store assigns those
 *  (unit letter + active sheet) when it calls addDevice. */
export function instantiateDevice(
  template: DeviceTemplate,
  position: Point,
  /** Full reference designator to assign (e.g. "U1"). Falls back to the
   * template's designator prefix + "1" if omitted — typically the caller
   * computes a collision-free number via `nextDesignator(...)`. */
  designator?: string,
): { device: Device; placement: Omit<Placement, 'id' | 'deviceId' | 'sheetId'> } {
  const resolvedDesignator = designator || `${getDesignatorPrefix(template)}1`;
  const deviceId = slugifyDesignator(resolvedDesignator);
  const pinCatalog: Pin[] = [];
  const connectors: ConnectorInstance[] = [];

  // Track positional indices per connector name so pins without a datasheet
  // pinNumber still get a stable, unique id (P0, P1, ... within the connector).
  const posIndexByConnector = new Map<string, number>();

  for (let ci = 0; ci < template.connectors.length; ci++) {
    const tplConn = template.connectors[ci];
    const bySide = new Map<Side, Pin[]>();

    for (let pi = 0; pi < tplConn.pins.length; pi++) {
      const tp = tplConn.pins[pi];
      const positional = posIndexByConnector.get(tplConn.name) ?? 0;
      posIndexByConnector.set(tplConn.name, positional + 1);
      const pin: Pin = {
        id: pinIdFor(tplConn.name, tp.pinNumber, positional),
        name: tp.name,
        pinNumber: tp.pinNumber,
        logicalConnectorName: tplConn.name,
        ...(tp.role ? { role: tp.role } : {}),
        ...(tp.current ? { current: tp.current } : {}),
        ...(tp.wireGauge ? { wireGauge: tp.wireGauge } : {}),
        ...(tp.comment ? { comment: tp.comment } : {}),
        ...(tp.twistGroup ? { twistGroup: tp.twistGroup } : {}),
      };
      pinCatalog.push(pin);
      const arr = bySide.get(tp.side) ?? [];
      arr.push(pin);
      bySide.set(tp.side, arr);
    }

    const sidesUsed = bySide.size;
    for (const [side, pins] of bySide) {
      const name = sidesUsed > 1
        ? `${tplConn.name} (${side[0].toUpperCase()})`
        : tplConn.name;
      connectors.push({
        id: connectorIdFor(deviceId, tplConn.name, side, sidesUsed > 1),
        name,
        logicalConnectorName: tplConn.name,
        side,
        pinIds: pins.map(p => p.id),
        ...(tplConn.gender ? { gender: tplConn.gender } : {}),
        ...(tplConn.connectorType ? { connectorType: tplConn.connectorType } : {}),
      });
    }
  }

  const symbolDef = getSymbolDef(template.symbolType);
  // Generic / schematic-symbol templates carry placeholder metadata
  // ("Generic" / "R") that isn't useful on a BOM. Leave those fields
  // blank on the instance so the user fills in real values (or leaves
  // them blank). Real-part templates (Garmin etc.) copy through.
  const isGenericSymbol = Boolean(template.symbolType);
  const device: Device = {
    id: deviceId,
    templateId: template.id,
    name: resolvedDesignator,
    productName: template.name,
    manufacturer: isGenericSymbol ? '' : template.manufacturer,
    partNumber:   isGenericSymbol ? '' : template.partNumber,
    pinCatalog,
    symbolType: template.symbolType,
    attributes: symbolDef ? initSymbolAttributes(symbolDef) : undefined,
  };
  const placement: Omit<Placement, 'id' | 'deviceId' | 'sheetId'> = {
    position,
    width:  symbolDef?.width  ?? template.width,
    height: symbolDef?.height ?? template.height,
    connectors,
  };
  return { device, placement };
}

/** Convenience helper for UI code that wants to render a template as a
 *  PlacedDevice WITHOUT adding it to the store (picker preview, placement
 *  ghost). Returns a synthetic PlacedDevice with a stable fake id and a
 *  dummy sheetId — never add this to the store as-is. */
export function previewPlacedDevice(
  template: DeviceTemplate,
  position: Point,
  designator?: string,
): PlacedDevice {
  const { device, placement } = instantiateDevice(template, position, designator);
  return {
    id: `${device.id}A`,
    deviceId: device.id,
    sheetId: '__preview__',
    position: placement.position,
    width: placement.width,
    height: placement.height,
    connectors: placement.connectors,
    templateId: device.templateId,
    name: device.name,
    productName: device.productName,
    manufacturer: device.manufacturer,
    partNumber: device.partNumber,
    pinCatalog: device.pinCatalog,
    symbolType: device.symbolType,
    attributes: device.attributes,
  };
}

/**
 * Pick the next free reference designator for a given prefix across the
 * devices already on the canvas. Skips numbers already in use so deleting
 * a device in the middle doesn't create duplicates.
 */
export function nextDesignator(prefix: string, existingDevices: { name: string }[]): string {
  const safePrefix = prefix.trim() || 'U';
  const escaped = safePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}(\\d+)$`);
  const used = new Set<number>();
  for (const d of existingDevices) {
    const m = d.name.match(re);
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${safePrefix}${n}`;
}
