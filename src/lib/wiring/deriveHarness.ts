import type {
  Wire, NetLabel, Junction, PlacedDevice, Point, Orientation,
  HarnessGraph, HarnessNode, Bundle, HarnessOverrides,
} from './types';
import { isJunctionKey, junctionIdFromKey } from './types';
import {
  endpointNodeId, isJunctionNodeId, junctionNodeId, connectorDockPoints,
  connectorNodeId, splitConnectorNodeId, branchPointNodeId,
} from './harness';
import { harnessAutoLayout } from './harnessAutoLayout';
import { slugifyDesignator } from './library/types';

/**
 * Harness derivation — `deriveHarness`.
 *
 * Replaces the one-cable-per-net `deriveBundles` model with a real harness
 * graph: a forest of harness trees of `connector` / `splice` / `branchPoint`
 * nodes, joined by `Bundle` segments that carry the conductors of MANY nets
 * through SHARED cable runs, plus `component` block nodes that are purely
 * visual. Pure and deterministic — re-run fresh on every device move / on
 * entering the harness view.
 *
 * See: docs/superpowers/specs/2026-05-21-harness-splicecad-routing-design.md
 *
 * Connector-granularity model — a device's connectors no longer collapse
 * into one node. Each *used* connector (one a wire endpoint resolves to) is
 * its own `connector` `HarnessNode` with its own dock point; bundles
 * terminate at connector nodes. The `component` node still exists per
 * placement so the renderer can draw the device block (and so it carries an
 * orientation + a position override), but it is NOT a bundle endpoint and is
 * NOT fed into the per-tree MST.
 *
 * Splice-cad-style clean tree — there is NO forced vertical trunk spine.
 * Branch points exist ONLY at genuine 3+-way fan-outs. The harness is a clean
 * free-form tree: a 2-device net is a single direct cable with no branch
 * point; a connector that fans out to 3+ neighbours gets exactly one branch
 * point; splices are internal fan-outs already.
 *
 * Algorithm per harness tree:
 *  1. Union-find the wires into electrical components (same-text net labels
 *     collapse via a shared virtual node) → one tree per connected component.
 *  2. Auto-layout puts device blocks in a column; each used connector docks
 *     at its block; splices settle at the centroid of their neighbours.
 *  3. Build a minimum spanning tree (Euclidean) over the connector + splice
 *     nodes — the connectivity backbone.
 *  4. Transform the MST into a clean harness tree. A `connector` node with
 *     MST-degree >= 2 gets a synthesized `branchPoint` (`bp:<connectorNodeId>`,
 *     a stable id); every MST edge incident on that connector is re-routed to
 *     the branch point, plus one leaf cable from the connector to its branch
 *     point. The connector becomes a degree-1 LEAF; the branch point takes
 *     degree = old connector degree + 1 (always >= 3 — a real fan-out). A
 *     connector with MST-degree <= 1 stays a direct leaf — no branch point. A
 *     `splice` is NEVER branched (it is an internal fan-out already). The
 *     resulting tree edges are the `Bundle`s.
 *  5. Position each non-anchored branch point at the centroid of its tree
 *     neighbours, relaxed over a few deterministic passes (connector docks,
 *     splice centroids and overridden branch points are fixed anchors).
 *  6. Route every wire along the unique tree-path between its two endpoint
 *     nodes; each crossed `Bundle.conductorIds` lists it. Two nets between the
 *     same pair of connectors therefore share ONE cable.
 *
 * The override layer. `deriveHarness` takes an optional `HarnessOverrides`
 * (per-sheet, persisted, topology-free). Overrides feed *into* the layout:
 *  - a `component` / `splice` / `branchPoint` node with an entry in
 *    `nodePositions` is placed at exactly that position; everything
 *    downstream (branch points, splice geometry, cables) is computed against
 *    it — so a moved device's branch point follows it unless that branch
 *    point is itself overridden. `connector` nodes are NOT overridable —
 *    they are pure-derived dock points that ride their device.
 *  - a `component` node with an entry in `nodeOrientations` carries that
 *    orientation; the device's connectors dock at the rotated edge.
 *  - a `Bundle` with an entry in `bundleLengths` carries that length.
 *  - branch-point ids are STABLE — `bp:<connectorNodeId>` (the connector the
 *    branch point fans out for), so an override re-applies by id across
 *    re-derivations.
 *  - an override whose keyed node/bundle isn't in the derived graph is
 *    harmlessly ignored (orphaned — never resurrected as phantom structure).
 *
 * Topology stability (2026-07). The MST (step 3 below) is recomputed from
 * scratch — cold Prim's over CURRENT positions — on every single derivation,
 * which is every device move, every frame of a drag, every wire edit. Prim's
 * has no memory of the shape it produced last time, so a move of a few
 * pixels can flip which edge wins a close distance comparison, which flips
 * a connector's MST-degree, which spawns or kills a branch point and
 * reroutes everything downstream of it — even for devices the user never
 * touched. Two mechanisms address this, both additive to the algorithm
 * above and both OFF by default (empty/absent inputs reproduce the exact
 * prior cold-MST behaviour):
 *
 *  - **Hysteresis** (`previousMstEdges`) — a soft bias. An edge that was
 *    part of the previous derivation's raw MST gets a small distance
 *    discount this time, so it wins ties and near-ties but a genuine,
 *    decisive move still wins on its own merit. The caller (`WiringPage`)
 *    keeps the last graph's raw MST edge keys (`HarnessGraph._mstEdgeKeys`)
 *    in a ref and feeds them back in every derivation — so this is a
 *    frame-to-frame smoothing effect, not a persisted guarantee. See
 *    `HARNESS_MST_HYSTERESIS_BONUS` below.
 *  - **Lock** (`overrides.lockedEdges`) — a hard pin, persisted per-sheet.
 *    An edge key present here is treated as a free, zero-cost, always-included
 *    member of the spanning tree — Prim's only has to route the nodes NOT
 *    already covered by a locked edge, seeded with every locked node
 *    pre-added to `inTree`. This is the one deliberate exception to "the
 *    iron rule" (overrides are topology-free) — locking is opt-in (a
 *    toolbar action) and reversible (Unlock), so it doesn't compromise the
 *    "never silently stale" guarantee the rest of the override layer relies
 *    on; it just lets the user trade auto-routing for a guarantee when they
 *    want one. See `applyLockedEdges` below.
 */

/** Input to `deriveHarness` — one sheet's placed devices, wires, junctions
 *  and net labels. Mirrors what `deriveBundles` reads, plus the placements
 *  and junction entities the graph needs for node identity + positions. */
export interface DeriveHarnessInput {
  placedDevices: PlacedDevice[];
  wires: Wire[];
  junctions: Junction[];
  netLabels: NetLabel[];
}

// ── Union-Find ──────────────────────────────────────────────────────

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x);
    if (p === undefined) { this.parent.set(x, x); return x; }
    while (p !== x) {
      const pp = this.parent.get(p)!;
      this.parent.set(x, pp);
      x = p;
      p = pp;
    }
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

// ── Geometry ────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Stable sorted-pair key for an (undirected) edge between two node ids.
 *  Same convention `emitBundle` uses for `Bundle.id` — shared here so a
 *  hysteresis-bias / locked-edge lookup keys identically to a bundle id. */
function edgeKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

// ── Node identity ───────────────────────────────────────────────────

/**
 * Map a wire-endpoint key to its harness graph-node id:
 *   - a connector key (`U1:C1-P3`) → the CONNECTOR node id
 *     `<placementId>:<logicalConnector>` — the device's connector is its own
 *     harness termination, so a device with connectors C1 + C2 yields TWO
 *     distinct nodes that bundles can dock onto independently. The wire's
 *     `endpointNodeId` gives `deviceId:connector`; we re-key the device id
 *     to its placement id on this sheet and rejoin.
 *   - a junction key (`junction:<id>`) → the SPLICE node id (`J:<id>`).
 *   - a label key (`#labelId`) → null (labels group nets, they are not nodes).
 * Returns null when the device isn't placed on this sheet.
 */
function endpointGraphNode(
  pinKey: string,
  deviceToPlacement: Map<string, string>,
): string | null {
  if (isJunctionKey(pinKey)) return junctionNodeId(pinKey);
  if (pinKey.startsWith('#')) return null;
  const node = endpointNodeId(pinKey); // e.g. 'U1:C1' (deviceId:connector)
  if (!node) return null;
  // Connector node id is 'deviceId:logicalConnectorName' — re-key the device
  // id to its placement id, then rejoin to '<placementId>:<connector>'.
  const colon = node.indexOf(':');
  if (colon < 0) {
    // No connector segment — a bare device key; map to its placement id.
    return deviceToPlacement.get(node) ?? null;
  }
  const deviceId = node.slice(0, colon);
  const connector = node.slice(colon + 1);
  const placementId = deviceToPlacement.get(deviceId);
  if (!placementId) return null;
  return connectorNodeId(placementId, connector);
}

// ── Tree helpers ────────────────────────────────────────────────────

interface MstEdge { a: string; b: string; }

/** Distance discount (canvas units) applied to an edge that was part of the
 *  previous derivation's raw MST. About 1.5 grid squares — enough that a
 *  small nudge or a mid-drag jitter frame can't flip which edge wins a close
 *  comparison, not enough to keep a genuinely different, decisively shorter
 *  route from winning when the user actually moves something. */
const HARNESS_MST_HYSTERESIS_BONUS = 16;

/**
 * Minimum spanning tree over a set of nodes by Euclidean distance between
 * their positions. Prim's algorithm — O(n²), fine for harness sizes.
 * Ties broken deterministically on the candidate node id so the result is
 * reproducible.
 *
 * `biasEdges` — hysteresis (2026-07): a set of edge keys (`edgeKey(a,b)`)
 * that formed the MST on the PREVIOUS derivation. A candidate edge matching
 * one gets `HARNESS_MST_HYSTERESIS_BONUS` shaved off its distance before
 * comparison, so it keeps winning ties/near-ties across small moves instead
 * of the tree reshuffling on every frame of a drag. Omitted → identical to
 * the original cold-MST behaviour (every caller before this feature).
 */
function buildMst(nodeIds: string[], pos: Map<string, Point>, biasEdges?: ReadonlySet<string>): MstEdge[] {
  if (nodeIds.length < 2) return [];
  const start = nodeIds.slice().sort()[0];
  const inTree = new Set<string>([start]);
  const edges: MstEdge[] = [];
  while (inTree.size < nodeIds.length) {
    let best: { a: string; b: string; d: number } | null = null;
    for (const a of inTree) {
      const pa = pos.get(a)!;
      for (const b of nodeIds) {
        if (inTree.has(b)) continue;
        const raw = dist(pa, pos.get(b)!);
        const d = biasEdges?.has(edgeKey(a, b)) ? raw - HARNESS_MST_HYSTERESIS_BONUS : raw;
        if (
          best === null ||
          d < best.d - 1e-9 ||
          (Math.abs(d - best.d) <= 1e-9 && b < best.b)
        ) {
          best = { a, b, d };
        }
      }
    }
    if (!best) break;
    inTree.add(best.b);
    edges.push({ a: best.a, b: best.b });
  }
  return edges;
}

/** One connected component of the `lockedEdges` graph, restricted to nodes
 *  present in this tree — a "seed island" whose internal wiring is frozen
 *  and must be preserved exactly, never re-routed. A node with no locked
 *  edge is its own trivial one-member island. */
interface SeedIsland {
  /** Sorted-first member id — the deterministic anchor used as this
   *  island's stand-in id in the contracted MST pass below. */
  representativeId: string;
  memberIds: string[];
  internalEdges: MstEdge[];
  /** Centroid of member positions — the island's position for the purpose
   *  of the contracted MST that connects islands to each other. */
  centroid: Point;
}

/**
 * Partition `nodeIds` into seed islands: connected components of
 * `lockedEdges` (an edge counts only when BOTH endpoints are still present
 * in `nodeIds` — a dangling reference from a deleted node is dropped, same
 * orphan-tolerance every other override field already has), plus every
 * remaining node as its own singleton island. Deterministic — islands and
 * their internal edges are derived from sorted iteration only.
 */
function partitionIntoSeedIslands(
  nodeIds: string[],
  pos: Map<string, Point>,
  lockedEdges: ReadonlySet<string>,
): SeedIsland[] {
  const nodeSet = new Set(nodeIds);
  const uf = new UnionFind();
  const liveEdges: MstEdge[] = [];
  // Sorted iteration: which edge survives the cycle check below must never
  // depend on Set/Record insertion order — the same persisted lock must
  // reproduce the same tree on every load.
  for (const key of Array.from(lockedEdges).sort()) {
    const sep = key.indexOf('|');
    if (sep < 0) continue;
    const a = key.slice(0, sep), b = key.slice(sep + 1);
    if (!nodeSet.has(a) || !nodeSet.has(b)) continue; // one endpoint gone — orphaned, drop
    // Cycle defense: the UI's lock toggle always clears-then-captures a
    // tree (acyclic by construction), but `lockHarnessEdges` merges — an
    // imported project or hand-edited JSON could carry a cycle, which
    // would break the "unique tree-path" invariant conductor routing
    // relies on. Keep a spanning forest: an edge whose endpoints are
    // already connected through earlier (sorted-first) locked edges is
    // silently dropped.
    if (uf.find(a) === uf.find(b)) continue;
    uf.union(a, b);
    liveEdges.push({ a, b });
  }
  const groups = new Map<string, string[]>();
  for (const id of nodeIds) {
    const root = uf.find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  const islands: SeedIsland[] = [];
  for (const memberIds of groups.values()) {
    const sortedMembers = memberIds.slice().sort();
    const memberSet = new Set(sortedMembers);
    const internalEdges = liveEdges.filter(e => memberSet.has(e.a) && memberSet.has(e.b));
    const pts = sortedMembers.map(id => pos.get(id)!);
    const centroid = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
    islands.push({ representativeId: sortedMembers[0], memberIds: sortedMembers, internalEdges, centroid });
  }
  return islands.sort((a, b) => a.representativeId < b.representativeId ? -1 : 1);
}

/** The closest real-node pair between two member lists — where a bridging
 *  edge between two islands actually attaches. Deterministic tie-break on
 *  (a id, b id) so the result never depends on iteration/Set order. */
function nearestRealEdge(idsA: string[], idsB: string[], pos: Map<string, Point>): MstEdge {
  let bestA = idsA[0], bestB = idsB[0], bestD = Infinity;
  for (const a of idsA) {
    const pa = pos.get(a)!;
    for (const b of idsB) {
      const d = dist(pa, pos.get(b)!);
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && (a < bestA || (a === bestA && b < bestB)))) {
        bestD = d; bestA = a; bestB = b;
      }
    }
  }
  return { a: bestA, b: bestB };
}

/**
 * MST over a node set with a `lockedEdges` pin (the explicit "Lock harness
 * layout" feature). Every node reachable through a chain of locked edges is
 * contracted into one seed island — its internal structure is exactly the
 * locked edges, never re-routed. Prim's then runs over the CONTRACTED graph
 * (islands + free singleton nodes) to connect whatever is left: new devices
 * added since the lock, and — if a deleted device fragmented a previously
 * one-piece locked structure into several disconnected islands — bridges
 * them back together too, at whichever real node pair is physically
 * closest. With no locked edges at all this degenerates to plain
 * `buildMst` (every node is its own singleton island, so the "contracted"
 * graph IS the real graph) — the two code paths agree exactly when nothing
 * is locked.
 */
function buildMstWithLocks(
  nodeIds: string[],
  pos: Map<string, Point>,
  lockedEdges: ReadonlySet<string>,
  biasEdges?: ReadonlySet<string>,
): MstEdge[] {
  if (nodeIds.length < 2) return [];
  const islands = partitionIntoSeedIslands(nodeIds, pos, lockedEdges);
  if (islands.length === 1) {
    // Every node is already reachable through the locked chain alone.
    return islands[0].internalEdges;
  }
  const islandById = new Map(islands.map(isl => [isl.representativeId, isl]));
  const contractedIds = islands.map(isl => isl.representativeId);
  const contractedPos = new Map(islands.map(isl => [isl.representativeId, isl.centroid]));
  // `biasEdges` is keyed by real node ids from the previous derivation. For
  // a singleton island (representativeId === its one real member id) that
  // still matches correctly; for a genuine multi-member island a stale bias
  // key simply never matches anything here (harmless no-op), which is
  // correct — an island's internal shape is governed by the lock, not bias.
  const contractedMst = buildMst(contractedIds, contractedPos, biasEdges);

  const out: MstEdge[] = [];
  for (const isl of islands) out.push(...isl.internalEdges);
  for (const ce of contractedMst) {
    const islA = islandById.get(ce.a)!;
    const islB = islandById.get(ce.b)!;
    out.push(nearestRealEdge(islA.memberIds, islB.memberIds, pos));
  }
  return out;
}

/** Adjacency map for an undirected edge list. */
function adjacencyOf(nodeIds: string[], edges: MstEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  return adj;
}

// ── deriveHarness ───────────────────────────────────────────────────

/** Per-tree working set assembled before geometry is built. */
interface HarnessTree {
  /** Connector + splice node ids in this electrical component. (`component`
   *  block nodes are never bundle endpoints, so they are not in a tree.) */
  nodeIds: string[];
  /** Wires whose endpoints both resolve to nodes in this tree. */
  wireIds: string[];
}

export function deriveHarness(
  input: DeriveHarnessInput,
  overrides?: HarnessOverrides,
  /** Hysteresis (2026-07) — the raw MST edge keys this same function
   *  returned last time (`HarnessGraph._mstEdgeKeys`). The caller keeps the
   *  last graph in a ref and feeds it back in every derivation; omitted →
   *  identical to the pre-hysteresis behaviour. See the module doc above. */
  previousMstEdges?: ReadonlySet<string>,
): HarnessGraph {
  const { placedDevices, wires, netLabels } = input;
  // Topology-free override layer. Keyed by stable id; an entry whose key
  // isn't in the freshly-derived graph is simply never read → ignored.
  const nodePositionOverrides = overrides?.nodePositions ?? {};
  const bundleLengthOverrides = overrides?.bundleLengths ?? {};
  // Lock (2026-07) — the one deliberate exception to "overrides are
  // topology-free": a set of raw MST edge keys the user has explicitly
  // pinned via the "Lock harness layout" action. See `buildMstWithLocks`.
  const lockedEdgeSet = new Set(Object.keys(overrides?.lockedEdges ?? {}));
  // Stable branch-point sequence numbers (2026-07) — assigned once, on
  // first sighting, by a small effect in WiringPage; deriveHarness only
  // ever READS this map, never assigns into it (stays pure). A brand-new
  // branch point this frame simply has no entry yet — `nodeLabel` below
  // returns undefined for it until the effect catches up (next tick).
  const branchPointLabels = overrides?.branchPointLabels ?? {};
  // Phase 4 — cable bend points + per-bundle names. Same pattern as
  // `bundleLengths`: attached to a `Bundle` by its stable sorted-pair id; an
  // entry for a bundle not in the derived graph is never read → ignored.
  const bundleWaypointOverrides = overrides?.bundleWaypoints ?? {};
  const bundleNameOverrides = overrides?.bundleNames ?? {};
  // Per-device connector row order — placement id → ordered logical-connector
  // names. Absent = natural order. Threads into `connectorDockPoints` so the
  // connector node positions follow the user's reordering.
  const connectorOrder = overrides?.connectorOrder ?? {};

  // deviceId → its placement id on this sheet (the component node id).
  const deviceToPlacement = new Map<string, string>();
  for (const pd of placedDevices) deviceToPlacement.set(pd.deviceId, pd.id);

  // Label lookup for same-text net collapsing.
  const labelText = new Map<string, string>();
  for (const l of netLabels) labelText.set(l.id, l.text);

  // ── 1. Nodes. One `component` per placement (a visual block only — never
  //       a bundle endpoint, never in the MST), one `connector` per *used*
  //       connector of a placement (the real harness terminations), and one
  //       `splice` per junction referenced by a wire on this sheet. (Net
  //       labels are not nodes.)
  const referencedJunctions = new Set<string>();
  for (const w of wires) {
    for (const pin of [w.fromPin, w.toPin]) {
      const jid = junctionIdFromKey(pin);
      if (jid) referencedJunctions.add(jid);
    }
  }

  // Per-placement orientation from the override layer (default 0°). A
  // `component` node carries it; it also picks the edge a connector docks on.
  const orientationOf = (placementId: string): Orientation =>
    overrides?.nodeOrientations?.[placementId] ?? 0;

  const nodes: HarnessNode[] = [];
  const nodeById = new Map<string, HarnessNode>();
  // Every node added goes through here; a node with a `nodePositions`
  // override is placed at exactly that position, otherwise at the position
  // the derivation computed. Branch points are created after the per-tree
  // geometry, so this single chokepoint applies overrides to every kind.
  // NOTE: `connector` nodes are pure-derived dock points — they are not
  // overridable; a `nodePositions` entry keyed by a connector id is ignored
  // by design (`addConnectorNode` never consults the override map).
  const addNode = (n: HarnessNode) => {
    const override = nodePositionOverrides[n.id];
    const placed = override
      ? { ...n, position: { x: override.x, y: override.y } }
      : n;
    nodes.push(placed);
    nodeById.set(placed.id, placed);
  };

  // A derived node that takes NO position override (connector nodes ride their
  // device; their position is fully derived). Distinct from `addNode`, which
  // applies a `nodePositions` override.
  const addDerivedNode = (n: HarnessNode) => {
    nodes.push(n);
    nodeById.set(n.id, n);
  };

  // Auto-layout positions every device deterministically. Component-position
  // overrides feed *into* the layout so downstream geometry (connector docks,
  // branch points, splice centroids) is computed against the user's actual
  // placement.
  const layout = harnessAutoLayout(
    placedDevices.map(pd => ({ id: pd.id, sortKey: pd.name || pd.id })),
    nodePositionOverrides,
  );

  // A `component` node per placement — the visual device block. Carries the
  // device orientation and a position override (so a `nodePositions` entry
  // still moves the block); it is NOT a bundle endpoint and is excluded from
  // the per-tree MST below.
  for (const pd of placedDevices) {
    addNode({
      id: pd.id,
      kind: 'component',
      position: layout[pd.id] ?? { x: 0, y: 0 },
      refId: pd.id,
      orientation: orientationOf(pd.id),
    });
  }

  // The set of *used* connector node ids — every wire endpoint that resolves
  // to a connector node. Only used connectors become `connector` nodes; an
  // unused connector draws as an empty row on the block but has no node.
  const usedConnectorIds = new Set<string>();
  for (const w of wires) {
    for (const pin of [w.fromPin, w.toPin]) {
      const g = endpointGraphNode(pin, deviceToPlacement);
      if (g && !isJunctionNodeId(g)) usedConnectorIds.add(g);
    }
  }

  // A `connector` node per used connector. Its position is the connector's
  // dock point on the device block — computed from the device's *effective*
  // position (the `nodePositions` override if present, else the auto-layout
  // position) at the device's orientation, so the connector always rides its
  // device. Pure-derived: never consults `nodePositions` for its own id.
  const placementById = new Map<string, PlacedDevice>();
  for (const pd of placedDevices) placementById.set(pd.id, pd);
  for (const connId of Array.from(usedConnectorIds).sort()) {
    const [placementId, connectorName] = splitConnectorNodeId(connId);
    if (!placementId || !connectorName) continue;
    const pd = placementById.get(placementId);
    if (!pd) continue; // device not placed — wire was already dropped
    const orientation = orientationOf(placementId);
    // The device's effective position drives the dock point. Build a
    // PlacedDevice with that position so `connectorDockPoints` (world-space)
    // returns the dock relative to where the device actually sits.
    const effectivePos = nodePositionOverrides[placementId] ?? layout[placementId];
    const effectiveDevice: PlacedDevice = effectivePos
      ? { ...pd, position: { x: effectivePos.x, y: effectivePos.y } }
      : pd;
    // A connector node id carries the SLUGIFIED connector name — it is built
    // from wire pin keys, and the pin-id builder slugifies the connector name
    // (`pinIdFor` → `slugifyDesignator`). `connectorDockPoints`, however, keys
    // by the RAW `logicalConnectorName`. Bridge by slug so a connector whose
    // raw name has spaces / parens / slashes (real shipped library devices —
    // AFS `'P1 (EFIS PFD)'`, Dynon `'J-NET 1'`) still resolves to its real
    // dock point instead of falling back to the canvas origin.
    const docks = connectorDockPoints(effectiveDevice, orientation, connectorOrder[placementId]); // Map<rawName, Point>
    const dockBySlug = new Map<string, Point>();
    for (const [rawName, pt] of docks) dockBySlug.set(slugifyDesignator(rawName), pt);
    // `connectorName` is the slugified node-id segment. The `{ x: 0, y: 0 }`
    // fallback is a genuine last resort — a connector with no matching dock,
    // which should not happen for a placed device.
    const resolvedDock = dockBySlug.get(connectorName);
    if (!resolvedDock) {
      console.warn(`[deriveHarness] connector "${connId}" has no matching dock point on its device block — cable will route to the canvas origin.`);
    }
    const dock = resolvedDock ?? { x: 0, y: 0 };
    addDerivedNode({
      id: connId,
      kind: 'connector',
      position: { x: dock.x, y: dock.y },
      refId: connId,
    });
  }

  for (const jid of referencedJunctions) {
    const nodeId = `J:${jid}`;
    addNode({
      id: nodeId,
      kind: 'splice',
      position: { x: 0, y: 0 }, // filled from tree geometry below
      refId: nodeId,
    });
  }

  // ── 2. Electrical components. Union-find over the wire graph — same-text
  //       net labels collapse via a shared `label:<text>` virtual node.
  const uf = new UnionFind();

  function ufNode(pinKey: string): string | null {
    if (pinKey.startsWith('#')) {
      const text = labelText.get(pinKey.slice(1));
      return text ? `label:${text}` : null;
    }
    return endpointGraphNode(pinKey, deviceToPlacement);
  }

  // Resolve each wire's two endpoints. A `RoutedWire` records how its
  // conductor routes:
  //  - `pair`     — two distinct real graph nodes → the conductor runs the
  //                 unique tree-path between them.
  //  - `labelNet` — at least one endpoint is a net label (no second node).
  //                 The conductor belongs to a multi-point label net and is
  //                 routed onto the minimal subtree spanning every member
  //                 device node (a power rail runs the full trunk length).
  //  - `internal` — both endpoints land on the SAME connector node: a jumper
  //                 such as a transponder's loopback between D25 pins 1 and
  //                 2. It never leaves the connector, so it is carried by no
  //                 bundle at all.
  // The `uf` root for grouping nodes into trees is taken from either real
  // endpoint or the `label:<text>` virtual node.
  interface RoutedWire {
    wireId: string;
    kind: 'pair' | 'labelNet' | 'internal';
    /** A node id in the wire's tree — used to find which tree it belongs to. */
    treeAnchor: string;
    /** kind 'pair' — the two endpoint nodes. */
    a?: string;
    b?: string;
    /** kind 'labelNet' — the wire's ELECTRICAL net root (see `netUf`).
     *  Grouping on this rather than on the tree root is what keeps one
     *  label net's conductors off cables belonging to another's. */
    netKey?: string;
  }
  // Electrical-net identity, deliberately SEPARATE from the `uf` above.
  // `uf` answers "which harness tree is this in", and since every wire
  // unions its endpoints there, a connected harness collapses to a single
  // root — useless for telling one net from another. Same rules as
  // nets.ts's `wiresInNet`: a wire unions its two endpoint keys, a label
  // unions its virtual key with what it is attached to, and labels sharing
  // text union together. Keyed on PINS, so two different nets landing on
  // the same connector stay distinct.
  const wireById = new Map(wires.map(w => [w.id, w]));
  const netUf = new UnionFind();
  for (const w of wires) netUf.union(w.fromPin, w.toPin);
  for (const nl of netLabels) netUf.union('#' + nl.id, nl.attachedTo);
  const firstLabelOfText = new Map<string, string>();
  for (const nl of netLabels) {
    const key = '#' + nl.id;
    const first = firstLabelOfText.get(nl.text);
    if (first === undefined) firstLabelOfText.set(nl.text, key);
    else netUf.union(first, key);
  }

  const routedWires: RoutedWire[] = [];
  const routedById = new Map<string, RoutedWire>();
  for (const w of wires) {
    const ua = ufNode(w.fromPin);
    const ub = ufNode(w.toPin);
    if (!ua || !ub) continue; // dangling / device not placed
    uf.union(ua, ub);
    const ga = endpointGraphNode(w.fromPin, deviceToPlacement);
    const gb = endpointGraphNode(w.toPin, deviceToPlacement);
    let rw: RoutedWire | null = null;
    if (ga && gb && ga !== gb) {
      rw = { wireId: w.id, kind: 'pair', treeAnchor: ga, a: ga, b: gb };
    } else if (ga && gb) {
      // Both ends on one connector — a jumper that never enters the harness.
      rw = { wireId: w.id, kind: 'internal', treeAnchor: ga };
    } else if (ga || gb) {
      // One real node, the other a net label — a label-net member.
      rw = {
        wireId: w.id,
        kind: 'labelNet',
        treeAnchor: (ga ?? gb)!,
        netKey: netUf.find(w.fromPin),
      };
    }
    if (rw) { routedWires.push(rw); routedById.set(w.id, rw); }
  }

  // Group the harness-termination nodes by their union-find root. Only
  // `connector` + `splice` nodes are bundle endpoints, so only those join a
  // tree — `component` block nodes are skipped entirely. An isolated
  // connector (a wired connector whose wire dangles) is its own root → its
  // own one-node tree → no bundles. A device with NO used connector emits a
  // `component` node only and never appears here.
  const treesByRoot = new Map<string, HarnessTree>();
  function treeOf(root: string): HarnessTree {
    let t = treesByRoot.get(root);
    if (!t) { t = { nodeIds: [], wireIds: [] }; treesByRoot.set(root, t); }
    return t;
  }
  for (const n of nodes) {
    if (n.kind === 'connector' || n.kind === 'splice') {
      treeOf(uf.find(n.id)).nodeIds.push(n.id);
    }
  }
  for (const rw of routedWires) {
    treeOf(uf.find(rw.treeAnchor)).wireIds.push(rw.wireId);
  }

  // ── 3 + 4 + 5 + 6. Per tree: physical tree + conductor routing.
  const bundles: Bundle[] = [];
  // Raw MST edges across every tree, collected as this derivation runs —
  // returned as `HarnessGraph._mstEdgeKeys` so the NEXT derivation can bias
  // toward them (hysteresis). Populated regardless of whether a tree used
  // `buildMst` or `buildMstWithLocks` — either way, this is "the
  // connectivity backbone actually used this time," which is exactly what
  // a future unlocked derivation should stay close to.
  const allMstEdgeKeys = new Set<string>();

  // Deterministic tree order: by the sorted-first node id.
  const trees = Array.from(treesByRoot.values()).sort((ta, tb) => {
    const sa = ta.nodeIds.slice().sort()[0] ?? '';
    const sb = tb.nodeIds.slice().sort()[0] ?? '';
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  for (const tree of trees) buildTree(tree);

  /**
   * Build one harness tree's physical structure and route its conductors.
   * Mutates the shared `nodes` / `bundles` / `nodeById`.
   */
  function buildTree(tree: HarnessTree): void {
    if (tree.nodeIds.length < 2) return; // isolated device — no bundles

    // 3a. Seed positions. Splice positions are unknown until now — place
    //     each splice at the centroid of its wire neighbours so the MST has
    //     a sensible geometry. Iterate so a splice chained to other splices
    //     still settles once a connector anchors it.
    const pos = new Map<string, Point>();
    for (const id of tree.nodeIds) {
      const n = nodeById.get(id)!;
      // Connector nodes carry their derived dock position (which already
      // tracks the device's effective position). Splices have no position
      // yet — UNLESS the user pinned one via an override, in which case it
      // seeds the MST geometry directly.
      if (n.kind !== 'splice') {
        pos.set(id, { x: n.position.x, y: n.position.y });
      } else {
        const ov = nodePositionOverrides[id];
        if (ov) pos.set(id, { x: ov.x, y: ov.y });
      }
    }
    const spliceNeighbours = new Map<string, string[]>();
    for (const wid of tree.wireIds) {
      const rw = routedById.get(wid);
      if (!rw || rw.kind !== 'pair' || !rw.a || !rw.b) continue;
      for (const [x, y] of [[rw.a, rw.b], [rw.b, rw.a]] as const) {
        if (isJunctionNodeId(x)) {
          const list = spliceNeighbours.get(x) ?? [];
          list.push(y);
          spliceNeighbours.set(x, list);
        }
      }
    }
    const spliceIds = tree.nodeIds.filter(id => isJunctionNodeId(id));
    for (let pass = 0; pass <= spliceIds.length; pass++) {
      let changed = false;
      for (const sid of spliceIds) {
        if (pos.has(sid)) continue;
        const pts: Point[] = [];
        for (const nb of spliceNeighbours.get(sid) ?? []) {
          const p = pos.get(nb);
          if (p) pts.push(p);
        }
        if (pts.length) {
          pos.set(sid, {
            x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
            y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
          });
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const sid of spliceIds) {
      if (!pos.has(sid)) pos.set(sid, { x: 0, y: 0 });
      nodeById.get(sid)!.position = pos.get(sid)!;
    }

    // 3b. MST over the node positions — the connectivity backbone. A locked
    //     edge (if any touch this tree) takes priority — `buildMstWithLocks`
    //     degenerates to plain `buildMst` when nothing is locked, so this is
    //     the only call site needed either way. `previousMstEdges` supplies
    //     hysteresis in both cases.
    const sortedNodeIds = tree.nodeIds.slice().sort();
    const mstEdges = lockedEdgeSet.size > 0
      ? buildMstWithLocks(sortedNodeIds, pos, lockedEdgeSet, previousMstEdges)
      : buildMst(sortedNodeIds, pos, previousMstEdges);
    for (const e of mstEdges) allMstEdgeKeys.add(edgeKey(e.a, e.b));
    const mstAdj = adjacencyOf(sortedNodeIds, mstEdges);

    // `nodePos` resolves any node (incl. the branch points created below) to
    // its current position.
    const nodePos = (id: string): Point => {
      const n = nodeById.get(id);
      if (n) return n.position;
      return pos.get(id) ?? { x: 0, y: 0 };
    };

    // Bundles emitted for THIS tree — collected so conductor routing only
    // ever path-finds within the tree it belongs to.
    //
    // A bundle's id is its two endpoint node ids SORTED and joined `<a>|<b>`
    // — stable because the node ids are, and the key into
    // `bundleLengths`. A `bundleLengths` entry re-applies the user-set
    // physical cable length; an entry for a pair not in the graph is ignored.
    const treeBundles: Bundle[] = [];
    const emitBundle = (a: string, b: string) => {
      const [e0, e1] = a <= b ? [a, b] : [b, a];
      const id = `${e0}|${e1}`;
      const wps = bundleWaypointOverrides[id];
      const bundle: Bundle = {
        id,
        endpoints: [a, b],
        conductorIds: [],
        conductors: [],
        length: bundleLengthOverrides[id],
        // Phase 4 — cable bend points + name re-applied by stable id, the
        // same way `length` is. A defensive copy of the waypoint array so a
        // consumer never mutates the persisted override in place.
        waypoints: Array.isArray(wps) && wps.length > 0
          ? wps.map(p => ({ x: p.x, y: p.y }))
          : undefined,
        name: bundleNameOverrides[id] || undefined,
      };
      bundles.push(bundle);
      treeBundles.push(bundle);
    };

    // ── 4. MST → clean splice-cad tree.
    //
    // The MST is the connectivity backbone. We transform it into a clean
    // harness tree whose only interior nodes are `branchPoint`s (always a
    // genuine 3+-way fan-out) and `splice`s — every `connector` ends up a
    // degree-1 leaf.
    //
    // 4a. MST-degree of every node.
    const mstDegree = new Map<string, number>();
    for (const id of sortedNodeIds) {
      mstDegree.set(id, (mstAdj.get(id) ?? []).length);
    }

    // 4b. Branched connectors — a `connector` node with MST-degree >= 2 gets
    //     a synthesized `branchPoint` with the stable id `bp:<connectorNodeId>`.
    //     A connector with MST-degree <= 1 stays a direct leaf (no branch
    //     point); a `splice` is never branched (it is an internal fan-out
    //     already).
    const isBranchedConnector = (id: string): boolean => {
      const n = nodeById.get(id);
      return !!n && n.kind === 'connector' && (mstDegree.get(id) ?? 0) >= 2;
    };

    // `rep(n)` — the node that physically carries `n` in the final tree: its
    // branch point if `n` is a branched connector, else `n` itself.
    const rep = (id: string): string =>
      isBranchedConnector(id) ? branchPointNodeId(id) : id;

    // 4c. Final edge set. For every MST edge (u,v): emit a bundle between
    //     rep(u) and rep(v). Then, for every branched connector c: emit the
    //     connector's single leaf cable c—bp:<c>. A degenerate rep(u)===rep(v)
    //     self-edge cannot arise (rep only collapses a node to its OWN branch
    //     point, and an MST edge joins two distinct nodes) — guarded anyway.
    const branchedConnectors = sortedNodeIds.filter(isBranchedConnector);
    for (const c of branchedConnectors) {
      // Create the branch-point node up front (through `addNode`, so a
      // `nodePositions[bp:<c>]` override pins it). Its position is seeded at
      // the served connector's dock point and relaxed below; an overridden
      // branch point keeps its overridden position.
      const bpId = branchPointNodeId(c);
      addNode({
        id: bpId,
        kind: 'branchPoint',
        position: { x: nodePos(c).x, y: nodePos(c).y },
        // Stable sequence number (2026-07) — read straight from the
        // override, assigned once on first sighting by a sync effect in
        // WiringPage. A branch point that appeared THIS frame and hasn't
        // been assigned yet renders with no number for one tick rather than
        // a live-sorted guess — see the module doc for why.
        label: branchPointLabels[bpId] !== undefined ? `BP${branchPointLabels[bpId]}` : undefined,
      });
    }
    for (const e of mstEdges) {
      const ra = rep(e.a);
      const rb = rep(e.b);
      if (ra === rb) continue; // degenerate self-edge — cannot occur; skip
      emitBundle(ra, rb);
    }
    for (const c of branchedConnectors) {
      emitBundle(c, branchPointNodeId(c)); // the branched connector's single leaf cable
    }

    // ── 5. Branch-point positions — centroid relaxation.
    //
    // Fixed anchors: every `connector` node (its dock position), every
    // `splice` node (its seeded centroid), and any `branchPoint` with a
    // `nodePositions` override. Non-anchored branch points relax to the
    // average of their tree-neighbour positions over a few deterministic
    // passes. Iteration is over a SORTED node-id list so the result never
    // depends on Set/Map insertion order — the function stays deterministic.
    {
      // Tree-neighbour adjacency over the bundles emitted for THIS tree.
      const treeAdj = new Map<string, string[]>();
      for (const b of treeBundles) {
        for (const [x, y] of [[b.endpoints[0], b.endpoints[1]],
                              [b.endpoints[1], b.endpoints[0]]] as const) {
          const list = treeAdj.get(x) ?? [];
          list.push(y);
          treeAdj.set(x, list);
        }
      }
      // Non-anchored branch points — a branch point with a position override
      // is an anchor and keeps its overridden position.
      const movableBps = branchedConnectors
        .map(c => branchPointNodeId(c))
        .filter(id => !nodePositionOverrides[id])
        .sort();
      // 12 deterministic relaxation passes. Each pass recomputes every
      // movable branch point as the average of its current tree-neighbour
      // positions, reading positions live off `nodeById`.
      for (let pass = 0; pass < 12; pass++) {
        for (const bpId of movableBps) {
          const nbs = treeAdj.get(bpId) ?? [];
          if (nbs.length === 0) continue;
          let sx = 0, sy = 0;
          for (const nb of nbs) {
            const p = nodePos(nb);
            sx += p.x;
            sy += p.y;
          }
          nodeById.get(bpId)!.position = {
            x: sx / nbs.length,
            y: sy / nbs.length,
          };
        }
      }
    }

    // ── 6. Route conductors. Adjacency over THIS tree's bundles only —
    //       `treeBundles` are exactly the ones emitted above.
    const finalAdj = new Map<string, { node: string; bundle: Bundle }[]>();
    for (const b of treeBundles) {
      for (const [x, y] of [[b.endpoints[0], b.endpoints[1]],
                            [b.endpoints[1], b.endpoints[0]]] as const) {
        const list = finalAdj.get(x) ?? [];
        list.push({ node: y, bundle: b });
        finalAdj.set(x, list);
      }
    }

    /** Unique bundle-path between two nodes in the acyclic bundle tree. */
    function pathBetween(from: string, to: string): Bundle[] {
      if (from === to) return [];
      const prevNode = new Map<string, string>();
      const prevBundle = new Map<string, Bundle>();
      const seen = new Set<string>([from]);
      const q = [from];
      while (q.length) {
        const cur = q.shift()!;
        if (cur === to) break;
        for (const e of (finalAdj.get(cur) ?? [])) {
          if (seen.has(e.node)) continue;
          seen.add(e.node);
          prevNode.set(e.node, cur);
          prevBundle.set(e.node, e.bundle);
          q.push(e.node);
        }
      }
      if (!prevBundle.has(to)) return [];
      const out: Bundle[] = [];
      let n = to;
      while (n !== from) {
        const b = prevBundle.get(n);
        if (!b) break;
        out.push(b);
        n = prevNode.get(n)!;
      }
      return out;
    }

    const addConductor = (b: Bundle, wid: string) => {
      if (!b.conductorIds.includes(wid)) b.conductorIds.push(wid);
    };

    /** Nodes reachable from `start` without crossing `without` — i.e. one
     *  side of the tree once that cable is cut. Used to work out which of a
     *  net's members sit at each end of a given segment. */
    const nodesOnSideOf = (without: Bundle, start: string): Set<string> => {
      const seen = new Set<string>([start]);
      const q = [start];
      while (q.length) {
        const cur = q.shift()!;
        for (const e of (finalAdj.get(cur) ?? [])) {
          if (e.bundle === without || seen.has(e.node)) continue;
          seen.add(e.node);
          q.push(e.node);
        }
      }
      return seen;
    };

    // 6a. `pair` wires — route along the unique tree-path between the two
    //     endpoint nodes (handles direct wires, junction wires, and the
    //     cycle case: the MST dropped the cycle-closing edge, the wire still
    //     routes along the surviving tree path).
    for (const wid of tree.wireIds) {
      const rw = routedById.get(wid);
      if (!rw || rw.kind !== 'pair' || !rw.a || !rw.b) continue;
      const w = wireById.get(wid);
      for (const b of pathBetween(rw.a, rw.b)) {
        addConductor(b, wid);
        // A plain wire is already one physical conductor between two real
        // pins — nothing to resolve.
        if (w) b.conductors.push({ id: wid, wireIds: [wid], from: w.fromPin, to: w.toPin });
      }
    }

    // 6b. `labelNet` wires — a label-net has no two distinguished endpoints,
    //     so its conductors run the minimal subtree spanning every member
    //     device node (a power rail runs the full harness length). All member
    //     wires of one label net share that same bundle set.
    //
    //     Grouped by ELECTRICAL net (`netKey`). This used to group by
    //     `uf.find(treeAnchor)` — the harness-tree root — which is the same
    //     value for every wire in a connected harness, so every net-label
    //     wire in the project ended up in one aggregate and was routed onto
    //     the subtree spanning all of them. A 2-pin resistor on a spur then
    //     reported the conductors of power rails it never touched.
    const labelNetMembers = new Map<string, {
      wireIds: string[];
      nodes: Set<string>;
      /** Node id → the real pin keys this net lands on there. Needed to
       *  report a conductor's ends as pins rather than as the label stub
       *  the schematic drew. */
      pinsByNode: Map<string, string[]>;
    }>();
    for (const wid of tree.wireIds) {
      const rw = routedById.get(wid);
      if (!rw || rw.kind !== 'labelNet') continue;
      const root = rw.netKey ?? uf.find(rw.treeAnchor);
      let agg = labelNetMembers.get(root);
      if (!agg) { agg = { wireIds: [], nodes: new Set(), pinsByNode: new Map() }; labelNetMembers.set(root, agg); }
      agg.wireIds.push(wid);
      agg.nodes.add(rw.treeAnchor);
      const w = wireById.get(wid);
      if (w) {
        // Whichever end isn't the label is the pin this leg terminates on.
        const realPin = w.fromPin.startsWith('#') ? w.toPin : w.fromPin;
        const list = agg.pinsByNode.get(rw.treeAnchor) ?? [];
        if (!list.includes(realPin)) list.push(realPin);
        agg.pinsByNode.set(rw.treeAnchor, list);
      }
    }
    for (const agg of labelNetMembers.values()) {
      const memberNodes = Array.from(agg.nodes).sort();
      const subtree = new Set<Bundle>();
      // Union of the tree-paths from the first member to every other —
      // covers every bundle in the minimal spanning subtree.
      for (let i = 1; i < memberNodes.length; i++) {
        for (const b of pathBetween(memberNodes[0], memberNodes[i])) subtree.add(b);
      }
      for (const wid of agg.wireIds) {
        for (const b of subtree) addConductor(b, wid);
      }
      // One physical conductor per segment, with the labels resolved away:
      // cutting this cable puts some of the net's pins on one side and the
      // rest on the other, and the wire in this cable joins them. For a
      // two-point net that's exactly `pinA → pinB`. For a bigger net it
      // names one member per side — honest, though such a net really wants
      // a splice node, which the harness doesn't derive yet.
      for (const b of subtree) {
        const sideA = nodesOnSideOf(b, b.endpoints[0]);
        const pinsA: string[] = [];
        const pinsB: string[] = [];
        for (const node of memberNodes) {
          const pins = agg.pinsByNode.get(node) ?? [];
          (sideA.has(node) ? pinsA : pinsB).push(...pins);
        }
        // A segment inside the spanning subtree always has members on both
        // sides; skip rather than invent an endpoint if that ever fails.
        if (pinsA.length === 0 || pinsB.length === 0) continue;
        pinsA.sort(); pinsB.sort();
        b.conductors.push({
          id: agg.wireIds[0],
          wireIds: [...agg.wireIds],
          from: pinsA[0],
          to: pinsB[0],
        });
      }
    }
  }

  return { nodes, bundles, _mstEdgeKeys: allMstEdgeKeys };
}
