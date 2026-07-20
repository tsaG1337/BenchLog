import type { PlacedDevice, Wire, Sheet, NetLabel, Point, Annotation, Shield } from './types';
import { isJunctionKey } from './types';
import { layoutDevice, computePinInfo } from './layout';
import { computePinWorldPos } from './layout';
import { computeWirePath, buildWirePath, computeEffectiveRouting, getWireEndpoints, resolveJunctionPos } from './wirePaths';
import { getSymbolDef, type SymbolDef } from './symbols';
import { colorForText } from '../../components/wiring/NetLabelView';
import { annotationPlainText } from '../../components/wiring/AnnotationEditor';

// ── Bounding-box computation ─────────────────────────────────────────
interface Box { x: number; y: number; width: number; height: number; }

/** Resolve a net-label's flag position to world coords. Mirrors the
 *  in-app NetLabelView logic — base anchor + drag offset, with support
 *  for pin / junction `attachedTo` keys. */
function labelFlagPos(
  label: NetLabel,
  placedDevices: PlacedDevice[],
): Point | null {
  const key = label.attachedTo;
  if (isJunctionKey(key)) {
    const pos = resolveJunctionPos(key);
    if (!pos) return null;
    return {
      x: pos.x + (label.offset?.dx ?? 0),
      y: pos.y + (label.offset?.dy ?? 0),
    };
  }
  const [deviceId, pinId] = key.split(':');
  const pd = placedDevices.find(p => p.deviceId === deviceId
    && p.connectors.some(c => c.pinIds.includes(pinId)));
  if (!pd) return null;
  const base = computePinWorldPos(pd, pinId);
  if (!base) return null;
  return {
    x: base.x + (label.offset?.dx ?? 0),
    y: base.y + (label.offset?.dy ?? 0),
  };
}

function labelOutwardDir(label: NetLabel, placedDevices: PlacedDevice[]): 'left' | 'right' | 'up' | 'down' {
  const rot = label.rotation;
  if (rot === 0)   return 'right';
  if (rot === 90)  return 'down';
  if (rot === 180) return 'left';
  if (rot === 270) return 'up';
  if (isJunctionKey(label.attachedTo)) return 'right';
  const [deviceId, pinId] = label.attachedTo.split(':');
  const pd = placedDevices.find(p => p.deviceId === deviceId
    && p.connectors.some(c => c.pinIds.includes(pinId)));
  if (!pd) return 'right';
  const info = computePinInfo(pd, pinId);
  return info?.outwardDir ?? 'right';
}

export function sheetBoundingBox(
  placedDevices: PlacedDevice[],
  wires: Wire[],
  netLabels: NetLabel[],
  annotations: Annotation[],
  shields: Shield[],
  sheetId: string,
): Box {
  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  const onSheet = (w: Wire) => w.sheetId === sheetId;
  const devicesOnSheet = placedDevices.filter(d => d.sheetId === sheetId);

  // Devices: use the symbol's own width/height for symbol devices (otherwise
  // layoutDevice overestimates — it assumes a connector-block layout).
  for (const d of devicesOnSheet) {
    const symDef = getSymbolDef(d.symbolType);
    const { width, height } = symDef
      ? { width: symDef.width, height: symDef.height }
      : layoutDevice(d);
    // account for pin stubs extending outside
    minX = Math.min(minX, d.position.x - 20);
    minY = Math.min(minY, d.position.y - 20);
    maxX = Math.max(maxX, d.position.x + width + 20);
    maxY = Math.max(maxY, d.position.y + height + 20);
  }

  // Wires: walk the FULL routed polyline, not just the endpoints. A wire
  // detoured around a device (auto-avoidance) or dragged by the user can
  // extend well past the endpoint box — endpoint-only bboxes clipped those
  // in exports. computeWirePath also resolves junction / net-label
  // endpoints, which the old per-pin lookup silently skipped.
  for (const w of wires.filter(onSheet)) {
    const pts = computeWirePath(placedDevices, w);
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  // Shields: stadium wraps its wires' ys at the shield's x-range, plus the
  // termination glyph hanging below (stem 12 + glyph ~14 + padding).
  for (const sh of shields.filter(s => s.sheetId === sheetId)) {
    const ext = shieldExtent(sh, wires, placedDevices);
    if (!ext) continue;
    minX = Math.min(minX, sh.xStart - 4);
    maxX = Math.max(maxX, sh.xEnd + 4);
    minY = Math.min(minY, ext.top - 4);
    maxY = Math.max(maxY, ext.glyphBottom + 4);
  }

  // Annotations — text + note markers contribute their own footprint.
  for (const a of annotations.filter(an => an.sheetId === sheetId)) {
    if (a.kind === 'text') {
      const fs = a.fontSize ?? 12;
      const lines = annotationPlainText(a.text).split(/\r?\n/);
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
      const w = Math.max(longest * fs * 0.55, 30);
      const h = lines.length * fs * 1.3 + 4;
      minX = Math.min(minX, a.position.x);
      minY = Math.min(minY, a.position.y - fs);
      maxX = Math.max(maxX, a.position.x + w);
      maxY = Math.max(maxY, a.position.y + h - fs);
    } else {
      const R = 14;
      const cx = a.position.x + R, cy = a.position.y + R;
      // Triangle bounds + text to the right.
      const textWidth = Math.max(a.text.length * 7, 0) + 12;
      minX = Math.min(minX, cx - R);
      minY = Math.min(minY, cy - R);
      maxX = Math.max(maxX, cx + R + textWidth);
      maxY = Math.max(maxY, cy + R);
    }
  }

  // Net labels — extend the bbox so dragged-away flags don't get clipped.
  // A label's bbox is approximately a 100×24 rect around its anchor in the
  // outward direction; we widen by that on each side conservatively.
  for (const lbl of netLabels.filter(n => n.sheetId === sheetId)) {
    const p = labelFlagPos(lbl, placedDevices);
    if (!p) continue;
    minX = Math.min(minX, p.x - 110);
    minY = Math.min(minY, p.y - 20);
    maxX = Math.max(maxX, p.x + 110);
    maxY = Math.max(maxY, p.y + 20);
  }

  if (!isFinite(minX)) return { x: 0, y: 0, width: 800, height: 600 };
  const pad = 30;
  return {
    x: minX - pad,
    y: minY - pad,
    width:  maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

// ── Shield geometry (mirrors ShieldBlock.tsx) ────────────────────────

/** Sample the wire's y at the given world x by walking its routed polyline.
 *  Port of ShieldBlock's sampleWireYAt — kept in sync so exported shields
 *  wrap the same wires at the same heights as the canvas. */
function sampleWireYAt(path: Point[], targetX: number): number | null {
  if (path.length < 2) return null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const xLo = Math.min(a.x, b.x), xHi = Math.max(a.x, b.x);
    if (targetX < xLo || targetX > xHi) continue;
    if (a.x === b.x) continue;
    const t = (targetX - a.x) / (b.x - a.x);
    return a.y + t * (b.y - a.y);
  }
  const first = path[0], last = path[path.length - 1];
  return Math.abs(targetX - first.x) <= Math.abs(targetX - last.x) ? first.y : last.y;
}

const SHIELD_PAD = 12;
const SHIELD_STEM = 12;

interface ShieldExtent { top: number; bottom: number; glyphBottom: number; midX: number; }

/** Vertical extent of a shield's stadium + its termination glyph. Returns
 *  null when none of the shield's wires resolve (all deleted). */
function shieldExtent(shield: Shield, wires: Wire[], placedDevices: PlacedDevice[]): ShieldExtent | null {
  const midX = (shield.xStart + shield.xEnd) / 2;
  const inShield = new Set(shield.wireIds);
  const ys: number[] = [];
  for (const w of wires) {
    if (!inShield.has(w.id)) continue;
    const path = computeWirePath(placedDevices, w);
    const y = sampleWireYAt(path, midX);
    if (y !== null) ys.push(y);
  }
  if (ys.length === 0) return null;
  const top = Math.min(...ys) - SHIELD_PAD;
  const bottom = Math.max(...ys) + SHIELD_PAD;
  // Glyph extends below the stem: ground = 3 bars (~6px), backshell =
  // triangle (12px), pin = circle (r 3.5 at stem+4). Use the max.
  const glyphBottom = shield.termination === 'float'
    ? bottom
    : bottom + SHIELD_STEM + 14;
  return { top, bottom, glyphBottom, midX };
}

/** Render one shield as standalone SVG: stadium outline + stem +
 *  termination glyph. Mirrors ShieldBlock.tsx with concrete colors. */
function renderShieldSvg(shield: Shield, wires: Wire[], placedDevices: PlacedDevice[]): string {
  const ext = shieldExtent(shield, wires, placedDevices);
  if (!ext) return '';
  const { top, bottom, midX } = ext;
  const xStart = shield.xStart, xEnd = shield.xEnd;
  const width = xEnd - xStart;
  const height = bottom - top;
  const r = Math.max(2, Math.min(width / 2, height / 2));
  const straightTop = top + r;
  const straightBottom = bottom - r;
  const stadiumPath =
    `M ${xStart} ${straightTop} ` +
    `A ${r} ${r} 0 0 1 ${xEnd} ${straightTop} ` +
    `L ${xEnd} ${straightBottom} ` +
    `A ${r} ${r} 0 0 1 ${xStart} ${straightBottom} ` +
    `Z`;
  const out: string[] = [];
  out.push(`<path d="${stadiumPath}" fill="none" stroke="#111" stroke-width="1"/>`);
  const stemTop = bottom;
  const stemBottom = stemTop + SHIELD_STEM;
  if (shield.termination !== 'float') {
    out.push(`<line x1="${midX}" y1="${stemTop}" x2="${midX}" y2="${stemBottom}" stroke="#111" stroke-width="1"/>`);
  }
  if (shield.termination === 'ground') {
    out.push(`<line x1="${midX - 8}" y1="${stemBottom}" x2="${midX + 8}" y2="${stemBottom}" stroke="#111" stroke-width="1"/>`);
    out.push(`<line x1="${midX - 5}" y1="${stemBottom + 3}" x2="${midX + 5}" y2="${stemBottom + 3}" stroke="#111" stroke-width="1"/>`);
    out.push(`<line x1="${midX - 2}" y1="${stemBottom + 6}" x2="${midX + 2}" y2="${stemBottom + 6}" stroke="#111" stroke-width="1"/>`);
  } else if (shield.termination === 'backshell') {
    const half = 7, triHeight = 12;
    out.push(`<path d="M ${midX - half} ${stemBottom} L ${midX + half} ${stemBottom} L ${midX} ${stemBottom + triHeight} Z" fill="#ffffff" stroke="#111" stroke-width="1"/>`);
    out.push(`<text x="${midX}" y="${stemBottom + 6}" font-size="9" font-weight="700" text-anchor="middle" fill="#111">S</text>`);
  } else if (shield.termination === 'pin') {
    out.push(`<circle cx="${midX}" cy="${stemBottom + 4}" r="3.5" fill="#ffffff" stroke="#111" stroke-width="1"/>`);
  }
  return out.join('\n');
}

// ── SVG emitter ──────────────────────────────────────────────────────
// Produces a standalone SVG string that can be downloaded, opened in a
// browser, imported into Illustrator, or embedded elsewhere. Uses the same
// layout algorithm the canvas uses, so output matches the screen.

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export interface ExportMetadata {
  projectName: string;
  sheetName: string;
  date: string;           // ISO
  revision?: string;
}

export function renderSheetSvg(
  placedDevices: PlacedDevice[],
  wires: Wire[],
  netLabels: NetLabel[],
  annotations: Annotation[],
  shields: Shield[],
  sheet: Sheet,
  meta: ExportMetadata,
): string {
  const bbox = sheetBoundingBox(placedDevices, wires, netLabels, annotations, shields, sheet.id);
  // Add space below for the title block.
  const titleBlockHeight = 80;
  bbox.height += titleBlockHeight;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}" width="${bbox.width}" height="${bbox.height}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">`);

  // White background
  parts.push(`<rect x="${bbox.x}" y="${bbox.y}" width="${bbox.width}" height="${bbox.height}" fill="#ffffff"/>`);

  // Wires first (render below devices). buildWirePath is the SAME path
  // generator the on-canvas <Wire> uses — including the hop arcs where a
  // horizontal run crosses another wire's vertical (the "not connected"
  // bumps). Using anything simpler here is what made old exports diverge
  // from the editor.
  const wiresOnSheet = wires.filter(w => w.sheetId === sheet.id);
  const wireLabelParts: string[] = [];
  for (const w of wiresOnSheet) {
    const d = buildWirePath(placedDevices, w, wiresOnSheet);
    if (!d) continue;
    const stroke = w.color === 'currentColor' ? '#111' : w.color;
    parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`);
    // Stripe overlay — dashed second stroke, same as the editor.
    if (w.stripeColor) {
      parts.push(`<path d="${d}" fill="none" stroke="${w.stripeColor}" stroke-width="1.5" stroke-dasharray="7 7"/>`);
    }
    // Junction dots — filled circles anywhere the wire terminates on a
    // junction, so T-taps read as connected (complement of the hops).
    const ends = getWireEndpoints(placedDevices, w);
    if (ends) {
      if (isJunctionKey(w.fromPin)) {
        parts.push(`<circle cx="${ends.from.x}" cy="${ends.from.y}" r="3.5" fill="#111"/>`);
      }
      if (isJunctionKey(w.toPin)) {
        parts.push(`<circle cx="${ends.to.x}" cy="${ends.to.y}" r="3.5" fill="#111"/>`);
      }
    }
    if (w.label && w.showLabel) {
      // Default label position/rotation mirror Wire.tsx exactly: anchored on
      // the middle vertical (computeEffectiveRouting), rotated 90° when that
      // vertical is long enough and the user hasn't dragged the label.
      const eff = computeEffectiveRouting(placedDevices, w);
      const labelX = w.labelX ?? eff.midX;
      const labelY = w.labelY ?? (eff.fromY + eff.toY) / 2;
      const middleVertLength = Math.abs(eff.fromY - eff.toY);
      const labelAtDefault = w.labelX === undefined && w.labelY === undefined;
      const autoRot = (labelAtDefault && middleVertLength > 10) ? 90 : 0;
      const rot = w.labelRotation ?? autoRot;
      const labelWidth = Math.max(w.label.length * 6 + 8, 20);
      // Label backing rect (editor has one too) — without it the label text
      // sits directly on the wire stroke and is illegible in print.
      // Collected separately and emitted AFTER all wires so a label never
      // ends up underneath a later wire's stroke.
      wireLabelParts.push(`<g${rot ? ` transform="rotate(${rot} ${labelX} ${labelY})"` : ''}>`);
      wireLabelParts.push(`<rect x="${labelX - labelWidth / 2}" y="${labelY - 8}" width="${labelWidth}" height="16" rx="2" fill="#ffffff" opacity="0.9"/>`);
      wireLabelParts.push(`<text x="${labelX}" y="${labelY}" font-size="10" text-anchor="middle" dominant-baseline="middle" fill="#111">${escapeXml(w.label)}</text>`);
      wireLabelParts.push(`</g>`);
    }
  }
  parts.push(...wireLabelParts);

  // Shields — stadium outline + termination glyph over their wire bundles.
  for (const sh of shields.filter(s => s.sheetId === sheet.id)) {
    const svg = renderShieldSvg(sh, wires, placedDevices);
    if (svg) parts.push(svg);
  }

  // Devices on this sheet only
  const devicesOnSheet = placedDevices.filter(d => d.sheetId === sheet.id);
  for (const d of devicesOnSheet) {
    const dx = d.position.x, dy = d.position.y;

    // Schematic-symbol devices render as their symbol, not as a generic box.
    if (d.symbolType) {
      const def = getSymbolDef(d.symbolType);
      if (def) {
        parts.push(`<g transform="translate(${dx} ${dy})">`);
        parts.push(renderSymbolBody(d, def));
        parts.push(`</g>`);
        continue;
      }
    }

    const { width, height, connectors: connLayout } = layoutDevice(d);

    // Device body
    parts.push(`<g transform="translate(${dx} ${dy})">`);
    parts.push(`<rect width="${width}" height="${height}" rx="4" fill="#ffffff" stroke="#111" stroke-width="1"/>`);
    parts.push(`<rect width="${width}" height="30" rx="4" fill="#f3f4f6"/>`);
    parts.push(`<text x="10" y="19" font-size="12" font-weight="700" fill="#111">${escapeXml(d.name)}</text>`);

    // Connectors
    for (const c of d.connectors) {
      const l = connLayout.get(c.id);
      if (!l) continue;
      parts.push(`<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="2" fill="#fafafa" stroke="#888" stroke-width="0.75"/>`);
      const isHoriz = c.side === 'top' || c.side === 'bottom';
      const headerRect = isHoriz
        ? (c.side === 'top'
            ? { x: l.x, y: l.y + l.height - 14, w: l.width, h: 14 }
            : { x: l.x, y: l.y, w: l.width, h: 14 })
        : { x: l.x, y: l.y, w: l.width, h: 14 };
      parts.push(`<rect x="${headerRect.x}" y="${headerRect.y}" width="${headerRect.w}" height="${headerRect.h}" fill="#e5e7eb"/>`);
      // Display name + muted physical-connector hint, so exports match the
      // on-canvas header which appends "(J1001)" etc. when a custom display
      // name hides the electrical identity.
      {
        const showPhys = c.logicalConnectorName
          && c.logicalConnectorName !== c.name
          && !c.name.includes(c.logicalConnectorName);
        const hint = showPhys
          ? `<tspan dx="4" font-weight="400" fill="#6b7280">(${escapeXml(c.logicalConnectorName)})</tspan>`
          : '';
        parts.push(`<text x="${headerRect.x + headerRect.w / 2}" y="${headerRect.y + headerRect.h / 2 + 3}" font-size="9" font-weight="600" text-anchor="middle" fill="#111">${escapeXml(c.name)}${hint}</text>`);
      }

      // Pin name labels
      for (const lbl of l.pinLabels) {
        const rot = isHoriz ? ` transform="rotate(-90 ${lbl.x} ${lbl.y})"` : '';
        const anchor = isHoriz ? 'start' : lbl.anchor;
        parts.push(`<text x="${lbl.x}" y="${lbl.y}" font-size="9" text-anchor="${anchor}" fill="#111"${rot}>${escapeXml(lbl.name)}</text>`);
      }

      // Pin stubs + circles
      for (const pp of l.pinPositions) {
        let rx = pp.x, ry = pp.y;
        switch (l.outwardDir) {
          case 'left':  rx = pp.x + 14; break;
          case 'right': rx = pp.x - 14; break;
          case 'up':    ry = pp.y + 14; break;
          case 'down':  ry = pp.y - 14; break;
        }
        parts.push(`<line x1="${rx}" y1="${ry}" x2="${pp.x}" y2="${pp.y}" stroke="#111" stroke-width="1"/>`);
        parts.push(`<circle cx="${pp.x}" cy="${pp.y}" r="3" fill="#ffffff" stroke="#111" stroke-width="1.25"/>`);
        const pin = d.pinCatalog.find(p => p.id === pp.pinId);
        if (pin?.pinNumber) {
          const midx = (rx + pp.x) / 2;
          const midy = (ry + pp.y) / 2;
          const horizontal = l.outwardDir === 'left' || l.outwardDir === 'right';
          const rot = horizontal ? '' : ` transform="rotate(-90 ${midx} ${midy})"`;
          parts.push(`<text x="${midx}" y="${horizontal ? midy - 3 : midy}" font-size="8" text-anchor="middle" fill="#666"${rot}>${escapeXml(pin.pinNumber)}</text>`);
        }
      }
    }

    parts.push(`</g>`);
  }

  // Net labels — pentagon flag pointing at the anchor, body extends in the
  // outward direction. Mirrors NetLabelView so exports match what the user
  // sees on the canvas.
  const labelsOnSheet = netLabels.filter(l => l.sheetId === sheet.id);
  for (const lbl of labelsOnSheet) {
    const pos = labelFlagPos(lbl, placedDevices);
    if (!pos) continue;
    const dir = labelOutwardDir(lbl, placedDevices);
    const fill = lbl.color ?? colorForText(lbl.text);
    const textWidth = Math.max(lbl.text.length * 7 + 8, 24);
    const boxH = 18;
    const stubGap = 4;
    const tipDepth = 6;

    let pathD: string;
    let textX: number, textY: number;
    if (dir === 'left' || dir === 'right') {
      const sign = dir === 'right' ? 1 : -1;
      const tipX = pos.x + sign * stubGap;
      const tipY = pos.y;
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
      const tipX = pos.x;
      const tipY = pos.y + sign * stubGap;
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
    parts.push(`<path d="${pathD}" fill="${fill}" opacity="0.85"/>`);
    parts.push(`<text x="${textX}" y="${textY}" font-size="11" font-weight="700" text-anchor="middle" fill="#ffffff">${escapeXml(lbl.text)}</text>`);
    // Small connection dot at the anchor — visually marks the attachment.
    parts.push(`<circle cx="${pos.x}" cy="${pos.y}" r="2.5" fill="#fff" stroke="#111" stroke-width="1"/>`);
  }

  // Annotations — free text + numbered note triangles.
  const annotationsOnSheet = annotations.filter(a => a.sheetId === sheet.id);
  for (const a of annotationsOnSheet) {
    if (a.kind === 'text') {
      const fs = a.fontSize ?? 12;
      const lines = annotationPlainText(a.text).split(/\r?\n/);
      const lineHeight = fs * 1.3;
      const tspans = lines.map((line, i) =>
        `<tspan x="${a.position.x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line || ' ')}</tspan>`
      ).join('');
      parts.push(`<text x="${a.position.x}" y="${a.position.y}" font-size="${fs}" fill="#111">${tspans}</text>`);
    } else {
      const R = 14;
      const cx = a.position.x + R, cy = a.position.y + R;
      const v0 = `${cx},${cy - R}`;
      const v1 = `${cx - R * 0.9},${cy + R * 0.7}`;
      const v2 = `${cx + R * 0.9},${cy + R * 0.7}`;
      parts.push(`<path d="M ${v0} L ${v1} L ${v2} Z" fill="#ffffff" stroke="#111" stroke-width="1.2"/>`);
      parts.push(`<text x="${cx}" y="${cy + 4}" font-size="12" font-weight="700" text-anchor="middle" fill="#111">${a.number}</text>`);
      const plain = annotationPlainText(a.text);
      if (plain) {
        parts.push(`<text x="${cx + R * 0.9 + 8}" y="${cy + 4}" font-size="11" fill="#111">${escapeXml(plain)}</text>`);
      }
    }
  }

  // Title block at the bottom
  const tbX = bbox.x + 10;
  const tbY = bbox.y + bbox.height - titleBlockHeight + 10;
  const tbW = bbox.width - 20;
  const tbH = titleBlockHeight - 20;
  parts.push(`<rect x="${tbX}" y="${tbY}" width="${tbW}" height="${tbH}" fill="#fff" stroke="#111" stroke-width="0.5"/>`);
  parts.push(`<line x1="${tbX + tbW * 0.5}" y1="${tbY}" x2="${tbX + tbW * 0.5}" y2="${tbY + tbH}" stroke="#111" stroke-width="0.5"/>`);
  parts.push(`<line x1="${tbX + tbW * 0.75}" y1="${tbY}" x2="${tbX + tbW * 0.75}" y2="${tbY + tbH}" stroke="#111" stroke-width="0.5"/>`);

  const tbTextY = tbY + 16;
  parts.push(`<text x="${tbX + 8}" y="${tbTextY}" font-size="9" fill="#666">PROJECT</text>`);
  parts.push(`<text x="${tbX + 8}" y="${tbTextY + 14}" font-size="13" font-weight="700" fill="#111">${escapeXml(meta.projectName)}</text>`);
  parts.push(`<text x="${tbX + 8}" y="${tbTextY + 32}" font-size="9" fill="#666">SHEET — ${escapeXml(meta.sheetName)}</text>`);

  parts.push(`<text x="${tbX + tbW * 0.5 + 8}" y="${tbTextY}" font-size="9" fill="#666">DATE</text>`);
  parts.push(`<text x="${tbX + tbW * 0.5 + 8}" y="${tbTextY + 14}" font-size="11" fill="#111">${escapeXml(meta.date.slice(0, 10))}</text>`);
  parts.push(`<text x="${tbX + tbW * 0.5 + 8}" y="${tbTextY + 32}" font-size="9" fill="#666">Generated by BenchLog Wiring</text>`);

  parts.push(`<text x="${tbX + tbW * 0.75 + 8}" y="${tbTextY}" font-size="9" fill="#666">REV</text>`);
  parts.push(`<text x="${tbX + tbW * 0.75 + 8}" y="${tbTextY + 14}" font-size="13" font-weight="700" fill="#111">${escapeXml(meta.revision ?? '—')}</text>`);

  parts.push(`</svg>`);
  return parts.join('\n');
}

// ── Symbol rendering (SVG strings) ───────────────────────────────────
// Mirrors SymbolBlock.tsx but emits standalone SVG strings. CSS vars aren't
// available inside an exported file, so we use concrete hex values.
const FG = '#111';
const BG = '#ffffff';
const MUTED = '#666';

function symbolPinsSvg(device: PlacedDevice, def: SymbolDef): string {
  const out: string[] = [];
  for (const sp of def.pins) {
    const pin = device.pinCatalog[sp.index];
    if (!pin) continue;
    // Stub extends outward from the body (pin tip sits PIN_STUB_LENGTH past
    // the body edge in the outward direction).
    let sx = sp.tipX, sy = sp.tipY;
    switch (sp.outwardDir) {
      case 'left':  sx = sp.tipX + 10; break;
      case 'right': sx = sp.tipX - 10; break;
      case 'up':    sy = sp.tipY + 10; break;
      case 'down':  sy = sp.tipY - 10; break;
    }
    out.push(`<line x1="${sx}" y1="${sy}" x2="${sp.tipX}" y2="${sp.tipY}" stroke="${FG}" stroke-width="1"/>`);
    out.push(`<circle cx="${sp.tipX}" cy="${sp.tipY}" r="3" fill="${BG}" stroke="${FG}" stroke-width="1.25"/>`);
  }
  return out.join('');
}

function headerLabel(device: PlacedDevice, width: number, fontSize = 11): string {
  return `<text x="${width / 2}" y="-2" font-size="${fontSize}" font-weight="600" text-anchor="middle" fill="${FG}">${escapeXml(device.name)}</text>`;
}

function belowLabel(text: string, width: number, height: number): string {
  if (!text) return '';
  return `<text x="${width / 2}" y="${height + 2}" font-size="10" text-anchor="middle" dominant-baseline="hanging" fill="${FG}">${escapeXml(text)}</text>`;
}

function renderSymbolBody(device: PlacedDevice, def: SymbolDef): string {
  const pins = symbolPinsSvg(device, def);
  switch (def.type) {
    case 'ground': {
      const cx = def.width / 2;
      return `
        <line x1="${cx}" y1="0" x2="${cx}" y2="8"  stroke="${FG}" stroke-width="1.2"/>
        <line x1="${cx - 14}" y1="8"  x2="${cx + 14}" y2="8"  stroke="${FG}" stroke-width="1.5"/>
        <line x1="${cx - 10}" y1="14" x2="${cx + 10}" y2="14" stroke="${FG}" stroke-width="1.5"/>
        <line x1="${cx - 6}"  y1="20" x2="${cx + 6}"  y2="20" stroke="${FG}" stroke-width="1.5"/>
        ${pins}`;
    }
    case 'breaker': {
      const rating = device.attributes?.rating ?? '';
      const cy = 18;
      const leftX = 10, rightX = def.width - 10;
      const arcR = (rightX - leftX) / 2;
      const peakY = cy - arcR;
      const buttonY = Math.max(peakY - 3, 1);
      const buttonHalfW = 4;
      return `
        <line x1="0" y1="${cy}" x2="${leftX}" y2="${cy}" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${def.width}" y1="${cy}" x2="${rightX}" y2="${cy}" stroke="${FG}" stroke-width="1.2"/>
        <circle cx="${leftX}"  cy="${cy}" r="2.5" fill="${FG}" stroke="${FG}" stroke-width="1"/>
        <circle cx="${rightX}" cy="${cy}" r="2.5" fill="${FG}" stroke="${FG}" stroke-width="1"/>
        <path d="M ${leftX} ${cy} A ${arcR} ${arcR} 0 0 1 ${rightX} ${cy}" fill="none" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${def.width / 2}" y1="${peakY}" x2="${def.width / 2}" y2="${buttonY}" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${def.width / 2 - buttonHalfW}" y1="${buttonY}" x2="${def.width / 2 + buttonHalfW}" y2="${buttonY}" stroke="${FG}" stroke-width="1.6"/>
        ${headerLabel(device, def.width, 10)}
        ${belowLabel(rating, def.width, def.height)}
        ${pins}`;
    }
    case 'resistor': {
      const value = device.attributes?.value ?? '';
      const bodyX = 10, bodyW = def.width - 20;
      return `
        <line x1="0" y1="10" x2="${bodyX}" y2="10" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${bodyX + bodyW}" y1="10" x2="${def.width}" y2="10" stroke="${FG}" stroke-width="1.2"/>
        <rect x="${bodyX}" y="4" width="${bodyW}" height="12" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
        ${headerLabel(device, def.width, 10)}
        ${belowLabel(value, def.width, def.height)}
        ${pins}`;
    }
    case 'capacitor':
    case 'capacitor-polar': {
      const polar = def.type === 'capacitor-polar';
      const value = device.attributes?.value ?? '';
      const cx = def.width / 2, cy = def.height / 2;
      const lX = cx - 4, rX = cx + 4, ph = 9;
      const rightPlate = polar
        ? `<path d="M ${rX} ${cy - ph} Q ${rX + 5} ${cy} ${rX} ${cy + ph}" fill="none" stroke="${FG}" stroke-width="1.5"/>`
        : `<line x1="${rX}" y1="${cy - ph}" x2="${rX}" y2="${cy + ph}" stroke="${FG}" stroke-width="1.5"/>`;
      const plus = polar
        ? `<text x="${lX - 5}" y="${cy - ph - 1}" font-size="10" font-weight="700" text-anchor="end" fill="${FG}">+</text>`
        : '';
      return `
        <line x1="0"  y1="${cy}" x2="${lX}" y2="${cy}" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${rX}" y1="${cy}" x2="${def.width}" y2="${cy}" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${lX}" y1="${cy - ph}" x2="${lX}" y2="${cy + ph}" stroke="${FG}" stroke-width="1.5"/>
        ${rightPlate}
        ${plus}
        ${headerLabel(device, def.width, 10)}
        ${belowLabel(value, def.width, def.height)}
        ${pins}`;
    }
    case 'switch-spst': {
      const y = def.height / 2;
      const lX = 10, rX = def.width - 10;
      return `
        ${headerLabel(device, def.width)}
        ${spstContactSvg(lX, rX, y, def.width)}
        ${pins}`;
    }
    case 'switch-spdt': {
      const commonX = 10, rX = def.width - 10;
      const commonY = 25, noY = 10, ncY = 40;
      return `
        ${headerLabel(device, def.width)}
        ${spdtContactSvg(commonX, rX, commonY, noY, ncY, def.width)}
        <text x="${rX - 4}" y="${noY - 4}" font-size="7" text-anchor="end" fill="${MUTED}">NO</text>
        <text x="${rX - 4}" y="${ncY + 10}" font-size="7" text-anchor="end" fill="${MUTED}">NC</text>
        ${pins}`;
    }
    case 'switch-dpst': {
      const lX = 10, rX = def.width - 10;
      const y1 = 15, y2 = 45;
      const linkX = (lX + rX - 3) / 2;
      return `
        ${headerLabel(device, def.width)}
        ${spstContactSvg(lX, rX, y1, def.width)}
        ${spstContactSvg(lX, rX, y2, def.width)}
        <line x1="${linkX}" y1="${y1 - 6}" x2="${linkX}" y2="${y2 - 6}" stroke="${FG}" stroke-width="0.9" stroke-dasharray="3 2"/>
        ${pins}`;
    }
    case 'switch-dpdt': {
      const commonX = 10, rX = def.width - 10;
      const u = { commonY: 25, noY: 10, ncY: 40 };
      const l = { commonY: 75, noY: 60, ncY: 90 };
      const linkX = (commonX + rX - 3) / 2;
      const upperLinkY = (u.commonY + u.ncY - 2) / 2;
      const lowerLinkY = (l.commonY + l.ncY - 2) / 2;
      return `
        ${headerLabel(device, def.width)}
        ${spdtContactSvg(commonX, rX, u.commonY, u.noY, u.ncY, def.width)}
        ${spdtContactSvg(commonX, rX, l.commonY, l.noY, l.ncY, def.width)}
        <line x1="${linkX}" y1="${upperLinkY}" x2="${linkX}" y2="${lowerLinkY}" stroke="${FG}" stroke-width="0.9" stroke-dasharray="3 2"/>
        ${pins}`;
    }
    case 'diode':          return diodeSvg(device, def, 'junction', pins);
    case 'diode-zener':    return diodeSvg(device, def, 'zener',    pins);
    case 'diode-schottky': return diodeSvg(device, def, 'schottky', pins);
    case 'diode-led':      return diodeSvg(device, def, 'led',      pins);
    case 'switch-momentary':
    case 'switch-momentary-nc': {
      const isNC = def.type === 'switch-momentary-nc';
      const termY = 22, capY = 2;
      const leftX = 10, rightX = def.width - 10;
      const cx = def.width / 2;
      const barLeftX = leftX - 2, barRightX = rightX + 2;
      const capHalfW = 9;
      // NC's bar sits BELOW the contacts (legs reach UP to terminals);
      // NO's bar sits above with an air gap.
      const barY = isNC ? 28 : 10;
      const stemBottomY = isNC ? termY - 2 : barY;
      const ncLegs = isNC ? `
        <line x1="${leftX}"  y1="${termY}" x2="${leftX}"  y2="${barY}" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${rightX}" y1="${termY}" x2="${rightX}" y2="${barY}" stroke="${FG}" stroke-width="1.2"/>` : '';
      return `
        ${headerLabel(device, def.width)}
        <line x1="0" y1="${termY}" x2="${leftX}" y2="${termY}" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${rightX}" y1="${termY}" x2="${def.width}" y2="${termY}" stroke="${FG}" stroke-width="1.2"/>
        <circle cx="${leftX}"  cy="${termY}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
        <circle cx="${rightX}" cy="${termY}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${barLeftX}" y1="${barY}" x2="${barRightX}" y2="${barY}" stroke="${FG}" stroke-width="1.4"/>
        ${ncLegs}
        <line x1="${cx - capHalfW}" y1="${capY}" x2="${cx + capHalfW}" y2="${capY}" stroke="${FG}" stroke-width="1.6"/>
        <line x1="${cx}" y1="${capY}" x2="${cx}" y2="${stemBottomY}" stroke="${FG}" stroke-width="1.2"/>
        ${pins}`;
    }
    case 'thermocouple':
    case 'thermocouple-polar': {
      const polar = def.type === 'thermocouple-polar';
      const type = device.attributes?.type ?? '';
      const jx = def.width - 18, jy = def.height / 2;
      const polarMarks = polar
        ? `<text x="-3" y="8" font-size="10" font-weight="700" text-anchor="end" fill="${FG}">−</text>
           <text x="-3" y="38" font-size="10" font-weight="700" text-anchor="end" fill="${FG}">+</text>`
        : '';
      return `
        <line x1="0" y1="10" x2="${jx}" y2="${jy}" stroke="${FG}" stroke-width="1.4"/>
        <line x1="0" y1="30" x2="${jx}" y2="${jy}" stroke="${FG}" stroke-width="1.4"/>
        <circle cx="${jx}" cy="${jy}" r="3" fill="${FG}" stroke="${FG}" stroke-width="1"/>
        <line x1="${jx}" y1="${jy}" x2="${def.width}" y2="${jy}" stroke="${FG}" stroke-width="1" stroke-dasharray="2 2"/>
        ${polarMarks}
        ${headerLabel(device, def.width, 10)}
        ${belowLabel(type ? `Type ${type}` : '', def.width, def.height)}
        ${pins}`;
    }
    case 'solenoid-spst':
    case 'solenoid-spdt':
    case 'solenoid-dpst':
    case 'solenoid-dpdt': {
      // Shared coil geometry for all four variants. Drawn as a vertical
      // backing line + a continuous path of right-bulging half-circle humps
      // (IEC-style spring-coil symbol). coilRightX is the visual right edge
      // of the humps; the mechanical linkage anchors there.
      const coilLeftX   = 12;
      const coilTopY    = 25, coilBottomY = 75;
      const coilMidY    = (coilTopY + coilBottomY) / 2;
      const humpCount   = 4;
      const humpHeight  = (coilBottomY - coilTopY) / humpCount;
      const humpRadius  = humpHeight / 2;
      const coilRightX  = coilLeftX + humpRadius;
      const topEdgeY    = 10, bottomEdgeY = 90;
      const armMidY     = (topEdgeY + bottomEdgeY) / 2;

      const coilStubs = `
        <line x1="0" y1="30" x2="${coilLeftX}" y2="${coilTopY}"    stroke="${FG}" stroke-width="1.2"/>
        <line x1="0" y1="70" x2="${coilLeftX}" y2="${coilBottomY}" stroke="${FG}" stroke-width="1.2"/>`;

      const coilBackingLine = `
        <line x1="${coilLeftX}" y1="${coilTopY}" x2="${coilLeftX}" y2="${coilBottomY}"
              stroke="${FG}" stroke-width="1.2"/>`;

      let coilHumpsPath = `M ${coilLeftX} ${coilTopY}`;
      for (let i = 0; i < humpCount; i++) {
        const yEnd = coilTopY + (i + 1) * humpHeight;
        coilHumpsPath += ` A ${humpRadius} ${humpRadius} 0 0 1 ${coilLeftX} ${yEnd}`;
      }
      const coilBox = `
        ${coilBackingLine}
        <path d="${coilHumpsPath}" fill="none" stroke="${FG}" stroke-width="1.2"/>`;
      const humps = ''; // humps are now part of coilBox; variable kept for template shape

      // Per-cell SVG helpers — mirror SpstCell / SpdtCell in SymbolBlock.
      const spstCell = (colX: number) => {
        const armEndX = colX + 6, armEndY = topEdgeY + 10;
        return `
          <circle cx="${colX}" cy="${topEdgeY}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
          <circle cx="${colX}" cy="${bottomEdgeY}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
          <line x1="${colX}" y1="${bottomEdgeY}" x2="${armEndX}" y2="${armEndY}" stroke="${FG}" stroke-width="1.4"/>`;
      };
      const spdtCell = (commonX: number, throwLX: number, throwRX: number) => `
        <circle cx="${throwLX}" cy="${topEdgeY}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
        <circle cx="${throwRX}" cy="${topEdgeY}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
        <circle cx="${commonX}" cy="${bottomEdgeY}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
        <line x1="${commonX}" y1="${bottomEdgeY}" x2="${throwLX + 1}" y2="${topEdgeY + 2}" stroke="${FG}" stroke-width="1.4"/>`;

      let cells = '';
      switch (def.type) {
        case 'solenoid-spst': {
          const colX = 50;
          cells = `
            ${spstCell(colX)}
            <line x1="${coilRightX}" y1="${coilMidY}" x2="${colX}" y2="${bottomEdgeY}"
                  stroke="${FG}" stroke-width="0.9" stroke-dasharray="3 2"/>`;
          break;
        }
        case 'solenoid-spdt': {
          const colX = 55, throwL = 47, throwR = 63;
          cells = `
            ${spdtCell(colX, throwL, throwR)}
            <line x1="${coilRightX}" y1="${coilMidY}" x2="${colX}" y2="${bottomEdgeY}"
                  stroke="${FG}" stroke-width="0.9" stroke-dasharray="3 2"/>`;
          break;
        }
        case 'solenoid-dpst': {
          const col1 = 55, col2 = 85;
          cells = `
            ${spstCell(col1)}
            ${spstCell(col2)}
            <line x1="${coilRightX}" y1="${coilMidY}" x2="${col1}" y2="${armMidY}"
                  stroke="${FG}" stroke-width="0.9" stroke-dasharray="3 2"/>
            <line x1="${col1}" y1="${armMidY}" x2="${col2}" y2="${armMidY}"
                  stroke="${FG}" stroke-width="0.9" stroke-dasharray="3 2"/>`;
          break;
        }
        case 'solenoid-dpdt': {
          const c1 = 60, l1 = 52, r1 = 68;
          const c2 = 100, l2 = 92, r2 = 108;
          cells = `
            ${spdtCell(c1, l1, r1)}
            ${spdtCell(c2, l2, r2)}
            <line x1="${coilRightX}" y1="${coilMidY}" x2="${c1}" y2="${armMidY}"
                  stroke="${FG}" stroke-width="0.9" stroke-dasharray="3 2"/>
            <line x1="${c1}" y1="${armMidY}" x2="${c2}" y2="${armMidY}"
                  stroke="${FG}" stroke-width="0.9" stroke-dasharray="3 2"/>`;
          break;
        }
      }

      return `
        ${headerLabel(device, def.width)}
        ${coilStubs}
        ${coilBox}
        ${humps}
        ${cells}
        ${pins}`;
    }
    case 'speaker': {
      const driverW = 10, coneStartX = driverW, coneEndX = def.width - 2;
      const topY = 4, bottomY = def.height - 4, midY = def.height / 2;
      return `
        <line x1="0" y1="12" x2="5" y2="12" stroke="${FG}" stroke-width="1.2"/>
        <line x1="0" y1="28" x2="5" y2="28" stroke="${FG}" stroke-width="1.2"/>
        <rect x="5" y="${midY - 8}" width="${driverW - 2}" height="16" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
        <path d="M ${coneStartX} ${midY - 8} L ${coneEndX} ${topY} L ${coneEndX} ${bottomY} L ${coneStartX} ${midY + 8} Z"
              fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
        ${headerLabel(device, def.width, 10)}
        ${pins}`;
    }
    case 'headphone-jack':
    case 'headphone-jack-mono': {
      const isMono = def.type === 'headphone-jack-mono';
      const barrelX = def.width - 12, barrelW = 8;
      const barrelY1 = 2, barrelY2 = def.height - 2;

      // Contact rows mirror the pin tipYs so body + stubs line up.
      const rows = def.pins.map((p, i) => ({
        y: p.tipY,
        hasSpring: i !== def.pins.length - 1,  // Sleeve (last) is straight
      }));

      const springSvg = (y: number) => {
        // Free end intentionally stops BEFORE the barrel — the gap is the
        // plug-insertion path; extending the line would short T/R to sleeve.
        const pts = [
          [0, y], [30, y], [38, y - 5], [46, y + 5],
        ].map(([x, yy]) => `${x},${yy}`).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="${FG}" stroke-width="1.2"/>`;
      };

      const contacts = rows.map(c =>
        c.hasSpring
          ? springSvg(c.y)
          : `<line x1="0" y1="${c.y}" x2="${barrelX}" y2="${c.y}" stroke="${FG}" stroke-width="1.2"/>`
      ).join('');

      const title = isMono ? `${device.name} (TS)` : device.name;
      return `
        <rect x="${barrelX}" y="${barrelY1}" width="${barrelW}" height="${barrelY2 - barrelY1}"
              fill="${FG}" stroke="${FG}" stroke-width="1"/>
        ${contacts}
        <text x="${def.width / 2}" y="-2" font-size="10" font-weight="600" text-anchor="middle" fill="${FG}">${escapeXml(title)}</text>
        ${pins}`;
    }
    case 'lemo-6': {
      const bodyCx = 50, bodyCy = def.height / 2;
      const bodyR = 42, pinR = 5.5, orbit = 26;
      const PIN_STUB = 10;
      // Regular hexagon: 60° between pins. Pin 1 at 2 o'clock (−30°), CCW.
      const internalAngles = [
        -Math.PI / 6, -Math.PI / 2, -5 * Math.PI / 6,
         5 * Math.PI / 6, Math.PI / 2, Math.PI / 6,
      ];
      const halfArc = 6;
      const notchCenterX = bodyCx + bodyR;

      const leads = def.pins.map((sp, i) => {
        const a = internalAngles[i];
        const px = bodyCx + orbit * Math.cos(a);
        const py = bodyCy + orbit * Math.sin(a);
        return `<line x1="${px}" y1="${py}" x2="${sp.tipX - PIN_STUB}" y2="${sp.tipY}" stroke="${FG}" stroke-width="1"/>`;
      }).join('');

      const pinCircles = def.pins.map((_, i) => {
        const a = internalAngles[i];
        const px = bodyCx + orbit * Math.cos(a);
        const py = bodyCy + orbit * Math.sin(a);
        return `
          <circle cx="${px}" cy="${py}" r="${pinR}" fill="${BG}" stroke="${FG}" stroke-width="1"/>
          <text x="${px}" y="${py + 1}" font-size="8" text-anchor="middle" dominant-baseline="middle" fill="${FG}">${i + 1}</text>`;
      }).join('');

      const labels = def.pins.map((sp) => {
        const pin = device.pinCatalog[sp.index];
        if (!pin?.name) return '';
        return `<text x="${sp.tipX + 6}" y="${sp.tipY}" font-size="9" dominant-baseline="middle" text-anchor="start" fill="${FG}">${escapeXml(pin.name)}</text>`;
      }).join('');

      return `
        <circle cx="${bodyCx}" cy="${bodyCy}" r="${bodyR}" fill="${BG}" stroke="${FG}" stroke-width="1.4"/>
        <path d="M ${notchCenterX} ${bodyCy - halfArc} A ${halfArc} ${halfArc} 0 0 1 ${notchCenterX} ${bodyCy + halfArc}"
              fill="${BG}" stroke="${FG}" stroke-width="1.4"/>
        ${leads}
        ${pinCircles}
        ${labels}
        <text x="${bodyCx}" y="-2" font-size="11" font-weight="600" text-anchor="middle" fill="${FG}">${escapeXml(device.name)}</text>
        ${pins}`;
    }
    default:
      return pins;
  }
}

type DiodeVariant = 'junction' | 'zener' | 'schottky' | 'led';

function diodeSvg(device: PlacedDevice, def: SymbolDef, variant: DiodeVariant, pins: string): string {
  const cy = variant === 'led' ? 18 : def.height / 2;
  const triL = 15, triR = 30, triH = 6;
  const below =
    variant === 'zener' ? (device.attributes?.voltage    ?? device.attributes?.partNumber ?? '') :
    variant === 'led'   ? (device.attributes?.color      ?? '') :
                          (device.attributes?.partNumber ?? '');
  const ledArrows = variant === 'led'
    ? `
      <g stroke="${FG}" stroke-width="1" fill="none">
        <line x1="${triL + 4}"  y1="${cy - triH - 3}"  x2="${triL + 10}" y2="${cy - triH - 10}"/>
        <path d="M ${triL + 10} ${cy - triH - 10} L ${triL + 8}  ${cy - triH - 9}  M ${triL + 10} ${cy - triH - 10} L ${triL + 9}  ${cy - triH - 12}"/>
        <line x1="${triL + 10}" y1="${cy - triH - 3}"  x2="${triL + 16}" y2="${cy - triH - 10}"/>
        <path d="M ${triL + 16} ${cy - triH - 10} L ${triL + 14} ${cy - triH - 9}  M ${triL + 16} ${cy - triH - 10} L ${triL + 15} ${cy - triH - 12}"/>
      </g>`
    : '';
  return `
    <line x1="0" y1="${cy}" x2="${triL}" y2="${cy}" stroke="${FG}" stroke-width="1.2"/>
    <line x1="${triR}" y1="${cy}" x2="${def.width}" y2="${cy}" stroke="${FG}" stroke-width="1.2"/>
    <path d="M ${triL} ${cy - triH} L ${triR} ${cy} L ${triL} ${cy + triH} Z" fill="${FG}" stroke="${FG}" stroke-width="1"/>
    ${cathodeBarSvg(variant, triR, cy, triH)}
    ${ledArrows}
    ${headerLabel(device, def.width, 10)}
    ${belowLabel(below, def.width, def.height)}
    ${pins}`;
}

function cathodeBarSvg(variant: DiodeVariant, x: number, cy: number, half: number): string {
  switch (variant) {
    case 'zener':
      return `<path d="M ${x - 3} ${cy - half - 2} L ${x} ${cy - half} L ${x} ${cy + half} L ${x + 3} ${cy + half + 2}" fill="none" stroke="${FG}" stroke-width="1.4"/>`;
    case 'schottky':
      return `
        <line x1="${x}" y1="${cy - half}" x2="${x}" y2="${cy + half}" stroke="${FG}" stroke-width="1.4"/>
        <polyline points="${x - 3},${cy - half + 3} ${x - 3},${cy - half} ${x},${cy - half}" fill="none" stroke="${FG}" stroke-width="1.4"/>
        <polyline points="${x + 3},${cy + half - 3} ${x + 3},${cy + half} ${x},${cy + half}"  fill="none" stroke="${FG}" stroke-width="1.4"/>`;
    case 'junction':
    case 'led':
    default:
      return `<line x1="${x}" y1="${cy - half}" x2="${x}" y2="${cy + half}" stroke="${FG}" stroke-width="1.4"/>`;
  }
}

function spstContactSvg(leftX: number, rightX: number, y: number, width: number): string {
  const armEndX = rightX - 3;
  const armEndY = y - 12;
  return `
    <line x1="0" y1="${y}" x2="${leftX}" y2="${y}" stroke="${FG}" stroke-width="1.2"/>
    <line x1="${rightX}" y1="${y}" x2="${width}" y2="${y}" stroke="${FG}" stroke-width="1.2"/>
    <circle cx="${leftX}"  cy="${y}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
    <circle cx="${rightX}" cy="${y}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
    <line x1="${leftX}" y1="${y}" x2="${armEndX}" y2="${armEndY}" stroke="${FG}" stroke-width="1.4"/>`;
}

function spdtContactSvg(commonX: number, rightX: number, commonY: number, noY: number, ncY: number, width: number): string {
  return `
    <line x1="0" y1="${commonY}" x2="${commonX}" y2="${commonY}" stroke="${FG}" stroke-width="1.2"/>
    <line x1="${rightX}" y1="${noY}" x2="${width}" y2="${noY}" stroke="${FG}" stroke-width="1.2"/>
    <line x1="${rightX}" y1="${ncY}" x2="${width}" y2="${ncY}" stroke="${FG}" stroke-width="1.2"/>
    <circle cx="${commonX}" cy="${commonY}" r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
    <circle cx="${rightX}"  cy="${noY}"     r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
    <circle cx="${rightX}"  cy="${ncY}"     r="2.5" fill="${BG}" stroke="${FG}" stroke-width="1.2"/>
    <line x1="${commonX}" y1="${commonY}" x2="${rightX - 3}" y2="${ncY - 2}" stroke="${FG}" stroke-width="1.4"/>`;
}

// ── Downloads ────────────────────────────────────────────────────────

function triggerDownload(filename: string, mime: string, body: string | Blob): void {
  const blob = body instanceof Blob ? body : new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadSheetSvg(
  placedDevices: PlacedDevice[],
  wires: Wire[],
  netLabels: NetLabel[],
  annotations: Annotation[],
  shields: Shield[],
  sheet: Sheet,
  meta: ExportMetadata,
): void {
  const svg = renderSheetSvg(placedDevices, wires, netLabels, annotations, shields, sheet, meta);
  const safeProj  = meta.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const safeSheet = sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  triggerDownload(`${safeProj}-${safeSheet}.svg`, 'image/svg+xml', svg);
}

/**
 * "Print to PDF" via the browser's print dialog. Renders the sheet SVG into
 * a hidden same-origin iframe and prints THAT document — no pop-up window,
 * so it cannot be eaten by pop-up blockers and never leaves a stray tab.
 * No pdf libraries required — the user picks "Save as PDF" in the dialog.
 *
 * Page setup: A3 landscape (typical for wiring diagrams). The SVG fills the
 * page with preserveAspectRatio=meet semantics, so the whole sheet always
 * lands on a single page regardless of the diagram's aspect ratio.
 */
export function printSheetPdf(
  placedDevices: PlacedDevice[],
  wires: Wire[],
  netLabels: NetLabel[],
  annotations: Annotation[],
  shields: Shield[],
  sheet: Sheet,
  meta: ExportMetadata,
): void {
  const svg = renderSheetSvg(placedDevices, wires, netLabels, annotations, shields, sheet, meta);
  const html = `<!doctype html><html><head><meta charset="UTF-8"><title>${escapeXml(meta.projectName)} — ${escapeXml(sheet.name)}</title>
    <style>
      @page { size: A3 landscape; margin: 8mm; }
      html, body { margin: 0; padding: 0; background: white; }
      body { width: 100vw; height: 100vh; overflow: hidden; }
      svg { display: block; width: 100%; height: 100%; }
    </style>
  </head><body>${svg}</body></html>`;

  const iframe = document.createElement('iframe');
  // Keep it in-layout but invisible: display:none would prevent rendering
  // (and thus printing) in some engines; a 0×0 off-screen frame prints fine.
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.srcdoc = html;

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) { cleanup(); return; }
    // Remove the frame once the print dialog closes. afterprint fires in
    // all modern browsers; the timeout is a safety net for engines that
    // skip it when the user cancels.
    win.addEventListener('afterprint', () => setTimeout(cleanup, 100));
    setTimeout(cleanup, 120_000);
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      alert('Printing failed — try the SVG export instead.');
    }
  };

  document.body.appendChild(iframe);
}
