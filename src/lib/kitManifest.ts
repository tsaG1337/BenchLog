/**
 * Kit manifest system: defines aircraft types, their kits, sub-kits,
 * bags, and expected parts lists for mass ingestion verification.
 *
 * Vendor data lives in src/templates/inventory/kitmanifest/<aircraft>/.
 * To add a new aircraft: create the template folder, then add one import + one array entry here.
 */

// ─── Types ────────────────────────────────────────────────────────

export interface ManifestEntry {
  partNumber: string;
  nomenclature: string;
  /** How many of this part are required per aircraft */
  qtyRequired: number;
  /** e.g. MANUFACTURED, MATERIAL, HARDWARE */
  partType: string;
  /** e.g. ".032 2024-T3 ALCLAD" */
  material: string;
  /** e.g. ELEV, TAILCONE — sub-kit within the parent kit. '' for hardware */
  subKit: string;
  /** Bag this item ships in, e.g. 'BAG 1001'. undefined if not in a bag */
  bag?: string;
  /** Unit of measure: 'pcs' (default) or 'lb' (rivets sold by weight) */
  unit?: string;
}

export interface BagContentItem {
  partNumber: string;
  qty: number;
}

export interface BagDefinition {
  /** Bag identifier, e.g. 'BAG 1001' */
  id: string;
  /** Short description, e.g. 'MISC EMP HDWRE' */
  description: string;
  /** Parts contained in this bag with bag-specific quantities */
  contents: BagContentItem[];
}

export interface KitDefinition {
  id: string;
  label: string;
  /** Sub-kits that belong to this kit */
  subKits: string[];
  /** Expected parts list */
  entries: ManifestEntry[];
  /** Bag definitions for this kit */
  bags: BagDefinition[];
}

export interface AircraftManifest {
  id: string;
  label: string;
  kits: KitDefinition[];
}

// ─── Registry ─────────────────────────────────────────────────────

import { VANS_RV10_MANIFEST } from '@/templates/inventory/kitmanifest/vans-rv10';

export const AIRCRAFT_MANIFESTS: AircraftManifest[] = [
  VANS_RV10_MANIFEST,
];

// ─── Helpers ──────────────────────────────────────────────────────

export function getAircraftManifest(aircraftType: string): AircraftManifest | undefined {
  return AIRCRAFT_MANIFESTS.find(m => m.id === aircraftType);
}

export function getKitDefinition(aircraftType: string, kitId: string): KitDefinition | undefined {
  const manifest = getAircraftManifest(aircraftType);
  return manifest?.kits.find(k => k.id === kitId);
}

/** Get all entries for a kit (across all its sub-kits) */
export function getKitEntries(aircraftType: string, kitId: string): ManifestEntry[] {
  const kit = getKitDefinition(aircraftType, kitId);
  return kit?.entries ?? [];
}

/** Get all entries across all kits for an aircraft (deduped by part number, first wins) */
export function getAllEntries(aircraftType: string): ManifestEntry[] {
  const manifest = getAircraftManifest(aircraftType);
  if (!manifest) return [];
  const seen = new Set<string>();
  const result: ManifestEntry[] = [];
  for (const kit of manifest.kits) {
    for (const e of kit.entries) {
      const key = e.partNumber.toUpperCase();
      if (!seen.has(key)) { seen.add(key); result.push(e); }
    }
  }
  return result;
}

/** Get entries expanded per-bag for check sessions.
 *  Parts that appear in multiple bags get one entry per bag with bag-specific qty.
 *  The bag-specific quantities sum to the kit total for that part. */
export function getKitEntriesPerBag(aircraftType: string, kitId: string): ManifestEntry[] {
  const kit = getKitDefinition(aircraftType, kitId);
  if (!kit) return [];

  // Build a map: partNumber → [{ bag, qty }] from all bag contents
  const partBags = new Map<string, { bagId: string; qty: number }[]>();
  for (const bag of (kit.bags ?? [])) {
    for (const c of bag.contents) {
      // Contents can be { partNumber, qty } objects or plain strings (sub-kit containers)
      const pn = typeof c === 'string' ? c : c.partNumber;
      const qty = typeof c === 'string' ? 0 : c.qty;
      if (!pn || qty <= 0) continue;  // skip string-only entries (no bag-specific qty)
      const key = pn.toUpperCase();
      const arr = partBags.get(key) || [];
      arr.push({ bagId: bag.id, qty });
      partBags.set(key, arr);
    }
  }

  const result: ManifestEntry[] = [];
  for (const entry of kit.entries) {
    const key = entry.partNumber.toUpperCase();
    const bags = partBags.get(key);
    if (bags && bags.length > 0) {
      // Part appears in bag contents — create one entry per bag with bag-specific qty
      let allocatedQty = 0;
      for (const { bagId, qty } of bags) {
        result.push({ ...entry, bag: bagId, qtyRequired: qty });
        allocatedQty += qty;
      }
      // If bag quantities don't sum to the kit total, add remainder under original bag
      const remainder = entry.qtyRequired - allocatedQty;
      if (remainder > 0.001) {
        result.push({ ...entry, qtyRequired: remainder });
      }
    } else {
      // Part not in any bag contents — keep as-is
      result.push(entry);
    }
  }
  return result;
}

/** Get all bag definitions for a kit */
export function getKitBags(aircraftType: string, kitId: string): BagDefinition[] {
  const kit = getKitDefinition(aircraftType, kitId);
  return kit?.bags || [];
}

/** Resolve all entries for a bag: entries tagged with the bag ID + entries
 *  listed in the bag's contents array (which may belong to other bags too).
 *  Uses bag-specific quantities from contents when available. */
function resolveBagEntries(kit: KitDefinition, bag: BagDefinition, visited?: Set<string>): ManifestEntry[] {
  const bagQtyMap = new Map(bag.contents.map(c => [c.partNumber.toUpperCase(), c.qty]));
  const seen = new Set<string>();
  const result: ManifestEntry[] = [];
  // Track visited bags to prevent infinite recursion
  const visitedBags = visited ?? new Set<string>();
  visitedBags.add(bag.id.toUpperCase());

  // First: entries explicitly tagged with this bag
  for (const e of kit.entries) {
    if (e.bag === bag.id) {
      const key = e.partNumber.toUpperCase();
      const bagQty = bagQtyMap.get(key);
      result.push(bagQty != null ? { ...e, qtyRequired: bagQty } : e);
      seen.add(key);
    }
  }
  // Second: entries listed in contents but assigned to a different bag
  for (const e of kit.entries) {
    const key = e.partNumber.toUpperCase();
    if (!seen.has(key) && bagQtyMap.has(key)) {
      const bagQty = bagQtyMap.get(key)!;
      result.push({ ...e, qtyRequired: bagQty });
      seen.add(key);
    }
  }
  // Third: recursively resolve nested bags (contents referencing other bag IDs)
  const allBags = kit.bags ?? [];
  for (const c of bag.contents) {
    const key = c.partNumber.toUpperCase();
    if (seen.has(key)) continue; // already resolved as an entry
    const nestedBag = allBags.find(b => b.id.toUpperCase() === key);
    if (nestedBag && !visitedBags.has(key)) {
      const nestedEntries = resolveBagEntries(kit, nestedBag, visitedBags);
      for (const ne of nestedEntries) {
        const neKey = ne.partNumber.toUpperCase();
        if (!seen.has(neKey)) {
          result.push(ne);
          seen.add(neKey);
        }
      }
    }
  }
  return result;
}

/** A group of entries belonging to a bag (or the top-level parent) */
export interface BagEntryGroup {
  bagId: string;
  description: string;
  entries: ManifestEntry[];
}

/** Resolve entries for a bag, grouped by sub-bag.
 *  First group = direct entries of the parent bag.
 *  Subsequent groups = one per nested sub-bag with its own entries. */
function resolveBagEntriesGrouped(kit: KitDefinition, bag: BagDefinition): BagEntryGroup[] {
  const bagQtyMap = new Map(bag.contents.map(c => [c.partNumber.toUpperCase(), c.qty]));
  const seen = new Set<string>();
  const directEntries: ManifestEntry[] = [];

  // Direct entries tagged with this bag
  for (const e of kit.entries) {
    if (e.bag === bag.id) {
      const key = e.partNumber.toUpperCase();
      const bagQty = bagQtyMap.get(key);
      directEntries.push(bagQty != null ? { ...e, qtyRequired: bagQty } : e);
      seen.add(key);
    }
  }
  // Entries in contents but assigned to a different bag (not a sub-bag reference)
  const allBags = kit.bags ?? [];
  const bagIdSet = new Set(allBags.map(b => b.id.toUpperCase()));
  for (const e of kit.entries) {
    const key = e.partNumber.toUpperCase();
    if (!seen.has(key) && bagQtyMap.has(key) && !bagIdSet.has(key)) {
      directEntries.push({ ...e, qtyRequired: bagQtyMap.get(key)! });
      seen.add(key);
    }
  }

  const groups: BagEntryGroup[] = [{ bagId: bag.id, description: bag.description, entries: directEntries }];

  // Nested bags
  for (const c of bag.contents) {
    const key = c.partNumber.toUpperCase();
    if (seen.has(key)) continue;
    const nestedBag = allBags.find(b => b.id.toUpperCase() === key);
    if (nestedBag) {
      const nestedEntries = resolveBagEntries(kit, nestedBag, new Set([bag.id.toUpperCase()]));
      if (nestedEntries.length > 0) {
        groups.push({ bagId: nestedBag.id, description: nestedBag.description, entries: nestedEntries });
        for (const ne of nestedEntries) seen.add(ne.partNumber.toUpperCase());
      }
    }
  }

  return groups;
}

/** Get a specific bag and its manifest entries */
export function getBagContents(aircraftType: string, kitId: string, bagId: string): {
  bag: BagDefinition;
  entries: ManifestEntry[];
} | undefined {
  const kit = getKitDefinition(aircraftType, kitId);
  if (!kit) return undefined;
  const bag = (kit.bags ?? []).find(b => b.id === bagId);
  if (!bag) return undefined;
  return { bag, entries: resolveBagEntries(kit, bag) };
}

/** Result type for bag lookups */
export interface BagLookupResult {
  kitId: string;
  bag: BagDefinition;
  entries: ManifestEntry[];
  groups: BagEntryGroup[];
}

/** Find a bag by ID across all kits for an aircraft */
export function findBag(aircraftType: string, bagId: string): BagLookupResult | undefined {
  const manifest = getAircraftManifest(aircraftType);
  if (!manifest) return undefined;
  for (const kit of manifest.kits) {
    const bag = (kit.bags ?? []).find(b => b.id === bagId);
    if (bag) {
      return { kitId: kit.id, bag, entries: resolveBagEntries(kit, bag), groups: resolveBagEntriesGrouped(kit, bag) };
    }
  }
  return undefined;
}

/** Check if a string looks like a bag identifier */
export function isBagLabel(text: string): boolean {
  return /^BAG\s+\S/i.test(text.trim());
}

/** Normalize a bag ID for fuzzy matching (collapse whitespace, uppercase) */
function normalizeBagId(id: string): string {
  return id.toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Build a BagLookupResult from a kit + bag */
function makeBagResult(kit: KitDefinition, bag: BagDefinition): BagLookupResult {
  return { kitId: kit.id, bag, entries: resolveBagEntries(kit, bag), groups: resolveBagEntriesGrouped(kit, bag) };
}

/** Find a bag by ID across all kits, with fuzzy whitespace matching.
 *  Also handles OCR over-read where the scanned text includes the bag
 *  description after the ID (e.g. "BAG 1001 MISC EMP HDWRE").
 */
export function findBagFuzzy(aircraftType: string, rawBagId: string): BagLookupResult | undefined {
  // Try exact match first
  const exact = findBag(aircraftType, rawBagId);
  if (exact) return exact;

  const manifest = getAircraftManifest(aircraftType);
  if (!manifest) return undefined;

  // Build a set of all normalized bag IDs for matching
  const allBags: { norm: string; kit: typeof manifest.kits[number]; bag: BagDefinition }[] = [];
  for (const kit of manifest.kits) {
    for (const bag of (kit.bags ?? [])) {
      allBags.push({ norm: normalizeBagId(bag.id), kit, bag });
    }
  }

  const needle = normalizeBagId(rawBagId);

  // 1) Exact normalized match
  for (const { norm, kit, bag } of allBags) {
    if (norm === needle) return makeBagResult(kit, bag);
  }

  // 2) OCR over-read: scanned text starts with a known bag ID
  for (const { norm, kit, bag } of allBags) {
    if (needle.startsWith(norm + ' ') || needle.startsWith(norm + '-')) return makeBagResult(kit, bag);
  }

  // 3) OCR under-read: no-space comparison
  const needleNoSpace = needle.replace(/\s+/g, '');
  for (const { norm, kit, bag } of allBags) {
    if (norm.replace(/\s+/g, '') === needleNoSpace) return makeBagResult(kit, bag);
  }

  // 4) Substring: prefer longest match
  let bestMatch: { kit: typeof manifest.kits[number]; bag: BagDefinition; len: number } | null = null;
  for (const { norm, kit, bag } of allBags) {
    if (norm.length >= 8 && needle.includes(norm) && (!bestMatch || norm.length > bestMatch.len)) {
      bestMatch = { kit, bag, len: norm.length };
    }
  }
  if (bestMatch) return makeBagResult(bestMatch.kit, bestMatch.bag);

  // 5) No-space substring
  for (const { norm, kit, bag } of allBags) {
    const normNoSpace = norm.replace(/\s+/g, '');
    if (normNoSpace.length >= 8 && needleNoSpace.includes(normNoSpace)) return makeBagResult(kit, bag);
  }

  return undefined;
}
