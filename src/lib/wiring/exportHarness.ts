import type { PlacedDevice, Wire, Bundle, HarnessGraph, HarnessNode, Orientation, Point } from './types';
import { isJunctionKey } from './types';
import {
  harnessBlockLayout, orderedLogicalConnectors,
  HARNESS_BLOCK_HEADER_H, HARNESS_BLOCK_COL_W, HARNESS_BLOCK_ROW_H,
  cableCurvePath, sampleCableCurve, tubeThickness, polylineMidpoint,
  computeNewBranchPointLabelAssignments, splitConnectorNodeId, DEFAULT_MM_PER_UNIT,
} from './harness';
import { getPinDesignator } from './layout';
import { escapeXml, titleBlockSvg, type ExportMetadata } from './export';

/**
 * Harness-view PDF/SVG export (2026-07).
 *
 * Mirrors the on-canvas harness renderer (`HarnessGraphView` +
 * `HarnessDeviceBlock`) as standalone SVG strings with concrete colours —
 * the same discipline the schematic exporter follows with `SymbolBlock`.
 * Geometry comes from the SAME helpers the canvas uses (`harnessBlockLayout`,
 * `cableCurvePath`, `tubeThickness`, `polylineMidpoint`), so the print can't
 * drift from the screen.
 */

/** What the user picked in the export dialog for harness pages. */
export interface HarnessRenderOptions {
  /** Show `Bundle.name` pills on cables that have one. */
  showCableNames: boolean;
  /** Show the conductor-count pill on every cable. */
  showConductorCounts: boolean;
  /** Cable length labels: none, only user-measured lengths, or measured
   *  plus geometric estimates (estimates render muted with a `~` prefix —
   *  useful for builders planning wire orders off the drawing). */
  lengthsMode: 'none' | 'defined' | 'all';
  /** The sheet's harness drawing scale (mm of cable per canvas unit). */
  mmPerUnit: number;
  /** Per-device connector row order (from `HarnessOverrides.connectorOrder`). */
  connectorOrder?: Record<string, string[]>;
  /** Persisted BP numbers (from `HarnessOverrides.branchPointLabels`).
   *  Branch points without an entry get ephemeral sequential numbers for
   *  this render only — a printed drawing with anonymous branch points
   *  would be useless at the bench. */
  branchPointLabels?: Record<string, number>;
}

const FG = '#111';
const BG = '#ffffff';
const MUTED = '#666';
const CABLE = '#8a8a8a';

/** Everything needed to render one sheet's harness page. */
export interface HarnessSheetRenderInput {
  graph: HarnessGraph;
  /** Placed devices ON THIS SHEET (block content: name, connectors, pins). */
  placedDevices: PlacedDevice[];
  options: HarnessRenderOptions;
  meta: ExportMetadata;
}

/** Effective per-node BP display label: persisted number when assigned,
 *  ephemeral sequential number otherwise (render-only, never persisted). */
function effectiveBpLabels(graph: HarnessGraph, persisted: Record<string, number>): Map<string, string> {
  const bpIds = graph.nodes.filter(n => n.kind === 'branchPoint').map(n => n.id);
  const merged = { ...persisted, ...computeNewBranchPointLabelAssignments(persisted, bpIds) };
  const out = new Map<string, string>();
  for (const id of bpIds) {
    const n = merged[id];
    if (n !== undefined) out.set(id, `BP${n}`);
  }
  return out;
}

/** Geometric cable length in mm along the rendered curve. Matches the
 *  canvas's estimate math (BundleLabels) — sampled curve polyline × scale. */
function geometricLengthMm(polyline: Point[], mmPerUnit: number): number {
  let units = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    units += Math.hypot(polyline[i + 1].x - polyline[i].x, polyline[i + 1].y - polyline[i].y);
  }
  return units * mmPerUnit;
}

/** One small label pill (rect + centred text) as SVG. */
function pillSvg(cx: number, cy: number, text: string, opts: { bold?: boolean; dark?: boolean; muted?: boolean } = {}): string {
  const w = Math.max(18, text.length * 6.2 + 8);
  const h = 12;
  const fill = opts.dark ? FG : BG;
  const textFill = opts.dark ? BG : (opts.muted ? MUTED : FG);
  return `<g>
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="#bbb" stroke-width="0.5"/>
    <text x="${cx}" y="${cy + 3}" font-size="9" text-anchor="middle" font-weight="${opts.bold ? 700 : 500}" fill="${textFill}">${escapeXml(text)}</text>
  </g>`;
}

/** Truncate a connector name to roughly one column pitch of 9px text —
 *  same rule as HarnessDeviceBlock's horizontal strip. */
function truncateLabel(name: string): string {
  const maxChars = Math.max(3, Math.floor(HARNESS_BLOCK_COL_W / 5) - 1);
  return name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
}

/** Small hexagonal connector port, centred on (cx, cy). */
function portHexSvg(cx: number, cy: number): string {
  const r = 4;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
  return `<polygon points="${pts}" fill="#eee" stroke="${FG}" stroke-width="1"/>`;
}

/** One harness device block — mirrors HarnessDeviceBlock's geometry. */
function deviceBlockSvg(placement: PlacedDevice, position: Point, orientation: Orientation, connectorOrder?: string[]): string {
  const layout = harnessBlockLayout(placement, orientation, connectorOrder);
  const { width, height, connectorEdge, headerEdge, localDocks } = layout;
  const horizontalStrip = connectorEdge === 'top' || connectorEdge === 'bottom';
  const headerY0 = headerEdge === 'top' ? 0 : height - HARNESS_BLOCK_HEADER_H;
  const headerBaseline = headerY0 + HARNESS_BLOCK_HEADER_H - 6;
  const headerDividerY = headerEdge === 'top' ? HARNESS_BLOCK_HEADER_H : height - HARNESS_BLOCK_HEADER_H;
  const orderedConns = orderedLogicalConnectors(placement, connectorOrder);

  const parts: string[] = [];
  parts.push(`<g transform="translate(${position.x} ${position.y})">`);
  parts.push(`<rect width="${width}" height="${height}" rx="6" fill="${BG}" stroke="${FG}" stroke-width="1"/>`);
  parts.push(`<text x="8" y="${headerBaseline}" font-size="12" font-weight="700" fill="${FG}">${escapeXml(placement.name)}</text>`);
  if (placement.productName) {
    parts.push(`<text x="${width - 8}" y="${headerBaseline}" font-size="10" fill="${MUTED}" text-anchor="end">${escapeXml(placement.productName)}</text>`);
  }
  parts.push(`<line x1="0" y1="${headerDividerY}" x2="${width}" y2="${headerDividerY}" stroke="#ccc" stroke-width="1"/>`);

  for (const lc of orderedConns) {
    const dock = localDocks.get(lc.name) ?? { x: 0, y: 0 };
    if (horizontalStrip) {
      const labelY = connectorEdge === 'top' ? dock.y + 14 : dock.y - 8;
      parts.push(`<text x="${dock.x}" y="${labelY}" font-size="9" fill="${FG}" text-anchor="middle">${escapeXml(truncateLabel(lc.name))}</text>`);
    } else {
      const textY = dock.y + HARNESS_BLOCK_ROW_H / 2 - 5;
      parts.push(`<text x="8" y="${textY}" font-size="11" fill="${FG}">${escapeXml(lc.name)}</text>`);
      parts.push(`<text x="${width - 8}" y="${textY}" font-size="10" fill="${MUTED}" text-anchor="end">[${lc.pinCount}]</text>`);
    }
    parts.push(portHexSvg(dock.x, dock.y));
  }
  parts.push(`</g>`);
  return parts.join('\n');
}

/**
 * Render one sheet's harness as a standalone SVG page string. Returns null
 * when the sheet has no cables to draw (no harness page is emitted for it).
 */
export function renderHarnessSvg(input: HarnessSheetRenderInput): string | null {
  const { graph, placedDevices, options, meta } = input;
  if (graph.bundles.length === 0) return null;

  const placementById = new Map(placedDevices.map(p => [p.id, p]));
  const bpLabels = effectiveBpLabels(graph, options.branchPointLabels ?? {});

  // ── Bounding box: nodes + component block extents + label headroom ──
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const n of graph.nodes) {
    acc(n.position.x, n.position.y);
    if (n.kind === 'component') {
      const placement = placementById.get(n.refId ?? n.id);
      if (placement) {
        const layout = harnessBlockLayout(placement, n.orientation ?? 0, options.connectorOrder?.[placement.id]);
        acc(n.position.x + layout.width, n.position.y + layout.height);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  const pad = 40;
  const titleBlockHeight = 80;
  const bbox = {
    x: minX - pad,
    y: minY - pad,
    width: (maxX - minX) + pad * 2,
    height: (maxY - minY) + pad * 2 + titleBlockHeight,
  };

  const nodeById = new Map<string, HarnessNode>(graph.nodes.map(n => [n.id, n]));
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}" width="${bbox.width}" height="${bbox.height}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">`);
  parts.push(`<rect x="${bbox.x}" y="${bbox.y}" width="${bbox.width}" height="${bbox.height}" fill="${BG}"/>`);

  // ── Cables (below nodes/blocks, matching canvas draw order) ──
  const labelParts: string[] = [];
  for (const b of graph.bundles) {
    const a = nodeById.get(b.endpoints[0]);
    const c = nodeById.get(b.endpoints[1]);
    if (!a || !c) continue;
    const waypoints = b.waypoints ?? [];
    const pathD = cableCurvePath(a.position, c.position, waypoints);
    const thickness = tubeThickness(b.conductors.length);
    parts.push(`<path d="${pathD}" fill="none" stroke="${CABLE}" stroke-width="${thickness}" stroke-linecap="round"/>`);

    // Label pills at the curve midpoint — same stacking as BundleLabels.
    const polyline = sampleCableCurve(a.position, c.position, waypoints);
    const mid = polylineMidpoint(polyline);
    const rows: string[] = [];
    if (options.showCableNames && b.name) rows.push('name');
    if (options.showConductorCounts) rows.push('count');
    const hasDefined = b.length !== undefined;
    const showLength = options.lengthsMode === 'all' || (options.lengthsMode === 'defined' && hasDefined);
    if (showLength) rows.push('length');
    const ROW_H = 14;
    let cy = mid.y - ((rows.length - 1) * ROW_H) / 2;
    for (const kind of rows) {
      if (kind === 'name') {
        labelParts.push(pillSvg(mid.x, cy, b.name!, { bold: true, dark: true }));
      } else if (kind === 'count') {
        labelParts.push(pillSvg(mid.x, cy, `${b.conductors.length}`));
      } else {
        const mm = hasDefined ? b.length! : geometricLengthMm(polyline, options.mmPerUnit);
        labelParts.push(pillSvg(mid.x, cy, `${hasDefined ? '' : '~'}${Math.round(mm)} mm`, { muted: !hasDefined }));
      }
      cy += ROW_H;
    }
  }
  parts.push(...labelParts);

  // ── Splice + branch-point markers ──
  for (const n of graph.nodes) {
    if (n.kind === 'splice') {
      parts.push(`<circle cx="${n.position.x}" cy="${n.position.y}" r="7" fill="${BG}" stroke="${MUTED}" stroke-width="2"/>`);
      parts.push(`<circle cx="${n.position.x}" cy="${n.position.y}" r="3" fill="${MUTED}"/>`);
    } else if (n.kind === 'branchPoint') {
      parts.push(`<circle cx="${n.position.x}" cy="${n.position.y}" r="5" fill="#999" stroke="${BG}" stroke-width="1.5"/>`);
      const label = bpLabels.get(n.id);
      if (label) {
        labelPillAboveRight(parts, n.position, label);
      }
    }
  }

  // ── Device blocks on top ──
  for (const n of graph.nodes) {
    if (n.kind !== 'component') continue;
    const placement = placementById.get(n.refId ?? n.id);
    if (!placement) continue;
    parts.push(deviceBlockSvg(placement, n.position, n.orientation ?? 0, options.connectorOrder?.[placement.id]));
  }

  parts.push(titleBlockSvg(bbox, titleBlockHeight, meta));
  parts.push(`</svg>`);
  return parts.join('\n');
}

/** The BP pill drawn above-right of a branch-point dot (canvas parity). */
function labelPillAboveRight(parts: string[], pos: Point, label: string): void {
  const pillW = Math.max(18, label.length * 6 + 6);
  const pillH = 12;
  const pillX = pos.x + 7;
  const pillY = pos.y - 12;
  parts.push(`<rect x="${pillX}" y="${pillY - pillH / 2}" width="${pillW}" height="${pillH}" rx="4" fill="${BG}" stroke="#ccc" stroke-width="0.5" opacity="0.95"/>`);
  parts.push(`<text x="${pillX + pillW / 2}" y="${pillY + 3.5}" font-size="8" text-anchor="middle" font-weight="600" fill="${MUTED}">${escapeXml(label)}</text>`);
}

// ── Cable summary (flow page) ────────────────────────────────────────

export interface CableSummarySheetInput {
  sheetName: string;
  graph: HarnessGraph;
  placedDevices: PlacedDevice[];
  wires: Wire[];
  mmPerUnit: number;
  branchPointLabels?: Record<string, number>;
}

/** Friendly endpoint description for the summary table:
 *  connector → "U3 · P1", splice → "Splice", branch point → "BP2". */
function endpointName(
  id: string,
  nodeById: Map<string, HarnessNode>,
  placementById: Map<string, PlacedDevice>,
  bpLabels: Map<string, string>,
): string {
  const n = nodeById.get(id);
  if (!n) return id;
  if (n.kind === 'splice') return 'Splice';
  if (n.kind === 'branchPoint') return bpLabels.get(id) ?? 'BP';
  const [placementId, connector] = splitConnectorNodeId(id);
  const placement = placementById.get(placementId);
  return placement ? `${placement.name} · ${connector}` : id;
}

/**
 * Build the cable-summary page: one table section per sheet, each row a
 * bundle — name, endpoints, conductor count, the wire labels it carries,
 * and its length (user-measured solid; otherwise the geometric estimate,
 * muted with `~`). A totals row sums lengths so the page doubles as a
 * rough wire-ordering figure. Returns null when no sheet has any bundles.
 */
export function buildCableSummaryHtml(
  sheets: CableSummarySheetInput[],
  meta: Omit<ExportMetadata, 'sheetName'>,
): string | null {
  const sections: string[] = [];
  let grandTotalMm = 0;
  let anyRows = false;

  for (const sheet of sheets) {
    if (sheet.graph.bundles.length === 0) continue;
    anyRows = true;
    const nodeById = new Map<string, HarnessNode>(sheet.graph.nodes.map(n => [n.id, n]));
    const placementById = new Map(sheet.placedDevices.map(p => [p.id, p]));
    const wireById = new Map(sheet.wires.map(w => [w.id, w]));
    const bpLabels = effectiveBpLabels(sheet.graph, sheet.branchPointLabels ?? {});

    let sheetTotalMm = 0;
    const rows: string[] = [];
    // Stable row order: named cables first (alphabetical), then by id.
    const ordered = [...sheet.graph.bundles].sort((a, b) => {
      if (!!a.name !== !!b.name) return a.name ? -1 : 1;
      if (a.name && b.name && a.name !== b.name) return a.name.localeCompare(b.name);
      return a.id.localeCompare(b.id);
    });
    for (const b of ordered) {
      const aN = nodeById.get(b.endpoints[0]);
      const cN = nodeById.get(b.endpoints[1]);
      if (!aN || !cN) continue;
      const polyline = sampleCableCurve(aN.position, cN.position, b.waypoints ?? []);
      const hasDefined = b.length !== undefined;
      const mm = hasDefined ? b.length! : geometricLengthMm(polyline, sheet.mmPerUnit);
      sheetTotalMm += mm;
      // Physical conductors: a two-point net label is one wire, listed
      // once, counted once — matching the canvas badge and the Inspector.
      const wireLabels = [...new Set(b.conductors
        .map(c => wireById.get(c.id)?.label)
        .filter((l): l is string => !!l))];
      rows.push(`<tr>
        <td>${b.name ? escapeXml(b.name) : '<span class="muted">—</span>'}</td>
        <td>${escapeXml(endpointName(b.endpoints[0], nodeById, placementById, bpLabels))}</td>
        <td>${escapeXml(endpointName(b.endpoints[1], nodeById, placementById, bpLabels))}</td>
        <td class="num">${b.conductors.length}</td>
        <td>${wireLabels.length > 0 ? escapeXml(wireLabels.join(', ')) : '<span class="muted">—</span>'}</td>
        <td class="num">${hasDefined ? `${Math.round(mm)} mm` : `<span class="muted">~${Math.round(mm)} mm</span>`}</td>
      </tr>`);
    }
    grandTotalMm += sheetTotalMm;
    sections.push(`<h2>${escapeXml(sheet.sheetName)}</h2>
      <table>
        <thead><tr><th>Cable</th><th>From</th><th>To</th><th>Cond.</th><th>Wires</th><th>Length</th></tr></thead>
        <tbody>${rows.join('\n')}</tbody>
        <tfoot><tr><td colspan="5">Total (measured + estimated)</td><td class="num">${formatLength(sheetTotalMm)}</td></tr></tfoot>
      </table>`);
  }

  if (!anyRows) return null;
  const grand = sections.length > 1
    ? `<h2>All sheets</h2><table><tfoot><tr><td>Grand total (measured + estimated)</td><td class="num" style="width:20%">${formatLength(grandTotalMm)}</td></tr></tfoot></table>`
    : '';
  return `<h1>${escapeXml(meta.projectName)} — Cable summary</h1>
    <p class="sub">Generated ${escapeXml(meta.date.slice(0, 10))} by BenchLog Wiring · lengths marked ~ are geometric estimates from the drawing scale</p>
    ${sections.join('\n')}
    ${grand}`;
}

function formatLength(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`;
}

// ── Wire summary (flow page) ─────────────────────────────────────────
//
// The cable summary above lists physical cable SEGMENTS. A single wire
// (conductor) can run through several of those — e.g. connector → splice
// → branch point → connector — so its real end-to-end length is the sum of
// every segment it crosses (`Bundle.conductorIds` already lists it on each,
// per deriveHarness §6). This table is the complement: one row per wire,
// its two schematic endpoints, and its total routed length.

/** Friendly pin reference for a wire endpoint key: "U3 · C1 · P4". Splice
 *  (junction) endpoints have no device, so they render as "Splice". */
function friendlyPinRef(pinKey: string, deviceIdToPlacement: Map<string, PlacedDevice>): string {
  if (isJunctionKey(pinKey)) return 'Splice';
  if (pinKey.startsWith('#')) return pinKey;
  const colon = pinKey.indexOf(':');
  if (colon < 0) return pinKey;
  const deviceId = pinKey.slice(0, colon);
  const pinId = pinKey.slice(colon + 1);
  const placement = deviceIdToPlacement.get(deviceId);
  if (!placement) return pinKey;
  const pin = placement.pinCatalog.find(p => p.id === pinId);
  const connector = pin?.logicalConnectorName ?? '?';
  return `${placement.name} · ${connector} · ${getPinDesignator(placement, pinId)}`;
}

/** Reorder a wire's crossed bundles into path order (endpoint → endpoint),
 *  purely for a readable "Via" column — a tree path's segment endpoints form
 *  a simple chain, so this just walks it. Falls back to input order if the
 *  set isn't a clean chain (shouldn't happen for a real routed wire). */
function orderPathSegments(segments: Bundle[]): Bundle[] {
  if (segments.length <= 1) return segments;
  const degree = new Map<string, number>();
  for (const b of segments) {
    degree.set(b.endpoints[0], (degree.get(b.endpoints[0]) ?? 0) + 1);
    degree.set(b.endpoints[1], (degree.get(b.endpoints[1]) ?? 0) + 1);
  }
  let start: string | undefined;
  for (const [node, d] of degree) { if (d === 1) { start = node; break; } }
  if (!start) return segments;
  const remaining = new Set(segments);
  const ordered: Bundle[] = [];
  let cur = start;
  while (remaining.size > 0) {
    const next = [...remaining].find(b => b.endpoints[0] === cur || b.endpoints[1] === cur);
    if (!next) break;
    ordered.push(next);
    remaining.delete(next);
    cur = next.endpoints[0] === cur ? next.endpoints[1] : next.endpoints[0];
  }
  return ordered.length === segments.length ? ordered : segments;
}

/** "Via" cell: direct runs show nothing, multi-segment runs show the named
 *  cables it passes through (or just a segment count when none are named). */
function viaLabel(segments: Bundle[]): string {
  if (segments.length <= 1) return '<span class="muted">—</span>';
  const named = segments.map(b => b.name).filter((n): n is string => !!n);
  if (named.length === segments.length) return escapeXml(named.join(' → '));
  return `<span class="muted">${segments.length} segments</span>`;
}

/**
 * Build the wire-summary page: one table section per sheet, each row one
 * wire (conductor) — its label (if set), from/to schematic endpoints, which
 * named cables it threads through, and its total end-to-end length (summed
 * across every bundle segment it crosses; muted `~` when any segment on its
 * route is unmeasured). Returns null when no sheet has any routed wires.
 */
export function buildWireSummaryHtml(
  sheets: CableSummarySheetInput[],
  meta: Omit<ExportMetadata, 'sheetName'>,
): string | null {
  const sections: string[] = [];
  let grandTotalMm = 0;
  let anyRows = false;

  for (const sheet of sheets) {
    if (sheet.graph.bundles.length === 0) continue;
    const wireIds = new Set<string>();
    for (const b of sheet.graph.bundles) for (const wid of b.conductorIds) wireIds.add(wid);
    if (wireIds.size === 0) continue;

    const nodeById = new Map<string, HarnessNode>(sheet.graph.nodes.map(n => [n.id, n]));
    const deviceIdToPlacement = new Map(sheet.placedDevices.map(p => [p.deviceId, p]));
    const wireById = new Map(sheet.wires.map(w => [w.id, w]));

    const orderedWires = [...wireIds]
      .map(wid => wireById.get(wid))
      .filter((w): w is Wire => !!w)
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '') || a.id.localeCompare(b.id));
    if (orderedWires.length === 0) continue;

    let sheetTotalMm = 0;
    const rows: string[] = [];
    for (const w of orderedWires) {
      const rawSegments = sheet.graph.bundles.filter(b => b.conductorIds.includes(w.id));
      if (rawSegments.length === 0) continue;
      const segments = orderPathSegments(rawSegments);
      let mm = 0;
      let anyEstimated = false;
      for (const b of segments) {
        const aN = nodeById.get(b.endpoints[0]);
        const cN = nodeById.get(b.endpoints[1]);
        if (!aN || !cN) continue;
        const hasDefined = b.length !== undefined;
        if (!hasDefined) anyEstimated = true;
        const polyline = sampleCableCurve(aN.position, cN.position, b.waypoints ?? []);
        mm += hasDefined ? b.length! : geometricLengthMm(polyline, sheet.mmPerUnit);
      }
      sheetTotalMm += mm;
      anyRows = true;
      rows.push(`<tr>
        <td>${w.label ? escapeXml(w.label) : '<span class="muted">—</span>'}</td>
        <td>${escapeXml(friendlyPinRef(w.fromPin, deviceIdToPlacement))}</td>
        <td>${escapeXml(friendlyPinRef(w.toPin, deviceIdToPlacement))}</td>
        <td>${viaLabel(segments)}</td>
        <td class="num">${anyEstimated ? `<span class="muted">~${Math.round(mm)} mm</span>` : `${Math.round(mm)} mm`}</td>
      </tr>`);
    }
    if (rows.length === 0) continue;
    grandTotalMm += sheetTotalMm;
    sections.push(`<h2>${escapeXml(sheet.sheetName)}</h2>
      <table>
        <thead><tr><th>Wire</th><th>From</th><th>To</th><th>Via</th><th>Length</th></tr></thead>
        <tbody>${rows.join('\n')}</tbody>
        <tfoot><tr><td colspan="4">Total (measured + estimated)</td><td class="num">${formatLength(sheetTotalMm)}</td></tr></tfoot>
      </table>`);
  }

  if (!anyRows) return null;
  const grand = sections.length > 1
    ? `<h2>All sheets</h2><table><tfoot><tr><td>Grand total (measured + estimated)</td><td class="num" style="width:20%">${formatLength(grandTotalMm)}</td></tr></tfoot></table>`
    : '';
  return `<h1>${escapeXml(meta.projectName)} — Wire summary</h1>
    <p class="sub">Generated ${escapeXml(meta.date.slice(0, 10))} by BenchLog Wiring · one row per wire, routed end-to-end through every cable segment it crosses · lengths marked ~ are geometric estimates from the drawing scale</p>
    ${sections.join('\n')}
    ${grand}`;
}

/** Re-export so the dialog/page can use one import site for scale default. */
export { DEFAULT_MM_PER_UNIT };
