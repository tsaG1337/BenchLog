import { describe, it, expect } from 'vitest';
import { renderHarnessSvg, buildCableSummaryHtml, buildWireSummaryHtml, type HarnessRenderOptions } from './exportHarness';
import type { HarnessGraph, PlacedDevice, ConnectorInstance, Wire } from './types';

// ── Fixtures ────────────────────────────────────────────────────────
// The exporter is a pure renderer over an already-derived graph, so the
// fixtures build the graph directly — no deriveHarness involved.

function makeDevice(id: string, cName: string, pins: number): PlacedDevice {
  const connector: ConnectorInstance = {
    id: `${id}:${cName}`,
    name: cName,
    logicalConnectorName: cName,
    side: 'right',
    pinIds: Array.from({ length: pins }, (_, i) => `P${i + 1}`),
  };
  return {
    id,
    deviceId: id,
    sheetId: 's1',
    position: { x: 0, y: 0 },
    width: 80,
    height: 60,
    connectors: [connector],
    name: id,
    pinCatalog: connector.pinIds.map(pid => ({
      id: pid, name: pid, logicalConnectorName: cName,
    })),
  };
}

/** Two components joined by one bundle carrying two conductors. */
function simpleGraph(bundleOverrides: Partial<HarnessGraph['bundles'][number]> = {}): HarnessGraph {
  return {
    nodes: [
      { id: 'U1', kind: 'component', position: { x: 0, y: 0 }, refId: 'U1' },
      { id: 'U2', kind: 'component', position: { x: 400, y: 0 }, refId: 'U2' },
      { id: 'U1:C1', kind: 'connector', position: { x: 80, y: 40 }, refId: 'U1:C1' },
      { id: 'U2:C1', kind: 'connector', position: { x: 400, y: 40 }, refId: 'U2:C1' },
    ],
    bundles: [{
      id: 'U1:C1|U2:C1',
      endpoints: ['U1:C1', 'U2:C1'],
      conductorIds: ['w1', 'w2'],
      ...bundleOverrides,
    }],
  };
}

const baseOptions: HarnessRenderOptions = {
  showCableNames: true,
  showConductorCounts: true,
  lengthsMode: 'all',
  mmPerUnit: 10,
};

const meta = { projectName: 'Test RV-10', sheetName: 'Main — Harness', date: '2026-07-22T00:00:00Z' };

function render(graph: HarnessGraph, options: Partial<HarnessRenderOptions> = {}) {
  return renderHarnessSvg({
    graph,
    placedDevices: [makeDevice('U1', 'C1', 4), makeDevice('U2', 'C1', 4)],
    options: { ...baseOptions, ...options },
    meta,
  });
}

describe('renderHarnessSvg', () => {
  it('returns null for a graph with no bundles (no blank pages)', () => {
    const g: HarnessGraph = { nodes: [], bundles: [] };
    expect(renderHarnessSvg({ graph: g, placedDevices: [], options: baseOptions, meta })).toBeNull();
  });

  it('renders device blocks, cable, and the title block', () => {
    const svg = render(simpleGraph())!;
    expect(svg).toContain('<svg');
    // Device headers by name.
    expect(svg).toContain('>U1</text>');
    expect(svg).toContain('>U2</text>');
    // The cable path + the title block fields.
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('Test RV-10');
    expect(svg).toContain('Main — Harness');
  });

  it('lengthsMode none → no length pill at all', () => {
    const svg = render(simpleGraph(), { lengthsMode: 'none' })!;
    expect(svg).not.toMatch(/mm</);
  });

  it('lengthsMode defined → only user-measured lengths, no ~estimates', () => {
    const withLength = render(simpleGraph({ length: 250 }), { lengthsMode: 'defined' })!;
    expect(withLength).toContain('>250 mm<');
    expect(withLength).not.toContain('~');

    const withoutLength = render(simpleGraph(), { lengthsMode: 'defined' })!;
    expect(withoutLength).not.toMatch(/mm</);
  });

  it('lengthsMode all → an unmeasured cable shows a ~ geometric estimate', () => {
    const svg = render(simpleGraph(), { lengthsMode: 'all' })!;
    // 320 units between docks × 10 mm/unit = ~3200 mm.
    expect(svg).toMatch(/~3\d{3} mm</);
  });

  it('cable name pill only when set AND enabled', () => {
    const named = simpleGraph({ name: 'MAIN-LOOM' });
    expect(render(named, { showCableNames: true })!).toContain('MAIN-LOOM');
    expect(render(named, { showCableNames: false })!).not.toContain('MAIN-LOOM');
    expect(render(simpleGraph(), { showCableNames: true })!).not.toContain('MAIN-LOOM');
  });

  it('conductor count pill honours its toggle', () => {
    expect(render(simpleGraph(), { showConductorCounts: true })!).toContain('>2</text>');
    expect(render(simpleGraph(), { showConductorCounts: false, lengthsMode: 'none', showCableNames: false })!)
      .not.toContain('>2</text>');
  });

  it('a branch point without a persisted number gets an ephemeral BP label', () => {
    const g = simpleGraph();
    g.nodes.push({ id: 'bp:U1:C1', kind: 'branchPoint', position: { x: 200, y: 40 } });
    const svg = render(g)!;
    expect(svg).toContain('>BP1</text>');
  });

  it('a persisted BP number wins over ephemeral numbering', () => {
    const g = simpleGraph();
    g.nodes.push({ id: 'bp:U1:C1', kind: 'branchPoint', position: { x: 200, y: 40 } });
    const svg = renderHarnessSvg({
      graph: g,
      placedDevices: [makeDevice('U1', 'C1', 4), makeDevice('U2', 'C1', 4)],
      options: { ...baseOptions, branchPointLabels: { 'bp:U1:C1': 7 } },
      meta,
    })!;
    expect(svg).toContain('>BP7</text>');
    expect(svg).not.toContain('>BP1</text>');
  });
});

describe('buildCableSummaryHtml', () => {
  const wires: Wire[] = [
    { id: 'w1', sheetId: 's1', fromPin: 'U1:C1-P1', toPin: 'U2:C1-P1', color: 'currentColor', showLabel: true, label: 'P1001-22' },
    { id: 'w2', sheetId: 's1', fromPin: 'U1:C1-P2', toPin: 'U2:C1-P2', color: 'currentColor', showLabel: true },
  ];

  function summaryFor(graph: HarnessGraph) {
    return buildCableSummaryHtml([{
      sheetName: 'Main',
      graph,
      placedDevices: [makeDevice('U1', 'C1', 4), makeDevice('U2', 'C1', 4)],
      wires,
      mmPerUnit: 10,
    }], { projectName: 'Test RV-10', date: '2026-07-22T00:00:00Z' });
  }

  it('null when no sheet has bundles', () => {
    expect(summaryFor({ nodes: [], bundles: [] })).toBeNull();
  });

  it('lists endpoints as friendly names, wire labels, and a total', () => {
    const html = summaryFor(simpleGraph({ name: 'MAIN-LOOM', length: 1500 }))!;
    expect(html).toContain('Cable summary');
    expect(html).toContain('MAIN-LOOM');
    // Friendly endpoint names: placement name · connector.
    expect(html).toContain('U1 · C1');
    expect(html).toContain('U2 · C1');
    // Labelled conductor listed; unlabelled one doesn't crash the row.
    expect(html).toContain('P1001-22');
    // A measured 1500 mm formats as metres in the total.
    expect(html).toContain('1.50 m');
    // Measured length renders solid (no ~ in the row's length cell).
    expect(html).toContain('>1500 mm<');
  });

  it('unmeasured cables show a muted ~ estimate in the table', () => {
    const html = summaryFor(simpleGraph())!;
    expect(html).toMatch(/~3\d{3} mm/);
  });
});

describe('buildWireSummaryHtml', () => {
  const directWires: Wire[] = [
    { id: 'w1', sheetId: 's1', fromPin: 'U1:P1', toPin: 'U2:P1', color: 'currentColor', showLabel: true, label: 'SIG-1' },
  ];
  const devices = [makeDevice('U1', 'C1', 4), makeDevice('U2', 'C1', 4)];
  const meta = { projectName: 'Test RV-10', date: '2026-07-22T00:00:00Z' };

  it('null when no wire crosses any bundle', () => {
    const g: HarnessGraph = { nodes: [], bundles: [] };
    expect(buildWireSummaryHtml([{ sheetName: 'Main', graph: g, placedDevices: [], wires: [], mmPerUnit: 10 }], meta)).toBeNull();
  });

  it('a direct (single-segment) wire lists friendly endpoints and its length, no Via', () => {
    const html = buildWireSummaryHtml([{
      sheetName: 'Main',
      graph: simpleGraph({ length: 1500 }),
      placedDevices: devices,
      wires: directWires,
      mmPerUnit: 10,
    }], meta)!;
    expect(html).toContain('Wire summary');
    expect(html).toContain('SIG-1');
    expect(html).toContain('U1 · C1');
    expect(html).toContain('U2 · C1');
    expect(html).toContain('1.50 m');
    expect(html).not.toContain('segments');
  });

  it('sums a wire across every bundle segment it crosses (via a splice)', () => {
    const g: HarnessGraph = {
      nodes: [
        { id: 'U1', kind: 'component', position: { x: 0, y: 0 }, refId: 'U1' },
        { id: 'U2', kind: 'component', position: { x: 400, y: 0 }, refId: 'U2' },
        { id: 'U1:C1', kind: 'connector', position: { x: 80, y: 40 }, refId: 'U1:C1' },
        { id: 'J:s1', kind: 'splice', position: { x: 240, y: 40 }, refId: 'J:s1' },
        { id: 'U2:C1', kind: 'connector', position: { x: 400, y: 40 }, refId: 'U2:C1' },
      ],
      bundles: [
        { id: 'U1:C1|J:s1', endpoints: ['U1:C1', 'J:s1'], conductorIds: ['w1'], name: 'LOOM-A' },
        { id: 'J:s1|U2:C1', endpoints: ['J:s1', 'U2:C1'], conductorIds: ['w1'], name: 'LOOM-B' },
      ],
    };
    const html = buildWireSummaryHtml([{
      sheetName: 'Main',
      graph: g,
      placedDevices: devices,
      wires: directWires,
      mmPerUnit: 10,
    }], meta)!;
    // 160 units per segment × 2 segments × 10 mm/unit = 3200 mm total, both
    // segments unmeasured → the wire's total renders as a muted estimate.
    expect(html).toMatch(/~3200 mm/);
    expect(html).toContain('LOOM-A → LOOM-B');
  });

  it('a splice endpoint renders as "Splice" rather than a raw junction key', () => {
    const wires: Wire[] = [
      { id: 'w1', sheetId: 's1', fromPin: 'U1:P1', toPin: 'junction:s1', color: 'currentColor', showLabel: true },
    ];
    const g = simpleGraph();
    const html = buildWireSummaryHtml([{
      sheetName: 'Main', graph: g, placedDevices: devices, wires, mmPerUnit: 10,
    }], meta)!;
    expect(html).toContain('Splice');
    expect(html).not.toContain('junction:s1');
  });
});
