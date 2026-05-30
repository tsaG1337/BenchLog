import { describe, it, expect } from 'vitest';
import { deriveHarness } from './deriveHarness';
import { harnessAutoLayout } from './harnessAutoLayout';
import { connectorDockPoints } from './harness';
import { pinIdFor, slugifyDesignator } from './library/types';
import { emptyHarnessOverrides } from './types';
import type { Wire, NetLabel, Junction, PlacedDevice, ConnectorInstance, HarnessOverrides } from './types';

/** Build a `HarnessOverrides` from a partial — fills in the empty defaults so
 *  tests only spell out the fields they exercise. */
function mkOverrides(partial: Partial<HarnessOverrides>): HarnessOverrides {
  return { ...emptyHarnessOverrides(), ...partial };
}

// ── Test fixtures ───────────────────────────────────────────────────
//
// `deriveHarness` takes one sheet's placed devices, wires, junctions and
// net labels (mirroring what `deriveBundles` reads, plus placements +
// junctions). These helpers build the minimal shapes it reads.

/** A placed device `id` with one connector `cName` carrying `pins` pins.
 *  In this fixture the placement id equals the device id, so the device's
 *  used connector node id is `<id>:<cName>` (e.g. 'U1:C1'). */
function makeDevice(id: string, cName: string, pins: number, x = 0, y = 0): PlacedDevice {
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
    position: { x, y },
    width: 80,
    height: 60,
    connectors: [connector],
    name: id,
    pinCatalog: connector.pinIds.map(pid => ({
      id: pid, name: pid, logicalConnectorName: cName,
    })),
  };
}

/** A placed device `id` with TWO logical connectors `A` and `B`, each
 *  carrying `pins` pins. Pin keys are `<id>:A-P*` / `<id>:B-P*`; the used
 *  connector node ids are `<id>:A` and `<id>:B`. */
function makeTwoConnectorDevice(id: string, pins = 2, x = 0, y = 0): PlacedDevice {
  const mkConn = (cName: string): ConnectorInstance => ({
    id: `${id}:${cName}`,
    name: cName,
    logicalConnectorName: cName,
    side: 'right',
    pinIds: Array.from({ length: pins }, (_, i) => `${cName}-P${i + 1}`),
  });
  const connectors = [mkConn('A'), mkConn('B')];
  return {
    id,
    deviceId: id,
    sheetId: 's1',
    position: { x, y },
    width: 80,
    height: 60,
    connectors,
    name: id,
    pinCatalog: connectors.flatMap(c =>
      c.pinIds.map(pid => ({ id: pid, name: pid, logicalConnectorName: c.logicalConnectorName })),
    ),
  };
}

/**
 * A placed device `id` with one connector whose *raw* `logicalConnectorName`
 * is `rawConn` — which is allowed to contain spaces / parens / slashes, as
 * real library devices do (AFS `'P1 (EFIS PFD)'`, Dynon `'J-NET 1'`). The
 * pin ids + connector id are produced by the SAME builders the app uses
 * (`pinIdFor` / `slugifyDesignator`), so a wire pin key `<id>:<pinId>`
 * resolves to the connector node id `<id>:<slugify(rawConn)>` exactly as it
 * would in production.
 */
function makeDeviceRawConn(
  id: string,
  rawConn: string,
  pins: number,
  x = 0,
  y = 0,
): PlacedDevice {
  const pinIds = Array.from({ length: pins }, (_, i) =>
    pinIdFor(rawConn, String(i + 1), i),
  );
  const connector: ConnectorInstance = {
    id: `${id}:${slugifyDesignator(rawConn)}`,
    name: rawConn,
    logicalConnectorName: rawConn,
    side: 'right',
    pinIds,
  };
  return {
    id,
    deviceId: id,
    sheetId: 's1',
    position: { x, y },
    width: 80,
    height: 60,
    connectors: [connector],
    name: id,
    pinCatalog: pinIds.map(pid => ({
      id: pid, name: pid, logicalConnectorName: rawConn,
    })),
  };
}

function wire(id: string, from: string, to: string): Wire {
  return { id, fromPin: from, toPin: to, sheetId: 's1' } as Wire;
}

function makeInput(opts: {
  placedDevices?: PlacedDevice[];
  wires?: Wire[];
  junctions?: Junction[];
  netLabels?: NetLabel[];
}) {
  return {
    placedDevices: opts.placedDevices ?? [],
    wires: opts.wires ?? [],
    junctions: opts.junctions ?? [],
    netLabels: opts.netLabels ?? [],
  };
}

/** U1 — U2 — U3 chained on one label net. The auto-layout column makes the
 *  MST a path U1—U2—U3, so the interior connector U2:C1 has MST-degree 2 →
 *  it is the one branched connector, with branch point `bp:U2:C1`. */
function chainOfThree(): { placedDevices: PlacedDevice[]; wires: Wire[]; netLabels: NetLabel[] } {
  const placedDevices = [
    makeDevice('U1', 'C1', 2, 0, 0),
    makeDevice('U2', 'C1', 2, 0, 200),
    makeDevice('U3', 'C1', 2, 0, 400),
  ];
  const wires = [
    wire('w1', 'U1:C1-P1', '#lA'),
    wire('w2', 'U2:C1-P1', '#lB'),
    wire('w3', 'U3:C1-P1', '#lC'),
  ];
  const netLabels: NetLabel[] = [
    { id: 'lA', text: 'VCC', attachedTo: 'U1:C1-P1' } as NetLabel,
    { id: 'lB', text: 'VCC', attachedTo: 'U2:C1-P1' } as NetLabel,
    { id: 'lC', text: 'VCC', attachedTo: 'U3:C1-P1' } as NetLabel,
  ];
  return { placedDevices, wires, netLabels };
}

/** Count incident bundles for a node id. */
function incidentBundles(g: ReturnType<typeof deriveHarness>, nodeId: string) {
  return g.bundles.filter(b => b.endpoints.includes(nodeId));
}

/** A star fixture: U1 wired to U2, U3, U4, with `nodePositions` overrides
 *  spreading the satellites around U1 so the Euclidean MST is a genuine star
 *  (every satellite's nearest in-tree node is U1) → U1:C1 has MST-degree 3,
 *  making it the single branched connector with branch point bp:U1:C1. */
function starFixture() {
  const placedDevices = [
    makeDevice('U1', 'C1', 4),
    makeDevice('U2', 'C1', 2),
    makeDevice('U3', 'C1', 2),
    makeDevice('U4', 'C1', 2),
  ];
  const wires = [
    wire('w1', 'U1:C1-P1', 'U2:C1-P1'),
    wire('w2', 'U1:C1-P2', 'U3:C1-P1'),
    wire('w3', 'U1:C1-P3', 'U4:C1-P1'),
  ];
  // U1 central; satellites at three far corners — each satellite's closest
  // node is U1, and the satellites are mutually distant, so the MST is the
  // star U1—U2, U1—U3, U1—U4.
  const overrides = mkOverrides({
    nodePositions: {
      U1: { x: 500, y: 500 },
      U2: { x: 0, y: 0 },
      U3: { x: 1000, y: 0 },
      U4: { x: 500, y: 1100 },
    },
  });
  return { placedDevices, wires, overrides };
}

describe('deriveHarness — nodes + electrical components', () => {
  it('one net, two devices → ONE direct bundle, no branch point', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const g = deriveHarness(makeInput({ placedDevices, wires }));

    // Each device contributes a `component` block node AND a `connector`
    // termination node for its used connector C1.
    expect(g.nodes.filter(n => n.kind === 'component')).toHaveLength(2);
    expect(g.nodes.filter(n => n.kind === 'connector')).toHaveLength(2);
    // Both connectors have MST-degree 1 (a 2-node MST) → neither branches.
    // The harness tree is a single bundle directly between the two connectors.
    expect(g.nodes.filter(n => n.kind === 'branchPoint')).toHaveLength(0);
    expect(g.bundles).toHaveLength(1);
    expect(g.bundles[0].endpoints.slice().sort()).toEqual(['U1:C1', 'U2:C1']);
    // The single conductor routes across the one bundle.
    expect(g.bundles[0].conductorIds).toEqual(['w1']);
  });

  it('two electrically-disconnected groups → two separate trees (a forest)', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
      makeDevice('U3', 'C1', 2, 400, 0),
      makeDevice('U4', 'C1', 2, 400, 200),
    ];
    const wires = [
      wire('w1', 'U1:C1-P1', 'U2:C1-P1'),
      wire('w2', 'U3:C1-P1', 'U4:C1-P1'),
    ];
    const g = deriveHarness(makeInput({ placedDevices, wires }));
    // Two independent 2-device runs — each is a single direct bundle, so 2
    // bundles total; no bundle bridges the two groups, no branch points.
    expect(g.bundles).toHaveLength(2);
    expect(g.nodes.filter(n => n.kind === 'branchPoint')).toHaveLength(0);
    for (const b of g.bundles) {
      const ep = b.endpoints.slice().sort();
      expect(ep.length).toBe(2);
    }
    // No bundle mixes a group-A node (U1/U2 connectors) with group-B (U3/U4).
    const groupA = new Set(['U1:C1', 'U2:C1']);
    for (const b of g.bundles) {
      const inA = b.endpoints.map(id => groupA.has(id));
      expect(inA[0]).toBe(inA[1]);
    }
  });

  it('isolated device (no wires) → no connector node, no bundles', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    // U3 is placed but unwired.
    placedDevices.push(makeDevice('U3', 'C1', 2, 500, 0));
    const g = deriveHarness(makeInput({ placedDevices, wires }));
    // All three devices get a `component` block node …
    expect(g.nodes.filter(n => n.kind === 'component')).toHaveLength(3);
    // … but U3's connector C1 is unused → no connector node for it.
    expect(g.nodes.some(n => n.kind === 'connector' && n.id === 'U3:C1')).toBe(false);
    expect(g.nodes.filter(n => n.kind === 'connector')).toHaveLength(2);
    // U3's component node is in no bundle.
    const u3Node = g.nodes.find(n => n.id === 'U3')!;
    expect(g.bundles.some(b => b.endpoints.includes(u3Node.id))).toBe(false);
  });

  it('a device with two used connectors → two distinct connector nodes', () => {
    // U1 has connectors A and B. A is wired to U2, B is wired to U3.
    // Each used connector is its own harness termination node.
    const u1 = makeTwoConnectorDevice('U1', 2, 0, 0);
    const u2 = makeDevice('U2', 'C1', 2, 0, 200);
    const u3 = makeDevice('U3', 'C1', 2, 0, 400);
    const wires = [
      wire('wA', 'U1:A-P1', 'U2:C1-P1'),
      wire('wB', 'U1:B-P1', 'U3:C1-P1'),
    ];
    const g = deriveHarness(makeInput({ placedDevices: [u1, u2, u3], wires }));
    // U1 still draws as ONE component block …
    expect(g.nodes.filter(n => n.kind === 'component' && n.id === 'U1')).toHaveLength(1);
    // … but its two used connectors are two distinct connector nodes.
    const u1A = g.nodes.find(n => n.kind === 'connector' && n.id === 'U1:A');
    const u1B = g.nodes.find(n => n.kind === 'connector' && n.id === 'U1:B');
    expect(u1A).toBeDefined();
    expect(u1B).toBeDefined();
    expect(u1A!.id).not.toBe(u1B!.id);
    // Each connector node is a bundle endpoint of its own net.
    expect(g.bundles.some(b => b.endpoints.includes('U1:A'))).toBe(true);
    expect(g.bundles.some(b => b.endpoints.includes('U1:B'))).toBe(true);
    // The two connectors are NOT electrically connected → no bundle joins them.
    expect(g.bundles.some(b =>
      b.endpoints.includes('U1:A') && b.endpoints.includes('U1:B'))).toBe(false);
    // wA runs U1:A↔U2:C1, wB runs U1:B↔U3:C1. Each is a separate 2-device run,
    // so each is one direct bundle. The route's edge-set has exactly its two
    // CONNECTOR nodes at odd degree.
    const routeEnds = (wid: string) => {
      const path = g.bundles.filter(b => b.conductorIds.includes(wid));
      expect(path.length).toBeGreaterThan(0);
      const deg = new Map<string, number>();
      for (const b of path) for (const e of b.endpoints) deg.set(e, (deg.get(e) ?? 0) + 1);
      return [...deg.entries()].filter(([, d]) => d % 2 === 1).map(([n]) => n).sort();
    };
    expect(routeEnds('wA')).toEqual(['U1:A', 'U2:C1']);
    expect(routeEnds('wB')).toEqual(['U1:B', 'U3:C1']);
  });

  it('an unused connector yields no connector node', () => {
    // U1 has connectors A and B; only A is wired. B → no connector node.
    const u1 = makeTwoConnectorDevice('U1', 2, 0, 0);
    const u2 = makeDevice('U2', 'C1', 2, 0, 200);
    const wires = [wire('wA', 'U1:A-P1', 'U2:C1-P1')];
    const g = deriveHarness(makeInput({ placedDevices: [u1, u2], wires }));
    expect(g.nodes.some(n => n.kind === 'connector' && n.id === 'U1:A')).toBe(true);
    expect(g.nodes.some(n => n.kind === 'connector' && n.id === 'U1:B')).toBe(false);
    // U1 still has its component block node.
    expect(g.nodes.some(n => n.kind === 'component' && n.id === 'U1')).toBe(true);
  });

  it('a connector whose raw name has spaces docks at its real dock point — not the origin', () => {
    // Real shipped library devices have connector names with spaces / parens
    // (Dynon SV-D1000 `'J-NET 1'`, AFS ACM `'P1 (EFIS PFD)'`). The pin id
    // builder SLUGIFIES the connector name, so the wire pin key — and thus the
    // connector node id — carries the slugified name. `connectorDockPoints`,
    // however, keys by the RAW `logicalConnectorName`. The dock lookup must
    // bridge the two so the connector node lands on its device, not at (0,0).
    const rawConn = 'J NET 1';
    const slug = slugifyDesignator(rawConn); // 'J-NET-1'
    const u1 = makeDeviceRawConn('U1', rawConn, 2, 0, 0);
    const u2 = makeDevice('U2', 'C1', 2, 0, 200);
    // U1's connector's first pin id, exactly as the app would generate it.
    const u1Pin = u1.connectors[0].pinIds[0]; // 'J-NET-1-P1'
    const wires = [wire('w1', `U1:${u1Pin}`, 'U2:C1-P1')];
    const g = deriveHarness(makeInput({ placedDevices: [u1, u2], wires }));

    // The connector node id is `<placementId>:<slugified connector name>`.
    const connNode = g.nodes.find(n => n.kind === 'connector' && n.id === `U1:${slug}`);
    expect(connNode).toBeDefined();

    // The real dock point. `deriveHarness` docks the connector against the
    // device's *effective* (auto-layout) position, so compute the expected
    // dock against that same position. `connectorDockPoints` is RAW-keyed.
    const layout = harnessAutoLayout(
      [u1, u2].map(pd => ({ id: pd.id, sortKey: pd.name })),
    );
    const u1AtLayout: PlacedDevice = { ...u1, position: layout.U1 };
    const expectedDock = connectorDockPoints(u1AtLayout, 0).get(rawConn)!;
    expect(expectedDock).toBeDefined();

    // The connector node must sit at its real dock point, NOT pinned to (0,0).
    expect(connNode!.position).not.toEqual({ x: 0, y: 0 });
    expect(connNode!.position).toEqual(expectedDock);
  });
});

describe('deriveHarness — clean splice-cad tree', () => {
  it('three devices on one net → exactly ONE branch point, 3 bundles, all connectors are leaves', () => {
    // U1 — U2 — U3 chained on one net. The column auto-layout makes the MST a
    // path U1—U2—U3, so the interior connector U2:C1 has MST-degree 2 → it is
    // the single branched connector. Its branch point bp:U2:C1 is the only
    // interior node; U1, U2, U3 connectors are all degree-1 leaves.
    const { placedDevices, wires, netLabels } = chainOfThree();
    const g = deriveHarness(makeInput({ placedDevices, wires, netLabels }));
    expect(g.nodes.filter(n => n.kind === 'component')).toHaveLength(3);
    // Exactly one branch point — for the interior connector U2:C1.
    expect(g.nodes.filter(n => n.kind === 'branchPoint').map(n => n.id))
      .toEqual(['bp:U2:C1']);
    // 3 bundles: bp—U1:C1, bp—U2:C1 (the connector's own leaf cable), bp—U3:C1.
    expect(g.bundles).toHaveLength(3);
    // Every connector node is a degree-1 leaf.
    for (const id of ['U1:C1', 'U2:C1', 'U3:C1']) {
      expect(incidentBundles(g, id)).toHaveLength(1);
    }
    // Every conductor is routed onto at least one bundle.
    for (const w of wires) {
      expect(g.bundles.some(b => b.conductorIds.includes(w.id))).toBe(true);
    }
  });

  it('a 4-device line → exactly 2 branch points, each with ≥ 3 incident bundles; all 4 connectors are leaves', () => {
    // Four devices stacked in a column → the MST is a path U1—U2—U3—U4.
    // The two interior connectors U2:C1 and U3:C1 each have MST-degree 2 →
    // each gets a branch point. The two end connectors stay leaves.
    // This is the splice-cad reference shape: two genuine 3-way fan-outs.
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
      makeDevice('U3', 'C1', 2, 0, 400),
      makeDevice('U4', 'C1', 2, 0, 600),
    ];
    const wires = [
      wire('w1', 'U1:C1-P1', '#lA'),
      wire('w2', 'U2:C1-P1', '#lB'),
      wire('w3', 'U3:C1-P1', '#lC'),
      wire('w4', 'U4:C1-P1', '#lD'),
    ];
    const netLabels: NetLabel[] = [
      { id: 'lA', text: 'VCC', attachedTo: 'U1:C1-P1' } as NetLabel,
      { id: 'lB', text: 'VCC', attachedTo: 'U2:C1-P1' } as NetLabel,
      { id: 'lC', text: 'VCC', attachedTo: 'U3:C1-P1' } as NetLabel,
      { id: 'lD', text: 'VCC', attachedTo: 'U4:C1-P1' } as NetLabel,
    ];
    const g = deriveHarness(makeInput({ placedDevices, wires, netLabels }));
    const bps = g.nodes.filter(n => n.kind === 'branchPoint');
    expect(bps.map(n => n.id).sort()).toEqual(['bp:U2:C1', 'bp:U3:C1']);
    // Each branch point is a genuine fan-out — ≥ 3 incident bundles.
    for (const bp of bps) {
      expect(incidentBundles(g, bp.id).length).toBeGreaterThanOrEqual(3);
    }
    // All 4 connectors are degree-1 leaves.
    for (const id of ['U1:C1', 'U2:C1', 'U3:C1', 'U4:C1']) {
      expect(incidentBundles(g, id)).toHaveLength(1);
    }
  });

  it('every branchPoint node has ≥ 3 incident bundles (a genuine fan-out)', () => {
    // A device wired to three others — its connector has MST-degree 3 → it is
    // branched. The synthesized branch point must be a real fan-out.
    const { placedDevices, wires, overrides } = starFixture();
    const g = deriveHarness(makeInput({ placedDevices, wires }), overrides);
    const bps = g.nodes.filter(n => n.kind === 'branchPoint');
    expect(bps.length).toBeGreaterThan(0);
    for (const bp of bps) {
      expect(incidentBundles(g, bp.id).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('a degree-≥2 connector becomes a leaf whose one bundle goes to its bp:<id>', () => {
    // U1 fans out to U2, U3, U4 → U1:C1 has MST-degree 3, so it branches.
    // The connector must end up a degree-1 leaf, and its single incident
    // bundle's other endpoint is its own branch point bp:U1:C1.
    const { placedDevices, wires, overrides } = starFixture();
    const g = deriveHarness(makeInput({ placedDevices, wires }), overrides);
    // U1:C1 is the only branched connector → exactly one branch point.
    expect(g.nodes.filter(n => n.kind === 'branchPoint').map(n => n.id))
      .toEqual(['bp:U1:C1']);
    const incident = incidentBundles(g, 'U1:C1');
    expect(incident).toHaveLength(1);
    const other = incident[0].endpoints.find(e => e !== 'U1:C1')!;
    expect(other).toBe('bp:U1:C1');
    const bp = g.nodes.find(n => n.id === 'bp:U1:C1')!;
    expect(bp.kind).toBe('branchPoint');
  });

  it('a junction net → a splice node, interior, never branched into a branch point', () => {
    // A junction splice with three wire neighbours. A `splice` is NEVER
    // branched — it is an internal fan-out already. It stays a multi-bundle
    // interior node; no `bp:J:j1` node is synthesized.
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
      makeDevice('U3', 'C1', 2, 200, 100),
    ];
    const junctions: Junction[] = [{ id: 'j1', sheetId: 's1', position: { x: 0, y: 100 } }];
    const wires = [
      wire('a1', 'U1:C1-P1', 'junction:j1'),
      wire('a2', 'junction:j1', 'U2:C1-P1'),
      wire('b', 'U3:C1-P1', 'junction:j1'),
    ];
    const g = deriveHarness(makeInput({ placedDevices, wires, junctions }));
    const splices = g.nodes.filter(n => n.kind === 'splice');
    expect(splices).toHaveLength(1);
    const splice = splices[0];
    // The splice is interior — it touches >= 2 bundles (a leaf touches 1).
    expect(incidentBundles(g, splice.id).length).toBeGreaterThan(1);
    // The splice is never branched — no `bp:<spliceId>` node.
    expect(g.nodes.some(n => n.id === `bp:${splice.id}`)).toBe(false);
  });
});

describe('deriveHarness — conductor routing (shared trunk)', () => {
  it('two nets between the same two devices → ONE bundle carrying both conductors', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 4, 0, 0),
      makeDevice('U2', 'C1', 4, 0, 200),
    ];
    const wires = [
      wire('w1', 'U1:C1-P1', 'U2:C1-P1'),
      wire('w2', 'U1:C1-P2', 'U2:C1-P2'),
    ];
    const g = deriveHarness(makeInput({ placedDevices, wires }));
    // Both nets run between U1 and U2 → a single direct bundle; both
    // conductors share the SAME route, so the one bundle carries both.
    expect(g.bundles).toHaveLength(1);
    expect(g.bundles[0].conductorIds.slice().sort()).toEqual(['w1', 'w2']);
  });

  it("routes a wire along the unique tree-path; every crossed bundle lists it", () => {
    // U1 — U2 — U3 chained. U2's connector is the interior branched connector.
    // A wire from U1 to U3 crosses the whole tree; a wire from U1 to U2 crosses
    // the U1-side leg and the U2 leg.
    const placedDevices = [
      makeDevice('U1', 'C1', 4, 0, 0),
      makeDevice('U2', 'C1', 4, 0, 200),
      makeDevice('U3', 'C1', 4, 0, 400),
    ];
    const wires = [
      wire('w12', 'U1:C1-P1', 'U2:C1-P1'),
      wire('w23', 'U2:C1-P2', 'U3:C1-P2'),
      wire('wEnd', 'U1:C1-P3', 'U3:C1-P3'),
    ];
    const g = deriveHarness(makeInput({ placedDevices, wires }));
    // Every wire's bundle-path is non-empty and is a connected path between
    // its two CONNECTOR nodes (bundles terminate at connectors now).
    const u1 = g.nodes.find(n => n.kind === 'connector' && n.refId === 'U1:C1')!.id;
    const u2 = g.nodes.find(n => n.kind === 'connector' && n.refId === 'U2:C1')!.id;
    const u3 = g.nodes.find(n => n.kind === 'connector' && n.refId === 'U3:C1')!.id;
    const carries = (wid: string) => g.bundles.filter(b => b.conductorIds.includes(wid));
    // wEnd connects the two end connectors — its path spans the whole tree.
    const wEndPath = carries('wEnd');
    expect(wEndPath.length).toBeGreaterThan(1);
    // Each routed wire forms a valid simple path between its endpoint nodes.
    for (const [wid, from, to] of [['w12', u1, u2], ['w23', u2, u3], ['wEnd', u1, u3]] as const) {
      const path = carries(wid);
      expect(path.length).toBeGreaterThan(0);
      // Endpoints of the path-as-edge-set are exactly the two device nodes:
      // every other node touched by the path appears an even number of times.
      const deg = new Map<string, number>();
      for (const b of path) for (const e of b.endpoints) deg.set(e, (deg.get(e) ?? 0) + 1);
      const odd = [...deg.entries()].filter(([, d]) => d % 2 === 1).map(([n]) => n).sort();
      expect(odd).toEqual([from, to].sort());
    }
  });

  it('a cycle wire still routes along the tree-path between its endpoints', () => {
    // Triangle U1-U2, U2-U3, U3-U1. The MST drops one cycle-closing edge;
    // every wire still routes along the surviving tree path.
    const placedDevices = [
      makeDevice('U1', 'C1', 4, 0, 0),
      makeDevice('U2', 'C1', 4, 200, 0),
      makeDevice('U3', 'C1', 4, 100, 200),
    ];
    const wires = [
      wire('w12', 'U1:C1-P1', 'U2:C1-P1'),
      wire('w23', 'U2:C1-P2', 'U3:C1-P2'),
      wire('w31', 'U3:C1-P3', 'U1:C1-P3'),
    ];
    const g = deriveHarness(makeInput({ placedDevices, wires }));
    // Every wire — including the cycle-closing one — routes onto >= 1 bundle.
    for (const w of wires) {
      expect(g.bundles.some(b => b.conductorIds.includes(w.id))).toBe(true);
    }
    // The bundle graph is still a tree over the non-component nodes (the
    // `component` block nodes are not bundle endpoints): #edges = #nodes-1
    // counting only connector / splice / branchPoint nodes.
    const wired = g.nodes.filter(n => n.kind !== 'component').length;
    expect(g.bundles).toHaveLength(wired - 1);
  });
});

describe('deriveHarness — stable branch-point ids', () => {
  it('branch-point ids are bp:<servedConnectorNodeId> — derived from the connector', () => {
    const { placedDevices, wires, netLabels } = chainOfThree();
    const g = deriveHarness(makeInput({ placedDevices, wires, netLabels }));
    const bps = g.nodes.filter(n => n.kind === 'branchPoint');
    expect(bps.length).toBeGreaterThan(0);
    // Every branch point's id is bp:<a connector node id that exists in the
    // graph> — branch points are synthesized from branched connectors.
    for (const bp of bps) {
      expect(bp.id.startsWith('bp:')).toBe(true);
      const served = bp.id.slice(3);
      const servedNode = g.nodes.find(n => n.id === served);
      expect(servedNode).toBeDefined();
      expect(servedNode!.kind).toBe('connector');
    }
    // The interior device U2's connector is the branched one.
    expect(g.nodes.some(n => n.id === 'bp:U2:C1')).toBe(true);
  });

  it('branch-point ids are deterministic + unchanged by an unrelated edit', () => {
    const a = chainOfThree();
    const g1 = deriveHarness(makeInput({ ...a }));
    // An unrelated schematic edit: add a separate disconnected device pair.
    const b = chainOfThree();
    b.placedDevices.push(makeDevice('U9', 'C1', 2, 800, 0));
    b.placedDevices.push(makeDevice('U8', 'C1', 2, 800, 200));
    b.wires.push(wire('wX', 'U8:C1-P1', 'U9:C1-P1'));
    const g2 = deriveHarness(makeInput({ ...b }));
    const bpIds = (g: ReturnType<typeof deriveHarness>) =>
      g.nodes.filter(n => n.kind === 'branchPoint').map(n => n.id).sort();
    // The original chain has exactly one branch point — the interior U2:C1.
    // The added disconnected U8-U9 pair is a plain 2-device run (no branch
    // point), so it does not change the chain's branch points at all.
    expect(bpIds(g1)).toEqual(['bp:U2:C1']);
    expect(bpIds(g2)).toEqual(['bp:U2:C1']);
  });
});

describe('deriveHarness — overrides', () => {
  it('a node-position override places the component node — and its connector follows', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const layout = harnessAutoLayout(
      placedDevices.map(pd => ({ id: pd.id, sortKey: pd.name })),
    );
    // Baseline (no override) — connector docks relative to the device.
    const base = deriveHarness(makeInput({ placedDevices, wires }));
    const baseComp = base.nodes.find(n => n.kind === 'component' && n.id === 'U1')!;
    const baseConn = base.nodes.find(n => n.kind === 'connector' && n.id === 'U1:C1')!;
    const dockDx = baseConn.position.x - baseComp.position.x;
    const dockDy = baseConn.position.y - baseComp.position.y;

    const overrides = mkOverrides({
      nodePositions: { U1: { x: 999, y: 777 } },
    });
    const g = deriveHarness(makeInput({ placedDevices, wires }), overrides);
    // The `component` node U1 is placed at the override position.
    const u1 = g.nodes.find(n => n.kind === 'component' && n.id === 'U1')!;
    expect(u1.position).toEqual({ x: 999, y: 777 });
    // Its connector node U1:C1 is a pure-derived dock — it moved with the
    // device by exactly the same dock offset.
    const u1Conn = g.nodes.find(n => n.kind === 'connector' && n.id === 'U1:C1')!;
    expect(u1Conn.position).toEqual({ x: 999 + dockDx, y: 777 + dockDy });
    // U2 has no override → its component keeps its auto-layout position.
    const u2 = g.nodes.find(n => n.kind === 'component' && n.id === 'U2')!;
    expect(u2.position).toEqual(layout.U2);
  });

  it('without an override a node derives at the auto-layout position', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const layout = harnessAutoLayout(
      placedDevices.map(pd => ({ id: pd.id, sortKey: pd.name })),
    );
    const g = deriveHarness(makeInput({ placedDevices, wires }));
    expect(g.nodes.find(n => n.kind === 'component' && n.id === 'U1')!.position).toEqual(layout.U1);
    expect(g.nodes.find(n => n.kind === 'component' && n.id === 'U2')!.position).toEqual(layout.U2);
  });

  it('a node-position override survives re-derivation by id', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const overrides = mkOverrides({
      nodePositions: { U2: { x: 500, y: 500 } },
    });
    const g1 = deriveHarness(makeInput({ placedDevices, wires }), overrides);
    // Re-derive with a fresh (added) wire — the override re-applies by id.
    const g2 = deriveHarness(
      makeInput({ placedDevices, wires: [...wires, wire('w2', 'U1:C1-P2', 'U2:C1-P2')] }),
      overrides,
    );
    expect(g1.nodes.find(n => n.kind === 'component' && n.id === 'U2')!.position).toEqual({ x: 500, y: 500 });
    expect(g2.nodes.find(n => n.kind === 'component' && n.id === 'U2')!.position).toEqual({ x: 500, y: 500 });
  });

  it('an override for a removed node is ignored — no crash, no phantom node', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const overrides = mkOverrides({
      // 'U_GONE' / 'bp:U_GONE' are not in the derived graph.
      nodePositions: { U_GONE: { x: 1, y: 2 }, 'bp:U_GONE': { x: 3, y: 4 } },
      bundleLengths: { 'U_GONE|U_ALSO_GONE': 1234 },
    });
    const g = deriveHarness(makeInput({ placedDevices, wires }), overrides);
    expect(g.nodes.some(n => n.id === 'U_GONE')).toBe(false);
    expect(g.nodes.some(n => n.id === 'bp:U_GONE')).toBe(false);
    // 2 component block nodes + 2 connector nodes — a 2-device run is a single
    // direct bundle with no branch point, so no other nodes exist.
    expect(g.nodes).toHaveLength(4);
    expect(g.nodes.filter(n => n.kind === 'component')).toHaveLength(2);
    expect(g.nodes.filter(n => n.kind === 'connector')).toHaveLength(2);
    expect(g.nodes.filter(n => n.kind === 'branchPoint')).toHaveLength(0);
  });

  it("a moved device's branch point follows it unless the branch point is itself overridden", () => {
    // U1 — U2 — U3 chained; U2's connector is the interior branched connector
    // → branch point bp:U2:C1. Its position is the centroid of its tree
    // neighbours, so moving U2 shifts it; pinning it freezes it.
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
      makeDevice('U3', 'C1', 2, 0, 400),
    ];
    const wires = [
      wire('w1', 'U1:C1-P1', '#lA'),
      wire('w2', 'U2:C1-P1', '#lB'),
      wire('w3', 'U3:C1-P1', '#lC'),
    ];
    const netLabels: NetLabel[] = [
      { id: 'lA', text: 'VCC', attachedTo: 'U1:C1-P1' } as NetLabel,
      { id: 'lB', text: 'VCC', attachedTo: 'U2:C1-P1' } as NetLabel,
      { id: 'lC', text: 'VCC', attachedTo: 'U3:C1-P1' } as NetLabel,
    ];
    const base = deriveHarness(makeInput({ placedDevices, wires, netLabels }));
    const baseBp = base.nodes.find(n => n.id === 'bp:U2:C1')!.position;
    const baseU2 = base.nodes.find(n => n.kind === 'component' && n.id === 'U2')!.position;

    // Nudge U2 up the trunk column. It stays the interior connector (the
    // column order U1<U2<U3 is unchanged), so its connector's branch point
    // keeps the stable id `bp:U2:C1` — and the centroid follows the move.
    const moved = mkOverrides({
      nodePositions: { U2: { x: baseU2.x, y: baseU2.y - 40 } },
    });
    const gMoved = deriveHarness(makeInput({ placedDevices, wires, netLabels }), moved);
    const movedBp = gMoved.nodes.find(n => n.id === 'bp:U2:C1')!.position;
    expect(movedBp).not.toEqual(baseBp);

    // Now also pin the branch point itself — it stays put despite the move.
    const pinned = mkOverrides({
      nodePositions: { U2: { x: baseU2.x, y: baseU2.y - 40 }, 'bp:U2:C1': { x: 111, y: 222 } },
    });
    const gPinned = deriveHarness(makeInput({ placedDevices, wires, netLabels }), pinned);
    expect(gPinned.nodes.find(n => n.id === 'bp:U2:C1')!.position).toEqual({ x: 111, y: 222 });
  });

  it('bundle length is keyed by the sorted endpoint pair and round-trips', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    // Discover the bundle's endpoint ids, build the sorted key.
    const probe = deriveHarness(makeInput({ placedDevices, wires }));
    const ep = probe.bundles[0].endpoints.slice().sort();
    const key = `${ep[0]}|${ep[1]}`;
    const overrides = mkOverrides({
      bundleLengths: { [key]: 250 },
    });
    const g = deriveHarness(makeInput({ placedDevices, wires }), overrides);
    expect(g.bundles[0].id).toBe(key);
    expect(g.bundles[0].length).toBe(250);
    // No override → length undefined.
    const plain = deriveHarness(makeInput({ placedDevices, wires }));
    expect(plain.bundles[0].length).toBeUndefined();
  });
});

describe('deriveHarness — branch-point positioning', () => {
  it('a non-overridden branch point sits at the centroid of its tree neighbours', () => {
    // U1 fans out to U2, U3, U4 → bp:U1:C1. Every tree neighbour (the 4
    // connector nodes) is a fixed anchor, so one relaxation pass already
    // converges the branch point onto the exact centroid.
    const { placedDevices, wires, overrides } = starFixture();
    const g = deriveHarness(makeInput({ placedDevices, wires }), overrides);
    const bp = g.nodes.find(n => n.id === 'bp:U1:C1')!;
    // The branch point's tree neighbours are the 4 connector nodes.
    const nbIds = incidentBundles(g, bp.id)
      .map(b => b.endpoints.find(e => e !== bp.id)!);
    expect(nbIds.length).toBe(4);
    const cx = nbIds.reduce((s, id) => s + g.nodes.find(n => n.id === id)!.position.x, 0) / nbIds.length;
    const cy = nbIds.reduce((s, id) => s + g.nodes.find(n => n.id === id)!.position.y, 0) / nbIds.length;
    expect(bp.position.x).toBeCloseTo(cx, 5);
    expect(bp.position.y).toBeCloseTo(cy, 5);
  });

  it('an overridden branch point keeps its overridden position (an anchor)', () => {
    const { placedDevices, wires, overrides } = starFixture();
    const g = deriveHarness(
      makeInput({ placedDevices, wires }),
      mkOverrides({
        nodePositions: {
          ...overrides.nodePositions,
          'bp:U1:C1': { x: 1234, y: 5678 },
        },
      }),
    );
    expect(g.nodes.find(n => n.id === 'bp:U1:C1')!.position).toEqual({ x: 1234, y: 5678 });
  });

  it('derivation is deterministic — same input → identical graph', () => {
    const { placedDevices, wires, netLabels } = chainOfThree();
    const g1 = deriveHarness(makeInput({ placedDevices, wires, netLabels }));
    const g2 = deriveHarness(makeInput({ placedDevices, wires, netLabels }));
    expect(g1).toEqual(g2);
  });
});

describe('deriveHarness — Phase 4 overrides (waypoints + names)', () => {
  it('a bundle carries its overridden waypoints, keyed by the sorted pair id', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const probe = deriveHarness(makeInput({ placedDevices, wires }));
    const key = probe.bundles[0].id;
    const wps = [{ x: 100, y: 50 }, { x: 100, y: 150 }];
    const g = deriveHarness(
      makeInput({ placedDevices, wires }),
      mkOverrides({ bundleWaypoints: { [key]: wps } }),
    );
    expect(g.bundles[0].waypoints).toEqual(wps);
    // No override → waypoints undefined.
    expect(probe.bundles[0].waypoints).toBeUndefined();
  });

  it('a bundle carries its overridden name', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const probe = deriveHarness(makeInput({ placedDevices, wires }));
    const key = probe.bundles[0].id;
    const g = deriveHarness(
      makeInput({ placedDevices, wires }),
      mkOverrides({ bundleNames: { [key]: 'Power Trunk' } }),
    );
    expect(g.bundles[0].name).toBe('Power Trunk');
    expect(probe.bundles[0].name).toBeUndefined();
  });

  it('a waypoint / name override for an absent bundle is ignored', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const g = deriveHarness(
      makeInput({ placedDevices, wires }),
      mkOverrides({
        bundleWaypoints: { 'GONE|ALSO_GONE': [{ x: 1, y: 2 }] },
        bundleNames: { 'GONE|ALSO_GONE': 'phantom' },
      }),
    );
    // Only the real bundle exists (a 2-device run — one direct bundle); the
    // phantom-keyed override is never read, so the bundle is clean.
    expect(g.bundles).toHaveLength(1);
    for (const b of g.bundles) {
      expect(b.waypoints).toBeUndefined();
      expect(b.name).toBeUndefined();
    }
  });

  it('waypoints + name survive re-derivation by id', () => {
    const placedDevices = [
      makeDevice('U1', 'C1', 2, 0, 0),
      makeDevice('U2', 'C1', 2, 0, 200),
    ];
    const wires = [wire('w1', 'U1:C1-P1', 'U2:C1-P1')];
    const key = deriveHarness(makeInput({ placedDevices, wires })).bundles[0].id;
    const ov = mkOverrides({
      bundleWaypoints: { [key]: [{ x: 60, y: 90 }] },
      bundleNames: { [key]: 'Avionics' },
    });
    const g2 = deriveHarness(
      makeInput({ placedDevices, wires: [...wires, wire('w2', 'U1:C1-P2', 'U2:C1-P2')] }),
      ov,
    );
    expect(g2.bundles[0].waypoints).toEqual([{ x: 60, y: 90 }]);
    expect(g2.bundles[0].name).toBe('Avionics');
  });
});

describe('deriveHarness — connectorOrder override', () => {
  it('connectorOrder swaps connector node Y positions without changing ids or bundle count', () => {
    // U1 has two connectors A (wired to U2) and B (wired to U3).
    // Both are used → both become connector nodes U1:A and U1:B.
    // Natural order: A is row 0, B is row 1 → A.y < B.y.
    // With connectorOrder ['B','A']: B is row 0, A is row 1 → B.y < A.y.
    const u1 = makeTwoConnectorDevice('U1', 2, 0, 0);
    const u2 = makeDevice('U2', 'C1', 2, 0, 200);
    const u3 = makeDevice('U3', 'C1', 2, 0, 400);
    const wires = [
      wire('wA', 'U1:A-P1', 'U2:C1-P1'),
      wire('wB', 'U1:B-P1', 'U3:C1-P1'),
    ];
    const input = makeInput({ placedDevices: [u1, u2, u3], wires });

    // Derive without overrides (natural order).
    const gBase = deriveHarness(input);
    const baseA = gBase.nodes.find(n => n.kind === 'connector' && n.id === 'U1:A')!;
    const baseB = gBase.nodes.find(n => n.kind === 'connector' && n.id === 'U1:B')!;
    expect(baseA).toBeDefined();
    expect(baseB).toBeDefined();
    // Natural order: A appears before B → A.y < B.y.
    expect(baseA.position.y).toBeLessThan(baseB.position.y);

    // Derive with connectorOrder: ['B', 'A'] for placement 'U1'.
    const gReordered = deriveHarness(
      input,
      mkOverrides({ connectorOrder: { U1: ['B', 'A'] } }),
    );
    const reordA = gReordered.nodes.find(n => n.kind === 'connector' && n.id === 'U1:A')!;
    const reordB = gReordered.nodes.find(n => n.kind === 'connector' && n.id === 'U1:B')!;
    expect(reordA).toBeDefined();
    expect(reordB).toBeDefined();
    // Reordered: B is now row 0, A is row 1 → B.y < A.y.
    expect(reordB.position.y).toBeLessThan(reordA.position.y);

    // The Y positions are SWAPPED between the two derivations.
    expect(reordA.position.y).toBe(baseB.position.y);
    expect(reordB.position.y).toBe(baseA.position.y);

    // Electrically unchanged: same node ids and same bundle count.
    const nodeIds = (g: ReturnType<typeof deriveHarness>) =>
      g.nodes.map(n => n.id).sort();
    expect(nodeIds(gReordered)).toEqual(nodeIds(gBase));
    expect(gReordered.bundles).toHaveLength(gBase.bundles.length);
  });
});

describe('harnessAutoLayout', () => {
  it('is deterministic — same input → same positions', () => {
    const devices = [
      { id: 'U2', sortKey: 'U2' },
      { id: 'U1', sortKey: 'U1' },
      { id: 'U3', sortKey: 'U3' },
    ];
    const a = harnessAutoLayout(devices);
    const b = harnessAutoLayout(devices);
    expect(a).toEqual(b);
  });

  it('orders devices in a column by their stable sort key', () => {
    const devices = [
      { id: 'U3', sortKey: 'U3' },
      { id: 'U1', sortKey: 'U1' },
      { id: 'U2', sortKey: 'U2' },
    ];
    const pos = harnessAutoLayout(devices);
    // Column order follows sortKey: U1 above U2 above U3.
    expect(pos.U1.y).toBeLessThan(pos.U2.y);
    expect(pos.U2.y).toBeLessThan(pos.U3.y);
    // Same column → same x.
    expect(pos.U1.x).toBe(pos.U2.x);
    expect(pos.U2.x).toBe(pos.U3.x);
  });

  it('uses an override position for a device that has one', () => {
    const devices = [
      { id: 'U1', sortKey: 'U1' },
      { id: 'U2', sortKey: 'U2' },
    ];
    const pos = harnessAutoLayout(devices, { U2: { x: 42, y: 99 } });
    expect(pos.U2).toEqual({ x: 42, y: 99 });
    // U1 still gets its auto position.
    expect(pos.U1).toEqual(harnessAutoLayout(devices).U1);
  });
});
