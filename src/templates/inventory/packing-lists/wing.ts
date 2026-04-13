/**
 * Van's RV-10 Wing Kit — Packing List
 * Source: Wing_Packing_list.pdf (9 pages)
 * Order Date: 12/12/25 | Ship Date: 2/17/26 | Purchase Order: WING
 *
 * Format: Each top-level entry is either a plain item (PackingListItem)
 * or a BAG / SUB-KIT with contents (PackingListBag).
 * Quantities for rivets sold by weight (LB) are noted in description.
 */

import type { PackingListItem, PackingListBag } from './empennage';

export const WING_PACKING_LIST: (PackingListItem | PackingListBag)[] = [
  // ════════════════════════════════════════════════════════════
  // TOP-LEVEL: RV-10 WING KIT-2 (STANDARDIZED KIT, No Center Section)
  // ════════════════════════════════════════════════════════════

  // ── PLANS & MANUALS ────────────────────────────────────────
  { stockCode: '10A PLANS WING', qty: 1, description: 'PLANS & MANUAL' },

  // ── SKINS & SPARS (Page 1) ────────────────────────────────
  { stockCode: 'A-1001A-1L', qty: 1, description: 'NOSE SKIN' },
  { stockCode: 'A-1001A-1R', qty: 1, description: 'NOSE SKIN' },
  { stockCode: 'A-1001B-1', qty: 2, description: 'TOP SKIN' },
  { stockCode: 'A-1002-1', qty: 2, description: 'BOTTOM SKIN' },
  { stockCode: 'A-1003-1L', qty: 1, description: 'SPAR' },
  { stockCode: 'A-1003-1R', qty: 1, description: 'SPAR' },

  // ── RIBS ──────────────────────────────────────────────────
  { stockCode: 'A-1004-1L', qty: 2, description: 'NOSE RIB' },
  { stockCode: 'A-1004-1R', qty: 2, description: 'NOSE RIB' },
  { stockCode: 'A-1005-1L', qty: 2, description: 'MAIN RIB' },
  { stockCode: 'A-1005-1R', qty: 2, description: 'MAIN RIB' },
  { stockCode: 'A-1015-1L', qty: 1, description: 'INBRD.NOSE RIB' },
  { stockCode: 'A-1015-1R', qty: 1, description: 'INBRD.NOSE RIB' },

  // ── MISC TOP-LEVEL PARTS ──────────────────────────────────
  { stockCode: 'A-710', qty: 8, description: 'AIL.STIFF.4 PER LNGTH' },
  { stockCode: 'AA6-063X3/4X3/4X18', qty: 1, description: '18 INCH ALUM ANGLE C-612/C-712' },
  { stockCode: 'AEX TIE DOWN X7.5', qty: 2, description: 'TIE DOWN X 7 1/2"' },
  { stockCode: 'AS3-063X5/8X13 1/2', qty: 2, description: 'ALUM SHEET' },
  { stockCode: 'AT0-032X1/4X19\'', qty: 1, description: 'SOFT ALUM TUBE COIL' },
  { stockCode: 'AT6-049X1.25X8', qty: 2, description: '6061 T6 TUBE 1 1/4 x 8\'' },

  // ════════════════════════════════════════════════════════════
  // HARDWARE BAGS
  // ════════════════════════════════════════════════════════════

  // ── RIVET BAGS (Pages 1-2) ────────────────────────────────
  {
    stockCode: 'BAG 1101', qty: 1, description: 'AN426AD3-3',
    contents: [
      { stockCode: 'AN426AD3-3', qty: 0.070, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1153', qty: 1, description: 'AN426AD3-3.5',
    contents: [
      { stockCode: 'AN426AD3-3.5', qty: 0.400, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1155', qty: 1, description: 'AN426AD3-4.5',
    contents: [
      { stockCode: 'AN426AD3-4.5', qty: 0.040, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1157', qty: 1, description: 'AN426AD3-6',
    contents: [
      { stockCode: 'AN426AD3-6', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1159', qty: 1, description: 'AN426AD4-8',
    contents: [
      { stockCode: 'AN426AD4-8', qty: 0.020, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1160', qty: 1, description: 'AN470AD4-4',
    contents: [
      { stockCode: 'AN470AD4-4', qty: 0.260, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1161', qty: 1, description: 'AN470AD4-5',
    contents: [
      { stockCode: 'AN470AD4-5', qty: 0.210, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1162', qty: 1, description: 'AN470AD4-6',
    contents: [
      { stockCode: 'AN470AD4-6', qty: 0.140, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1163', qty: 1, description: 'AN470AD4-7',
    contents: [
      { stockCode: 'AN470AD4-7', qty: 0.230, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1165', qty: 1, description: 'AN470AD4-10',
    contents: [
      { stockCode: 'AN470AD4-10', qty: 0.020, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },

  // ── POP RIVET BAGS ────────────────────────────────────────
  {
    stockCode: 'BAG 1172', qty: 1, description: 'POP RIVET AD-41H',
    contents: [
      { stockCode: 'RIVET AD-41H', qty: 22, description: 'POP RIVET TANK BAFFLE' },
    ],
  },
  {
    stockCode: 'BAG 1173', qty: 1, description: 'POP RIVET AD-42-H',
    contents: [
      { stockCode: 'RIVET AD-42-H', qty: 64, description: 'POP RIVET TANK BAFFLE' },
    ],
  },
  {
    stockCode: 'BAG 1174-1', qty: 1, description: 'CS4-4 BLIND RIVETS',
    contents: [
      { stockCode: 'RIVET CS4-4', qty: 100, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1175-1', qty: 1, description: 'LP4-3 BLIND RIVETS',
    contents: [
      { stockCode: 'RIVET LP4-3', qty: 105, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1176-1', qty: 1, description: 'MK-319-BS BLIND RIVET',
    contents: [
      { stockCode: 'RIVET MK-319-BS', qty: 270, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1177', qty: 1, description: 'POP RIVET MSP-42',
    contents: [
      { stockCode: 'RIVET MSP-42', qty: 36, description: 'POP RIVET' },
    ],
  },

  // ── PLATE NUT BAGS ────────────────────────────────────────
  {
    stockCode: 'BAG 1178', qty: 1, description: 'K1000-06 PLATENUTS',
    contents: [
      { stockCode: 'K1000-06', qty: 26, description: '6-32 PLATENUT "FIGURE 8 SHAPE"' },
    ],
  },
  {
    stockCode: 'BAG 1179', qty: 1, description: 'K1000-08 PLATENUTS',
    contents: [
      { stockCode: 'K1000-08', qty: 30, description: 'PLATENUT 8-32 Kaynar' },
    ],
  },
  {
    stockCode: 'BAG 1180', qty: 1, description: 'K1000-3 PLATENUTS',
    contents: [
      { stockCode: 'K1000-3', qty: 56, description: 'PLATENUT 10-32 MS21047L3' },
    ],
  },
  {
    stockCode: 'BAG 1181', qty: 1, description: 'K1000-4/MK1000-428',
    contents: [
      { stockCode: 'K1000-4', qty: 4, description: 'PLATENUT 1/4-28' },
      { stockCode: 'MK1000-428', qty: 2, description: 'MINI PLATENUT MS21069L4' },
    ],
  },
  {
    stockCode: 'BAG 1182', qty: 1, description: 'K1100-08 PLATENUTS',
    contents: [
      { stockCode: 'K1100-08', qty: 224, description: 'PLATENUT SCREW HOLE DIMPLED 8-32' },
    ],
  },
  {
    stockCode: 'BAG 1183', qty: 1, description: 'MS21051-L08 PLATENUTS',
    contents: [
      { stockCode: 'MS21051-L08', qty: 6, description: '8-32 SINGLE LUG P/NUT' },
    ],
  },
  {
    stockCode: 'BAG 1184', qty: 1, description: 'MS21053-L08 PLATENUTS',
    contents: [
      { stockCode: 'MS21053-L08', qty: 22, description: '100 DG CS S/L PLT NUT' },
    ],
  },
  {
    stockCode: 'BAG 1185', qty: 1, description: 'K1100-06 PLATENUTS',
    contents: [
      { stockCode: 'K1100-06', qty: 12, description: 'PLATENUT SCREW HOLE DIMPLED 6-32' },
    ],
  },

  // ── FLUID FITTINGS BAG (Pages 2-3) ────────────────────────
  {
    stockCode: 'BAG 1186-1', qty: 1, description: 'MISC FLUID FITTINGS',
    contents: [
      { stockCode: 'AN818-4D', qty: 5, description: 'NUT, FLARE COUPLING' },
      { stockCode: 'AN819-4D', qty: 5, description: 'SLEEVE, FLARE COUPLING' },
      { stockCode: 'AN832-4D', qty: 4, description: 'UNION, BLKHD TUBE-TUBE' },
      { stockCode: 'AN924-4D', qty: 3, description: 'NUT, BLKHD' },
    ],
  },

  // ── BUSHING BAGS ──────────────────────────────────────────
  {
    stockCode: 'BAG 1187-1', qty: 1, description: 'BUSHINGS SB-3/-4/-7',
    contents: [
      { stockCode: 'BUSHING SB375-3', qty: 4, description: 'SNAP-IN 3/16ID 3/8 OD' },
      { stockCode: 'BUSHING SB437-4', qty: 24, description: 'SNAP-IN 1/4ID 7/16 OD' },
      { stockCode: 'BUSHING SB625-7', qty: 32, description: 'SNAP-IN 7/16ID 5/8 OD' },
    ],
  },

  // ── SCREW BAGS (Page 3) ───────────────────────────────────
  {
    stockCode: 'BAG 1188', qty: 1, description: 'AN507-6R6 SCREWS',
    contents: [
      { stockCode: 'AN507-6R6', qty: 36, description: 'SCREW, FLT HD' },
    ],
  },
  {
    stockCode: 'BAG 1189', qty: 1, description: 'AN509-8R8 SCREWS',
    contents: [
      { stockCode: 'AN509-8R8', qty: 275, description: 'SCREW, FLT HD STRUCT' },
    ],
  },
  {
    stockCode: 'BAG 1190', qty: 1, description: 'AN515-8R8 SCREWS',
    contents: [
      { stockCode: 'AN515-8R8', qty: 12, description: '8-32X1/2 PAN HEAD SCREW' },
    ],
  },
  {
    stockCode: 'BAG 1191-1', qty: 1, description: 'AN526C632R8 SCREWS',
    contents: [
      { stockCode: 'AN526C632R8', qty: 8, description: 'SCREW, TRUSS HD SS' },
    ],
  },
  {
    stockCode: 'BAG 1192', qty: 1, description: 'SCREWS, FINE',
    contents: [
      { stockCode: 'MS24693S10', qty: 2, description: '100 DG 440 CS M/S' },
      { stockCode: 'MS24694C14', qty: 1, description: 'SCREW 100DEG CS SS #8' },
    ],
  },

  // ── BOLT BAGS (Pages 3-4) ─────────────────────────────────
  {
    stockCode: 'BAG 1194-1', qty: 1, description: 'AN3-BOLTS',
    contents: [
      { stockCode: 'AN3-4A', qty: 40, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1195', qty: 1, description: 'AN3-BOLTS',
    contents: [
      { stockCode: 'AN3-5A', qty: 30, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1196', qty: 1, description: 'AN3-BOLTS',
    contents: [
      { stockCode: 'AN3-10A', qty: 8, description: 'AN BOLT' },
      { stockCode: 'AN3-11A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN3-12A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN3-13A', qty: 12, description: 'AN BOLT' },
      { stockCode: 'AN3-14A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN3-15A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN3-6A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN3-7A', qty: 6, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1197', qty: 1, description: 'AN3-BOLTS',
    contents: [
      { stockCode: 'AN3-16A', qty: 6, description: 'AN BOLT' },
      { stockCode: 'AN3-17A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN3-20A', qty: 6, description: 'AN BOLT' },
      { stockCode: 'AN3-21A', qty: 4, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1199', qty: 1, description: 'AN4-BOLTS',
    contents: [
      { stockCode: 'AN4-11A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN4-14A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN4-32A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN4-7', qty: 12, description: 'AN BOLT' },
    ],
  },

  // ── WING TIP ATTACH BAG ───────────────────────────────────
  {
    stockCode: 'BAG 1200', qty: 1, description: 'WING TIP ATTACH',
    contents: [
      { stockCode: 'AN507-6R6', qty: 88, description: 'SCREW, FLT HD' },
      { stockCode: 'K1000-06', qty: 88, description: '6-32 PLATENUT "FIGURE 8 SHAPE"' },
    ],
  },

  // ── CLOSE TOLERANCE BOLT BAG ──────────────────────────────
  {
    stockCode: 'BAG 1201', qty: 1, description: 'NAS1306-58/NAS1309-58',
    contents: [
      { stockCode: 'NAS1306-58', qty: 8, description: 'HEX HD. CL. TOL. BOLT' },
      { stockCode: 'NAS1309-58', qty: 8, description: 'HEX HD. CL. TOL. BOLT' },
    ],
  },

  // ── NUT BAGS (Pages 3-4) ──────────────────────────────────
  {
    stockCode: 'BAG 1203-1', qty: 1, description: 'AN365-1032 NUTS',
    contents: [
      { stockCode: 'AN365-1032', qty: 80, description: 'NUT, STOP' },
    ],
  },
  {
    stockCode: 'BAG 1204-1', qty: 1, description: 'NUTS 428/624/632/918',
    contents: [
      { stockCode: 'AN365-428', qty: 8, description: 'NUT, STOP 1/4-28' },
      { stockCode: 'AN365-624A', qty: 10, description: 'NUT, STOP 3/8-24' },
      { stockCode: 'AN365-632A', qty: 10, description: 'NUT, STOP 6-32' },
      { stockCode: 'AN365-832A', qty: 2, description: 'NUT, STOP 8-32' },
      { stockCode: 'AN365-918A', qty: 8, description: 'MS21044N9' },
    ],
  },
  {
    stockCode: 'BAG 1206', qty: 1, description: 'MISC. JAM NUTS',
    contents: [
      { stockCode: 'AN310-4', qty: 14, description: 'NUT, CASTLE 1/4' },
      { stockCode: 'AN316-4R', qty: 6, description: 'NUT, THIN JAM 1/4' },
      { stockCode: 'AN316-6R', qty: 6, description: 'NUT, THIN JAM 3/8' },
      { stockCode: 'MS21044N04', qty: 2, description: 'NUT 440 LOCK HEX' },
      { stockCode: 'MSP1083-N3', qty: 4, description: 'AN364-1032 STOP NUT' },
    ],
  },

  // ── ROD END BEARINGS & INSERTS BAG ────────────────────────
  {
    stockCode: 'BAG 1208', qty: 1, description: 'ROD END BEARINGS, INSERTS',
    contents: [
      { stockCode: 'BEARING CM-4M', qty: 2, description: '1/4X1/4 ROD END BRNG' },
      { stockCode: 'BEARING COM-3-5', qty: 4, description: '5/8 OD AILERON BEAR' },
      { stockCode: 'BEARING F3414M', qty: 4, description: '3/16X1/4FEM R/E BEARG' },
      { stockCode: 'BEARING MD3614M', qty: 4, description: '3/16 X 3/8 ROD END' },
      { stockCode: 'VA-146', qty: 4, description: 'FLANGE BEARING' },
      { stockCode: 'VA-162', qty: 4, description: 'THREADED INSERT, MALE' },
      { stockCode: 'VA-169', qty: 4, description: 'THREADED INSERT, FEMALE' },
      { stockCode: 'VA-4908P', qty: 4, description: 'THREADED ROD END' },
    ],
  },

  // ── WASHER BAGS (Page 4) ──────────────────────────────────
  {
    stockCode: 'BAG 1210-1', qty: 1, description: 'NAS1149F0363P WASHERS',
    contents: [
      { stockCode: 'NAS1149F0363P', qty: 150, description: 'REPLACES AN960-10' },
    ],
  },
  {
    stockCode: 'BAG 1211', qty: 1, description: 'NAS1149F04 WASHERS',
    contents: [
      { stockCode: 'NAS1149F0432P', qty: 18, description: 'REPLACES AN960-416L' },
      { stockCode: 'NAS1149F0463P', qty: 48, description: 'REPLACES AN960-416' },
    ],
  },
  {
    stockCode: 'BAG 1212', qty: 1, description: 'WHRS #4 -9/16',
    contents: [
      { stockCode: 'AN970-3', qty: 8, description: 'WASHER, 7/8 OD' },
      { stockCode: 'NAS1149F0663P', qty: 10, description: 'REPLACES AN960-616' },
      { stockCode: 'NAS1149F0963P', qty: 10, description: 'REPLACES AN960-916' },
      { stockCode: 'NAS1149FN416P', qty: 8, description: 'REPLACES AN960-4L' },
      { stockCode: 'NAS1149FN432P', qty: 18, description: 'REPLACES AN960-4' },
      { stockCode: 'NAS1149FN832P', qty: 8, description: 'REPLACES AN960-8' },
    ],
  },
  {
    stockCode: 'BAG 1213-1', qty: 1, description: 'COTTER PINS/WASHERS',
    contents: [
      { stockCode: 'MS24665-151', qty: 12, description: 'COTTER PIN' },
      { stockCode: 'NAS1149F0332P', qty: 8, description: 'REPLACES AN960-10L' },
    ],
  },

  // ── BUSHINGS & DRAIN VALVE BAG ────────────────────────────
  {
    stockCode: 'BAG 1214', qty: 1, description: 'BUSHINGS/CAV-110',
    contents: [
      { stockCode: 'BUSH-BZ.25X.375X.250', qty: 6, description: 'BRONZE BUSHING' },
      { stockCode: 'CAV-110', qty: 2, description: 'FUEL DRAIN VALVE, 1/8-27 NPT' },
    ],
  },

  // ── AILERON BRACKETS BAG ──────────────────────────────────
  {
    stockCode: 'BAG 1215-1', qty: 1, description: 'AILERON BRACKETS',
    contents: [
      { stockCode: 'A-1006-1', qty: 2, description: 'OUTBRD.HINGE BRACKET' },
      { stockCode: 'A-1007-1', qty: 2, description: 'INBRD.HINGE BRACKET' },
      { stockCode: 'A-1008-1', qty: 1, description: 'DOUBLER' },
      { stockCode: 'WASHER 5702-475-48Z3', qty: 4, description: '.190X.562X.048 WASHER' },
    ],
  },

  // ── STALL WARNING HARDWARE BAG (Pages 4-5) ────────────────
  {
    stockCode: 'BAG 1216-1', qty: 1, description: 'STALL WARN HARDWARE',
    contents: [
      { stockCode: 'AN515-8R8', qty: 2, description: '8-32X1/2 PAN HEAD SCREW' },
      { stockCode: 'ES 421-0107 CONNECTOR', qty: 2, description: 'MALE SLIP-ON CONN.' },
      { stockCode: 'ES 421-0108 CONNECTOR', qty: 2, description: 'FEMALE SLIP-ON CONN.' },
      { stockCode: 'ES DV18-188B-M', qty: 2, description: 'FEMALE DISCONNECT TERMINAL, NYLON' },
      { stockCode: 'ES E22-50K MICRO SW', qty: 1, description: 'MICRO SWITCH' },
      { stockCode: 'K1000-08', qty: 2, description: 'PLATENUT 8-32 Kaynar' },
      { stockCode: 'VA-196', qty: 1, description: 'STALL WARNING VANE' },
    ],
  },

  // ── MISC WING PARTS BAG (Page 5) ─────────────────────────
  {
    stockCode: 'BAG 1217-1', qty: 1, description: 'MISC WING PARTS',
    contents: [
      { stockCode: 'T-1010', qty: 2, description: 'ANTI ROTATION PLATE' },
      { stockCode: 'VA-112', qty: 2, description: 'DRAIN FLANGE' },
      { stockCode: 'VA-141', qty: 2, description: 'FUEL FLANGE' },
      { stockCode: 'VA-195A', qty: 1, description: 'STALL WARNING MOUNT PLATE' },
      { stockCode: 'VA-195B', qty: 1, description: 'STALL WARNING KEEPER PLATE' },
    ],
  },

  // ── BUSHINGS & FUEL SCREEN BAG ────────────────────────────
  {
    stockCode: 'BAG 1218-2', qty: 1, description: 'BUSHINGS/FUEL SCREEN',
    contents: [
      { stockCode: 'AT6-058X5/16X4', qty: 1, description: 'ALUM TUBE X 4"' },
      { stockCode: 'BUSH AL.197X.313X.438', qty: 2, description: 'SPACER' },
      { stockCode: 'BUSH AL.197X.313X.594', qty: 2, description: 'SPACER' },
      { stockCode: 'BUSH-BS.245X375X2.781', qty: 2, description: 'BELLCRANK BUSHING 7/8/9/10' },
      { stockCode: 'VA-261', qty: 2, description: 'FUEL STRAINER' },
    ],
  },

  // ── AILERON HARDWARE BAG ──────────────────────────────────
  {
    stockCode: 'BAG 1219', qty: 1, description: 'AILERON HARDWARE',
    contents: [
      { stockCode: 'AN470AD4-6', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
      { stockCode: 'AN509-10R25', qty: 2, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'MS21042-3', qty: 4, description: '10-32 METAL LOCK NUT' },
      { stockCode: 'MS21055-L3', qty: 2, description: '10-32 RT ANGLE P/NUT' },
    ],
  },

  // ── ADDITIONAL RIVET BAGS (Page 5) ────────────────────────
  {
    stockCode: 'BAG 1314', qty: 1, description: 'AN426AD4-11',
    contents: [
      { stockCode: 'AN426AD4-11', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1320', qty: 1, description: 'AN470AD4-9',
    contents: [
      { stockCode: 'AN470AD4-9', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1907', qty: 1, description: 'AN426AD4-7',
    contents: [
      { stockCode: 'AN426AD4-7', qty: 0.020, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1934', qty: 1, description: 'AN426AD3-5',
    contents: [
      { stockCode: 'AN426AD3-5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 2323', qty: 1, description: 'AN470AD4-8',
    contents: [
      { stockCode: 'AN470AD4-8', qty: 0.040, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 323', qty: 1, description: 'AN470AD4-11',
    contents: [
      { stockCode: 'AN470AD4-11', qty: 0.020, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 422', qty: 1, description: 'AN426AD4-4',
    contents: [
      { stockCode: 'AN426AD4-4', qty: 0.020, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },

  // ── STALL WARNER PARTS BAG ────────────────────────────────
  {
    stockCode: 'BAG 527-1', qty: 1, description: 'STALL WARNER PARTS',
    contents: [
      { stockCode: 'AN365-632A', qty: 2, description: 'NUT, STOP 6-32' },
      { stockCode: 'AN515-6R8', qty: 2, description: '6-32X1/2 PAN HEAD SCREW' },
      { stockCode: 'BUSHING SB750-10', qty: 1, description: 'SNAP-IN 5/8 ID 3/4 OD' },
      { stockCode: 'ES 31890', qty: 2, description: '#18-22WIRE/#8 RING' },
      { stockCode: 'ES 320559', qty: 2, description: '#18-22 SPLICE' },
      { stockCode: 'ES AUDIO WARN', qty: 1, description: 'TONE GENERATOR' },
      { stockCode: 'MS21266-1N', qty: 1, description: 'GROMMET STRIP 12"' },
      { stockCode: 'NAS1149FN632P', qty: 2, description: 'REPLACES AN960-6' },
    ],
  },

  // ── MORE RIVET BAGS ───────────────────────────────────────
  {
    stockCode: 'BAG 822', qty: 1, description: 'AN470AD4-8',
    contents: [
      { stockCode: 'AN470AD4-8', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },

  // ── TIP LENS HARDWARE BAG (Pages 5-6) ─────────────────────
  {
    stockCode: 'BAG 967', qty: 1, description: 'TIP LENS HARDWARE ALL',
    contents: [
      { stockCode: 'AN426AD3-5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'AN507C632R8', qty: 4, description: 'SCREW, FLT HD SS' },
      { stockCode: 'DOC W/TIP LENS 7/9', qty: 1, description: 'LENS INSTALL INSTRUC.' },
      { stockCode: 'K1000-06', qty: 4, description: '6-32 PLATENUT "FIGURE 8 SHAPE"' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // EA-10 KIT: ELEC.AILERON/ROLL TRIM RV-10/14 (Page 6)
  // ════════════════════════════════════════════════════════════
  { stockCode: 'EA-10 KIT', qty: 1, description: 'ELEC.AILERON/ROLL TRIM RV-10/14' },

  {
    stockCode: 'BAG 1010', qty: 1, description: 'ELEC. AIL TRIM RV-10',
    contents: [
      { stockCode: 'ES-00044', qty: 1, description: 'MOLEX PLUG MFIT 6 POS Fits ES-00047' },
      { stockCode: 'ES-00047', qty: 6, description: 'MOLEX MICRO-FIT PIN' },
      { stockCode: 'VA-158', qty: 2, description: 'AILERON TRIM SPG' },
      { stockCode: 'W-1017B', qty: 1, description: 'AIL.TRIM SPRING BRCKT' },
      { stockCode: 'W-1033B', qty: 1, description: 'AILERON TRIM LINK' },
      { stockCode: 'W-1033C', qty: 1, description: 'AILERON TRIM ARM' },
    ],
  },
  {
    stockCode: 'BAG 1011', qty: 1, description: 'ELEC. AIL TRIM RV-10',
    contents: [
      { stockCode: 'AN365-632A', qty: 4, description: 'NUT, STOP 6-32' },
      { stockCode: 'AN509-8R8', qty: 4, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN515-6R8', qty: 4, description: '6-32X1/2 PAN HEAD SCREW' },
      { stockCode: 'BUSHING SB375-3', qty: 1, description: 'SNAP-IN 3/16ID 3/8 OD' },
      { stockCode: 'K1100-08', qty: 4, description: 'PLATENUT SCREW HOLE DIMPLED 8-32' },
      { stockCode: 'MS20392-1C9', qty: 3, description: 'CLEVIS PIN' },
      { stockCode: 'MS24665-132', qty: 3, description: 'COTTER PIN' },
      { stockCode: 'NAS1149FN432P', qty: 3, description: 'REPLACES AN960-4' },
      { stockCode: 'RIVET LP4-3', qty: 6, description: 'POP RIVET' },
    ],
  },

  // ── EA-10 KIT LOOSE PARTS ─────────────────────────────────
  { stockCode: 'DWG OP-38 (1-6)', qty: 1, description: 'RV-10 ELEC. AIL. TRIM' },
  { stockCode: 'ES MSTS-6A', qty: 1, description: 'MAC TRIM DRIVE .95"' },
  { stockCode: 'ES MSTS-WIRE', qty: 1, description: '26G FIVE CONDCTR 20\'' },
  { stockCode: 'W-1033A', qty: 1, description: 'AIL. TRIM MNT.BRACKET' },

  // ════════════════════════════════════════════════════════════
  // FLAP PARTS (Page 6)
  // ════════════════════════════════════════════════════════════
  { stockCode: 'FL-1001A-L', qty: 1, description: 'INBRD.NOSE SKIN' },
  { stockCode: 'FL-1001A-R', qty: 1, description: 'INBRD.NOSE SKIN' },
  { stockCode: 'FL-1001B-L', qty: 1, description: 'OUTBRD.NOSE SKIN' },
  { stockCode: 'FL-1001B-R', qty: 1, description: 'OUTBRD.NOSE SKIN' },
  { stockCode: 'FL-1001C', qty: 2, description: 'FLAP TOP SKIN' },
  { stockCode: 'FL-1002', qty: 2, description: 'FLAP BOTTOM SKIN' },
  { stockCode: 'FL-1003-L', qty: 1, description: 'FLAP SPAR' },
  { stockCode: 'FL-1003-R', qty: 1, description: 'FLAP SPAR' },
  { stockCode: 'FL-1004-L', qty: 10, description: 'FLAP NOSE RIB' },
  { stockCode: 'FL-1004-R', qty: 10, description: 'FLAP NOSE RIB' },
  { stockCode: 'FL-1005-L', qty: 11, description: 'FLAP MAIN RIB' },
  { stockCode: 'FL-1005-R', qty: 11, description: 'FLAP MAIN RIB' },
  { stockCode: 'FL-1006', qty: 4, description: 'DOUBLER' },
  { stockCode: 'FL-1007-L', qty: 6, description: 'FLAP HINGE BRACKET' },
  { stockCode: 'FL-1007-R', qty: 6, description: 'FLAP HINGE BRACKET' },
  { stockCode: 'FL-1008', qty: 4, description: 'FLAP HINGE BRACKET' },

  // ════════════════════════════════════════════════════════════
  // FUEL SENDERS, STIFFENERS, TUBES, CAPS (Pages 6-7)
  // ════════════════════════════════════════════════════════════
  { stockCode: 'IE F-385B', qty: 1, description: 'STEWART WARNER FUEL LEVEL SENDER, LEFT TANK' },
  { stockCode: 'IE F-385C', qty: 1, description: 'STEWART WARNER FUEL LEVEL SENDER, RIGHT TANK' },
  { stockCode: 'J-CHANNEL X6\'', qty: 6, description: 'ALUM STIFFENER ANGLE' },
  { stockCode: 'J-CHANNEL X8\'', qty: 6, description: 'ALUM STIFFENER ANGLE' },
  { stockCode: 'ST304-065X1.375X34.62', qty: 2, description: 'COUNTERBALANCE 10' },
  { stockCode: 'ST4130-035X1/2X48-PC', qty: 1, description: 'PUSHROD TUBE' },
  { stockCode: 'ST4130-035X7/8X22', qty: 1, description: 'MAKES 2 WD-1014C or CS-00009B' },
  { stockCode: 'T-00007-1', qty: 2, description: 'METAL FUEL CAP AND FLANGE' },

  // ════════════════════════════════════════════════════════════
  // TANK PARTS (Page 7)
  // ════════════════════════════════════════════════════════════
  { stockCode: 'T-1001-L', qty: 1, description: 'TANK SKIN' },
  { stockCode: 'T-1001-R', qty: 1, description: 'TANK SKIN' },
  { stockCode: 'T-1002', qty: 2, description: 'TANK BAFFLE' },
  { stockCode: 'T-1003-L', qty: 1, description: 'FUEL TANK END RIB' },
  { stockCode: 'T-1003-R', qty: 1, description: 'FUEL TANK END RIB' },
  { stockCode: 'T-1003B-L', qty: 1, description: 'TANK INBOARD MAIN RIB' },
  { stockCode: 'T-1003B-R', qty: 1, description: 'TANK INBOARD MAIN RIB' },
  { stockCode: 'T-1003C-L', qty: 1, description: 'TANK INBD.NOSE RIB' },
  { stockCode: 'T-1003C-R', qty: 1, description: 'TANK INBD NOSE RIB' },
  { stockCode: 'T-1004-L-1', qty: 5, description: 'FUEL TANK RIB' },
  { stockCode: 'T-1004-R-1', qty: 5, description: 'FUEL TANK RIB' },
  { stockCode: 'T-1005-L', qty: 1, description: 'TANK ATTACH BRACKET' },
  { stockCode: 'T-1005-R', qty: 1, description: 'TANK ATTACH BRACKET' },
  { stockCode: 'T-1005BC', qty: 1, description: 'SHIM' },
  { stockCode: 'T-1011', qty: 7, description: 'TANK STIFFENER' },
  { stockCode: 'T-1012', qty: 2, description: 'FUEL TANK ATTACH ZEE' },

  // ════════════════════════════════════════════════════════════
  // TRAILING EDGES, LENS, TEMPLATES, MISC (Page 7)
  // ════════════════════════════════════════════════════════════
  { stockCode: 'VA-140', qty: 6, description: 'TRAILING EDGE' },
  { stockCode: 'VA-193', qty: 1, description: 'LENS, WINGTIP RV-10/14' },
  { stockCode: 'VA-195C', qty: 1, description: 'ACCESS HATCH DOUBLER' },
  { stockCode: 'VA-195D', qty: 1, description: 'ACCESS HATCH COVER' },
  { stockCode: 'VB-11', qty: 2, description: 'TEMPLATE ON BOX LID' },
  { stockCode: 'W-00007CD', qty: 1, description: 'DOUBLER, AILERON ATTACH' },

  // ════════════════════════════════════════════════════════════
  // WING SKINS & SPARS (Pages 7-8)
  // ════════════════════════════════════════════════════════════
  { stockCode: 'W-1001-L', qty: 1, description: 'LEADING EDGE SKIN' },
  { stockCode: 'W-1001-R', qty: 1, description: 'LEADING EDGE SKIN' },
  { stockCode: 'W-1002', qty: 2, description: 'TOP INBD WING SKIN' },
  { stockCode: 'W-1003', qty: 2, description: 'TOP OUTBD.WING SKIN' },
  { stockCode: 'W-1004-L', qty: 1, description: 'BOTTOM INBD WING SKIN' },
  { stockCode: 'W-1004-R', qty: 1, description: 'BOTTOM INBD WING SKIN' },
  { stockCode: 'W-1005-L', qty: 1, description: 'BOT.OUTBRD.WING SKIN' },
  { stockCode: 'W-1005-R', qty: 1, description: 'BOT.OUTBRD.WING SKIN' },
  { stockCode: 'W-1006-L', qty: 1, description: 'MAIN SPAR LEFT-10' },
  { stockCode: 'W-1006-R', qty: 1, description: 'MAIN SPAR RIGHT-10' },
  { stockCode: 'W-1006E-L', qty: 1, description: 'MAIN SPAR WEB EXT.' },
  { stockCode: 'W-1006E-R', qty: 1, description: 'MAIN SPAR WEB EXT.' },
  { stockCode: 'W-1006F', qty: 8, description: 'SPAR SPLICE PLATE' },
  { stockCode: 'W-1007A-L', qty: 1, description: 'REAR SPAR WEB' },
  { stockCode: 'W-1007A-R', qty: 1, description: 'REAR SPAR WEB' },
  { stockCode: 'W-1007B', qty: 2, description: 'REAR SPAR REINF.FORK' },
  { stockCode: 'W-1007C', qty: 2, description: 'REAR SPAR DBLR.PLATE' },
  { stockCode: 'W-1007D', qty: 4, description: 'REAR SPAR DBLR.PLATE' },
  { stockCode: 'W-1007E', qty: 2, description: 'REAR SPAR DBLER.PLATE' },

  // ── LEADING EDGE RIBS ─────────────────────────────────────
  { stockCode: 'W-1008-L-1', qty: 1, description: 'LEADING EDGE RIB' },
  { stockCode: 'W-1008-R-1', qty: 1, description: 'LEADING EDGE RIB' },
  { stockCode: 'W-1009-L-3', qty: 6, description: 'LEADING EDGE RIB' },
  { stockCode: 'W-1009-R-3', qty: 6, description: 'LEADING EDGE RIB' },

  // ── WING RIBS ─────────────────────────────────────────────
  { stockCode: 'W-1010-L-1', qty: 1, description: 'INBD. WING RIB .032' },
  { stockCode: 'W-1010-R-1', qty: 1, description: 'INBD. WING RIB .032' },
  { stockCode: 'W-1011-L', qty: 11, description: 'INBD.WING RIB .025' },
  { stockCode: 'W-1011-R', qty: 11, description: 'INBD.WING RIB .025' },
  { stockCode: 'W-1012-L', qty: 3, description: 'OUTBOARD WING RIB' },
  { stockCode: 'W-1012-R', qty: 3, description: 'OUTBOARD WING RIB' },

  // ── AILERON HINGE BRACKETS (Page 8) ───────────────────────
  { stockCode: 'W-1013A', qty: 2, description: 'AIL.HINGE BRCKT.SPACR' },
  { stockCode: 'W-1013C-L', qty: 1, description: 'AILERON HINGE BRACKET' },
  { stockCode: 'W-1013C-LX', qty: 1, description: 'AILERON HINGE BRACKET' },
  { stockCode: 'W-1013C-R', qty: 1, description: 'AILERON HINGE BRACKET' },
  { stockCode: 'W-1013C-RX', qty: 1, description: 'AILERON HINGE BRACKET' },
  { stockCode: 'W-1013D-L', qty: 1, description: 'BRACKET, AIL.HINGE SIDE' },
  { stockCode: 'W-1013D-R', qty: 1, description: 'BRACKET, AIL.HINGE SIDE' },
  { stockCode: 'W-1013E-L', qty: 1, description: 'BRACKET, AILERON HINGE SIDE' },
  { stockCode: 'W-1013E-R', qty: 1, description: 'BRACKET, AILERON HINGE SIDE' },
  { stockCode: 'W-1013FG', qty: 1, description: 'BRACKET, AILERON HINGE' },

  // ── WING TIPS & FAIRINGS ──────────────────────────────────
  { stockCode: 'W-1015-L', qty: 1, description: 'WING TIP' },
  { stockCode: 'W-1015-R', qty: 1, description: 'WING TIP' },
  { stockCode: 'W-1016-L', qty: 1, description: 'WING TIP RIB' },
  { stockCode: 'W-1016-R', qty: 1, description: 'WING TIP RIB' },
  { stockCode: 'W-1021-L', qty: 1, description: 'FLAP GAP FAIRING' },
  { stockCode: 'W-1021-R', qty: 1, description: 'FLAP GAP FAIRING' },
  { stockCode: 'W-1021B', qty: 1, description: 'FLAP GAP STIFFENER' },
  { stockCode: 'W-1024-L', qty: 1, description: 'AILERON GAP FAIRING' },
  { stockCode: 'W-1024-R', qty: 1, description: 'AILERON GAP FAIRING' },

  // ── FLAP HINGE & WING WALK ────────────────────────────────
  { stockCode: 'W-1025A', qty: 6, description: 'FLAP HINGE BRACKET' },
  { stockCode: 'W-1025B', qty: 3, description: 'FLAP HINGE RIB' },
  { stockCode: 'W-1027A', qty: 2, description: 'WING WALK DOUBLER-FWD' },
  { stockCode: 'W-1027B', qty: 2, description: 'WING WALK DOUBLER-AFT' },

  // ── TORQUE TUBE BRACKETS ──────────────────────────────────
  { stockCode: 'W-1029A-L', qty: 1, description: 'TORQUE TUBE BRACKET' },
  { stockCode: 'W-1029A-R', qty: 1, description: 'TORQUE TUBE BRACKET' },
  { stockCode: 'W-1029B-L', qty: 1, description: 'TORQUE TUBE BRACKET' },
  { stockCode: 'W-1029B-R', qty: 1, description: 'TORQUE TUBE BRACKET' },

  // ── MISC WING PARTS (Page 8) ──────────────────────────────
  { stockCode: 'W-730', qty: 1, description: 'BELLCRANK JIG' },
  { stockCode: 'W-822PP', qty: 6, description: 'WING ACCESS PLATE' },
  { stockCode: 'W-823PP-PC', qty: 4, description: 'AILERON BRACKET' },
  { stockCode: 'WD-1014-PC', qty: 4, description: 'AILERON TORQUE TUBE' },
  { stockCode: 'WD-421-L-PC', qty: 1, description: 'AIL.BELCRANK 7/8/9/10/14' },
  { stockCode: 'WD-421-R-PC', qty: 1, description: 'AIL.BELCRANK 7/8/9/10/14' },
  { stockCode: 'WIRE #18X20\'', qty: 1, description: 'WIRE M22759/16-18 TEFZELx 20\'' },
];
