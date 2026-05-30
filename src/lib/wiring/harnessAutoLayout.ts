import type { Point } from './types';

/**
 * Deterministic harness auto-layout.
 *
 * A *decent* default (not a graph-layout engine): every device is placed in a
 * single vertical column, ordered by a stable sort key — a starting point the
 * user then drags from. `deriveHarness` builds the harness tree off these
 * positions (MST → branch points at genuine fan-outs). Same input always
 * yields the same positions — `deriveHarness` re-derives the whole graph on
 * every device move, so layout MUST be deterministic.
 */

/** A device to lay out. `sortKey` is a stable ordering key — the schematic
 *  designator (e.g. "U1") works well; ties break on `id`. */
export interface AutoLayoutDevice {
  id: string;
  sortKey: string;
}

/** Column x of the device stack — the default starting layout. */
export const HARNESS_COLUMN_X = 320;
/** Vertical pitch between consecutive devices in the column. */
export const HARNESS_ROW_PITCH = 140;
/** Y of the first (topmost) device. */
export const HARNESS_COLUMN_TOP = 80;

/**
 * Compute a deterministic harness-view position for each device.
 *
 * Devices are sorted by `(sortKey, id)` — a total, stable order — and stacked
 * in one column at a fixed pitch. The result is a plain `Record` keyed by
 * device id, ready to feed into `deriveHarness` as the node positions.
 *
 * Phase 3: an optional `overrides` map (device id → user-placed position)
 * feeds *into* the layout. A device with an override sits at that exact
 * position; the auto-computed column position is used for every other
 * device. The override is applied per-device, so `deriveHarness`'s
 * downstream geometry (branch points, splices) is computed against the
 * user's actual layout — a moved device's branch point follows it.
 */
export function harnessAutoLayout(
  devices: AutoLayoutDevice[],
  overrides?: Record<string, Point>,
): Record<string, Point> {
  const ordered = devices.slice().sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const out: Record<string, Point> = {};
  ordered.forEach((d, i) => {
    const override = overrides?.[d.id];
    out[d.id] = override
      ? { x: override.x, y: override.y }
      : {
          x: HARNESS_COLUMN_X,
          y: HARNESS_COLUMN_TOP + i * HARNESS_ROW_PITCH,
        };
  });
  return out;
}
