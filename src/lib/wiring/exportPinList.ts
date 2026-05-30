import XLSX from 'xlsx-js-style';
import type { Device, Placement, Wire, Pin, NetLabel } from './types';
import { isJunctionKey } from './types';

/**
 * Pin-to-pin list export — every wire that connects two device pins becomes
 * one row in an .xlsx, with a Cobalt-coloured header row, frozen pane,
 * auto-filter, and zebra-striped data rows. Wires that end at junctions,
 * free points, or net labels are skipped (they're part of larger nets and
 * don't have a single "to pin" to display).
 */
interface PinResolution {
  designator: string;            // "U1"
  subsystem: string;             // attributes.subsystem
  productName: string;           // "Garmin G3X"
  connectorName: string;         // "J1"
  pinNumber: string;             // "12"
  pinName: string;               // "POWER INPUT"
  pinRemarks: string;            // pin.comment
  twistGroup: string;            // pin.twistGroup, or "" if unset
}

function resolvePin(
  devices: readonly Device[],
  _placements: readonly Placement[],
  pinKey: string,
): PinResolution | null {
  if (!pinKey || isJunctionKey(pinKey) || pinKey.startsWith('#')) return null;
  const [deviceId, pinId] = pinKey.split(':');
  if (!deviceId || !pinId) return null;
  const dev = devices.find(d => d.id === deviceId);
  if (!dev) return null;
  const pin = dev.pinCatalog.find((p: Pin) => p.id === pinId);
  if (!pin) return null;
  return {
    designator:   dev.name ?? deviceId,
    subsystem:    dev.attributes?.subsystem ?? '',
    productName:  dev.productName ?? dev.manufacturer ?? '',
    // Use the logical connector name (e.g. "D37") rather than the canvas
    // view label (e.g. "D37 (L)") — the wiring-harness fabricator cares
    // about the physical connector, not which side it appears on the sheet.
    connectorName: pin.logicalConnectorName ?? '',
    pinNumber:    pin.pinNumber ?? '',
    pinName:      pin.name ?? '',
    pinRemarks:   pin.comment ?? '',
    twistGroup:   pin.twistGroup ?? '',
  };
}

/** Column definitions in render order. `width` is in Excel "character"
 *  units; the values were eyeballed against typical contents. */
const COLUMNS: { key: string; header: string; width: number }[] = [
  { key: 'lineId',      header: 'Line #',           width: 8  },
  { key: 'fromSubsys',  header: 'From Subsystem',   width: 18 },
  { key: 'fromName',    header: 'From Device',      width: 22 },
  { key: 'fromUnit',    header: 'From Designator',  width: 14 },
  { key: 'fromConn',    header: 'From Connector',   width: 16 },
  { key: 'fromPin',     header: 'From Pin #',       width: 10 },
  { key: 'fromPinName', header: 'From Pin Name',    width: 22 },
  { key: 'fromNotes',   header: 'From Notes',       width: 22 },
  { key: 'cableType',   header: 'Cable Type',       width: 12 },
  { key: 'twistGroup',  header: 'Twist Group',      width: 12 },
  { key: 'netName',     header: 'Net Name',         width: 20 },
  { key: 'toSubsys',    header: 'To Subsystem',     width: 18 },
  { key: 'toName',      header: 'To Device',        width: 22 },
  { key: 'toUnit',      header: 'To Designator',    width: 14 },
  { key: 'toConn',      header: 'To Connector',     width: 16 },
  { key: 'toPin',       header: 'To Pin #',         width: 10 },
  { key: 'toPinName',   header: 'To Pin Name',      width: 22 },
  { key: 'notes',       header: 'Notes',            width: 24 },
];

interface PinListRow {
  lineId: number;
  fromSubsys: string; fromName: string; fromUnit: string; fromConn: string;
  fromPin: string;    fromPinName: string; fromNotes: string;
  cableType: string;  twistGroup: string; netName: string;
  toSubsys: string;   toName: string; toUnit: string; toConn: string;
  toPin: string;      toPinName: string; notes: string;
}

/**
 * Walk the wiring graph and group every pin endpoint into electrical nets.
 * Edge types match the Inspector / lint logic:
 *   • Wires connect their two endpoints
 *   • A `junction:<id>` endpoint connects every wire/label that references
 *     the same id — covered by the wire-edge step (endpoint-key equality)
 *   • Same-text labels are siblings (named-net equivalence)
 *
 * Returns one entry per connected component that contains at least one pin
 * endpoint, plus all wires and labels that participate in that net (used
 * downstream to pick a Cable Type and Net Name).
 */
interface Net {
  pinKeys: string[];
  wireSet: Set<string>;
  labelSet: Set<string>;
}

function findNets(wires: readonly Wire[], netLabels: readonly NetLabel[]): Net[] {
  // Seed the graph with every endpoint of every wire + every label anchor + #labelId.
  const allNodes = new Set<string>();
  for (const w of wires) { allNodes.add(w.fromPin); allNodes.add(w.toPin); }
  for (const l of netLabels) { allNodes.add(l.attachedTo); allNodes.add(`#${l.id}`); }

  const visited = new Set<string>();
  const nets: Net[] = [];

  for (const seed of allNodes) {
    if (visited.has(seed)) continue;
    const queue: string[] = [seed];
    visited.add(seed);
    const compNodes = new Set<string>([seed]);
    const compWires = new Set<string>();
    const compLabels = new Set<string>();

    const enqueue = (k: string) => {
      if (!visited.has(k)) { visited.add(k); queue.push(k); compNodes.add(k); }
    };

    while (queue.length) {
      const node = queue.shift()!;

      // Same-text label siblings.
      if (node.startsWith('#')) {
        const lbl = netLabels.find(n => `#${n.id}` === node);
        if (lbl) {
          compLabels.add(lbl.id);
          for (const sib of netLabels.filter(n => n.text === lbl.text)) {
            enqueue(`#${sib.id}`);
            enqueue(sib.attachedTo);
            compLabels.add(sib.id);
          }
        }
      }

      // Wires touching this node.
      for (const w of wires) {
        if (w.fromPin === node) { enqueue(w.toPin);   compWires.add(w.id); }
        else if (w.toPin === node) { enqueue(w.fromPin); compWires.add(w.id); }
      }
    }

    const pinKeys: string[] = [];
    for (const k of compNodes) {
      if (!isJunctionKey(k) && !k.startsWith('#')) pinKeys.push(k);
    }
    if (pinKeys.length >= 2) {
      nets.push({ pinKeys, wireSet: compWires, labelSet: compLabels });
    }
  }
  return nets;
}

/**
 * Collapse the assorted ways users spell "ground" into a single canonical
 * `GND` so the exported pin list reads consistently. Matches:
 *   • G, G1, G2, …          (abbreviated, optionally numbered)
 *   • GND, GND1, GND2, …    (numbered grounds)
 *   • Ground, Ground1, …    (full word, optionally numbered)
 * All other names pass through unchanged so deliberate net names like
 * "Power Ground" or "Signal Ground" are preserved.
 */
function normalizeNetName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (/^(g|gnd|ground)\d*$/i.test(trimmed)) return 'GND';
  return trimmed;
}

/** Stable sort key for a pin: by Designator → Connector → Pin number. */
function pinSortKey(
  devices: readonly Device[],
  pinKey: string,
): [string, string, number, string] {
  const [deviceId, pinId] = pinKey.split(':');
  const dev = devices.find(d => d.id === deviceId);
  const pin = dev?.pinCatalog.find(p => p.id === pinId);
  const pinNumRaw = pin?.pinNumber ?? '';
  const pinNum = parseInt(pinNumRaw, 10);
  return [
    dev?.name ?? deviceId,
    pin?.logicalConnectorName ?? '',
    Number.isFinite(pinNum) ? pinNum : Number.MAX_SAFE_INTEGER,
    pinNumRaw,
  ];
}

/** Pure data builder — exposed for testing and re-use. Enumerates every
 *  electrical net (across direct wires, junctions, and named labels) and
 *  emits a star-topology row set: one row from the net's canonical "primary"
 *  pin to each other pin on the net. A 2-pin net produces one row; a 5-pin
 *  ground bus produces four. */
export function buildPinListRows(
  devices: readonly Device[],
  placements: readonly Placement[],
  wires: readonly Wire[],
  netLabels: readonly NetLabel[] = [],
): PinListRow[] {
  const rows: PinListRow[] = [];
  const nets = findNets(wires, netLabels);

  for (const net of nets) {
    // Sort pins so the primary is deterministic across exports.
    const sortedPins = [...net.pinKeys].sort((a, b) => {
      const ka = pinSortKey(devices, a);
      const kb = pinSortKey(devices, b);
      for (let i = 0; i < ka.length; i++) {
        const av = ka[i], bv = kb[i];
        if (typeof av === 'number' && typeof bv === 'number') { if (av !== bv) return av - bv; }
        else if (String(av) !== String(bv)) return String(av).localeCompare(String(bv));
      }
      return 0;
    });

    // Net name: prefer a label on this net; fall back to any wire's label.
    // Run through `normalizeNetName` so ground variants (G, GND1, Ground…)
    // all read as plain "GND" in the export.
    let netName = '';
    if (net.labelSet.size > 0) {
      const labelId = [...net.labelSet][0];
      netName = netLabels.find(n => n.id === labelId)?.text ?? '';
    }
    if (!netName) {
      for (const wid of net.wireSet) {
        const w = wires.find(ww => ww.id === wid);
        if (w?.label) { netName = w.label; break; }
      }
    }
    netName = normalizeNetName(netName);

    // Cable type: first wire in the net that has an AWG set.
    let cableType = '';
    for (const wid of net.wireSet) {
      const w = wires.find(ww => ww.id === wid);
      if (w?.awg) { cableType = `AWG${w.awg}`; break; }
    }

    // Twist group: derived from the device template's per-pin twistGroup tags.
    // If every pin on this net that has a tag agrees on the same value, that
    // value names the twisted pair this net belongs to. If multiple groups
    // appear, or no pin is tagged, leave the column blank — we don't want to
    // pick arbitrarily.
    let twistGroup = '';
    const seenTwistGroups = new Set<string>();
    for (const pk of sortedPins) {
      const resolved = resolvePin(devices, placements, pk);
      if (resolved?.twistGroup) seenTwistGroups.add(resolved.twistGroup);
    }
    if (seenTwistGroups.size === 1) twistGroup = [...seenTwistGroups][0];

    const primary = resolvePin(devices, placements, sortedPins[0]);
    if (!primary) continue;
    for (let i = 1; i < sortedPins.length; i++) {
      const to = resolvePin(devices, placements, sortedPins[i]);
      if (!to) continue;
      rows.push({
        lineId:     0,
        fromSubsys: primary.subsystem,
        fromName:   primary.productName,
        fromUnit:   primary.designator,
        fromConn:   primary.connectorName,
        fromPin:    primary.pinNumber,
        fromPinName: primary.pinName,
        fromNotes:  primary.pinRemarks,
        cableType,
        twistGroup,
        netName,
        toSubsys:   to.subsystem,
        toName:     to.productName,
        toUnit:     to.designator,
        toConn:     to.connectorName,
        toPin:      to.pinNumber,
        toPinName:  to.pinName,
        notes:      '',
      });
    }
  }

  // Sort by From Designator → Connector → Pin → To Designator so the
  // spreadsheet opens in cable-run order. User can re-sort with the
  // auto-filter chevrons.
  rows.sort((a, b) => {
    const c1 = a.fromUnit.localeCompare(b.fromUnit);
    if (c1) return c1;
    const c2 = a.fromConn.localeCompare(b.fromConn);
    if (c2) return c2;
    const an = parseInt(a.fromPin, 10);
    const bn = parseInt(b.fromPin, 10);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    if (a.fromPin !== b.fromPin) return a.fromPin.localeCompare(b.fromPin);
    return a.toUnit.localeCompare(b.toUnit);
  });
  rows.forEach((r, i) => { r.lineId = i + 1; });
  return rows;
}

// ── Cobalt palette (matches src/index.css) ─────────────────────────
const COLOR_HEADER_BG     = '2E5BD9'; // light-mode Cobalt primary
const COLOR_HEADER_FG     = 'FFFFFF';
const COLOR_ZEBRA_BG      = 'F5F7FB'; // light-mode paper-blue
const COLOR_TITLE_FG      = '0B1320'; // ink
const COLOR_TITLE_BG      = 'EEF2F8'; // surface-low
const COLOR_GRID_BORDER   = 'C8D1DF';

const headerStyle = {
  font: { bold: true, color: { rgb: COLOR_HEADER_FG }, sz: 11 },
  fill: { fgColor: { rgb: COLOR_HEADER_BG } },
  alignment: { vertical: 'center', horizontal: 'left', wrapText: false },
  border: {
    top:    { style: 'thin', color: { rgb: COLOR_HEADER_BG } },
    bottom: { style: 'thin', color: { rgb: COLOR_HEADER_BG } },
    left:   { style: 'thin', color: { rgb: COLOR_HEADER_BG } },
    right:  { style: 'thin', color: { rgb: COLOR_HEADER_BG } },
  },
};

// Branded title block — three rows: wordmark, subtitle, export stamp.
// Wordmark renders as a single ink-coloured "BenchLog" across the full
// width — the previous two-cell "Bench"+"Log" split looked visually broken
// because the merged halves stretched the gap between the two words,
// and xlsx-js-style doesn't reliably write per-run rich text for a true
// two-colour single string. Single colour is the cleanest stable option.
const brandStyle = {
  font: { bold: true, color: { rgb: COLOR_TITLE_FG }, sz: 22, name: 'Calibri' },
  fill: { fgColor: { rgb: 'FFFFFF' } },
  alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
};
const subtitleStyle = {
  font: { bold: true, color: { rgb: COLOR_TITLE_FG }, sz: 12 },
  fill: { fgColor: { rgb: COLOR_TITLE_BG } },
  alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
};
const stampStyle = {
  font: { color: { rgb: '6E7C95' }, sz: 10, italic: true },
  fill: { fgColor: { rgb: COLOR_TITLE_BG } },
  alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
};

const dataCellStyle = (isZebra: boolean) => ({
  font: { color: { rgb: COLOR_TITLE_FG }, sz: 10 },
  fill: isZebra ? { fgColor: { rgb: COLOR_ZEBRA_BG } } : undefined,
  alignment: { vertical: 'center', horizontal: 'left' },
  border: {
    top:    { style: 'hair', color: { rgb: COLOR_GRID_BORDER } },
    bottom: { style: 'hair', color: { rgb: COLOR_GRID_BORDER } },
    left:   { style: 'hair', color: { rgb: COLOR_GRID_BORDER } },
    right:  { style: 'hair', color: { rgb: COLOR_GRID_BORDER } },
  },
});

/** Trigger an xlsx download with Cobalt-styled formatting. */
export function exportPinList(
  devices: readonly Device[],
  placements: readonly Placement[],
  wires: readonly Wire[],
  netLabels: readonly NetLabel[],
  projectName: string,
): void {
  const rows = buildPinListRows(devices, placements, wires, netLabels);
  const ncols = COLUMNS.length;
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  // ── Branded title block (rows 1–3) ─────────────────────────────────
  // Row 1: "BenchLog" wordmark — Bench in ink, Log in cobalt (rich text)
  // Row 2: "Pin list — <project name>"
  // Row 3: "Exported on <date> at <time>"
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  ws['A1'] = { t: 's', v: 'BenchLog', s: brandStyle };
  ws['A2'] = { t: 's', v: `Pin list — ${projectName || 'Wiring'}`, s: subtitleStyle };
  ws['A3'] = { t: 's', v: `Exported on ${dateStr} at ${timeStr}`, s: stampStyle };
  // Fill the trailing merged-cell columns so the three title rows render
  // as continuous bars across the sheet width.
  for (let c = 1; c < ncols; c++) {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: '', s: brandStyle };
    ws[XLSX.utils.encode_cell({ r: 1, c })] = { t: 's', v: '', s: subtitleStyle };
    ws[XLSX.utils.encode_cell({ r: 2, c })] = { t: 's', v: '', s: stampStyle };
  }

  // ── Header row (row 4) ─────────────────────────────────────────────
  const HEADER_ROW = 3; // 0-indexed
  COLUMNS.forEach((col, i) => {
    const addr = XLSX.utils.encode_cell({ r: HEADER_ROW, c: i });
    ws[addr] = { t: 's', v: col.header, s: headerStyle };
  });

  // ── Data rows (row 5+) ─────────────────────────────────────────────
  const DATA_START = HEADER_ROW + 1;
  rows.forEach((row, ri) => {
    const isZebra = ri % 2 === 1;
    const style = dataCellStyle(isZebra);
    COLUMNS.forEach((col, ci) => {
      const addr = XLSX.utils.encode_cell({ r: DATA_START + ri, c: ci });
      const raw = (row as unknown as Record<string, string | number>)[col.key];
      const isNumeric = col.key === 'lineId';
      ws[addr] = {
        t: isNumeric ? 'n' : 's',
        v: raw ?? '',
        s: style,
      };
    });
  });

  // Sheet metadata: ref range, merges for the three title rows, column
  // widths, auto-filter (data-only), freeze panes pinning header + brand.
  const lastRow = Math.max(HEADER_ROW, DATA_START + rows.length - 1);
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: ncols - 1 } });
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: ncols - 1 } },
  ];
  ws['!cols'] = COLUMNS.map(c => ({ wch: c.width }));
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: HEADER_ROW, c: 0 },
      e: { r: lastRow, c: ncols - 1 },
    }),
  };
  // Freeze the brand block + header so all four rows stay visible while
  // scrolling the data.
  ws['!freeze'] = {
    xSplit: '0', ySplit: String(DATA_START),
    topLeftCell: `A${DATA_START + 1}`,
    activePane: 'bottomLeft', state: 'frozen',
  };
  ws['!rows'] = [
    { hpt: 34 }, // brand wordmark
    { hpt: 22 }, // subtitle
    { hpt: 18 }, // export stamp
    { hpt: 22 }, // header row
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Pin list');

  const safeName = (projectName || 'wiring').replace(/[^A-Za-z0-9_-]+/g, '-');
  const fileDate = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `pin-list-${safeName}-${fileDate}.xlsx`);
}
