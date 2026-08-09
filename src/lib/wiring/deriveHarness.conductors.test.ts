/**
 * Conductor routing — which wires each physical cable actually carries.
 *
 * The bug these cover: label-net conductors were grouped by the harness
 * TREE root rather than by electrical net. Every wire unions its endpoints
 * into that tree, so a connected harness collapses to one root — meaning
 * every net-label wire in the project was treated as a single enormous
 * net and routed onto the minimal subtree spanning all of them, i.e. most
 * of the harness. A 2-pin resistor on a spur reported 19 conductors,
 * including power rails at the other end of the aircraft and jumpers
 * internal to another device's connector.
 *
 * This matters past the canvas: `conductorIds` feeds the cable- and
 * wire-summary pages of the PDF export, so the counts people size bundles
 * and buy wire from were inflated too.
 *
 * The invariant worth holding onto: a cable reaching a device can carry no
 * more conductors than that device has pins on it.
 */
import { describe, it, expect } from 'vitest';
import { deriveHarness } from './deriveHarness';
import type { Wire, NetLabel, PlacedDevice, ConnectorInstance } from './types';

/** Placed device with one connector; pin keys are `<id>:<conn>-P<n>`, which
 *  is what resolves to the connector node id `<id>:<conn>` in production. */
function makeDevice(id: string, cName: string, pins: number, x = 0, y = 0): PlacedDevice {
  const connector: ConnectorInstance = {
    id: `${id}:${cName}`,
    name: cName,
    logicalConnectorName: cName,
    side: 'right',
    pinIds: Array.from({ length: pins }, (_, i) => `${cName}-P${i + 1}`),
  };
  return {
    id, deviceId: id, sheetId: 's1', position: { x, y }, width: 80, height: 60,
    connectors: [connector], name: id,
    pinCatalog: connector.pinIds.map(pid => ({ id: pid, name: pid, logicalConnectorName: cName })),
  } as PlacedDevice;
}

const wire = (id: string, from: string, to: string): Wire =>
  ({ id, fromPin: from, toPin: to, sheetId: 's1' } as Wire);
const label = (id: string, text: string, attachedTo: string): NetLabel =>
  ({ id, text, attachedTo, sheetId: 's1' } as NetLabel);

/**
 * R1 (a 2-pin resistor) sits on a spur off a backbone of four devices.
 * It carries one real wire and one leg of a two-point label net. Several
 * UNRELATED label nets live elsewhere on the backbone, plus a jumper
 * between two pins of U6's own connector.
 */
function scenario() {
  const placedDevices = [
    makeDevice('R1', 'R', 2, 0, 0),
    makeDevice('U3', 'PANEL', 4, 400, 0),
    makeDevice('U1', 'D37', 8, 800, 0),
    makeDevice('U2', 'D37', 8, 1200, 0),
    makeDevice('U6', 'D25', 8, 1600, 0),
  ];
  const wires = [
    wire('w-r1-u3', 'R1:R-P1', 'U3:PANEL-P1'),
    wire('w-r1-lbl', 'R1:R-P2', '#nl-sts-r1'),
    wire('w-u1-lbl', 'U1:D37-P1', '#nl-sts-u1'),
    wire('w-u3-u1', 'U3:PANEL-P2', 'U1:D37-P2'),
    wire('w-u1-u2', 'U1:D37-P3', 'U2:D37-P1'),
    wire('w-u2-u6', 'U2:D37-P2', 'U6:D25-P1'),
    wire('w-u2-pwr', 'U2:D37-P3', '#nl-pwr-u2'),
    wire('w-u6-pwr', 'U6:D25-P2', '#nl-pwr-u6'),
    wire('w-u1-gps', 'U1:D37-P4', '#nl-gps-u1'),
    wire('w-u6-gps', 'U6:D25-P3', '#nl-gps-u6'),
    wire('w-loop', 'U6:D25-P4', 'U6:D25-P5'),
  ];
  const netLabels = [
    label('nl-sts-r1', 'Pitot_Heat_STS', 'R1:R-P2'),
    label('nl-sts-u1', 'Pitot_Heat_STS', 'U1:D37-P1'),
    label('nl-pwr-u2', 'Avionics_PWR', 'U2:D37-P3'),
    label('nl-pwr-u6', 'Avionics_PWR', 'U6:D25-P2'),
    label('nl-gps-u1', 'GPS_TX', 'U1:D37-P4'),
    label('nl-gps-u6', 'GPS_TX', 'U6:D25-P3'),
  ];
  return deriveHarness({ placedDevices, wires, junctions: [], netLabels });
}

/** Every conductor on any cable touching `nodePrefix`. */
function conductorsAt(g: ReturnType<typeof deriveHarness>, nodePrefix: string): string[] {
  const ids = g.bundles
    .filter(b => b.endpoints.some(e => e.startsWith(nodePrefix)))
    .flatMap(b => b.conductorIds);
  return [...new Set(ids)].sort();
}

/** Which electrical net each fixture wire belongs to. A label net's legs
 *  are separate wire ids but one net — and one physical conductor on any
 *  cable they cross. */
const NET_OF: Record<string, string> = {
  'w-r1-u3': 'R1→U3',
  'w-r1-lbl': 'Pitot_Heat_STS',
  'w-u1-lbl': 'Pitot_Heat_STS',
  'w-u3-u1': 'U3→U1',
  'w-u1-u2': 'U1→U2',
  'w-u2-u6': 'U2→U6',
  'w-u2-pwr': 'Avionics_PWR',
  'w-u6-pwr': 'Avionics_PWR',
  'w-u1-gps': 'GPS_TX',
  'w-u6-gps': 'GPS_TX',
};

describe('conductor routing', () => {
  it('a 2-pin leaf carries only the nets that actually reach it', () => {
    // The reported bug: this spur claimed conductors from unrelated nets.
    // Both legs of Pitot_Heat_STS appear because a label net is stored as
    // one wire id per leg — they are one physical conductor, and the wire
    // summary needs every leg listed, so both ids ride the cable.
    expect(conductorsAt(scenario(), 'R1:')).toEqual(['w-r1-lbl', 'w-r1-u3', 'w-u1-lbl']);
    const nets = new Set(conductorsAt(scenario(), 'R1:').map(w => NET_OF[w]));
    expect([...nets].sort()).toEqual(['Pitot_Heat_STS', 'R1→U3']);
  });

  it('does not put an unrelated power rail on that spur', () => {
    const at = conductorsAt(scenario(), 'R1:');
    expect(at).not.toContain('w-u2-pwr');
    expect(at).not.toContain('w-u6-pwr');
  });

  it('does not put an unrelated serial net on that spur', () => {
    const at = conductorsAt(scenario(), 'R1:');
    expect(at).not.toContain('w-u1-gps');
    expect(at).not.toContain('w-u6-gps');
  });

  it('never routes a same-connector jumper through any cable', () => {
    // U6:D25-P4 → U6:D25-P5 is a loopback inside one connector. It has no
    // physical run in the harness, so no bundle should list it.
    for (const b of scenario().bundles) {
      expect(b.conductorIds).not.toContain('w-loop');
    }
  });

  it('still carries both legs of a genuine two-point label net', () => {
    // Pitot_Heat_STS runs R1 → U1, so every cable between them carries it.
    const g = scenario();
    const carriers = g.bundles.filter(b => b.conductorIds.includes('w-r1-lbl'));
    expect(carriers.length).toBeGreaterThan(0);
    // Both legs of one net travel together.
    for (const b of carriers) expect(b.conductorIds).toContain('w-u1-lbl');
  });

  it('still runs a multi-point power rail along the trunk it spans', () => {
    // Avionics_PWR lands on U2 and U6, so the cable between them carries it.
    const g = scenario();
    const carriers = g.bundles.filter(b => b.conductorIds.includes('w-u2-pwr'));
    expect(carriers.length).toBeGreaterThan(0);
    for (const b of carriers) expect(b.conductorIds).toContain('w-u6-pwr');
  });

  it('keeps two different nets landing on the same connector distinct', () => {
    // U6:D25 carries both Avionics_PWR and GPS_TX. Sharing a connector must
    // not merge them into one net.
    const g = scenario();
    const pwrOnly = g.bundles.filter(b =>
      b.conductorIds.includes('w-u2-pwr') && !b.conductorIds.includes('w-u1-gps'));
    expect(pwrOnly.length).toBeGreaterThan(0);
  });

  it('collapses a two-point label net into one conductor with real pins', () => {
    // The label is a drawing convenience: R1:R-P2 and U1:D37-P8 are one
    // wire. It must read that way, not as two stubs into a #netlabel.
    const g = scenario();
    const spur = g.bundles.filter(b => b.endpoints.some(e => e.startsWith('R1:')));
    const all = spur.flatMap(b => b.conductors);
    const sts = all.filter(c => c.wireIds.includes('w-r1-lbl'));
    expect(sts).toHaveLength(1);
    expect([sts[0].from, sts[0].to].sort()).toEqual(['R1:R-P2', 'U1:D37-P1']);
    expect(sts[0].wireIds.sort()).toEqual(['w-r1-lbl', 'w-u1-lbl']);
  });

  it('never reports a #netlabel as a conductor endpoint', () => {
    for (const b of scenario().bundles) {
      for (const c of b.conductors) {
        expect(c.from.startsWith('#')).toBe(false);
        expect(c.to.startsWith('#')).toBe(false);
      }
    }
  });

  it('counts the R1 spur as 2 physical conductors, not 3 schematic wires', () => {
    const g = scenario();
    const spur = g.bundles.filter(b => b.endpoints.some(e => e.startsWith('R1:')));
    expect(spur).toHaveLength(1);
    expect(spur[0].conductorIds).toHaveLength(3); // schematic legs
    expect(spur[0].conductors).toHaveLength(2);   // physical wires
  });

  it('gives a plain wire one conductor between its own two pins', () => {
    const g = scenario();
    const plain = g.bundles.flatMap(b => b.conductors).filter(c => c.id === 'w-r1-u3');
    expect(plain.length).toBeGreaterThan(0);
    for (const c of plain) {
      expect([c.from, c.to].sort()).toEqual(['R1:R-P1', 'U3:PANEL-P1']);
      expect(c.wireIds).toEqual(['w-r1-u3']);
    }
  });

  it('no cable carries more NETS than the pins available at its device ends', () => {
    // The invariant the bug violated: a cable reaching a connector cannot
    // carry more distinct nets than that connector has pins. R1's spur
    // claimed 19 against 2 available pins.
    const g = scenario();
    const pinsPerConnector: Record<string, number> = {
      'R1:R': 2, 'U3:PANEL': 4, 'U1:D37': 8, 'U2:D37': 8, 'U6:D25': 8,
    };
    for (const b of g.bundles) {
      const nets = new Set(b.conductorIds.map(w => NET_OF[w] ?? w));
      for (const end of b.endpoints) {
        const cap = pinsPerConnector[end];
        if (cap === undefined) continue; // branch point / splice — not a device end
        expect(nets.size).toBeLessThanOrEqual(cap);
      }
    }
  });
});
