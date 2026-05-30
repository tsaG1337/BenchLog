import type { KitDefinition } from '@/lib/kitManifest';

/**
 * Standalone kits and bags from Van's that are NOT part of the main
 * airframe kits (empennage / wing / fuselage / finish).
 *
 * Examples: RV Building Class Project, tool kits, accessory kits, etc.
 * Add new entries + bags here as needed.
 */
export const extrasKit: KitDefinition = {
  id: 'extras',
  label: 'Extras & Standalone',
  subKits: ['CLASS PROJECT'],
  entries: [
    // ══════════════════════════════════════════════════════════════
    // RV BUILDING CLASS PROJECT
    // ══════════════════════════════════════════════════════════════
    { partNumber: 'A-908', nomenclature: 'PRACTICE RIB', qtyRequired: 2, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'A-910', nomenclature: 'PRACTICE RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'AA6-063X3/4X3/4X11', nomenclature: 'ALUMINUM ANGLE 11"', qtyRequired: 1, partType: 'MATERIAL', material: '6061-T6', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'AA6-063X3/4X3/4X6', nomenclature: 'ALUMINUM ANGLE 6"', qtyRequired: 1, partType: 'MATERIAL', material: '6061-T6', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'CP-1', nomenclature: 'CLASS PROJECT PART 1', qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'CP-2', nomenclature: 'CLASS PROJECT PART 2', qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'CP-3', nomenclature: 'CLASS PROJECT PART 3', qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'CP-4', nomenclature: 'CLASS PROJECT PART 4', qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'CP-5', nomenclature: 'CLASS PROJECT PART 5', qtyRequired: 2, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'DOC RV CLASS PROJECT', nomenclature: 'CLASS PROJECT DOCUMENTATION', qtyRequired: 1, partType: 'MATERIAL', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'A-905-L', nomenclature: 'PRACTICE SKIN LEFT', qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },
    { partNumber: 'A-905-R', nomenclature: 'PRACTICE SKIN RIGHT', qtyRequired: 1, partType: 'MANUFACTURED', material: '', subKit: 'CLASS PROJECT', bag: 'RV BUILDING CLASS PROJECT' },

    // ── CLASS TRAINING BAG HARDWARE ──
    // -- BAG CLASS TRAINING 1 --
    { partNumber: 'AN426AD3-3', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.01, partType: 'HARDWARE', material: '', subKit: 'CLASS PROJECT', bag: 'BAG CLASS TRAINING 1', unit: 'lb' },
    // -- BAG CLASS TRAINING 2 --
    { partNumber: 'AN426AD3-3.5', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.01, partType: 'HARDWARE', material: '', subKit: 'CLASS PROJECT', bag: 'BAG CLASS TRAINING 2', unit: 'lb' },
    // -- BAG CLASS TRAINING 3 --
    { partNumber: 'AN426AD3-4', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.01, partType: 'HARDWARE', material: '', subKit: 'CLASS PROJECT', bag: 'BAG CLASS TRAINING 3', unit: 'lb' },
    // -- BAG CLASS TRAINING 4 --
    { partNumber: 'AN470AD4-4', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.01, partType: 'HARDWARE', material: '', subKit: 'CLASS PROJECT', bag: 'BAG CLASS TRAINING 4', unit: 'lb' },
    // -- BAG CLASS TRAINING 5 --
    { partNumber: 'AD-41-ABS', nomenclature: 'POP RIVETS', qtyRequired: 0.01, partType: 'HARDWARE', material: '', subKit: 'CLASS PROJECT', bag: 'BAG CLASS TRAINING 5', unit: 'lb' },
  ],
  bags: [
    { id: 'RV TRAINING PROJECT-1', description: 'RV TRAINING PROJECT-1', contents: [
        { partNumber: 'A-908', qty: 2 },
        { partNumber: 'A-910', qty: 1 },
        { partNumber: 'AA6-063X3/4X3/4X11', qty: 1 },
        { partNumber: 'AA6-063X3/4X3/4X6', qty: 1 },
        { partNumber: 'BAG CLASS TRAINING 1', qty: 1 },
        { partNumber: 'BAG CLASS TRAINING 2', qty: 1 },
        { partNumber: 'BAG CLASS TRAINING 3', qty: 1 },
        { partNumber: 'BAG CLASS TRAINING 4', qty: 1 },
        { partNumber: 'BAG CLASS TRAINING 5', qty: 1 },
        { partNumber: 'CP-1', qty: 1 },
        { partNumber: 'CP-2', qty: 1 },
        { partNumber: 'CP-3', qty: 1 },
        { partNumber: 'CP-4', qty: 1 },
        { partNumber: 'CP-5', qty: 2 },
        { partNumber: 'DOC RV CLASS PROJECT', qty: 1 },
        { partNumber: 'A-905-L', qty: 1 },
        { partNumber: 'A-905-R', qty: 1 },
      ] },
    { id: 'BAG CLASS TRAINING 1', description: 'CLASS TRAINING HARDWARE 1', contents: [{ partNumber: 'AN426AD3-3', qty: 0.01 }] },
    { id: 'BAG CLASS TRAINING 2', description: 'CLASS TRAINING HARDWARE 2', contents: [{ partNumber: 'AN426AD3-3.5', qty: 0.01 }] },
    { id: 'BAG CLASS TRAINING 3', description: 'CLASS TRAINING HARDWARE 3', contents: [{ partNumber: 'AN426AD3-4', qty: 0.01 }] },
    { id: 'BAG CLASS TRAINING 4', description: 'CLASS TRAINING HARDWARE 4', contents: [{ partNumber: 'AN470AD4-4', qty: 0.01 }] },
    { id: 'BAG CLASS TRAINING 5', description: 'CLASS TRAINING HARDWARE 5', contents: [{ partNumber: 'AD-41-ABS', qty: 0.01 }] },
  ],
};
