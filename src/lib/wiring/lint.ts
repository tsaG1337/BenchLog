import type { Device, Pin, PinRole, PlacedDevice, Wire, NetLabel } from './types';
import { isJunctionKey } from './types';

export interface LintIssue {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  detail: string;
  deviceId?: string;
  wireId?: string;
  /** Optional net-label id so the IssuesPanel can highlight a problematic
   *  label when the user clicks the issue. */
  netLabelId?: string;
}

// Name-based fallback for pins without an explicit role. Kept so legacy
// data and hand-edited devices still get sensible lint coverage.
function nameLooksLikePower(name: string) {
  const n = name.toUpperCase();
  return /\bPOWER\b|\+12V|\+24V|\bV\+\b|\bBAT\b/.test(n) && !/GND|GROUND|RETURN|LO\b/.test(n);
}

function nameLooksLikeGround(name: string) {
  const n = name.toUpperCase();
  return /\bGND\b|\bGROUND\b/.test(n);
}

// Effective role: explicit `role` wins; otherwise fall back to the name
// heuristic; otherwise undefined (treated as a plain signal pin).
function effectiveRole(p: Pin): PinRole | undefined {
  if (p.role) return p.role;
  if (nameLooksLikeGround(p.name)) return 'ground';
  if (nameLooksLikePower(p.name))  return 'power';
  return undefined;
}

export function runLint(devicesIn: Device[], wires: Wire[], netLabels: NetLabel[] = []): LintIssue[] {
  const issues: LintIssue[] = [];

  // Group input by LOGICAL device id. Callers pass one PlacedDevice per
  // visible placement, but lint should run once per logical device — a
  // device with 3 placements would otherwise emit 3 identical warnings.
  // We also collect the set of pin ids that are actually drawn somewhere
  // (any connector view of any placement on this sheet) so we can skip
  // "phantom" placements: empty placements that the user has on canvas
  // but which expose no pins for wiring.
  type Entry = {
    /** Stable logical device id — used as the wire-endpoint key prefix
     *  and the issue-id stable key. */
    deviceId: string;
    /** A representative PlacedDevice for the device — used for pinCatalog,
     *  templateId, attributes, and the display name on the issue. */
    sample: Device;
    /** Placement id of the FIRST seen PlacedDevice for this device. We
     *  use this as the issue's `deviceId` payload so clicking the warning
     *  in the IssuesPanel actually selects something — selectOnly takes
     *  PLACEMENT ids, not logical device ids. */
    firstPlacementId: string;
    /** World coords of the first seen placement, for the "(at x, y)"
     *  hint surfaced in the issue detail when a device is off-screen. */
    firstPlacementPos?: { x: number; y: number };
    /** Union of pin ids visible on a connector view across all of this
     *  device's placements on the sheet. Lint only cares about these. */
    visiblePinIds: Set<string>;
  };
  const byDeviceId = new Map<string, Entry>();
  for (const d of devicesIn) {
    const placed = d as PlacedDevice;
    const devId = placed.deviceId ?? d.id;
    let entry = byDeviceId.get(devId);
    if (!entry) {
      entry = {
        deviceId: devId,
        sample: d,
        firstPlacementId: placed.id ?? devId,
        firstPlacementPos: placed.position,
        visiblePinIds: new Set(),
      };
      byDeviceId.set(devId, entry);
    }
    if (placed.connectors) {
      for (const c of placed.connectors) {
        for (const pid of c.pinIds) entry.visiblePinIds.add(pid);
      }
    }
  }

  const connectedPins = new Set<string>();
  for (const w of wires) {
    connectedPins.add(w.fromPin);
    connectedPins.add(w.toPin);
  }

  function pinsOfRole(dev: Device, role: PinRole, visiblePinIds: Set<string>): Pin[] {
    // Only consider pins the user has actually drawn on a connector view.
    // Hidden pins shouldn't drive a "missing power/ground" warning — the
    // user might have intentionally not wired that part of the device.
    return dev.pinCatalog.filter(p => visiblePinIds.has(p.id) && effectiveRole(p) === role);
  }

  function anyConnected(deviceId: string, pins: Pin[]): boolean {
    // Wire endpoints use the LOGICAL device id ("U5:p"), never a placement
    // id ("U5B:p"). Use the deviceId from the entry, not whatever happens
    // to live on the sample's `id` field.
    return pins.some(p => connectedPins.has(`${deviceId}:${p.id}`));
  }

  // Format the placement's world coords as a "(at x, y)" hint — surfaced
  // in the issue detail so the user can find a device that's been placed
  // far away from the rest of the diagram. Click-to-select highlights it
  // but doesn't pan the canvas, so the coords are still useful.
  const posHint = (entry: Entry): string => {
    const pos = entry.firstPlacementPos;
    if (!pos) return '';
    return ` (at x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)})`;
  };

  // Rule: device has a power/ground pin (visible) but it's not connected.
  for (const entry of byDeviceId.values()) {
    const { deviceId, sample, firstPlacementId, visiblePinIds } = entry;
    if (visiblePinIds.size === 0) continue; // phantom — no pins drawn
    const powerPins  = pinsOfRole(sample, 'power',  visiblePinIds);
    const groundPins = pinsOfRole(sample, 'ground', visiblePinIds);
    if (powerPins.length > 0 && !anyConnected(deviceId, powerPins)) {
      issues.push({
        id: `lint-power-${deviceId}`,
        severity: 'warning',
        title: `${sample.name} has no power connection`,
        detail: `This device exposes a power pin but nothing is wired to it.${posHint(entry)} Add a breaker or bus connection.`,
        deviceId: firstPlacementId,
      });
    }
    if (groundPins.length > 0 && !anyConnected(deviceId, groundPins)) {
      issues.push({
        id: `lint-gnd-${deviceId}`,
        severity: 'warning',
        title: `${sample.name} has no ground connection`,
        detail: `This device exposes a ground pin but nothing is wired to it.${posHint(entry)}`,
        deviceId: firstPlacementId,
      });
    }
  }

  // Rule: duplicate device designators. Compare logical-device names from
  // the deduped entries, not per-placement display names.
  const nameCounts = new Map<string, Entry[]>();
  for (const entry of byDeviceId.values()) {
    const list = nameCounts.get(entry.sample.name) ?? [];
    list.push(entry);
    nameCounts.set(entry.sample.name, list);
  }
  for (const [name, list] of nameCounts) {
    if (list.length > 1) {
      for (let i = 1; i < list.length; i++) {
        issues.push({
          id: `lint-dup-${list[i].deviceId}`,
          severity: 'warning',
          title: `Duplicate device name "${name}"`,
          detail: 'Two or more devices share this name. Rename one (e.g. "#1", "#2") in the Inspector.',
          deviceId: list[i].firstPlacementId,
        });
      }
    }
  }

  // Rule: same pin wired more than once (typical error — shorts or missed splice).
  // We deliberately skip junction endpoints ("junction:<id>") — those are
  // designed to be N-way meeting points (T-splits, splice points) and almost
  // always carry 3 wires. Flagging them produced one error per extra wire at
  // every junction, which buried the real "two wires on the same pin" cases.
  const pinToWires = new Map<string, string[]>();
  for (const w of wires) {
    for (const pk of [w.fromPin, w.toPin]) {
      if (isJunctionKey(pk)) continue;
      const arr = pinToWires.get(pk) ?? [];
      arr.push(w.id);
      pinToWires.set(pk, arr);
    }
  }
  for (const [pk, wireIds] of pinToWires) {
    if (wireIds.length > 1) {
      // Emit ONE issue per offending pin, not one per "extra" wire — the
      // error reads better and clicking through to a single wire is enough
      // to find the problem. Attach to the second wire so the user has a
      // jump target distinct from the originally-correct first wire.
      issues.push({
        id: `lint-multi-${pk}`,
        severity: 'error',
        title: `Pin wired multiple times`,
        detail: `${pk} has ${wireIds.length} wires attached. Use a splice or junction if this is intentional.`,
        wireId: wireIds[1],
      });
    }
  }

  // Rule: circuit breaker with no rating annotation. The rating now lives in
  // attributes.rating (set via the Inspector); we also accept it embedded in
  // the designator (e.g. "CB 5A") so legacy diagrams don't suddenly warn.
  for (const entry of byDeviceId.values()) {
    const d = entry.sample;
    if (d.templateId !== 'generic-breaker') continue;
    const ratingAttr = (d.attributes?.rating ?? '').trim();
    const hasRatingInAttr = /\d+\s*A/i.test(ratingAttr);
    const hasRatingInName = /\d+\s*A/i.test(d.name);
    if (!hasRatingInAttr && !hasRatingInName) {
      issues.push({
        id: `lint-cb-${entry.deviceId}`,
        severity: 'warning',
        title: `Circuit breaker missing rating`,
        detail: 'Set the Rating attribute (e.g. "5A", "10A") in the Inspector, or include it in the designator (e.g. "CB 5A").',
        deviceId: entry.firstPlacementId,
      });
    }
  }

  // ── Connectivity walk for the next two rules ─────────────────────────
  // Replicates the Inspector's BFS so we can answer two questions per
  // starting node: (a) does this set of nodes reach any pin? (b) does it
  // reach a same-text label sibling? Treats:
  //   - same-text labels as connected by name
  //   - wires as edges between their two endpoints
  //   - `junction:<id>` endpoints connect via the wire-edge step — every
  //     wire/label referencing the same id meets at that node by equality.
  function reachable(seeds: string[]): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [];
    const enqueue = (k: string) => { if (!visited.has(k)) { visited.add(k); queue.push(k); } };
    seeds.forEach(enqueue);
    while (queue.length) {
      const node = queue.shift()!;
      if (node.startsWith('#')) {
        const lbl = netLabels.find(n => `#${n.id}` === node);
        if (lbl) {
          for (const sib of netLabels) {
            if (sib.text === lbl.text) {
              enqueue(`#${sib.id}`);
              enqueue(sib.attachedTo);
            }
          }
        }
      }
      for (const w of wires) {
        if (w.fromPin === node) enqueue(w.toPin);
        else if (w.toPin === node) enqueue(w.fromPin);
      }
    }
    return visited;
  }

  // Helper: does the visited set contain any pin endpoint?
  const hasPin = (visited: Set<string>): boolean => {
    for (const k of visited) {
      if (!isJunctionKey(k) && !k.startsWith('#')) return true;
    }
    return false;
  };

  // ── Rule: disconnected wires ─────────────────────────────────────────
  // A wire counts as an "orphan loop" when neither end resolves to a pin
  // through the connectivity graph (= no device connection on either side
  // of any chained wires/junctions). One issue per wire so the user can
  // click each problem entry and locate it.
  for (const w of wires) {
    const visited = reachable([w.fromPin, w.toPin]);
    if (!hasPin(visited)) {
      issues.push({
        id: `lint-wire-orphan-${w.id}`,
        severity: 'warning',
        title: 'Disconnected wire',
        detail: 'This wire (and anything wired to it) doesn\'t reach any pin. Connect at least one end to a device pin or delete it.',
        wireId: w.id,
      });
    }
  }

  // ── Rule: label has no wire attached ─────────────────────────────────
  // A label that has no wire physically touching it is almost certainly a
  // mistake — the user dropped it on canvas and forgot to wire it. We
  // count "physically attached" as any of:
  //   • a wire with `#labelId` as an endpoint (label is a wire endpoint)
  //   • the label's `attachedTo` is a `junction:<id>` (anchored at a tap)
  //   • the label's `attachedTo` is a pin (visually sits on a pin — even
  //     if the pin's connections happen elsewhere, the label is not adrift)
  // Stricter than the "not connected" rule below; both can fire if a free
  // label is also on no net.
  for (const lbl of netLabels) {
    const labelKey = `#${lbl.id}`;
    const wireTouches = wires.some(w => w.fromPin === labelKey || w.toPin === labelKey);
    const tapped = isJunctionKey(lbl.attachedTo);
    const onPin = !isJunctionKey(lbl.attachedTo) && !lbl.attachedTo.startsWith('#');
    if (!wireTouches && !tapped && !onPin) {
      issues.push({
        id: `lint-label-no-wire-${lbl.id}`,
        severity: 'warning',
        title: `Net label "${lbl.text}" has no wire attached`,
        detail: 'Drop the label on a pin or a wire, or draw a wire from the label\'s tip to a pin.',
        netLabelId: lbl.id,
      });
    }
  }

  // ── Rule: disconnected net labels ────────────────────────────────────
  // A label is "stranded" when its net (same-text labels + wired graph)
  // doesn't reach any pin. Single-instance free-floating labels with no
  // wires are the most common case. Emit one issue per label so the user
  // can click each one and decide whether to wire it up or remove it.
  for (const lbl of netLabels) {
    const visited = reachable([`#${lbl.id}`]);
    if (!hasPin(visited)) {
      issues.push({
        id: `lint-label-orphan-${lbl.id}`,
        severity: 'warning',
        title: `Net label "${lbl.text}" not connected`,
        detail: 'No pin reaches this label\'s net. Wire it to a pin, drop a same-named label on a pin, or remove the label.',
        netLabelId: lbl.id,
      });
    }
  }

  return issues;
}
