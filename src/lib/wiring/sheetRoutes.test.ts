import { describe, it, expect } from 'vitest';
import { computeSheetRoutes } from './sheetRoutes';
import type { PlacedDevice, ConnectorInstance, Wire, Junction, Shield } from './types';

// ── Fixtures (same shapes deriveHarness.test.ts uses) ────────────────

function makeDevice(id: string, cName: string, pins: number, x = 0, y = 0, side: ConnectorInstance['side'] = 'right'): PlacedDevice {
  const connector: ConnectorInstance = {
    id: `${id}:${cName}`,
    name: cName,
    logicalConnectorName: cName,
    side,
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

function makeWire(id: string, fromPin: string, toPin: string, over: Partial<Wire> = {}): Wire {
  return { id, sheetId: 's1', fromPin, toPin, color: 'currentColor', showLabel: true, ...over };
}

const baseCtx = {
  netLabels: [] as never[],
  junctions: [] as Junction[],
};

describe('computeSheetRoutes — basics', () => {
  it('routes a pin-to-pin wire and produces a path string', () => {
    const a = makeDevice('U1', 'C1', 2, 0, 0);
    const b = makeDevice('U2', 'C1', 2, 400, 0);
    const w = makeWire('w1', 'U1:P1', 'U2:P1');
    const res = computeSheetRoutes({ placedDevices: [a, b], wires: [w], ...baseCtx });
    const r = res.routes.get('w1');
    expect(r).toBeDefined();
    expect(r!.points.length).toBeGreaterThanOrEqual(2);
    expect(r!.pathD.startsWith('M ')).toBe(true);
  });

  it('skips wires with dangling endpoints instead of throwing', () => {
    const a = makeDevice('U1', 'C1', 2, 0, 0);
    const w = makeWire('w1', 'U1:P1', 'GONE:P9');
    const res = computeSheetRoutes({ placedDevices: [a], wires: [w], ...baseCtx });
    expect(res.routes.has('w1')).toBe(false);
  });

  it('resolves junction endpoints from the explicit junction list', () => {
    const a = makeDevice('U1', 'C1', 2, 0, 0);
    const j: Junction = { id: 'j1', sheetId: 's1', position: { x: 300, y: 40 } };
    const w = makeWire('w1', 'U1:P1', 'junction:j1');
    const res = computeSheetRoutes({ placedDevices: [a], wires: [w], netLabels: [], junctions: [j] });
    const r = res.routes.get('w1');
    expect(r).toBeDefined();
    expect(r!.ends.to).toEqual({ x: 300, y: 40 });
  });
});

describe('computeSheetRoutes — hop arcs (the PDF-export regression)', () => {
  it('inserts an arc where one wire crosses another without connecting', () => {
    // U1.P1 → U2.P1 runs horizontally. A second wire drops vertically
    // through that horizontal between two vertically-offset devices, at an
    // x strictly inside the horizontal's span → the horizontal must hop.
    const left  = makeDevice('U1', 'C1', 1, 0, 100);
    const right = makeDevice('U2', 'C1', 1, 600, 100);
    const top    = makeDevice('U3', 'C1', 1, 250, -300);
    const bottom = makeDevice('U4', 'C1', 1, 250, 400);
    const horizontal = makeWire('wh', 'U1:P1', 'U2:P1');
    const vertical   = makeWire('wv', 'U3:P1', 'U4:P1');
    const res = computeSheetRoutes({
      placedDevices: [left, right, top, bottom],
      wires: [horizontal, vertical],
      ...baseCtx,
    });
    const h = res.routes.get('wh')!;
    // The hop is an SVG arc command with the hop radius (5).
    expect(h.pathD).toMatch(/A 5 5/);
    // The vertical itself must NOT hop (hops only go on horizontals).
    const v = res.routes.get('wv')!;
    expect(v.pathD).not.toMatch(/A 5 5/);
  });

  it('does not hop when wires do not cross', () => {
    const a1 = makeDevice('U1', 'C1', 1, 0, 0);
    const a2 = makeDevice('U2', 'C1', 1, 400, 0);
    const b1 = makeDevice('U3', 'C1', 1, 0, 500);
    const b2 = makeDevice('U4', 'C1', 1, 400, 500);
    const res = computeSheetRoutes({
      placedDevices: [a1, a2, b1, b2],
      wires: [makeWire('w1', 'U1:P1', 'U2:P1'), makeWire('w2', 'U3:P1', 'U4:P1')],
      ...baseCtx,
    });
    expect(res.routes.get('w1')!.pathD).not.toMatch(/A 5 5/);
    expect(res.routes.get('w2')!.pathD).not.toMatch(/A 5 5/);
  });
});

describe('computeSheetRoutes — shield drain pins (two-phase)', () => {
  it('resolves a #shield:<id> endpoint to the pin-termination dot', () => {
    // Two parallel wires wrapped by a shield with a pin termination, plus a
    // drain wire from the shield pin to a ground device. Phase A routes the
    // member wires, the shield pin position derives from them, then phase B
    // routes the drain wire against that position.
    const l1 = makeDevice('U1', 'C1', 2, 0, 0);
    const r1 = makeDevice('U2', 'C1', 2, 600, 0);
    const gnd = makeDevice('G1', 'C1', 1, 300, 400);
    const w1 = makeWire('w1', 'U1:P1', 'U2:P1');
    const w2 = makeWire('w2', 'U1:P2', 'U2:P2');
    const shield: Shield = {
      id: 'sh1', sheetId: 's1', wireIds: ['w1', 'w2'],
      xStart: 200, xEnd: 400, termination: 'pin',
    };
    const drain = makeWire('wd', '#shield:sh1', 'G1:P1');
    const res = computeSheetRoutes({
      placedDevices: [l1, r1, gnd],
      wires: [w1, w2, drain],
      netLabels: [],
      junctions: [],
      shields: [shield],
    });
    const pinPos = res.shieldPinPos.get('sh1');
    expect(pinPos).toBeDefined();
    // Centered on the shield's x-range.
    expect(pinPos!.x).toBe(300);
    const d = res.routes.get('wd');
    expect(d).toBeDefined();
    expect(d!.ends.from).toEqual(pinPos);
  });
});
