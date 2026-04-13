/**
 * Van's RV-10 Fuselage Kit — Packing List
 * Source: Fuselage_Packing_list.pdf (14 pages)
 * Order Date: 08/25/22 | Ship Date: 5/6/24 | Purchase Order: FUSE
 *
 * Format: Each top-level entry is a BAG, SUB-KIT, or individual part.
 * `contents` lists the individual items inside that bag/sub-kit.
 * Quantities for rivets sold by weight (LB) are noted in description.
 */

import type { PackingListItem, PackingListBag } from './empennage';

export const FUSELAGE_PACKING_LIST: (PackingListItem | PackingListBag)[] = [
  // ════════════════════════════════════════════════════════════
  // TOP-LEVEL: RV-10 FUSELAGE-2 (STANDARDIZED KIT, Includes Center)
  // ════════════════════════════════════════════════════════════

  // ── 10 CENTER SECTION DT KIT (CENTER SECTION DRILL TEMPLATES) ──
  {
    stockCode: '10 CENTER SECTION DT KIT', qty: 1, description: 'CENTER SECTION DRILL TEMPLATES',
    contents: [
      { stockCode: 'DOC SB-00007', qty: 1, description: 'SB Instructions' },
      { stockCode: 'VA-00272', qty: 1, description: 'Bushing, Drill .250' },
      { stockCode: 'VA-00273', qty: 1, description: 'Bushing, Drill .312' },
      { stockCode: 'VA-00274', qty: 1, description: 'Template, Drill, .063' },
      { stockCode: 'VA-00275', qty: 1, description: 'Template, Drill .090' },
    ],
  },

  // ── 10A FUSE HARDWARE-1 (REGULAR FUSE HDWRE) ─────────────
  // ── RIVET BAGS ────────────────────────────────────────────
  {
    stockCode: 'BAG 1300', qty: 1, description: 'AN426AD3-3',
    contents: [
      { stockCode: 'AN426AD3-3', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1301', qty: 1, description: 'AN426AD3-3.5',
    contents: [
      { stockCode: 'AN426AD3-3.5', qty: 0.400, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1302', qty: 1, description: 'AN426AD3-4',
    contents: [
      { stockCode: 'AN426AD3-4', qty: 0.280, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1303', qty: 1, description: 'AN426AD3-4.5',
    contents: [
      { stockCode: 'AN426AD3-4.5', qty: 0.100, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1304', qty: 1, description: 'AN426AD3-5',
    contents: [
      { stockCode: 'AN426AD3-5', qty: 0.140, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1305', qty: 1, description: 'AN426AD3-6',
    contents: [
      { stockCode: 'AN426AD3-6', qty: 0.020, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1308', qty: 1, description: 'AN426AD4-4',
    contents: [
      { stockCode: 'AN426AD4-4', qty: 0.120, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1309', qty: 1, description: 'AN426AD4-5',
    contents: [
      { stockCode: 'AN426AD4-5', qty: 0.060, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1312', qty: 1, description: 'AN426AD4-9',
    contents: [
      { stockCode: 'AN426AD4-9', qty: 0.030, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1313', qty: 1, description: 'AN426AD4-16',
    contents: [
      { stockCode: 'AN426AD4-16', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },

  // Page 2
  {
    stockCode: 'BAG 1315', qty: 1, description: 'AN470AD4-4',
    contents: [
      { stockCode: 'AN470AD4-4', qty: 0.160, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1316', qty: 1, description: 'AN470AD4-5',
    contents: [
      { stockCode: 'AN470AD4-5', qty: 0.550, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1317', qty: 1, description: 'AN470AD4-6',
    contents: [
      { stockCode: 'AN470AD4-6', qty: 0.420, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1318', qty: 1, description: 'AN470AD4-7',
    contents: [
      { stockCode: 'AN470AD4-7', qty: 0.080, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1319', qty: 1, description: 'AN470AD4-8',
    contents: [
      { stockCode: 'AN470AD4-8', qty: 0.100, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1320', qty: 1, description: 'AN470AD4-9',
    contents: [
      { stockCode: 'AN470AD4-9', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },

  // ── POP RIVET BAGS ────────────────────────────────────────
  {
    stockCode: 'BAG 1323', qty: 1, description: 'POP RIVET CS4-4',
    contents: [
      { stockCode: 'RIVET CS4-4', qty: 581, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1324', qty: 1, description: 'POP RIVET LP4-3',
    contents: [
      { stockCode: 'RIVET LP4-3', qty: 525, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1325', qty: 1, description: 'POP RIVET MK-319-BS',
    contents: [
      { stockCode: 'RIVET MK-319-BS', qty: 24, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1326', qty: 1, description: 'POP RIVET MSP-42',
    contents: [
      { stockCode: 'RIVET MSP-42', qty: 35, description: 'POP RIVET' },
    ],
  },

  // ── WASHER/BOLT/NUT BAGS ──────────────────────────────────
  {
    stockCode: 'BAG 1328-2', qty: 1, description: 'MISC WASHERS',
    contents: [
      { stockCode: 'WASHER 5610-90-31', qty: 6, description: 'NYLON WASHER AN3' },
      { stockCode: 'WASHER 5702-475-48Z3', qty: 4, description: '.190X.562X.048 WASHER' },
      { stockCode: 'WASHER 5702-75-60', qty: 12, description: 'STEEL WASHER FOR AN3' },
      { stockCode: 'WASHER 5702-95-30', qty: 6, description: 'STEEL WASHER FOR AN4' },
    ],
  },
  {
    stockCode: 'BAG 1330', qty: 1, description: 'CLEVIS BOLTS',
    contents: [
      { stockCode: 'AN23-10', qty: 4, description: 'CLEVIS BOLT DRILLED' },
    ],
  },
  {
    stockCode: 'BAG 1331', qty: 1, description: 'BOLTS AN3-3A',
    contents: [
      { stockCode: 'AN3-3A', qty: 4, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1332', qty: 1, description: 'BOLTS AN3-4A',
    contents: [
      { stockCode: 'AN3-4A', qty: 4, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1333', qty: 1, description: 'BOLTS AN3-5A',
    contents: [
      { stockCode: 'AN3-5', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN3-5A', qty: 20, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1334', qty: 1, description: 'BOLTS AN3-6,6A,7',
    contents: [
      { stockCode: 'AN3-6', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN3-6A', qty: 8, description: 'AN BOLT' },
      { stockCode: 'AN3-7', qty: 4, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1335', qty: 1, description: 'BOLTS AN3-10A',
    contents: [
      { stockCode: 'AN3-10A', qty: 10, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1336', qty: 1, description: 'BOLTS AN3-11A',
    contents: [
      { stockCode: 'AN3-11A', qty: 12, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1337', qty: 1, description: 'BOLTS AN3-12,12A',
    contents: [
      { stockCode: 'AN3-12', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN3-12A', qty: 36, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1338', qty: 1, description: 'BOLTS AN3-13A',
    contents: [
      { stockCode: 'AN3-13A', qty: 6, description: 'AN BOLT' },
    ],
  },

  // Page 3
  {
    stockCode: 'BAG 1339', qty: 1, description: 'BOLTS AN3-14A',
    contents: [
      { stockCode: 'AN3-14A', qty: 30, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1340', qty: 1, description: 'BOLTS AN3-15A,20A',
    contents: [
      { stockCode: 'AN3-15A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN3-20A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN4-15A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN5-16A', qty: 2, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1341', qty: 1, description: 'BOLTS AN3-22A,26A,41A',
    contents: [
      { stockCode: 'AN3-22A', qty: 6, description: 'AN BOLT' },
      { stockCode: 'AN3-26A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN3-41A', qty: 4, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1342', qty: 1, description: 'NUTS AN310-3,4,6',
    contents: [
      { stockCode: 'AN310-3', qty: 20, description: 'NUT, CASTLE 3/16' },
      { stockCode: 'AN310-4', qty: 2, description: 'NUT, CASTLE 1/4' },
      { stockCode: 'AN310-6', qty: 2, description: 'NUT, CASTLE 3/8' },
    ],
  },
  {
    stockCode: 'BAG 1343', qty: 1, description: 'NUTS AN316-4,6',
    contents: [
      { stockCode: 'AN316-4R', qty: 10, description: 'NUT, THIN JAM 1/4' },
      { stockCode: 'AN316-6R', qty: 4, description: 'NUT, THIN JAM 3/8' },
    ],
  },
  {
    stockCode: 'BAG 1344', qty: 1, description: 'NUT AN365-428,524',
    contents: [
      { stockCode: 'AN365-428', qty: 12, description: 'NUT, STOP 1/4-28' },
      { stockCode: 'AN365-524', qty: 2, description: '5/16-24 LOCK NUT' },
    ],
  },
  {
    stockCode: 'BAG 1345', qty: 1, description: 'AN365-632,832',
    contents: [
      { stockCode: 'AN365-632A', qty: 12, description: 'NUT, STOP 6-32' },
      { stockCode: 'AN365-832A', qty: 16, description: 'NUT, STOP 8-32' },
    ],
  },
  {
    stockCode: 'BAG 1346', qty: 1, description: 'NUTS AN365-1032',
    contents: [
      { stockCode: 'AN365-1032', qty: 181, description: 'NUT, STOP' },
    ],
  },
  {
    stockCode: 'BAG 1347-1', qty: 1, description: 'AN4 BOLTS',
    contents: [
      { stockCode: 'AN4-11A', qty: 3, description: 'AN BOLT' },
      { stockCode: 'AN4-12A', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN4-6A', qty: 20, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1349', qty: 1, description: 'BOLT AN4-14A,20,27,24',
    contents: [
      { stockCode: 'AN4-14A', qty: 15, description: 'AN BOLT' },
      { stockCode: 'AN4-27', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN5-24A', qty: 1, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1350', qty: 1, description: 'SCREW AN507-6R6,-R8',
    contents: [
      { stockCode: 'AN507-6R6', qty: 12, description: 'SCREW, FLT HD' },
      { stockCode: 'AN507C632R8', qty: 6, description: 'SCREW, FLT HD SS' },
    ],
  },
  {
    stockCode: 'BAG 1352', qty: 1, description: 'SCREW AN509-8R8',
    contents: [
      { stockCode: 'AN509-8R8', qty: 220, description: 'SCREW, FLT HD STRUCT' },
    ],
  },
  {
    stockCode: 'BAG 1353', qty: 1, description: 'SCREW AN509-8R10',
    contents: [
      { stockCode: 'AN509-8R10', qty: 85, description: 'SCREW FLT HD STRUCT' },
    ],
  },
  {
    stockCode: 'BAG 1354', qty: 1, description: 'SCREW AN509-8R12',
    contents: [
      { stockCode: 'AN509-8R12', qty: 15, description: 'SCREW, FLT HD STRUCT' },
    ],
  },
  {
    stockCode: 'BAG 1355', qty: 1, description: 'SCREW AN515-6R8,-10R7',
    contents: [
      { stockCode: 'AN515-6R8', qty: 12, description: '6-32X1/2 PAN HEAD SCREW' },
      { stockCode: 'AN525-10R7', qty: 6, description: 'SCREW, WASHER HD' },
    ],
  },
  {
    stockCode: 'BAG 1356', qty: 1, description: 'SCREW AN515-8R8',
    contents: [
      { stockCode: 'AN515-8R8', qty: 140, description: '8-32X1/2 PAN HEAD SCREW' },
    ],
  },

  // Page 4
  {
    stockCode: 'BAG 1357', qty: 1, description: 'AN509-10R11,-10R14',
    contents: [
      { stockCode: 'AN509-10R11', qty: 25, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN509-10R14', qty: 6, description: 'SCREW, FLT HD STRUCT' },
    ],
  },
  {
    stockCode: 'BAG 1358', qty: 1, description: 'SCREW AN526C832R8',
    contents: [
      { stockCode: 'AN526C832R8', qty: 40, description: 'SCREW, TRUSS HD SS' },
    ],
  },
  {
    stockCode: 'BAG 1359', qty: 1, description: 'BOLT AN6-11',
    contents: [
      { stockCode: 'AN6-11', qty: 2, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1361', qty: 1, description: 'BLUE -4D FITTINGS',
    contents: [
      { stockCode: 'AN818-4D', qty: 8, description: 'NUT, FLARE COUPLING' },
      { stockCode: 'AN819-4D', qty: 8, description: 'SLEEVE, FLARE COUPLING' },
      { stockCode: 'AN822-4D', qty: 4, description: 'ELBOW 90DEG TUBE-PIPE' },
    ],
  },
  {
    stockCode: 'BAG 1362', qty: 1, description: 'BLUE -6D FITTINGS',
    contents: [
      { stockCode: 'AN816-6D', qty: 3, description: 'NIPPLE, PIPE-TUBE' },
      { stockCode: 'AN818-6D', qty: 14, description: 'NUT, FLARE COUPLING' },
      { stockCode: 'AN819-6D', qty: 14, description: 'SLEEVE, FLARE COUPLING' },
      { stockCode: 'AN823-6D', qty: 2, description: 'ELBOW 45DEG TUBE-PIPE' },
      { stockCode: 'AN826-6D', qty: 1, description: 'TEE, PIPE-TUBE-TUBE' },
      { stockCode: 'AN833-6D', qty: 2, description: 'ELBOW, BLKHD TUBE-TUBE' },
      { stockCode: 'AN837-6D', qty: 1, description: 'ELBOW, 45BLK TUBE-TUBE' },
      { stockCode: 'AN924-6D', qty: 3, description: 'NUT, BLKHD' },
    ],
  },
  {
    stockCode: 'BAG 1363', qty: 1, description: 'AN931-6-16 GROMMETS',
    contents: [
      { stockCode: 'AN931-6-16', qty: 21, description: 'GROMMET, 3/8 ID, 1" OD' },
    ],
  },
  {
    stockCode: 'BAG 1365', qty: 1, description: 'AN960-416,416L,-4L',
    contents: [
      { stockCode: 'NAS1149F0432P', qty: 28, description: 'REPLACES AN960-416L' },
      { stockCode: 'NAS1149F0463P', qty: 35, description: 'REPLACES AN960-416' },
      { stockCode: 'NAS1149FN416P', qty: 12, description: 'REPLACES AN960-4L' },
    ],
  },
  {
    stockCode: 'BAG 1368', qty: 1, description: 'AN960-516,-6',
    contents: [
      { stockCode: 'NAS1149F0563P', qty: 2, description: 'REPLACES AN960-516' },
      { stockCode: 'NAS1149FN632P', qty: 12, description: 'REPLACES AN960-6' },
    ],
  },
  {
    stockCode: 'BAG 1370', qty: 1, description: 'AN960-616,-716,-8',
    contents: [
      { stockCode: 'NAS1149F0663P', qty: 6, description: 'REPLACES AN960-616' },
      { stockCode: 'NAS1149F0763P', qty: 8, description: 'REPLACES AN960-716' },
      { stockCode: 'NAS1149FN832P', qty: 32, description: 'REPLACES AN960-8' },
    ],
  },
  {
    stockCode: 'BAG 1371', qty: 1, description: 'AN960-10',
    contents: [
      { stockCode: 'NAS1149F0363P', qty: 276, description: 'REPLACES AN960-10' },
    ],
  },
  {
    stockCode: 'BAG 1372', qty: 1, description: 'AN960-10L',
    contents: [
      { stockCode: 'NAS1149F0332P', qty: 55, description: 'REPLACES AN960-10L' },
    ],
  },
  {
    stockCode: 'BAG 1375', qty: 1, description: 'SPCR 4D,6D,BEAR CM-4M',
    contents: [
      { stockCode: 'AN SPACER, 4D', qty: 4, description: 'BULKHEAD SPACER' },
      { stockCode: 'AN SPACER, 6D', qty: 3, description: 'BULKHEAD SPACER' },
      { stockCode: 'BEARING CM-4M', qty: 2, description: '1/4X1/4 ROD END BRNG' },
    ],
  },
  {
    stockCode: 'BAG 1376', qty: 1, description: '10 FUSE MISC',
    contents: [
      { stockCode: 'AN4-15A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN5-16A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'BUSH AL.197X313X1.688', qty: 4, description: 'BUSHING ALUMINUM' },
      { stockCode: 'F-01057-L-1', qty: 1, description: 'MID SEAT RAIL SUPPORT' },
      { stockCode: 'F-01057-R-1', qty: 1, description: 'MID SEAT RAIL SUPPORT' },
      { stockCode: 'MS21042-08', qty: 4, description: '8-32 METAL LOCK NUT' },

      // Page 5
      { stockCode: 'MS21042-4', qty: 32, description: '1/4-28 METAL LOCKNUT' },
      { stockCode: 'MS21042-5', qty: 2, description: '5/16-24 METAL LOCKNUT' },
      { stockCode: 'NAS1149F0532P', qty: 2, description: 'REPLACES AN960-516L' },
      { stockCode: 'VA-00277', qty: 1, description: 'Template, Drill, Top' },
      { stockCode: 'VA-00278', qty: 1, description: 'Template, Drill, Bottom' },
    ],
  },
  {
    stockCode: 'BAG 1379-1', qty: 1, description: 'K1000-06,-4,-3',
    contents: [
      { stockCode: 'K1000-06', qty: 6, description: 'PLATENUT 6-32 "FIGURE 8 SHAPE"' },
      { stockCode: 'K1000-3', qty: 28, description: 'PLATENUT 10-32 MS21047L3' },
      { stockCode: 'K1000-4', qty: 6, description: 'PLATENUT 1/4-28' },
    ],
  },
  {
    stockCode: 'BAG 1380', qty: 1, description: 'K1000-08',
    contents: [
      { stockCode: 'K1000-08', qty: 248, description: 'PLATENUT 8-32 Kaynar' },
    ],
  },
  {
    stockCode: 'BAG 1381', qty: 1, description: 'K1100-06,-08',
    contents: [
      { stockCode: 'K1100-06', qty: 5, description: 'PLATENUT SCREW HOLE DIMPLED 6-32' },
      { stockCode: 'K1100-08', qty: 115, description: 'PLATENUT SCREW HOLE DIMPLED 8-32' },
    ],
  },
  {
    stockCode: 'BAG 1382', qty: 1, description: 'MS21042-3,051-L08,L3',
    contents: [
      { stockCode: 'MS21042-3', qty: 24, description: '10-32 METAL LOCK NUT' },
      { stockCode: 'MS21051-L08', qty: 54, description: '8-32 SINGLE LUG P/NUT' },
      { stockCode: 'MS21053-L08', qty: 20, description: '100 DG CS S/L PLT NUT' },
    ],
  },
  {
    stockCode: 'BAG 1383-1', qty: 1, description: 'BEARINGS',
    contents: [
      { stockCode: 'BEARING GMM-4M-675', qty: 1, description: '1/4 HOLE X3/8 SHANK EXTRA LONG' },
      { stockCode: 'BEARING M3414M', qty: 6, description: '3/16X1/4 MALE RD END' },
      { stockCode: 'BEARING MD3614M', qty: 1, description: '3/16 X 3/8 ROD END' },
      { stockCode: 'BEARING MD3616M', qty: 2, description: '3/16X3/8M LONG RD END' },
      { stockCode: 'BUSH-BS.245X375X2.313', qty: 2, description: 'BRASS BUSH WD-611&612' },
    ],
  },
  {
    stockCode: 'BAG 1385', qty: 1, description: 'MS21919DG4,DG6',
    contents: [
      { stockCode: 'MS21919DG4', qty: 12, description: 'CUSHION CLAMP 1/4' },
      { stockCode: 'MS21919WDG6', qty: 6, description: 'CUSHION CLAMP 3/8' },
    ],
  },
  {
    stockCode: 'BAG 1387', qty: 1, description: 'COTTER PIN 24665-132',
    contents: [
      { stockCode: 'MS24665-132', qty: 24, description: 'COTTER PIN' },
    ],
  },
  {
    stockCode: 'BAG 1388-1', qty: 1, description: 'COTTER PINS 208/283',
    contents: [
      { stockCode: 'MS24665-208', qty: 12, description: 'COTTER PIN - CLEVIS' },
      { stockCode: 'MS24665-283', qty: 2, description: 'COTTER PIN 3/8 BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1389', qty: 1, description: 'FLT. HEAD SCREWS',
    contents: [
      { stockCode: 'MS24694-S67', qty: 4, description: '100 DG FLT HD SCREW' },
      { stockCode: 'MS24694S72', qty: 6, description: '100 DG FL HD MS' },
    ],
  },
  {
    stockCode: 'BAG 1390', qty: 1, description: 'PLASTIC BUSHINGS MISC',
    contents: [
      { stockCode: 'BUSHING SB375-4', qty: 6, description: 'SNAP-IN 1/4ID 3/8 OD' },
      { stockCode: 'BUSHING SB437-4', qty: 4, description: 'SNAP-IN 1/4ID 7/16 OD' },
      { stockCode: 'BUSHING SB500-6', qty: 6, description: 'SNAP-IN 3/8 ID 1/2 OD' },
      { stockCode: 'BUSHING SB625-7', qty: 8, description: 'SNAP-IN 7/16ID 5/8 OD' },
      { stockCode: 'BUSHING SB625-8', qty: 4, description: 'SNAP-IN 1/2ID 5/8 OD' },
      { stockCode: 'BUSHING SB750-10', qty: 10, description: 'SNAP-IN 5/8 ID 3/4 OD' },
    ],
  },
  {
    stockCode: 'BAG 1392', qty: 1, description: 'VA-101,-111,-146',
    contents: [
      { stockCode: 'HW-00018', qty: 2, description: 'DYNAFLO #28 SS HOSE CLAMP 1.25-2.' },
      { stockCode: 'VA-101', qty: 2, description: 'THREADED INSERT' },
      { stockCode: 'VA-111', qty: 2, description: 'THREADED INSERT, FEMALE (W-416)' },
      { stockCode: 'VA-146', qty: 1, description: 'FLANGE BEARING' },
    ],
  },
  {
    stockCode: 'BAG 1395-1', qty: 1, description: 'MISC FUSE PARTS',
    contents: [
      { stockCode: 'F-1051G', qty: 1, description: 'SPLICE PLATE' },
      { stockCode: 'F-1059D', qty: 1, description: 'BAG.DOOR LCK.BRACKET' },
      { stockCode: 'F-1061', qty: 1, description: 'STRIKER PLATE' },
      { stockCode: 'F-1062-1', qty: 1, description: 'LOCK LATCH' },
      { stockCode: 'F-1092', qty: 2, description: 'VENT DOOR DOUBLER' },
      { stockCode: 'F-1093', qty: 2, description: 'VENT DOOR' },
      { stockCode: 'F-1096', qty: 2, description: 'VENT DOUBLER' },
      { stockCode: 'F-1099C', qty: 2, description: 'WING WALK SPACER UHMW' },
      { stockCode: 'SS4130-050X1/2X4', qty: 4, description: 'STEEL STRAP' },
    ],
  },

  // Page 6
  {
    stockCode: 'BAG 1396', qty: 1, description: 'MISC. FUSE PARTS',
    contents: [
      { stockCode: 'AS3-063X1/2X5', qty: 1, description: 'BELLCRANK SPACERS' },
      { stockCode: 'F-1005D', qty: 1, description: 'CROTCH STRAP LUG' },
      { stockCode: 'F-1016H', qty: 1, description: 'GUIDE BRACKET' },
      { stockCode: 'F-1042E-L/R', qty: 1, description: 'GUSSET' },
      { stockCode: 'F-1048D', qty: 2, description: 'FUEL FILTER BRACKET' },
      { stockCode: 'F-1066C-2', qty: 1, description: 'REINFORCING ANGLES' },
      { stockCode: 'VA-188', qty: 1, description: 'FLO-SCAN MOUNT BRACKT' },
    ],
  },
  {
    stockCode: 'BAG 1397', qty: 1, description: 'DRILL BUSHING/MISC.',
    contents: [
      { stockCode: 'F-1030', qty: 4, description: 'BUSHING BLOCK' },
      { stockCode: 'F-1038', qty: 2, description: 'STEP SUPPORT BLOCK' },
      { stockCode: 'F-1039A', qty: 2, description: 'RDDR.PEDAL BRNG BLOCK' },
      { stockCode: 'F-1042F', qty: 2, description: 'GUSSET' },
      { stockCode: 'F-1048G', qty: 4, description: 'RUDDER CABLE GUIDE' },
      { stockCode: 'F-DRILL BUSHING', qty: 2, description: 'DRILL BUSHING' },
    ],
  },
  {
    stockCode: 'BAG 1398', qty: 1, description: 'MISC. FUSE PARTS',
    contents: [
      { stockCode: 'F-1048F', qty: 1, description: 'FACET PUMP BRACKET' },
      { stockCode: 'F-1051J', qty: 1, description: 'SCAT TUBE SUPPORT' },
      { stockCode: 'PS UHMW-125X1/2X5', qty: 1, description: 'PLASTIC STRIP' },
      { stockCode: 'PT 1/2ODX2 CLEAR', qty: 1, description: '3/8IDX1/2ODX2"' },
    ],
  },
  {
    stockCode: 'BAG 1399', qty: 1, description: 'FUEL PUMP/FLO SCAN HW',
    contents: [
      { stockCode: 'AN4-3A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN426AD3-3.5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'AN426AD3-4', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'MK1000-428', qty: 4, description: 'MINI PLATENUT MS21069L4' },
      { stockCode: 'NAS1149F0432P', qty: 4, description: 'REPLACES AN960-416L' },
      { stockCode: 'NAS1149F0463P', qty: 4, description: 'REPLACES AN960-416' },
    ],
  },
  {
    stockCode: 'BAG 1400', qty: 1, description: 'FLAP MOTOR HWR',
    contents: [
      { stockCode: 'AN3-5A', qty: 6, description: 'AN BOLT' },
      { stockCode: 'AN310-5', qty: 1, description: 'NUT, CASTLE 5/16' },
      { stockCode: 'AN316-4R', qty: 1, description: 'NUT, THIN JAM 1/4' },
      { stockCode: 'AN426AD3-4.5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'AN470AD4-8', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
      { stockCode: 'AN5-25', qty: 1, description: 'AN BOLT, DRILLED' },
      { stockCode: 'BEARING CM-4M', qty: 1, description: '1/4X1/4 ROD END BRNG' },
      { stockCode: 'BUSH AL.252X.312X.173', qty: 2, description: 'ALUMINUM BUSHING' },
      { stockCode: 'BUSH AL.322X.438X.680', qty: 2, description: 'ALUMINUM BUSHING' },
      { stockCode: 'F-1066B-2', qty: 1, description: 'FLAP MOTOR ATTACH ANGLES' },
      { stockCode: 'K1000-3', qty: 6, description: 'PLATENUT 10-32 MS21047L3' },

      // Page 7 (continuation of BAG 1400)
      { stockCode: 'MS24665-208', qty: 1, description: 'COTTER PIN - CLEVIS' },
      { stockCode: 'NAS1149F0332P', qty: 6, description: 'REPLACES AN960-10L' },
      { stockCode: 'NAS1149F0363P', qty: 2, description: 'REPLACES AN960-10' },
      { stockCode: 'NAS1149F0563P', qty: 1, description: 'REPLACES AN960-516' },
    ],
  },
  {
    stockCode: 'BAG 1445', qty: 1, description: 'BLUE FITTINGS -6D',
    contents: [
      { stockCode: 'AN SPACER, 6D', qty: 3, description: 'BULKHEAD SPACER' },
      { stockCode: 'AN818-6D', qty: 4, description: 'NUT, FLARE COUPLING' },
      { stockCode: 'AN819-6D', qty: 4, description: 'SLEEVE, FLARE COUPLING' },
      { stockCode: 'AN822-6D', qty: 2, description: 'ELBOW 90DEG TUBE-PIPE' },
      { stockCode: 'AN833-6D', qty: 2, description: 'ELBOW, BLKHD TUBE-TUBE' },
      { stockCode: 'AN924-6D', qty: 2, description: 'NUT, BLKHD' },
    ],
  },
  {
    stockCode: 'BAG 1469', qty: 1, description: 'FUEL VALVE HWR',
    contents: [
      { stockCode: 'AN365-632A', qty: 1, description: 'NUT, STOP 6-32' },
      { stockCode: 'MS21044N04', qty: 1, description: 'NUT 440 LOCK HEX' },
      { stockCode: 'MS35214-29', qty: 1, description: '6-32 X 3/4 BLACK PAN HD BRASS' },
      { stockCode: 'NAS1149F0463P', qty: 4, description: 'REPLACES AN960-416' },
      { stockCode: 'NAS1149FN632P', qty: 1, description: 'REPLACES AN960-6' },
      { stockCode: 'SCREW 1/8-440X1/2', qty: 1, description: 'VA-178 SHOULDER BOLT' },
      { stockCode: 'SCREW 1/8-440X3/16', qty: 1, description: 'SOCKET HEAD SCREW' },
      { stockCode: 'SCREW 5/16-18X3/8', qty: 1, description: 'SOCKET HEAD CAP SCREW' },
      { stockCode: 'VA-178A', qty: 1, description: 'FUEL HANDLE SHAFT' },
      { stockCode: 'VA-178B', qty: 1, description: 'DETENT FUEL HANDLE' },
      { stockCode: 'VA-178C', qty: 1, description: 'COMPRESSION SPRING' },
      { stockCode: 'VA-178D', qty: 1, description: 'DETENT PLATE' },
    ],
  },
  {
    stockCode: 'BAG 2751', qty: 1, description: 'AN470AD4-7',
    contents: [
      { stockCode: 'AN470AD4-7', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 3116', qty: 1, description: 'KNOB KIT FOR RECT. SIDEWALL VENT',
    contents: [
      { stockCode: 'SCREW #4-40X3/8 SMS', qty: 2, description: 'SCREW FOR VENT-00004: BLACK' },
      { stockCode: 'VENT-00004', qty: 2, description: 'VENT KNOB, FOR SIDEWALL VENT' },
    ],
  },
  {
    stockCode: 'BAG 487-1', qty: 1, description: 'FUEL VALVE RV-10 ONLY',
    contents: [
      { stockCode: 'F 1/4 PIPE PLUG', qty: 1, description: 'ALLEN HEAD PIPE PLUG' },
      { stockCode: 'VA-178G', qty: 1, description: 'FUEL VALVE DRILLED' },
    ],
  },
  {
    stockCode: 'BAG 488', qty: 1, description: '3" CUTTING DISCS',
    contents: [
      { stockCode: 'TOOL 3" CUTTING DISC', qty: 3, description: 'NORTON CUTTING DISC' },
    ],
  },
  {
    stockCode: 'BAG 665', qty: 1, description: 'F-6115 RUDDER BLOCK',
    contents: [
      { stockCode: 'F-6115', qty: 1, description: 'CENTER BEARING BUSHNG' },
      { stockCode: 'ES-FA-PA-270-12-5', qty: 1, description: 'FLAP MOTOR RV-10 and RV-14/14A' },
      { stockCode: 'VA-107', qty: 1, description: 'BRAKE RESERVOIR W/CAP' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 1-1
  // ════════════════════════════════════════════════════════════
  { stockCode: 'F-01004C-L-1', qty: 1, description: 'CENTER SECTION BULKHEAD' },
  { stockCode: 'F-01004C-R-1', qty: 1, description: 'CENTER SECTION BULKHEAD' },
  { stockCode: 'F-1001B', qty: 1, description: 'F.WALL ANGLE' },
  { stockCode: 'F-1003B', qty: 1, description: 'INST.PNL.LOWER FLANGE' },
  { stockCode: 'F-1004D-L', qty: 1, description: 'CNTR.SECTION BULKHEAD' },
  { stockCode: 'F-1004D-R', qty: 1, description: 'CNTR.SECTION BULKHEAD' },
  { stockCode: 'F-1015D-L', qty: 1, description: 'MID CABIN SIDE COVER' },
  { stockCode: 'F-1015D-R', qty: 1, description: 'MID CABIN SIDE COVER' },
  { stockCode: 'F-1016E-L', qty: 1, description: 'FLAP TORQ.TUBE COVER' },
  { stockCode: 'F-1016E-R', qty: 1, description: 'FLAP TORQ.TUBE COVER' },
  { stockCode: 'F-1016F-L', qty: 1, description: 'INBD.FOOT WELL RIB' },
  { stockCode: 'F-1016F-R', qty: 1, description: 'INBD.FOOT WELL RIB' },
  { stockCode: 'F-1021-L', qty: 1, description: 'OUTBOARD BAGGAGE RIB' },
  { stockCode: 'F-1021-R', qty: 1, description: 'OUTBOARD BAGGAGE RIB' },
  { stockCode: 'F-1048-L', qty: 1, description: 'FWD FUSE RIB' },
  { stockCode: 'F-1048-R', qty: 1, description: 'FWD FUSE RIB' },
  { stockCode: 'F-1051C', qty: 1, description: 'FRNT.SEAT TUNNL.COVER' },
  { stockCode: 'F-1051E', qty: 1, description: 'REAR SEAT TUNNL.COVER' },
  { stockCode: 'F-1080', qty: 1, description: 'BAGGAGE COVER, RIGHT' },
  { stockCode: 'F-1081', qty: 1, description: 'BAGGAGE COVER, LEFT' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 10
  // ════════════════════════════════════════════════════════════
  { stockCode: 'F-1001K', qty: 1, description: 'FIREWALL RECESS' },
  { stockCode: 'VA-175', qty: 2, description: 'HEAT DUCT TEE' },
  { stockCode: 'VENT DL-03', qty: 2, description: '2" ALUM FLANGE' },
  { stockCode: 'VENT DL-10', qty: 2, description: '92.4 DGREE.FLANGE DCT' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 12
  // ════════════════════════════════════════════════════════════
  { stockCode: 'F-1004-SPACR-125', qty: 52, description: 'CENTER SECTION SPACER' },
  { stockCode: 'F-1004J', qty: 2, description: 'CNTR.SECT.UPRIGHT BAR' },
  { stockCode: 'F-1033-L', qty: 1, description: 'CONTROL COLUMN' },
  { stockCode: 'F-1033-R', qty: 1, description: 'CONTROL COLUMN' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 2-1
  // ════════════════════════════════════════════════════════════
  { stockCode: 'F-01043B-L-1', qty: 1, description: 'FWD.FUSE.BULKHEAD' },
  { stockCode: 'F-01043B-R-1', qty: 1, description: 'FWD.FUSE.BULKHEAD' },
  { stockCode: 'F-1004L', qty: 1, description: 'C.SECTION HAT STIFFNR' },
  { stockCode: 'F-10100', qty: 1, description: 'BAGGAGE DOOR SHIM' },
  { stockCode: 'F-10101', qty: 1, description: 'BAGGAGE DOOR SHIM' },
  { stockCode: 'F-1015A-L', qty: 1, description: 'OUTBRD.FOOT WELL RIB' },
  { stockCode: 'F-1015A-R', qty: 1, description: 'OUTBRD.FOOT WELL RIB' },
  { stockCode: 'F-1015EF', qty: 1, description: 'SPACERS' },
  { stockCode: 'F-1016-L', qty: 1, description: 'OUTBRD.FOOT WELL RIB' },
  { stockCode: 'F-1016-R', qty: 1, description: 'OUTBRD.FOOT WELL RIB' },
  { stockCode: 'F-1017B', qty: 2, description: 'SEAT BELT ATTACH RIB' },
  { stockCode: 'F-1027', qty: 1, description: 'CLOSE OUT PANEL' },
  { stockCode: 'F-1043A-L', qty: 1, description: 'FWD.FUSE.BULKHEAD' },
  { stockCode: 'F-1043A-R', qty: 1, description: 'FWD.FUSE.BULKHEAD' },
  { stockCode: 'F-1044A', qty: 1, description: 'FWD FUSELAGE RIB' },
  { stockCode: 'F-1045-L', qty: 1, description: 'FWD.FUSE RIB' },
  { stockCode: 'F-1045-R', qty: 1, description: 'FWD.FUSE RIB' },
  { stockCode: 'F-1049D-L', qty: 1, description: 'FWD.FUSE FLOOR RIB' },
  { stockCode: 'F-1049D-R', qty: 1, description: 'FWD.FUSE FLOOR RIB' },
  { stockCode: 'F-1068A', qty: 1, description: 'SUB PANEL CENTER' },
  { stockCode: 'F-1084', qty: 2, description: 'SYSTEMS BRACKET' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 3-1
  // ════════════════════════════════════════════════════════════
  { stockCode: 'AA3-032X3/4X3/4X12', qty: 2, description: 'ALUM ANGLE' },
  { stockCode: 'AS3-063X1X12', qty: 1, description: 'ALUM STRIP' },
  { stockCode: 'AS3-063X5/8X13 1/2', qty: 1, description: 'ALUM SHEET' },
  { stockCode: 'AT6-058X5/16X9', qty: 1, description: 'PUSH ROD 4/6/7/8/12' },
  { stockCode: 'F-01043D-L-1', qty: 1, description: 'COVER PANEL' },
  { stockCode: 'F-01043D-R-1', qty: 1, description: 'COVER PANEL' },
  { stockCode: 'F-01067A-1', qty: 2, description: 'SEAT FLOOR' },
  { stockCode: 'F-10105', qty: 1, description: 'CONTROL CABLE BRACKET' },
  { stockCode: 'F-1016D', qty: 2, description: 'SEAT BELT ATTACH BAR' },
  { stockCode: 'F-1016D-1', qty: 2, description: 'SEAT BELT ATTACH BAR' },
  { stockCode: 'F-1022A-L', qty: 1, description: 'BAGGAGE FLOOR' },
  { stockCode: 'F-1022A-R', qty: 1, description: 'BAGGAGE FLOOR' },
  { stockCode: 'F-1042G-L', qty: 1, description: 'WIRE COVER' },
  { stockCode: 'F-1042G-R', qty: 1, description: 'WIRE COVER' },
  { stockCode: 'F-1044DEF', qty: 1, description: 'ANGLE' },
  { stockCode: 'F-1050B', qty: 2, description: 'BOLT ACCESS PLATE' },
  { stockCode: 'F-1051F', qty: 1, description: 'BAGGAGE TUNNEL COVER' },
  { stockCode: 'F-1052', qty: 2, description: 'RUDDER PEDAL SET' },
  { stockCode: 'F-1052C', qty: 2, description: 'BRAKE PDL.DBLER.PLATE' },
  { stockCode: 'F-1059E', qty: 1, description: 'BAGGAGE DOOR SKIN' },
  { stockCode: 'F-1059F', qty: 1, description: 'BAG.DOOR CLOSEOUT PNL' },
  { stockCode: 'F-1067B', qty: 2, description: 'SEAT FLOOR SPACER' },
  { stockCode: 'F-637A', qty: 2, description: 'SEAT BACK SKIN' },
  { stockCode: 'VA-256', qty: 2, description: 'FLAP PUSH ROD' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 4-1
  // ════════════════════════════════════════════════════════════
  { stockCode: 'F-01004T-L', qty: 1, description: 'CENTER SECTION SIDE PLATE DOUBLER' },
  { stockCode: 'F-01004T-R', qty: 1, description: 'CENTER SECTION SIDE PLATE DOUBLER' },
  { stockCode: 'F-01042BCD-1', qty: 1, description: 'CLIPS AND SPACERS' },
  { stockCode: 'F-1001G-L', qty: 1, description: 'F.WALL GUSSET' },
  { stockCode: 'F-1001G-R', qty: 1, description: 'F.WALL GUSSET' },
  { stockCode: 'F-1001J', qty: 1, description: 'LONGERON GUSSET' },
  { stockCode: 'F-1003C', qty: 1, description: 'INST.PANEL ATTACH FLG' },
  { stockCode: 'F-1004-SPACR-063', qty: 4, description: 'CENTER SECTION SPACER' },
  { stockCode: 'F-1016G', qty: 1, description: 'INBRD.FOOT WELL SPCER' },
  { stockCode: 'F-1017A-L', qty: 5, description: 'REAR SEAT RIB' },
  { stockCode: 'F-1017A-R', qty: 5, description: 'REAR SEAT RIB' },
  { stockCode: 'F-1017C', qty: 4, description: 'SEAT BELT ATTACH LUG' },
  { stockCode: 'F-1018-L', qty: 1, description: 'REAR SEAT RIB' },
  { stockCode: 'F-1018-R', qty: 1, description: 'REAR SEAT RIB' },
  { stockCode: 'F-1034E', qty: 2, description: 'S.BACK BRACE GUSSET' },
  { stockCode: 'F-1039B', qty: 2, description: 'RUDDER PEDAL BRCKT.' },
  { stockCode: 'F-1039J', qty: 1, description: 'R.PEDAL DRILL JIG' },
  { stockCode: 'F-1048C-1', qty: 1, description: 'FUEL VALVE BRACKET' },
  { stockCode: 'F-1052B', qty: 4, description: 'BRAKE SIDE PLATE' },
  { stockCode: 'F-1063A', qty: 2, description: 'ELEVATOR IDLER ARM' },
  { stockCode: 'F-1071B', qty: 2, description: 'HAND HOLD DOUBLER' },
  { stockCode: 'F-1083', qty: 1, description: 'CNTRL.CABLE BRACKET' },
  { stockCode: 'F-814HPP', qty: 4, description: 'FWD SEATBELT ANCHOR' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 5-1
  // ════════════════════════════════════════════════════════════
  { stockCode: 'AA6-125X3/4X3/4X24', qty: 1, description: 'ALUM ANGLE' },
  { stockCode: 'F-01002-L-1', qty: 1, description: 'FORWARD FUSELAGE BULKHEAD' },
  { stockCode: 'F-01002-R-1', qty: 1, description: 'FORWARD FUSELAGE BULKHEAD' },
  { stockCode: 'F-01067D-1', qty: 2, description: 'SEAT FLOOR ATTACH STRIP' },
  { stockCode: 'F-1001C', qty: 1, description: 'F.WALL CHANNEL' },
  { stockCode: 'F-1001F-L', qty: 1, description: 'F.WALL ANGLE' },
  { stockCode: 'F-1001F-R', qty: 1, description: 'F.WALL ANGLE' },
  { stockCode: 'F-1005A', qty: 1, description: 'CNTR.SECTION BULKHEAD' },
  { stockCode: 'F-10107', qty: 2, description: 'RIVET BACK STRIP' },
  { stockCode: 'F-1015C-L', qty: 1, description: 'MID CABIN DECK' },
  { stockCode: 'F-1015C-R', qty: 1, description: 'MID CABIN DECK' },
  { stockCode: 'F-1016B-L', qty: 4, description: 'FLOOR STIFFENER' },
  { stockCode: 'F-1016B-R', qty: 4, description: 'FLOOR STIFFENER' },
  { stockCode: 'F-1022', qty: 2, description: 'BAGGAGE STIFFENER' },
  { stockCode: 'F-1023-L', qty: 1, description: 'BAGGAGE FLOOR ANGLE' },
  { stockCode: 'F-1023-R', qty: 1, description: 'BAGGAGE FLOOR ANGLE' },
  { stockCode: 'F-1026', qty: 1, description: 'BAG.DOOR SEAL CHAN.' },
  { stockCode: 'F-1034A', qty: 1, description: 'FUSELAGE BULKHEAD' },
  { stockCode: 'F-1034B', qty: 1, description: 'SEAT BACK BRACE' },
  { stockCode: 'F-1034F', qty: 1, description: 'S.BACK BRACE CLOSEOUT' },
  { stockCode: 'F-1043C', qty: 1, description: 'ATTACH ANGLE' },
  { stockCode: 'F-1043F', qty: 2, description: 'SEAT RAIL SUPRT.ANGLE' },
  { stockCode: 'F-1051A', qty: 1, description: 'FWD.FUSE TUNNEL COVER' },
  { stockCode: 'F-1058', qty: 1, description: 'BAG.DOOR HINGE FRAME' },
  { stockCode: 'F-1059C', qty: 1, description: 'BAG.DOOR LWR.FRAME' },
  { stockCode: 'F-1064', qty: 2, description: 'PUSH ROD' },
  { stockCode: 'F-1065', qty: 1, description: 'PUSH ROD' },
  { stockCode: 'F-1099D', qty: 2, description: 'WING FAIRING STIFFNER' },
  { stockCode: 'F-1099EFG-L', qty: 1, description: 'W.ROOT FAIR.SUPPORT' },
  { stockCode: 'F-1099EFG-R', qty: 1, description: 'W.ROOT FAIR.SUPPORT' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 6-1
  // ════════════════════════════════════════════════════════════
  { stockCode: 'F-01042-L-1', qty: 1, description: 'BLKHD.SIDE CHANNEL' },
  { stockCode: 'F-01042-R-1', qty: 1, description: 'BLKHD.SIDE CHANNEL' },
  { stockCode: 'F-01049C-L-1', qty: 1, description: 'FWD.FUSE FLOOR RIB' },
  { stockCode: 'F-01049C-R-1', qty: 1, description: 'FWD.FUSE FLOOR RIB' },
  { stockCode: 'F-01088-L-1', qty: 1, description: 'FORWARD FUSELAGE RIB' },
  { stockCode: 'F-01088-R-1', qty: 1, description: 'FORWARD FUSELAGE RIB' },
  { stockCode: 'F-1001D', qty: 1, description: 'F.WALL RHT.SIDE ANGLE' },
  { stockCode: 'F-1001E-L', qty: 1, description: 'F.WALL ANGLE' },
  { stockCode: 'F-1001E-R', qty: 1, description: 'F.WALL ANGLE' },
  { stockCode: 'F-1005C-L', qty: 1, description: 'BULKHEAD SIDE CHANNEL' },
  { stockCode: 'F-1005C-R', qty: 1, description: 'BULKHEAD SIDE CHANNEL' },
  { stockCode: 'F-1015B-L', qty: 1, description: 'FOOT WELL RIB INTRCST' },
  { stockCode: 'F-1015B-R', qty: 1, description: 'FOOT WELL RIB INTRCST' },
  { stockCode: 'F-1019-L', qty: 1, description: 'INBD BAGGAGE RIB' },
  { stockCode: 'F-1019-R', qty: 1, description: 'INBD BAGGAGE RIB' },
  { stockCode: 'F-1020-L', qty: 1, description: 'MID BAGGAGE RIB' },
  { stockCode: 'F-1020-R', qty: 1, description: 'MID BAGGAGE RIB' },
  { stockCode: 'F-1031', qty: 1, description: 'BAG.DOOR SEAL CHANNEL' },
  { stockCode: 'F-1034C-L', qty: 1, description: 'FUSELAGE BULKHEAD' },
  { stockCode: 'F-1034C-R', qty: 1, description: 'FUSELAGE BULKHEAD' },

  // Page 11
  { stockCode: 'F-1040-L', qty: 1, description: 'FWD.FUSE CHANNEL' },
  { stockCode: 'F-1040-R', qty: 1, description: 'FWD.FUSE CHANNEL' },
  { stockCode: 'F-1041-L', qty: 1, description: 'FWD.FUSE CHANNEL' },
  { stockCode: 'F-1041-R', qty: 1, description: 'FWD.FUSE CHANNEL' },
  { stockCode: 'F-1049A-L', qty: 1, description: 'FWD.FUSE FLOOR RIB' },
  { stockCode: 'F-1049A-R', qty: 1, description: 'FWD.FUSE FLOOR RIB' },
  { stockCode: 'F-1049B-L', qty: 1, description: 'FWD.FUSE FLOOR RIB' },
  { stockCode: 'F-1049B-R', qty: 1, description: 'FWD.FUSE FLOOR RIB' },
  { stockCode: 'F-1059A', qty: 1, description: 'BAG.DOOR FWD.FRAME' },
  { stockCode: 'F-1059B', qty: 1, description: 'BAG.DOOR UPR.FRAME' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 7
  // ════════════════════════════════════════════════════════════
  { stockCode: 'AT0-032X1/4X12', qty: 1, description: 'SOFT ALUM TUBE COIL' },
  { stockCode: 'AT0-035X3/8X12\'', qty: 1, description: 'SOFT ALUM TUBE COIL' },
  { stockCode: 'F-1005E-L', qty: 1, description: 'GUSSET' },
  { stockCode: 'F-1005E-R', qty: 1, description: 'GUSSET' },
  { stockCode: 'F-1023B-L', qty: 1, description: 'BAGGAGE FLOOR ANGLE' },
  { stockCode: 'F-1023B-R', qty: 1, description: 'BAGGAGE FLOOR ANGLE' },
  { stockCode: 'F-1034D', qty: 1, description: 'GUSSET' },
  { stockCode: 'F-1043E-L', qty: 2, description: 'FWD.SEAT RAIL SUPPORT' },
  { stockCode: 'F-1043E-R', qty: 2, description: 'FWD.SEAT RAIL SUPPORT' },
  { stockCode: 'F-1053', qty: 2, description: 'RV-10 RUDDER CABLE' },
  { stockCode: 'F-1063B-L', qty: 1, description: 'ELEV.IDLER BRCKT.' },
  { stockCode: 'F-1063B-R', qty: 1, description: 'ELEV.IDLER BRCKT.' },
  { stockCode: 'F-1066A-1', qty: 1, description: 'BRACKET, FLAP MOTOR' },
  { stockCode: 'F-1086', qty: 1, description: 'VENT BRACKET' },
  { stockCode: 'F-1087', qty: 1, description: 'VENT SLIDE' },
  { stockCode: 'F-6114', qty: 1, description: 'SB CABLE ASSY (2SEAT)' },
  {
    stockCode: 'BAG 633', qty: 1, description: 'SB HARNESS HWR',
    contents: [
      { stockCode: 'AS3-040X1/2X4', qty: 1, description: 'ALUM STRIP' },
      { stockCode: 'PS UHMW-125X1/2X2', qty: 2, description: 'PLASTIC STRIP' },
      { stockCode: 'PS UHMW-125X1X2', qty: 2, description: 'PLASTIC STRIP F-6114C' },
      { stockCode: 'RIVET LP4-3', qty: 8, description: 'POP RIVET' },
      { stockCode: 'F-6114A', qty: 2, description: 'CABLE FOR SB HARNESS' },
      { stockCode: 'F-6122-1', qty: 1, description: 'TRI-GEAR BRAKE BRAKET' },
      { stockCode: 'RUBBER CHANNEL X 4\'', qty: 1, description: 'EMP FAIRING SEAL' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 8-1
  // ════════════════════════════════════════════════════════════
  { stockCode: 'F-01004K-L-1', qty: 1, description: 'CNTR.SECT.SIDE PLATE' },
  { stockCode: 'F-01004K-R-1', qty: 1, description: 'CNTR.SECT.SIDE PLATE' },
  { stockCode: 'F-01004P-L-1', qty: 2, description: 'MID SEAT RAIL SUPPORT' },
  { stockCode: 'F-01004P-R-1', qty: 2, description: 'MID SEAT RAIL SUPPORT' },
  { stockCode: 'F-01043G-L-1', qty: 2, description: 'FWD.SEAT RAIL SUPPORT' },
  { stockCode: 'F-01043G-R-1', qty: 2, description: 'FWD.SEAT RAIL SUPPORT' },
  { stockCode: 'F-1004R-L', qty: 3, description: 'AFT SEAT RAIL SUPPORT' },
  { stockCode: 'F-1004R-R', qty: 3, description: 'AFT SEAT RAIL SUPPORT' },
  { stockCode: 'F-1004S-L', qty: 1, description: 'AFT SEAT RAIL SUPPORT' },
  { stockCode: 'F-1004S-R', qty: 1, description: 'AFT SEAT RAIL SUPPORT' },
  { stockCode: 'F-1016C-L', qty: 1, description: 'FLOOR PAN' },
  { stockCode: 'F-1016C-R', qty: 1, description: 'FLOOR PAN' },

  // Page 12
  { stockCode: 'F-1024-L', qty: 1, description: 'SEAT FLOOR' },
  { stockCode: 'F-1024-R', qty: 1, description: 'SEAT FLOOR' },
  { stockCode: 'F-1025-L', qty: 1, description: 'REAR SEAT COVER PANEL' },
  { stockCode: 'F-1025-R', qty: 1, description: 'REAR SEAT COVER PANEL' },
  { stockCode: 'F-1039D', qty: 1, description: 'PEDAL BRACE' },
  { stockCode: 'F-1068B-L', qty: 1, description: 'SUB PANEL SIDE' },
  { stockCode: 'F-1068B-R', qty: 1, description: 'SUB PANEL SIDE' },
  { stockCode: 'TRIM BUNDLE FUS', qty: 1, description: 'MISC PARTS' },

  // ════════════════════════════════════════════════════════════
  // 10A FUSE SUB-KIT 9-1
  // ════════════════════════════════════════════════════════════
  { stockCode: 'AA6-063X3/4X3/4X3\'', qty: 1, description: '36 INCH ALUMINUM ANGLE' },
  { stockCode: 'AA6-063X3/4X3/4X6\'', qty: 1, description: '72 INCH ALUM ANGLE' },
  { stockCode: 'AA6-125X3/4X3/4X54', qty: 2, description: 'ALUM ANGLE' },
  { stockCode: 'AA6-125X3/4X3/4X6\'', qty: 3, description: 'ALUM ANGLE' },
  { stockCode: 'AA6-125X3/4X3/4X92.5', qty: 1, description: 'ALUM ANGLE' },
  { stockCode: 'AN257-P3X6\'', qty: 1, description: 'HINGE X 6\'' },
  { stockCode: 'AT6-035X1 1/2X61', qty: 1, description: 'RV-10 PUSH ROD TUBE; F-1090' },
  { stockCode: 'AT6-035X1 1/8X3\'', qty: 1, description: 'PUSH/PULL TUBE' },
  { stockCode: 'F-01067C-1', qty: 1, description: 'SEAT FLOOR ANGLE' },
  { stockCode: 'HINGE PIANO 1/8X9\' ML', qty: 1, description: 'MULTIPLE LENGTHS' },
  { stockCode: '10A PLANS FUSE', qty: 1, description: 'PLANS & MANUAL' },

  // ════════════════════════════════════════════════════════════
  // ADDITIONAL INDIVIDUAL ITEMS (pages 12-13)
  // ════════════════════════════════════════════════════════════
  { stockCode: 'AA6-125X3/4X3/4X9\'6"', qty: 1, description: 'ALUM ANGLE' },
  { stockCode: 'C-1001', qty: 1, description: 'CABIN COVER' },
  { stockCode: 'C-1004-L SC-15', qty: 1, description: 'REAR LEFT WINDOW, LOW UV' },
  { stockCode: 'C-1004-R SC-15', qty: 1, description: 'RIGHT REAR WINDOW, LOW UV' },
  { stockCode: 'C-1005 SC-15', qty: 1, description: 'WINDSHIELD RV-10, LOW-UV' },
  { stockCode: 'CA SEAT RAIL SET-1', qty: 1, description: 'SEAT RAILS FOR LEFT & RIGHT SEATS' },

  {
    stockCode: 'BAG 1310', qty: 1, description: 'CA SEAT RAIL HWR',
    contents: [
      { stockCode: 'AN364-428', qty: 8, description: 'NUT, STOP SHEAR' },
      { stockCode: 'AN509-416R14', qty: 8, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'CA-10001C', qty: 4, description: 'STOP, SEAT' },
      { stockCode: 'MS16562-31', qty: 2, description: 'ROLL PIN' },
      { stockCode: 'NAS1149F0432P', qty: 8, description: 'REPLACES AN960-416L' },
    ],
  },

  { stockCode: 'CA-10001A-L', qty: 1, description: 'TRACK, SEAT' },
  { stockCode: 'CA-10001A-R', qty: 1, description: 'TRACK, SEAT' },
  { stockCode: 'CA-10001B', qty: 2, description: 'BAR, SEAT POSITION' },
  { stockCode: 'CA-10002', qty: 2, description: 'TRACK, SEAT' },

  { stockCode: 'F-01050-L-1', qty: 1, description: 'FWD.CABIN FLOOR PANEL' },
  { stockCode: 'F-01050-R-1', qty: 1, description: 'FWD.CABIN FLOOR PANEL' },
  { stockCode: 'F-01069-1', qty: 2, description: 'FWD.FUSE SIDE SKIN' },
  { stockCode: 'F-01072-1', qty: 1, description: 'FWD.FUSE BOTTOM SKIN' },
  { stockCode: 'F-1001A', qty: 1, description: 'FIREWALL' },
  { stockCode: 'F-1001M', qty: 1, description: 'F.WALL L.SIDE ANGLE' },
  { stockCode: 'F-1003A', qty: 1, description: 'INSTRUMENT PANEL' },
  { stockCode: 'F-1005B', qty: 2, description: 'REAR SPAR ATTACH BAR' },
  { stockCode: 'F-1046B', qty: 1, description: 'LONGERON BEND MPLATE' },
  { stockCode: 'F-1070-L', qty: 1, description: 'MID SIDE SKIN' },
  { stockCode: 'F-1070-R', qty: 1, description: 'MID SIDE SKIN' },
  { stockCode: 'F-1071', qty: 1, description: 'FWD FUSE TOP SKIN' },

  // Page 13
  { stockCode: 'F-1076', qty: 1, description: 'MID BOTTOM SKIN' },
  { stockCode: 'F-1077', qty: 1, description: 'MID BOTTOM SKIN' },
  { stockCode: 'F-1094B', qty: 1, description: 'EMPENNAGE FAIRING' },
  { stockCode: 'F-1099A', qty: 2, description: 'UPPR.WING ROOT FAIRNG' },
  { stockCode: 'F-1099B', qty: 2, description: 'LWR.WING ROOT FAIRING' },

  // ── STATIC AIR KIT ────────────────────────────────────────
  {
    stockCode: 'STATIC-KIT', qty: 1, description: 'STATIC AIR KIT ALL',
    contents: [
      { stockCode: 'DOC STATIC AIR KIT', qty: 1, description: 'DOC' },
      { stockCode: 'F PLASTIC TEE', qty: 1, description: 'PITOT STATIC TEE' },
      { stockCode: 'FLF-00007', qty: 1, description: 'PUSH TO CONNECT ELBOW' },
      { stockCode: 'PT 1/4IDX3/8ODX4"', qty: 1, description: 'PITOT TUBE JOINER or T-01236' },
      { stockCode: 'PT 1/4OD TUBEX20\'', qty: 1, description: 'POLYPROPYLENE' },
      { stockCode: 'PT 1/8 CLR X 5\'', qty: 1, description: 'ID PLASTIC TUBE X 5\'' },
      { stockCode: 'RIVET SD-42-BSLF', qty: 2, description: 'POP RIVET (BAFFLE)' },
      { stockCode: 'VENT TG-1010 L&R', qty: 1, description: 'RV-10 HEAT BOXES (2)' },
    ],
  },

  // ── CENTER SECTION & LANDING GEAR ─────────────────────────
  { stockCode: 'W-1006 CENTER SECTION-1', qty: 1, description: 'WING SPAR/FUSE BLKHD' },
  { stockCode: 'F-01004FWD-1', qty: 1, description: 'CENTER SECTION, FORWARD' },
  { stockCode: 'F-1004AFT', qty: 1, description: 'CENTER SECTION, AFT' },
  { stockCode: 'WD-01021-L-1', qty: 1, description: 'MOUNT, LANDING GEAR' },
  { stockCode: 'WD-01021-R-1', qty: 1, description: 'MOUNT, LANDING GEAR' },
  { stockCode: 'WD-1002-L-PC', qty: 1, description: 'UPPER F.WALL BRACKET' },
  { stockCode: 'WD-1002-R-PC', qty: 1, description: 'UPPER F.WALL BRACKET' },
  { stockCode: 'WD-1003-L-PC', qty: 1, description: 'LOWER F.WALL BRACKET' },
  { stockCode: 'WD-1003-R-PC', qty: 1, description: 'LOWER F.WALL BRACKET' },
  { stockCode: 'WD-1004-PC', qty: 2, description: 'NOSE GEAR TENSION FIT' },
  { stockCode: 'WD-1006-L-PC', qty: 1, description: 'RUDDER PEDAL LEFT' },
  { stockCode: 'WD-1006-R-PC', qty: 1, description: 'RUDDER PEDAL RIGHT' },
  { stockCode: 'WD-1007-L', qty: 1, description: 'STEP' },
  { stockCode: 'WD-1007-R', qty: 1, description: 'STEP' },
  { stockCode: 'WD-1008-L-PC', qty: 1, description: 'STEP MOUNTING BRACKET' },
  { stockCode: 'WD-1008-R-PC', qty: 1, description: 'STEP MOUNTING BRACKET' },
  { stockCode: 'WD-1010-PC', qty: 1, description: 'CONTROL COLUMN' },
  { stockCode: 'WD-1011-L-PC', qty: 1, description: 'LEFT STICK BASE' },
  { stockCode: 'WD-1011-R-PC', qty: 1, description: 'RIGHT STICK BASE' },
  { stockCode: 'WD-1012-PC', qty: 2, description: 'CONTROL STICK' },
  { stockCode: 'WD-1013A-PC', qty: 1, description: 'FLAP CRANK' },
  { stockCode: 'WD-1013B-PC', qty: 2, description: 'FLAP HORN' },
  { stockCode: 'WD-1013C-PC', qty: 2, description: 'TORQUE TUBE' },
  { stockCode: 'WD-1043-PC', qty: 1, description: 'ROLL BAR BRACE STNLES' },

  // ════════════════════════════════════════════════════════════
  // 10 GROVE BRAKE KIT
  // ════════════════════════════════════════════════════════════
  { stockCode: 'AT0-032X1/4X12\'', qty: 1, description: 'SOFT ALUM TUBE COIL' },
  {
    stockCode: 'BAG 1377-1', qty: 1, description: 'BRASS FITTINGS/INSERT',
    contents: [
      { stockCode: 'F 63-PT3-25', qty: 6, description: 'BRASS INSERT BRK HI-P' },
      { stockCode: 'F 69-F-04X02', qty: 6, description: 'BRASS ELBOW W/FERRULE' },
      { stockCode: 'FLF-00004', qty: 1, description: 'TEE.25TUBEX.125NPT' },
    ],
  },
  {
    stockCode: 'BAG 1394', qty: 1, description: 'GROVE BRAKE FITTINGS, RV-10',
    contents: [
      { stockCode: 'AN818-4D', qty: 6, description: 'NUT, FLARE COUPLING' },
      { stockCode: 'AN819-4D', qty: 6, description: 'SLEEVE, FLARE COUPLING' },
      { stockCode: 'AN833-4D', qty: 4, description: 'ELBOW, BLKHD TUBE-TUBE' },
      { stockCode: 'AN837-4D', qty: 2, description: 'ELBOW, 45BLK TUBE-TUBE' },
      { stockCode: 'AN924-4D', qty: 6, description: 'NUT, BLKHD' },
      { stockCode: 'NAS1149F0763P', qty: 5, description: 'REPLACES AN960-716' },
    ],
  },
  { stockCode: 'BRAKE MAST.CYL.LEFT-1', qty: 2, description: 'MATCO 4/6/7/9/10/12/14' },
  { stockCode: 'BRAKE MAST.CYL.RGHT-1', qty: 2, description: 'MATCO 4/6/7/9/10/12/14' },
  { stockCode: 'F-8105', qty: 2, description: 'BRAKE HOSE 20" 8/10' },
  { stockCode: 'PT-062X1/4X15', qty: 7, description: 'HI PRES BRAKE HOSE' },
  { stockCode: 'PT-062X1/4X9\'', qty: 1, description: 'HI PRES DUAL BRK SYS' },
  { stockCode: 'U 15X6.0-6', qty: 2, description: 'MAIN TIRE 6 PLY RV-10' },
  { stockCode: 'U 15X6.0-6IT', qty: 2, description: 'INNER TUBE MAIN RV-10' },
  { stockCode: 'U 5:00X5-6', qty: 1, description: '6 PLY TIRE MAIN GEAR' },
  { stockCode: 'U 5:00X5-6IT', qty: 1, description: 'TUBE FOR 5:005-6' },
  { stockCode: 'U NW501.25', qty: 1, description: 'NOSE WHEEL W/BEARINGS RV-6/7/8/9/1' },
  { stockCode: 'U-00011', qty: 1, description: 'GROVE WHL&BRK 6X6.00, RV-10' },
  { stockCode: 'U-00024', qty: 1, description: 'AXLE, NOSE WHEEL-10/14' },
  { stockCode: 'U-01004', qty: 2, description: 'AXLE NUT STANDOFF' },
  { stockCode: 'U-1003-PC', qty: 2, description: 'BRAKE MOUNT' },
];
