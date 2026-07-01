import type { KitDefinition } from '@/lib/kitManifest';

/**
 * Generic Van's Aircraft kits — supplemental kits that ship across multiple
 * model lines (RV-7, RV-9, RV-10, RV-14, …). Define each kit once here and
 * import it into every applicable model's manifest, instead of duplicating
 * the entries per model.
 *
 * Add new shared kits at the bottom of this file and append them to
 * `sharedVansKits` so every model picks them up automatically.
 */

// ══════════════════════════════════════════════════════════════════
// ACCESS PANEL KIT
// ══════════════════════════════════════════════════════════════════
export const accessPanelKit: KitDefinition = {
  id: 'access-panel',
  label: 'Access Panel Kit',
  subKits: [],
  entries: [
    // ── BAG 539 ──────────────────────────────────────────────────
    { partNumber: 'AN426AD3-3.5', nomenclature: 'COUNTERSUNK HEAD RIVETS',    qtyRequired: 0.02, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 539', unit: 'lb' },
    { partNumber: 'AN507C832R8',  nomenclature: 'COUNTERSUNK MACHINE SCREW', qtyRequired: 32,   partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 539' },
    { partNumber: 'K1100-08',     nomenclature: 'NUTPLATE',                  qtyRequired: 32,   partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 539' },
    // ── Loose (no bag) ───────────────────────────────────────────
    { partNumber: 'VA-258A', nomenclature: 'FORWARD FUSELAGE ACCESS PANEL RING/DOUBLER', qtyRequired: 2, partType: 'MANUFACTURED', material: '', subKit: '' },
    { partNumber: 'VA-258B', nomenclature: 'FORWARD FUSELAGE ACCESS PANEL',              qtyRequired: 2, partType: 'MANUFACTURED', material: '', subKit: '' },
  ],
  bags: [
    // Top-level kit bag — what the user actually sees printed on the
    // outer kit label. Lets a single scan of "ACCESS PANEL KIT" trigger
    // the bag-prompt flow that ingests every part inside, including the
    // sub-bag's hardware.
    { id: 'ACCESS PANEL KIT', description: 'ACCESS PANEL KIT', contents: [
      { partNumber: 'VA-258A', qty: 2 },
      { partNumber: 'VA-258B', qty: 2 },
      { partNumber: 'BAG 539', qty: 1 },
    ]},
    { id: 'BAG 539', description: 'ACCESS PANEL HARDWARE', contents: [
      { partNumber: 'AN426AD3-3.5', qty: 0.02 },
      { partNumber: 'AN507C832R8',  qty: 32 },
      { partNumber: 'K1100-08',     qty: 32 },
    ]},
  ],
};

// ══════════════════════════════════════════════════════════════════
// 14 SV AFS YAW SERVO INSTALL KIT
// ══════════════════════════════════════════════════════════════════
export const afsYawServoInstallKit: KitDefinition = {
  id: 'afs-yaw-servo-install',
  label: 'AFS Yaw Servo Install Kit',
  subKits: [],
  entries: [
    // ── BAG 3347 — Hardware ──────────────────────────────────────
    { partNumber: 'AN23-9',        nomenclature: 'CLEVIS BOLT',       qtyRequired: 2,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'AN3-4A',        nomenclature: 'BOLT',              qtyRequired: 4,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'AN3-6A',        nomenclature: 'BOLT',              qtyRequired: 4,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'AN310-3',       nomenclature: 'CASTLE NUT',        qtyRequired: 2,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'AN525-832R9',   nomenclature: 'WASHER HEAD SCREW', qtyRequired: 4,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'CS-00022',      nomenclature: 'CABLE',             qtyRequired: 4,  partType: 'MANUFACTURED', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'F-14189C',      nomenclature: 'YAW SERVO PLATE',   qtyRequired: 1,  partType: 'MANUFACTURED', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'MS21042-3',     nomenclature: 'SELF-LOCKING NUT',  qtyRequired: 8,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'MS24665-132',   nomenclature: 'COTTER PIN',        qtyRequired: 3,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'MS24665-153',   nomenclature: 'COTTER PIN',        qtyRequired: 1,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'NAS1149F0332P', nomenclature: 'FLAT WASHER',       qtyRequired: 14, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'NAS1149F0363P', nomenclature: 'FLAT WASHER',       qtyRequired: 2,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    { partNumber: 'NAS1149F0532P', nomenclature: 'FLAT WASHER',       qtyRequired: 1,  partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3347' },
    // ── BAG 3348 — Electrical ────────────────────────────────────
    { partNumber: 'ES-00006',              nomenclature: 'MOLEX SOCKET 093',                    qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3348' },
    { partNumber: 'ES-00012',              nomenclature: 'MOLEX 12 POSITION RECEPTACLE, FEMALE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 3348' },
    { partNumber: 'PLASTIC TIE WRAP 14"',  nomenclature: 'PLASTIC TIE WRAP 14"', qtyRequired: 2, partType: 'MATERIAL', material: '', subKit: '', bag: 'BAG 3348' },
    { partNumber: 'PLASTIC TIE WRAP 5.5"', nomenclature: 'PLASTIC TIE WRAP 5.5"', qtyRequired: 2, partType: 'MATERIAL', material: '', subKit: '', bag: 'BAG 3348' },
    // ── Loose (no bag) ───────────────────────────────────────────
    { partNumber: 'CS-00021', nomenclature: 'CABLE, YAW SERVO BRIDLE', qtyRequired: 2, partType: 'MANUFACTURED', material: '', subKit: '' },
    { partNumber: 'F-14189A', nomenclature: 'YAW SERVO PLATE',         qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: '' },
    { partNumber: 'F-14189B', nomenclature: 'YAW SERVO PLATE',         qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: '' },
  ],
  bags: [
    // Top-level kit bag — matches the outer kit label.
    { id: '14 SV AFS YAW SERVO INSTAL KIT', description: '14 SV AFS YAW SERVO INSTAL KIT', contents: [
      { partNumber: 'CS-00021', qty: 2 },
      { partNumber: 'F-14189A', qty: 1 },
      { partNumber: 'F-14189B', qty: 1 },
      { partNumber: 'BAG 3347', qty: 1 },
      { partNumber: 'BAG 3348', qty: 1 },
    ]},
    { id: 'BAG 3347', description: 'AFS YAW SERVO HARDWARE', contents: [
      { partNumber: 'AN23-9',        qty: 2 },
      { partNumber: 'AN3-4A',        qty: 4 },
      { partNumber: 'AN3-6A',        qty: 4 },
      { partNumber: 'AN310-3',       qty: 2 },
      { partNumber: 'AN525-832R9',   qty: 4 },
      { partNumber: 'CS-00022',      qty: 4 },
      { partNumber: 'F-14189C',      qty: 1 },
      { partNumber: 'MS21042-3',     qty: 8 },
      { partNumber: 'MS24665-132',   qty: 3 },
      { partNumber: 'MS24665-153',   qty: 1 },
      { partNumber: 'NAS1149F0332P', qty: 14 },
      { partNumber: 'NAS1149F0363P', qty: 2 },
      { partNumber: 'NAS1149F0532P', qty: 1 },
    ]},
    { id: 'BAG 3348', description: 'AFS YAW SERVO ELECTRICAL', contents: [
      { partNumber: 'ES-00006',              qty: 8 },
      { partNumber: 'ES-00012',              qty: 1 },
      { partNumber: 'PLASTIC TIE WRAP 14"',  qty: 2 },
      { partNumber: 'PLASTIC TIE WRAP 5.5"', qty: 2 },
    ]},
  ],
};

// ══════════════════════════════════════════════════════════════════
// Registry — every Van's model imports this list
// ══════════════════════════════════════════════════════════════════
export const sharedVansKits: KitDefinition[] = [
  accessPanelKit,
  afsYawServoInstallKit,
];
