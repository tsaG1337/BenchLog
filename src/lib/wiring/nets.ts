import type { Wire, NetLabel } from './types';

// ── Union-Find over string keys ─────────────────────────────────────
// Mirrors the UnionFind in deriveHarness.ts (path-halving compression).

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

/**
 * Every wire id electrically connected to `wireId` (itself included) — its net.
 *
 * Net connectivity (union-find over endpoint-key strings):
 *  - each `Wire` unions its two endpoint keys (`fromPin`, `toPin`);
 *  - each `NetLabel` unions `#<labelId>` with its `attachedTo` key;
 *  - net labels with the same `text` union together.
 * Two wires share a net iff an endpoint key of one shares a union-find root
 * with an endpoint key of the other.
 *
 * Returns the wire ids sorted (deterministic). A `wireId` not in `wires` → [].
 */
export function wiresInNet(
  wireId: string,
  wires: Wire[],
  netLabels: NetLabel[],
): string[] {
  const uf = new UnionFind();

  // Step 1 — each wire unions its two endpoint keys.
  for (const w of wires) {
    uf.union(w.fromPin, w.toPin);
  }

  // Step 2 — each net label unions its virtual key with its attachment point.
  for (const label of netLabels) {
    uf.union('#' + label.id, label.attachedTo);
  }

  // Step 3 — labels sharing the same text union their virtual keys together.
  const byText = new Map<string, string[]>();
  for (const label of netLabels) {
    const key = '#' + label.id;
    const group = byText.get(label.text);
    if (group) {
      group.push(key);
    } else {
      byText.set(label.text, [key]);
    }
  }
  for (const group of byText.values()) {
    // Union all members of the group to the first element.
    for (let i = 1; i < group.length; i++) {
      uf.union(group[0], group[i]);
    }
  }

  // Find the seed wire.
  const seed = wires.find(w => w.id === wireId);
  if (!seed) return [];

  const root = uf.find(seed.fromPin);

  // Collect every wire that shares a root with the seed.
  const result: string[] = [];
  for (const w of wires) {
    if (uf.find(w.fromPin) === root || uf.find(w.toPin) === root) {
      result.push(w.id);
    }
  }

  return result.sort();
}
