/**
 * Round-trip coverage for the harness override layer.
 *
 * `serialize` writes whole sheets, so anything added to HarnessOverrides
 * gets saved for free — but `loadFromJson` rebuilds the override object
 * field by field, so a new field has to be taught to the loader too.
 * `lockedEdges` and `branchPointLabels` were both added without that
 * step and were silently discarded on load: locking the harness layout
 * held until the next reload and no further.
 *
 * These assert the whole shape survives a save/load cycle, so the next
 * field added to HarnessOverrides fails here rather than in the field.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useWiring } from './store';
import type { HarnessOverrides } from './types';

function roundTrip(overrides: Partial<HarnessOverrides>): HarnessOverrides | undefined {
  const s = useWiring.getState();
  const sheetId = s.sheets[0].id;
  // Seed the active sheet's harness slice, then save → load → read back.
  useWiring.setState({
    sheets: s.sheets.map(sh => sh.id === sheetId
      ? { ...sh, harness: { viewMode: 'harness', overrides: overrides as HarnessOverrides } }
      : sh),
  });
  const json = useWiring.getState().serialize();
  useWiring.getState().loadFromJson(json);
  return useWiring.getState().sheets.find(sh => sh.id === sheetId)?.harness?.overrides;
}

describe('harness overrides survive a save/load round trip', () => {
  beforeEach(() => {
    // Each test starts from whatever the store's initial sheet set is.
    useWiring.getState().loadFromJson(JSON.stringify({ version: 13 }));
  });

  it('keeps lockedEdges — the harness layout stays locked across a reload', () => {
    const out = roundTrip({
      nodePositions: {}, bundleLengths: {}, bundleWaypoints: {},
      bundleNames: {}, nodeOrientations: {},
      lockedEdges: { 'a|b': true, 'b|c': true },
    });
    expect(out?.lockedEdges).toEqual({ 'a|b': true, 'b|c': true });
  });

  it('keeps branchPointLabels so branch points do not renumber on reload', () => {
    const out = roundTrip({
      nodePositions: {}, bundleLengths: {}, bundleWaypoints: {},
      bundleNames: {}, nodeOrientations: {},
      branchPointLabels: { 'bp:c1': 1, 'bp:c2': 2 },
    });
    expect(out?.branchPointLabels).toEqual({ 'bp:c1': 1, 'bp:c2': 2 });
  });

  it('leaves lockedEdges absent when the project was never locked', () => {
    // Absent and empty must stay distinguishable: presence of the field is
    // what "locked" means to deriveHarness.
    const out = roundTrip({
      nodePositions: {}, bundleLengths: {}, bundleWaypoints: {},
      bundleNames: {}, nodeOrientations: {},
    });
    expect(out?.lockedEdges).toBeUndefined();
  });

  it('preserves an explicitly emptied lock as empty, not absent', () => {
    const out = roundTrip({
      nodePositions: {}, bundleLengths: {}, bundleWaypoints: {},
      bundleNames: {}, nodeOrientations: {},
      lockedEdges: {},
    });
    expect(out?.lockedEdges).toEqual({});
  });

  it('drops malformed lock entries rather than trusting the file', () => {
    const out = roundTrip({
      nodePositions: {}, bundleLengths: {}, bundleWaypoints: {},
      bundleNames: {}, nodeOrientations: {},
      lockedEdges: { 'a|b': true, 'bad': false as unknown as true, '': true as unknown as true },
    });
    expect(out?.lockedEdges).toEqual({ 'a|b': true });
  });

  it('still round-trips the fields that already worked', () => {
    const out = roundTrip({
      nodePositions: { n1: { x: 10, y: 20 } },
      bundleLengths: { b1: 350 },
      bundleWaypoints: { b1: [{ x: 1, y: 2 }] },
      bundleNames: { b1: 'Main run' },
      nodeOrientations: { p1: 90 },
      connectorOrder: { p1: ['J1', 'J2'] },
    });
    expect(out?.nodePositions).toEqual({ n1: { x: 10, y: 20 } });
    expect(out?.bundleLengths).toEqual({ b1: 350 });
    expect(out?.bundleWaypoints).toEqual({ b1: [{ x: 1, y: 2 }] });
    expect(out?.bundleNames).toEqual({ b1: 'Main run' });
    expect(out?.nodeOrientations).toEqual({ p1: 90 });
    expect(out?.connectorOrder).toEqual({ p1: ['J1', 'J2'] });
  });
});
