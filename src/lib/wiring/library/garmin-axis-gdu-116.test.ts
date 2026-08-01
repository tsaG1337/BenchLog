import { describe, it, expect } from 'vitest';
import { instantiateDevice } from './types';
import gdu116b from './devices/garmin-axis-gdu-116b';
import gdu116c from './devices/garmin-axis-gdu-116c';
import gdu116nc from './devices/garmin-axis-gdu-116nc';

/**
 * These three templates are the first real (non-draft) use of
 * `DeviceTemplate.placements` — multi-block device splitting — so they're
 * worth a regression test beyond "does it typecheck". Two failure modes
 * matter most: duplicate pin ids within one device (silently merges two
 * distinct pins), and a `placements[].connectorNames` typo that doesn't
 * match any real connector name (silently peels zero connectors — the
 * exact bug `commitPlacement` in WiringPage.tsx would hit at runtime,
 * mirrored here without needing the store/canvas).
 *
 * Deliberately lives one level above devices/ — that directory is
 * `import.meta.glob('./devices/*.ts', { eager: true })`-imported wholesale
 * as device templates (library/index.ts), so a `.test.ts` file placed
 * inside it gets bundled into the app itself and drags `vitest` into the
 * production build. Learned that the hard way — see CHANGELOG_INTERNAL.md.
 */
describe.each([
  ['AXIS GDU 116B', gdu116b],
  ['AXIS GDU 116C', gdu116c],
  ['AXIS GDU 116NC', gdu116nc],
])('%s', (_label, template) => {
  it('instantiates with no duplicate pin ids', () => {
    const { device } = instantiateDevice(template, { x: 0, y: 0 }, 'U1');
    const ids = device.pinCatalog.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every connector name referenced by placements[] exists on the template', () => {
    const connectorNames = new Set(template.connectors.map(c => c.name));
    for (const entry of template.placements ?? []) {
      for (const name of entry.connectorNames) {
        expect(connectorNames.has(name)).toBe(true);
      }
    }
  });

  it('simulates commitPlacement\'s split: every peeled placement actually gets connectors, and every connector lands on exactly one placement', () => {
    const { placement } = instantiateDevice(template, { x: 0, y: 0 }, 'U1');
    const layout = template.placements ?? [];
    // Mirror WiringPage.tsx's commitPlacement loop: entry 0 is the anchor
    // (already holds every connector from instantiateDevice); entries 1..n
    // peel named connectors off it by logicalConnectorName.
    let anchorConnectors = placement.connectors;
    const seenConnectorIds = new Set<string>();
    for (let i = 1; i < layout.length; i++) {
      const wanted = new Set(layout[i].connectorNames);
      const peeled = anchorConnectors.filter(c => wanted.has(c.logicalConnectorName));
      expect(peeled.length).toBeGreaterThan(0);
      for (const c of peeled) seenConnectorIds.add(c.id);
      anchorConnectors = anchorConnectors.filter(c => !wanted.has(c.logicalConnectorName));
    }
    for (const c of anchorConnectors) seenConnectorIds.add(c.id);
    // Every physical connector on the template ends up on exactly one
    // placement after the full split — none dropped, none duplicated.
    expect(seenConnectorIds.size).toBe(placement.connectors.length);
  });

  it('J1011 and J1012 pinouts are present on every variant (identical per the manual)', () => {
    const j1011 = template.connectors.find(c => c.name === 'J1011');
    const j1012 = template.connectors.find(c => c.name === 'J1012');
    expect(j1011?.pins.length).toBe(9);
    expect(j1012?.pins.length).toBe(49);
  });
});

describe('AXIS GDU 116B (no J1013/J1015)', () => {
  it('has exactly two connectors', () => {
    expect(gdu116b.connectors.map(c => c.name).sort()).toEqual(['J1011', 'J1012']);
  });
});

describe.each([
  ['AXIS GDU 116C', gdu116c],
  ['AXIS GDU 116NC', gdu116nc],
])('%s (has J1013/J1015)', (_label, template) => {
  it('has all four connectors with the documented pin counts', () => {
    const byName = Object.fromEntries(template.connectors.map(c => [c.name, c.pins.length]));
    expect(byName).toEqual({ J1011: 9, J1012: 49, J1013: 58, J1015: 47 });
  });
});
