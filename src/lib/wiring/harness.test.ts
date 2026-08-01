import { describe, it, expect } from 'vitest';
import {
  orderedCablePathPoints,
  insertWaypointAtNearestSegment,
  junctionNodeId,
  isJunctionNodeId,
  endpointNodeId,
  snapToGrid,
  snapPointToGrid,
  computeAlignmentSnap,
  harnessBlockLayout,
  connectorDockPoints,
  orderedLogicalConnectors,
  HARNESS_BLOCK_HEADER_H,
  HARNESS_BLOCK_ROW_H,
  HARNESS_BLOCK_COL_W,
  HARNESS_BLOCK_PAD,
  HARNESS_BLOCK_MIN_WIDTH,
  cableCurvePath,
  sampleCableCurve,
  harnessTreeOf,
  branchPointNodeId,
  isBranchPointNodeId,
  harnessNodeIdKind,
  bundleGeometricLengthMm,
  computeNewBranchPointLabelAssignments,
} from './harness';
import type { PlacedDevice, ConnectorInstance, HarnessNode, HarnessGraph } from './types';

describe('orderedCablePathPoints', () => {
  it('keeps waypoints in their stored array order', () => {
    // Array order = the user's intent: visit A (y=150) then B (y=50). A
    // projection sort would flip them, because B projects "earlier" on the
    // straight start->end line — reshuffling the cable into a crossed shape.
    const poly = orderedCablePathPoints(
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      [{ x: 100, y: 150 }, { x: 100, y: 50 }],
      [],
    );
    expect(poly).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 150 },
      { x: 100, y: 50 },
      { x: 0, y: 200 },
    ]);
  });

  it('interleaves a child tap without disturbing waypoint order', () => {
    const poly = orderedCablePathPoints(
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      [{ x: 100, y: 150 }, { x: 100, y: 50 }],
      [{ x: 100, y: 100 }],
    );
    expect(poly).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 150 },
      { x: 100, y: 100 },
      { x: 100, y: 50 },
      { x: 0, y: 200 },
    ]);
  });
});

describe('insertWaypointAtNearestSegment', () => {
  it('inserts a new bend point on the polyline segment nearest the click', () => {
    // L-shaped cable: start(0,0) -> A(100,0) -> end(100,100). A click near
    // the vertical leg at (100,50) must land AFTER A — projecting onto the
    // straight start->end line would have placed it before A.
    const result = insertWaypointAtNearestSegment(
      [{ x: 100, y: 0 }],
      { x: 100, y: 50 },
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    );
    expect(result).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  it('inserts before an existing waypoint when the click is on the first segment', () => {
    const result = insertWaypointAtNearestSegment(
      [{ x: 100, y: 0 }],
      { x: 20, y: 2 },
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    );
    expect(result).toEqual([
      { x: 20, y: 2 },
      { x: 100, y: 0 },
    ]);
  });
});

describe('snapToGrid', () => {
  it('snaps a coordinate to the nearest 10-unit grid point', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(4)).toBe(0);
    expect(snapToGrid(5)).toBe(10);
    expect(snapToGrid(13)).toBe(10);
    expect(snapToGrid(-7)).toBe(-10);
    expect(snapToGrid(123)).toBe(120);
  });

  it('snaps a point on both axes', () => {
    expect(snapPointToGrid({ x: 13, y: 27 })).toEqual({ x: 10, y: 30 });
  });
});

describe('computeAlignmentSnap', () => {
  it('snaps to a neighbour x within the threshold and surfaces a guide', () => {
    // Candidate at x=104; a neighbour sits at x=100 (4 away ≤ 6) → snap.
    const r = computeAlignmentSnap({ x: 104, y: 50 }, [{ x: 100, y: 999 }], 6);
    expect(r.position.x).toBe(100);
    expect(r.guideX).toBe(100);
    // No neighbour near y → y unchanged, no horizontal guide.
    expect(r.position.y).toBe(50);
    expect(r.guideY).toBe(null);
  });

  it('leaves the coordinate alone when no neighbour is within the threshold', () => {
    const r = computeAlignmentSnap({ x: 104, y: 50 }, [{ x: 80, y: 80 }], 6);
    expect(r.position).toEqual({ x: 104, y: 50 });
    expect(r.guideX).toBe(null);
    expect(r.guideY).toBe(null);
  });

  it('snaps x and y independently to the nearest neighbours', () => {
    const r = computeAlignmentSnap(
      { x: 102, y: 203 },
      [{ x: 100, y: 0 }, { x: 0, y: 200 }],
      6,
    );
    expect(r.position).toEqual({ x: 100, y: 200 });
    expect(r.guideX).toBe(100);
    expect(r.guideY).toBe(200);
  });
});

describe('harness node-id helpers', () => {
  it('maps a junction endpoint key to its graph-node id', () => {
    // Identity is explicit — no coordinate rounding, just `J:<id>`.
    expect(junctionNodeId('junction:abc')).toBe('J:abc');
    expect(junctionNodeId('junction:jct-12ab34cd')).toBe('J:jct-12ab34cd');
  });

  it('returns null for non-junction keys', () => {
    expect(junctionNodeId('U1:C1-P3')).toBe(null);
    expect(junctionNodeId('#lbl1')).toBe(null);
  });

  it('isJunctionNodeId discriminates junction ids from connector ids', () => {
    expect(isJunctionNodeId('J:abc')).toBe(true);
    expect(isJunctionNodeId('U1:C1')).toBe(false);
  });

  it('endpointNodeId resolves connector, junction and label keys', () => {
    expect(endpointNodeId('U1:C1-P3')).toBe('U1:C1');
    expect(endpointNodeId('junction:abc')).toBe('J:abc');
    expect(endpointNodeId('#lbl1')).toBe(null);
  });
});

describe('harness node-id helpers', () => {
  it('branchPointNodeId / isBranchPointNodeId round-trip', () => {
    const id = branchPointNodeId('U1:c1');
    expect(id).toBe('bp:U1:c1');
    expect(isBranchPointNodeId(id)).toBe(true);
    expect(isBranchPointNodeId('U1:c1')).toBe(false);
    expect(isBranchPointNodeId('J:j1')).toBe(false);
  });
  it('harnessNodeIdKind classifies endpoint ids', () => {
    expect(harnessNodeIdKind('J:j1')).toBe('splice');
    expect(harnessNodeIdKind('bp:U1:c1')).toBe('branchPoint');
    expect(harnessNodeIdKind('U1:c1')).toBe('connector');
  });
});

// ── connectorDockPoints / harnessBlockLayout ───────────────────────
//
// Test fixture: a device placed at (100, 200) with width=80 and TWO logical
// connectors named "A" and "B" (one ConnectorInstance each).

function makePlacedDevice2(): PlacedDevice {
  const connA: ConnectorInstance = {
    id: 'U1:A',
    name: 'A',
    logicalConnectorName: 'A',
    side: 'right',
    pinIds: ['P1', 'P2'],
  };
  const connB: ConnectorInstance = {
    id: 'U1:B',
    name: 'B',
    logicalConnectorName: 'B',
    side: 'right',
    pinIds: ['P3', 'P4'],
  };
  return {
    id: 'U1',
    deviceId: 'U1',
    sheetId: 's1',
    position: { x: 100, y: 200 },
    width: 80,
    height: 60,
    connectors: [connA, connB],
    name: 'U1',
    pinCatalog: [
      { id: 'P1', name: 'P1', logicalConnectorName: 'A' },
      { id: 'P2', name: 'P2', logicalConnectorName: 'A' },
      { id: 'P3', name: 'P3', logicalConnectorName: 'B' },
      { id: 'P4', name: 'P4', logicalConnectorName: 'B' },
    ],
  };
}

describe('connectorDockPoints / harnessBlockLayout', () => {
  it('0°: connector edge is "left", header edge is "top"', () => {
    const pd = makePlacedDevice2();
    const layout = harnessBlockLayout(pd, 0);
    expect(layout.connectorEdge).toBe('left');
    expect(layout.headerEdge).toBe('top');
  });

  it('0°: both connectors dock on the left edge (x === placement.position.x)', () => {
    const pd = makePlacedDevice2();
    const docks = connectorDockPoints(pd, 0);
    expect(docks.get('A')!.x).toBe(pd.position.x);
    expect(docks.get('B')!.x).toBe(pd.position.x);
  });

  it('0°: dock Y of B is greater than dock Y of A (connectors go top-to-bottom)', () => {
    const pd = makePlacedDevice2();
    const docks = connectorDockPoints(pd, 0);
    expect(docks.get('B')!.y).toBeGreaterThan(docks.get('A')!.y);
  });

  it('180°: both connectors dock on the right edge (x === placement.position.x + layout.width)', () => {
    const pd = makePlacedDevice2();
    const layout = harnessBlockLayout(pd, 180);
    const docks = connectorDockPoints(pd, 180);
    expect(docks.get('A')!.x).toBe(pd.position.x + layout.width);
    expect(docks.get('B')!.x).toBe(pd.position.x + layout.width);
  });

  it('90°: connector edge is "top", header edge is "bottom"', () => {
    const pd = makePlacedDevice2();
    const layout = harnessBlockLayout(pd, 90);
    expect(layout.connectorEdge).toBe('top');
    expect(layout.headerEdge).toBe('bottom');
  });

  it('90°: both connectors dock on the top edge (y === placement.position.y)', () => {
    const pd = makePlacedDevice2();
    const docks = connectorDockPoints(pd, 90);
    expect(docks.get('A')!.y).toBe(pd.position.y);
    expect(docks.get('B')!.y).toBe(pd.position.y);
  });

  it('90°: dock X of B is greater than dock X of A (connectors go left-to-right)', () => {
    const pd = makePlacedDevice2();
    const docks = connectorDockPoints(pd, 90);
    expect(docks.get('B')!.x).toBeGreaterThan(docks.get('A')!.x);
  });

  it('270°: both connectors dock on the bottom edge (y === placement.position.y + layout.height)', () => {
    const pd = makePlacedDevice2();
    const layout = harnessBlockLayout(pd, 270);
    const docks = connectorDockPoints(pd, 270);
    expect(docks.get('A')!.y).toBe(pd.position.y + layout.height);
    expect(docks.get('B')!.y).toBe(pd.position.y + layout.height);
  });

  it('layout dimensions: 0° width is content-driven (NOT placement.width); height accounts for n rows + header + padding', () => {
    const pd = makePlacedDevice2();
    const layout = harnessBlockLayout(pd, 0);
    // Fixture's name ("U1") and connector rows ("A [2]", "B [2]") are tiny —
    // the block should size down to the minimum floor, not the schematic
    // block's much wider `placement.width` (80 here, but a real schematic
    // block sized for a pin list can be 200-400px — the whole point of this
    // layout being content-driven instead of inherited).
    expect(layout.width).toBe(HARNESS_BLOCK_MIN_WIDTH);
    expect(layout.height).toBe(HARNESS_BLOCK_HEADER_H + 2 * HARNESS_BLOCK_ROW_H + 8);
  });

  it('layout dimensions: 90° height is one row + header + padding; width spans n columns', () => {
    const pd = makePlacedDevice2();
    const layout = harnessBlockLayout(pd, 90);
    expect(layout.height).toBe(HARNESS_BLOCK_HEADER_H + HARNESS_BLOCK_ROW_H + 8);
    // 2 connectors → at least 2 * HARNESS_BLOCK_COL_W + 8 wide
    expect(layout.width).toBeGreaterThanOrEqual(2 * HARNESS_BLOCK_COL_W + 8);
  });

  it('0°: width is independent of an oversized placement.width (schematic sizing must not leak into the harness view)', () => {
    // Same short name/connectors as makePlacedDevice2, but with a
    // schematic-sized placement.width (e.g. a device with a big pin-list
    // box on the schematic sheet). The harness block must stay narrow.
    const pd = { ...makePlacedDevice2(), width: 420 };
    const layout = harnessBlockLayout(pd, 0);
    expect(layout.width).toBeLessThan(pd.width);
    expect(layout.width).toBe(HARNESS_BLOCK_MIN_WIDTH);
  });

  it('0°: width grows to fit a long device name / product name / connector name', () => {
    const pd: PlacedDevice = {
      ...makePlacedDevice2(),
      name: 'U1',
      productName: 'A Fairly Long Avionics Product Name',
      connectors: [{
        id: 'U1:LONGCONN', name: 'LONGCONN', logicalConnectorName: 'LONGCONN',
        side: 'right', pinIds: ['P1'],
      }],
      pinCatalog: [{ id: 'P1', name: 'P1', logicalConnectorName: 'LONGCONN' }],
    };
    const layout = harnessBlockLayout(pd, 0);
    expect(layout.width).toBeGreaterThan(HARNESS_BLOCK_MIN_WIDTH);
  });

  it('single-connector device: exactly one dock, on the left edge at 0°', () => {
    const connA: ConnectorInstance = {
      id: 'U2:A',
      name: 'A',
      logicalConnectorName: 'A',
      side: 'right',
      pinIds: ['P1'],
    };
    const pd: PlacedDevice = {
      id: 'U2',
      deviceId: 'U2',
      sheetId: 's1',
      position: { x: 50, y: 75 },
      width: 80,
      height: 60,
      connectors: [connA],
      name: 'U2',
      pinCatalog: [{ id: 'P1', name: 'P1', logicalConnectorName: 'A' }],
    };
    const docks = connectorDockPoints(pd, 0);
    expect(docks.size).toBe(1);
    expect(docks.get('A')!.x).toBe(pd.position.x);
  });

  it('90° width for 3 connectors is >= 3 * HARNESS_BLOCK_COL_W + HARNESS_BLOCK_PAD', () => {
    const makeConn = (name: string, pid: string): ConnectorInstance => ({
      id: `U3:${name}`,
      name,
      logicalConnectorName: name,
      side: 'right',
      pinIds: [pid],
    });
    const pd: PlacedDevice = {
      id: 'U3',
      deviceId: 'U3',
      sheetId: 's1',
      position: { x: 0, y: 0 },
      width: 80,
      height: 60,
      connectors: [makeConn('A', 'P1'), makeConn('B', 'P2'), makeConn('C', 'P3')],
      name: 'U3',
      pinCatalog: [
        { id: 'P1', name: 'P1', logicalConnectorName: 'A' },
        { id: 'P2', name: 'P2', logicalConnectorName: 'B' },
        { id: 'P3', name: 'P3', logicalConnectorName: 'C' },
      ],
    };
    const layout = harnessBlockLayout(pd, 90);
    expect(layout.width).toBeGreaterThanOrEqual(3 * HARNESS_BLOCK_COL_W + HARNESS_BLOCK_PAD);
  });
});

describe('orderedLogicalConnectors', () => {
  it('no order arg → natural order (A then B)', () => {
    const pd = makePlacedDevice2();
    const lcs = orderedLogicalConnectors(pd);
    expect(lcs.map(lc => lc.name)).toEqual(['A', 'B']);
  });

  it("order ['B','A'] → reversed order", () => {
    const pd = makePlacedDevice2();
    const lcs = orderedLogicalConnectors(pd, ['B', 'A']);
    expect(lcs.map(lc => lc.name)).toEqual(['B', 'A']);
  });

  it("order ['B','ZZZ'] → unknown 'ZZZ' ignored, 'A' appended last → ['B','A']", () => {
    const pd = makePlacedDevice2();
    const lcs = orderedLogicalConnectors(pd, ['B', 'ZZZ']);
    expect(lcs.map(lc => lc.name)).toEqual(['B', 'A']);
  });

  it('connectorDockPoints(dev, 0, ["B","A"]) → B dock Y < A dock Y (rows swapped vs natural order)', () => {
    const pd = makePlacedDevice2();
    const naturalDocks = connectorDockPoints(pd, 0);
    const reorderedDocks = connectorDockPoints(pd, 0, ['B', 'A']);
    // In natural order A is row 0 (lower Y) and B is row 1 (higher Y).
    // In reordered: B becomes row 0, A becomes row 1.
    expect(reorderedDocks.get('B')!.y).toBe(naturalDocks.get('A')!.y);
    expect(reorderedDocks.get('A')!.y).toBe(naturalDocks.get('B')!.y);
  });
});

describe('cableCurvePath / sampleCableCurve', () => {
  // Reusable points for all sub-tests.
  const a = { x: 0,   y: 0   };
  const b = { x: 200, y: 100 };
  const w1 = { x: 80,  y: 60  };
  const w2 = { x: 140, y: 20  };

  // ── cableCurvePath ────────────────────────────────────────────────

  it('no waypoints: path starts with M and contains exactly one C command', () => {
    const d = cableCurvePath(a, b);
    // Must start with the M move command.
    expect(d.startsWith('M ')).toBe(true);
    // Count `C` tokens: split on whitespace, count tokens equal to 'C'.
    const cCount = d.split(/\s+/).filter(tok => tok === 'C').length;
    expect(cCount).toBe(1);
  });

  it('two waypoints: path contains exactly 3 C commands (4 control pts → 3 spans)', () => {
    const d = cableCurvePath(a, b, [w1, w2]);
    const cCount = d.split(/\s+/).filter(tok => tok === 'C').length;
    expect(cCount).toBe(3);
  });

  // ── sampleCableCurve ─────────────────────────────────────────────

  it('no waypoints: returns array of length >= 2, first equals start, last equals end', () => {
    const pts = sampleCableCurve(a, b);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[0]).toEqual(a);
    expect(pts[pts.length - 1]).toEqual(b);
  });

  it('with a waypoint: some sampled point is within 5 units of the waypoint', () => {
    // A single waypoint at the midpoint region — the Catmull-Rom curve must
    // pass through it (it IS a control point, not just a guide).
    const midWp = { x: 100, y: 50 };
    const pts = sampleCableCurve(a, b, [midWp]);
    const epsilon = 5;
    const near = pts.some(p => Math.hypot(p.x - midWp.x, p.y - midWp.y) < epsilon);
    expect(near).toBe(true);
  });

  it('coincident endpoints: sampleCableCurve(p, p) returns length >= 2, no NaN coords, first and last equal p', () => {
    const p = { x: 42, y: 77 };
    const pts = sampleCableCurve(p, p);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    for (const pt of pts) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
    expect(pts[0]).toEqual(p);
    expect(pts[pts.length - 1]).toEqual(p);
  });
});

describe('harnessTreeOf', () => {
  // Two separate trees:
  //   Tree 1: nodes a-b-c, bundles B-ab (a↔b) and B-bc (b↔c)
  //   Tree 2: nodes x-y,  bundle B-xy (x↔y)
  const graph: HarnessGraph = {
    nodes: [
      { id: 'a', kind: 'connector', position: { x: 0, y: 0 } } as HarnessNode,
      { id: 'b', kind: 'connector', position: { x: 0, y: 0 } } as HarnessNode,
      { id: 'c', kind: 'connector', position: { x: 0, y: 0 } } as HarnessNode,
      { id: 'x', kind: 'connector', position: { x: 0, y: 0 } } as HarnessNode,
      { id: 'y', kind: 'connector', position: { x: 0, y: 0 } } as HarnessNode,
    ],
    bundles: [
      { id: 'B-ab', endpoints: ['a', 'b'], conductorIds: [] },
      { id: 'B-bc', endpoints: ['b', 'c'], conductorIds: [] },
      { id: 'B-xy', endpoints: ['x', 'y'], conductorIds: [] },
    ],
  };

  it('seeding from B-ab returns the full first tree', () => {
    const result = harnessTreeOf('B-ab', graph);
    expect(result.bundleIds).toEqual(['B-ab', 'B-bc']);
    expect(result.nodeIds).toEqual(['a', 'b', 'c']);
  });

  it('seeding from B-bc returns the same first tree (any bundle in a tree works)', () => {
    const result = harnessTreeOf('B-bc', graph);
    expect(result.bundleIds).toEqual(['B-ab', 'B-bc']);
    expect(result.nodeIds).toEqual(['a', 'b', 'c']);
  });

  it('seeding from B-xy returns only the second tree', () => {
    const result = harnessTreeOf('B-xy', graph);
    expect(result.bundleIds).toEqual(['B-xy']);
    expect(result.nodeIds).toEqual(['x', 'y']);
  });

  it('absent seed bundle id returns empty arrays', () => {
    const result = harnessTreeOf('NOPE', graph);
    expect(result.bundleIds).toEqual([]);
    expect(result.nodeIds).toEqual([]);
  });

  it('nodeIds includes component (placement) ids for connector node ids like "U1A:C1"', () => {
    // Realistic harness: two devices (U1A, U2A) each with one connector node id.
    // A splice node (J:sp1) and a branch-point node (bp:bp1) are also present.
    // The BFS endpoint ids are connector-format ('U1A:C1', 'U2A:C1') plus the
    // junction and branchPoint ids. Component (device-block) node ids like 'U1A'
    // are NOT bundle endpoints — they must be derived from the connector ids.
    const realisticGraph: HarnessGraph = {
      nodes: [
        { id: 'U1A:C1',  kind: 'connector',   position: { x: 0, y: 0 } } as HarnessNode,
        { id: 'U2A:C1',  kind: 'connector',   position: { x: 0, y: 0 } } as HarnessNode,
        { id: 'J:sp1',   kind: 'splice',      position: { x: 0, y: 0 } } as HarnessNode,
        { id: 'bp:bp1',  kind: 'branchPoint', position: { x: 0, y: 0 } } as HarnessNode,
        // Component (device-block) nodes — NOT bundle endpoints, not in BFS by default.
        { id: 'U1A',     kind: 'component',   position: { x: 0, y: 0 } } as HarnessNode,
        { id: 'U2A',     kind: 'component',   position: { x: 0, y: 0 } } as HarnessNode,
      ],
      bundles: [
        { id: 'B-main', endpoints: ['U1A:C1', 'J:sp1'],  conductorIds: [] },
        { id: 'B-leg',  endpoints: ['J:sp1',  'bp:bp1'], conductorIds: [] },
        { id: 'B-end',  endpoints: ['bp:bp1', 'U2A:C1'], conductorIds: [] },
      ],
    };

    const result = harnessTreeOf('B-main', realisticGraph);

    // All three bundles must be found.
    expect(result.bundleIds).toEqual(['B-end', 'B-leg', 'B-main']);
    // nodeIds must contain: the four BFS endpoint ids AND the two component
    // (placement) ids 'U1A' + 'U2A' derived from the connector endpoint ids.
    // Sorted: 'J:sp1' < 'U1A' < 'U1A:C1' < 'U2A' < 'U2A:C1' < 'bp:bp1'
    // (uppercase letters sort before lowercase in JS string sort)
    expect(result.nodeIds).toEqual(['J:sp1', 'U1A', 'U1A:C1', 'U2A', 'U2A:C1', 'bp:bp1']);
  });
});

describe('bundleGeometricLengthMm', () => {
  const graph: HarnessGraph = {
    nodes: [
      { id: 'a', kind: 'connector', position: { x: 0, y: 0 } },
      { id: 'b', kind: 'connector', position: { x: 100, y: 0 } },
    ],
    bundles: [],
  };
  const bundle = { id: 'a|b', endpoints: ['a', 'b'] as [string, string], conductorIds: [] };

  it('straight cable × scale', () => {
    const len = bundleGeometricLengthMm(bundle, graph, 10);
    expect(len).toBeGreaterThan(990);
    expect(len).toBeLessThan(1010);
  });
  it('scale of 1 → ~100', () => {
    const len = bundleGeometricLengthMm(bundle, graph, 1);
    expect(len).toBeGreaterThan(99);
    expect(len).toBeLessThan(101);
  });
  it('missing endpoint node → 0', () => {
    const orphan = { id: 'a|z', endpoints: ['a', 'z'] as [string, string], conductorIds: [] };
    expect(bundleGeometricLengthMm(orphan, graph, 10)).toBe(0);
  });
});

// ── 2026-07 stable branch-point numbering ────────────────────────────
//
// Regression coverage for the other half of the "moving a device messes up
// the order" report: branch-point IDS were already stable, but the
// DISPLAYED NUMBER (BP1, BP2, …) was recomputed from a live sort every
// render, so an unrelated branch point appearing/disappearing anywhere in
// the tree could renumber every other one. This is the pure assignment
// logic the `WiringPage` sync effect calls — see its doc comment in
// `harness.ts` for why it's a separate exported function instead of staying
// inline in the effect (unit-testable without a React render harness).
describe('computeNewBranchPointLabelAssignments', () => {
  it('nothing existing, nothing current → no assignments', () => {
    expect(computeNewBranchPointLabelAssignments({}, [])).toEqual({});
  });

  it('assigns fresh ids sequentially in sorted-id order, starting at 1', () => {
    const result = computeNewBranchPointLabelAssignments({}, ['bp:C', 'bp:A', 'bp:B']);
    expect(result).toEqual({ 'bp:A': 1, 'bp:B': 2, 'bp:C': 3 });
  });

  it('never re-assigns or returns an id that already has a number', () => {
    const existing = { 'bp:A': 1, 'bp:C': 3 };
    const result = computeNewBranchPointLabelAssignments(existing, ['bp:A', 'bp:B', 'bp:C', 'bp:D']);
    // Only the two genuinely new ids come back, numbered from max(1,3)+1=4
    // upward — bp:A / bp:C are untouched (not even present in the result).
    expect(result).toEqual({ 'bp:B': 4, 'bp:D': 5 });
  });

  it('is idempotent — merging the result in leaves nothing left to assign next time', () => {
    const existing = { 'bp:A': 1 };
    const currentIds = ['bp:A', 'bp:B'];
    const round1 = computeNewBranchPointLabelAssignments(existing, currentIds);
    const merged = { ...existing, ...round1 };
    const round2 = computeNewBranchPointLabelAssignments(merged, currentIds);
    expect(round2).toEqual({});
  });

  it('an id that disappears and comes back keeps its original number (orphan-tolerant)', () => {
    // bp:B had number 2 before; it's gone from `currentIds` this round
    // (nothing to assign, existing entries are just left in the map by the
    // caller). If it reappears later, it's already in `existingLabels`, so
    // it must NOT be treated as new / re-numbered.
    const existing = { 'bp:A': 1, 'bp:B': 2 };
    const result = computeNewBranchPointLabelAssignments(existing, ['bp:A', 'bp:B', 'bp:C']);
    expect(result).toEqual({ 'bp:C': 3 });
  });
});
