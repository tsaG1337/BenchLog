/**
 * Van's RV-10 Finish Kit — Packing List
 * Source: Finish_Packing_list.pdf (9 pages)
 * Order Date: 08/25/22 | Ship Date: 07/24/25 | Purchase Order: FIN
 * Engine: IO-540
 *
 * Format: Each top-level entry is a BAG, SUB-KIT, or individual part.
 * `contents` lists the individual items inside that bag/sub-kit.
 * Quantities for rivets sold by weight (LB) are noted in description.
 */

import type { PackingListItem, PackingListBag } from './empennage';

export const FINISH_PACKING_LIST: (PackingListItem | PackingListBag)[] = [
  // ════════════════════════════════════════════════════════════
  // RV-10 FINISH IO-540 (===STANDARDIZED KIT)
  // ════════════════════════════════════════════════════════════

  // ── 10 DOOR LATCH SYSTEM ──────────────────────────────────
  { stockCode: '10 DOOR LATCH SYSTEM', qty: 1, description: 'WARNING LIGHT KIT' },

  {
    stockCode: 'BAG 540', qty: 1, description: 'DOOR LATCH HWRE',
    contents: [
      { stockCode: 'AS3-040X2 1/2X2 3/4', qty: 1, description: 'ALUM SHEET' },
      { stockCode: 'BUSHING SB187-2', qty: 2, description: 'SNAP-IN 1/8ID 3/16OD' },
      { stockCode: 'ES 31890', qty: 1, description: '#18-22WIRE/#8 RING' },
      { stockCode: 'ES 36152', qty: 3, description: '#20 WIRE/#6 SCREW' },
      { stockCode: 'ES 421-0107 CONNECTOR', qty: 2, description: 'MALE SLIP-ON CONN.' },
      { stockCode: 'ES 421-0108 CONNECTOR', qty: 10, description: 'FEMALE SLIP-ON CONN.' },
      { stockCode: 'ES RS 276-270', qty: 2, description: 'RED LED W/HOLDER' },
      { stockCode: 'ES RS 49-496', qty: 4, description: 'MAGNET & SWITCH' },
      { stockCode: 'MS21919DG4', qty: 4, description: 'CUSHION CLAMP 1/4' },
    ],
  },
  {
    stockCode: 'BAG 541', qty: 1, description: 'DOOR LATCH HARDWARE',
    contents: [
      { stockCode: 'AN3-3A', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN365-632A', qty: 2, description: 'NUT, STOP 6-32' },
      { stockCode: 'AN365-832A', qty: 2, description: 'NUT, STOP 8-32' },
      { stockCode: 'AN509-8R8', qty: 2, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN515-6R8', qty: 2, description: '6-32X1/2 PAN HEAD SCREW' },
      { stockCode: 'K1000-3', qty: 1, description: 'PLATENUT 10-32 MS21047L3' },
      { stockCode: 'NAS1149F0332P', qty: 1, description: 'REPLACES AN960-10L' },
      { stockCode: 'NAS1149FN632P', qty: 2, description: 'REPLACES AN960-6' },
      { stockCode: 'NAS1149FN832P', qty: 2, description: 'REPLACES AN960-8' },
    ],
  },

  { stockCode: 'DOC RV-10 DOOR LIGHT', qty: 1, description: 'WARNING LIGHT KIT' },
  { stockCode: 'ES HST-1/8 X 9 INCH', qty: 1, description: 'HEAT SHRINK' },
  { stockCode: 'ES RLY-351', qty: 2, description: 'RV-10 DOOR LT RELAY' },
  { stockCode: "WIRE #18X20'", qty: 1, description: "WIRE M22759/16-18 TEFZELx 20'" },

  // ── 10 FIN SUB-KIT 1 ─────────────────────────────────────
  { stockCode: '10 FIN SUB-KIT 1', qty: 1, description: 'MISC.PARTS' },
  { stockCode: 'AS3-063X5X10.469', qty: 1, description: 'ALUM SHEET' },
  { stockCode: 'C-1002C', qty: 2, description: 'GAS STRUT ATT.DOUBLER' },
  { stockCode: 'C-1008', qty: 2, description: 'HANDLE LEVER' },
  { stockCode: 'C-1016 DOOR STRUT', qty: 2, description: 'GAS STRUT FOR RV-10 DOORS' },
  { stockCode: 'C-RACK 10"', qty: 2, description: 'GEAR RACK' },
  { stockCode: 'F-10108A', qty: 1, description: 'SUPPORT BRACKET' },
  { stockCode: 'F-10108B', qty: 1, description: 'SPLICE PLATE' },
  { stockCode: 'F-10108C', qty: 1, description: 'PLATE' },
  { stockCode: 'F-10109', qty: 2, description: 'LOUVER' },
  { stockCode: 'FBGLS.PARABEAM 9X30', qty: 1, description: 'FBGLS CLOTH 9"X30"' },
  { stockCode: 'U-1010-L', qty: 1, description: 'MAIN WHL.FAIRING BRKT' },
  { stockCode: 'U-1010-R', qty: 1, description: 'MAIN WHL.FAIRING BRKT' },
  { stockCode: 'U-1013C-L', qty: 1, description: 'N.WHEEL PANT BRACKET' },
  { stockCode: 'U-1013C-R', qty: 1, description: 'N.WHEEL PANT BRACKET' },
  { stockCode: 'WD-1022-PC', qty: 2, description: 'DOOR HANDLE ASSEMBLY' },
  { stockCode: 'WD-1023-PC', qty: 2, description: 'GAS STRUT BRACKET' },
  { stockCode: 'WD-1031-PC', qty: 1, description: 'AXLE FLANGE' },

  // ── 10 FIN SUB-KIT 2 ─────────────────────────────────────
  { stockCode: '10 FIN SUB-KIT 2', qty: 1, description: 'MISC.PARTS' },
  { stockCode: 'C-1011-L', qty: 1, description: 'FWD.LATCH PIN' },
  { stockCode: 'C-1011-R', qty: 1, description: 'FWD.LATCH PIN' },
  { stockCode: 'C-1012-L', qty: 1, description: 'AFT LATCH PIN ASSY.' },
  { stockCode: 'C-1012-R', qty: 1, description: 'AFT LATCH PIN ASSY.' },
  { stockCode: 'U-1017A', qty: 2, description: 'GEAR LEG FAIRING MAIN' },
  { stockCode: 'U-1018A', qty: 1, description: 'NOSE GEAR FAIRING-10' },

  // ── 10 FIN SUB-KIT 3 ─────────────────────────────────────
  { stockCode: '10 FIN SUB-KIT 3', qty: 1, description: 'MISC.PARTS' },
  { stockCode: 'COWL, 10 INLET LEFT', qty: 1, description: 'INLET LEFT' },
  { stockCode: 'COWL, 10 INLET RIGHT', qty: 1, description: 'INLET RIGHT' },
  { stockCode: 'COWL-10-01A', qty: 1, description: 'COWL OIL DOOR' },
  { stockCode: 'COWL-10-01B', qty: 1, description: 'OIL DOOR CORE' },

  // ── 10 FIN SUB-KIT 5 ─────────────────────────────────────
  { stockCode: '10 FIN SUB-KIT 5', qty: 1, description: 'MISC.PARTS' },
  { stockCode: 'EA J-11968-14', qty: 4, description: 'GEAR ELASTOMER -10' },
  { stockCode: 'WD-1030', qty: 1, description: 'RV-10 NOSE FORK' },

  // ── 10 FRONT SEAT KIT ────────────────────────────────────
  { stockCode: '10 FRONT SEAT KIT', qty: 1, description: 'PILOT AND COPILOT SEATS AND CUSHIONS' },

  {
    stockCode: 'BAG 1020', qty: 1, description: 'BOLTS/SCREWS, 10 FRONT SEAT HWR',
    contents: [
      { stockCode: 'AN3-5A', qty: 16, description: 'AN BOLT' },
      { stockCode: 'AN3-6A', qty: 8, description: 'AN BOLT' },
      { stockCode: 'AN4-13A', qty: 8, description: 'AN BOLT' },
      { stockCode: 'AN4-4A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN525-832R8', qty: 8, description: 'SCREW, WASHER HD' },
      { stockCode: 'NAS1352-08-16P', qty: 2, description: 'SCREW, CAP, SOCKET HEAD' },
    ],
  },
  {
    stockCode: 'BAG 1021', qty: 1, description: 'NUTS/WASH, 10 FRONT SEAT HWR',
    contents: [
      { stockCode: 'AN365-1032', qty: 8, description: 'NUT, STOP' },
      { stockCode: 'AN365-428', qty: 12, description: 'NUT, STOP 1/4-28' },
      { stockCode: 'AN970-4', qty: 6, description: 'WASHER 1 1/8 OD' },
      { stockCode: 'MS21042-08', qty: 8, description: '8-32 METAL LOCK NUT' },
      { stockCode: 'MS21042-3', qty: 24, description: '10-32 METAL LOCK NUT' },
      { stockCode: 'MS21042-4', qty: 16, description: '1/4-28 METAL LOCKNUT' },
      { stockCode: 'MS35649-282', qty: 2, description: 'NUT HEX' },
      // Page 3
      { stockCode: 'NAS1149F0363P', qty: 24, description: 'REPLACES AN960-10' },
      { stockCode: 'NAS1149F0463P', qty: 16, description: 'REPLACES AN960-416' },
      { stockCode: 'WASHER-00025', qty: 8, description: 'PTFE .531x1.000x.010' },
      { stockCode: 'WASHER-00026', qty: 12, description: 'PTFE .531x1.000x.015' },
    ],
  },
  {
    stockCode: 'BAG 1022', qty: 1, description: 'SPRING/WASH, 10 FRONT SEAT HWR',
    contents: [
      { stockCode: 'CA-10003P', qty: 2, description: 'PIN, SEAT ADJUSTMENT' },
      { stockCode: 'MS27039-4-13', qty: 4, description: 'SCREW PAN HD' },
      { stockCode: 'NAS1149F0332P', qty: 8, description: 'REPLACES AN960-10L' },
      { stockCode: 'NAS1149F0432P', qty: 16, description: 'REPLACES AN960-416L' },
      { stockCode: 'NAS1149FN832P', qty: 8, description: 'REPLACES AN960-8' },
      { stockCode: 'SPRING-00008', qty: 2, description: 'Exten .359x1.75' },
      { stockCode: 'SPRING-00009', qty: 2, description: 'Comp .720x2.50' },
      { stockCode: 'SPRING-00010', qty: 2, description: 'Comp .480x1.50' },
    ],
  },
  {
    stockCode: 'BAG 1023', qty: 1, description: 'MISC HWR, 10 FRONT SEAT',
    contents: [
      { stockCode: 'BEARING-00001', qty: 4, description: 'SELF LUBRICATING BEARING' },
      { stockCode: 'BEARING-00002', qty: 8, description: 'SELF LUBRICATING BEARING' },
      { stockCode: 'BUSH-ST.250X.499X.375', qty: 8, description: 'STEEL BUSHING' },
      { stockCode: 'CA-10003T', qty: 2, description: 'CAP SPRING' },
      { stockCode: 'MS16562-33', qty: 2, description: 'ROLL PIN' },
      { stockCode: 'MS16562-47', qty: 2, description: 'ROLL PIN' },
      { stockCode: 'RIVET CR3213-4-2', qty: 86, description: 'CHERRY RIVET ROUND' },
    ],
  },
  {
    stockCode: 'BAG 1024', qty: 1, description: 'SCREWS HWR, 10 FRONT SEAT',
    contents: [
      { stockCode: 'MS27039-08-08', qty: 2, description: 'SCREW PAN HD' },
      { stockCode: 'MS27039-1-11', qty: 8, description: 'SCREW PAN HD' },
      { stockCode: 'MS27039-4-14', qty: 10, description: 'SCREW PAN HD' },
      { stockCode: 'MS27039-4-17', qty: 4, description: 'SCREW PAN HD' },
      { stockCode: 'MS27039-4-20', qty: 2, description: 'SCREW PAN HD' },
      { stockCode: 'MS35206-226', qty: 8, description: 'SCREW PAN HD' },
      { stockCode: 'MS35206-241', qty: 4, description: 'SCREW PAN HD' },
    ],
  },
  {
    stockCode: 'BAG 1025', qty: 1, description: 'HANDLE L/R, 10 FRONT SEAT',
    contents: [
      { stockCode: 'CA-10003U', qty: 2, description: 'HANDLE, SEAT ADJUSTMENT' },
    ],
  },
  {
    stockCode: 'BAG 1232', qty: 1, description: 'AN470AD4-5',
    contents: [
      { stockCode: 'AN470AD4-5', qty: 0.040, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1412', qty: 1, description: 'AN470AD4-6',
    contents: [
      { stockCode: 'AN470AD4-6', qty: 0.060, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },

  // Seat parts (individual items)
  { stockCode: 'CA-10003A-L B0', qty: 2, description: 'SEAT BOTTOM SIDE FRAME' },
  { stockCode: 'CA-10003A-R B0', qty: 2, description: 'SEAT BOTTOM SIDE FRAME' },
  { stockCode: 'CA-10003B AB', qty: 4, description: 'SEAT BOTTOM CROSS FRAME' },
  { stockCode: 'CA-10003C RB', qty: 8, description: 'RIB, SEAT BOTTOM' },
  { stockCode: 'CA-10003D', qty: 2, description: 'SEAT PAN' },
  { stockCode: 'CA-10003E 0D', qty: 8, description: 'SEAT TRACK SLIDE, UHMW' },
  { stockCode: 'CA-10003F-L', qty: 2, description: 'HOUSING, RECLINE' },
  { stockCode: 'CA-10003F-R', qty: 2, description: 'HOUSING, RECLINE' },
  { stockCode: 'CA-10003G', qty: 4, description: 'COVER, RECLINE HOUSING' },
  { stockCode: 'CA-10003H', qty: 4, description: 'LOCK, RECLINE' },
  { stockCode: 'CA-10003J', qty: 4, description: 'BRACKET, RECLINE' },
  { stockCode: 'CA-10003K-1', qty: 2, description: 'SEAT BACK WEB' },
  { stockCode: 'CA-10003M', qty: 2, description: 'SOCKET, RETURN SPRING' },
  // Page 4
  { stockCode: 'CA-10003N', qty: 2, description: 'HOUSING, SEAT ADJUSTMENT' },
  { stockCode: 'CA-10003V-L', qty: 1, description: 'HANDLE, RECLINE' },
  { stockCode: 'CA-10003V-R', qty: 1, description: 'HANDLE, RECLINE' },
  { stockCode: 'CA-10004A', qty: 2, description: 'RV-10 CUSHION' },
  { stockCode: 'CA-10004B', qty: 2, description: 'RV-10 CUSHION' },
  { stockCode: 'CA-10004C', qty: 2, description: 'RV-10 CUSHION' },
  { stockCode: 'CA-10004D', qty: 2, description: 'RV-10 CUSHION' },
  { stockCode: 'MANUAL-10 SECTION 49', qty: 1, description: 'FOR 10 FRONT SEAT KIT' },
  { stockCode: 'WD-00002 DA', qty: 2, description: 'TORQUE TUBE ASSEMBLY, RECLINE' },
  { stockCode: 'WD-00003-1', qty: 2, description: 'SEAT BACK FRAME' },

  // ── 10 SAFETY LATCH KIT ──────────────────────────────────
  { stockCode: '10 SAFETY LATCH KIT', qty: 1, description: 'SAFETY DOOR LATCH (2)' },

  {
    stockCode: 'BAG 542', qty: 1, description: 'SAFETY LATCH HWR',
    contents: [
      { stockCode: 'AN3-12', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN310-3', qty: 2, description: 'NUT, CASTLE 3/16' },
      { stockCode: 'AN426AD3-3.5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'C-1018', qty: 10, description: 'SAFETY LATCH' },
      { stockCode: 'C-1019', qty: 2, description: 'SFTY LATCH WEAR PLATE' },
      { stockCode: 'MS24665-132', qty: 2, description: 'COTTER PIN' },
      { stockCode: 'NAS1149F0332P', qty: 4, description: 'REPLACES AN960-10L' },
    ],
  },
  {
    stockCode: 'BAG 543', qty: 1, description: 'SAFETY LATCH HWR',
    contents: [
      { stockCode: 'AN426AD4-12', qty: 0.020, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'C-1020', qty: 1, description: 'LATCH ATTACH ANGLE' },
      { stockCode: 'NAS1149F0363P', qty: 4, description: 'REPLACES AN960-10' },
      { stockCode: 'RIVET CCR-264SS-3-2', qty: 8, description: '3/32 FLUSH SS' },
      { stockCode: 'RIVET LP4-3', qty: 30, description: 'POP RIVET' },
    ],
  },

  { stockCode: 'C-1021', qty: 1, description: 'LATCH DOUBLER ANGLE' },
  { stockCode: 'DOC 10 SAFETY LATCH', qty: 1, description: 'SECT 45A' },
  { stockCode: 'SPRING .032 WIREX18', qty: 1, description: 'MUSIC WIRE .032 X18" (C-1022)' },

  // ── 10A FINISH HARDWARE ───────────────────────────────────
  { stockCode: '10A FINISH HARDWARE', qty: 1, description: 'HARDWARE BAGS' },

  {
    stockCode: 'BAG 1002', qty: 1, description: 'MAGNET KIT',
    contents: [
      { stockCode: 'HW-00011', qty: 20, description: 'SPHERICAL MAGNET' },
      { stockCode: 'WASHER 5610-18-31', qty: 20, description: '#8 NYLON FLAT RETAINING WASHER' },
    ],
  },
  {
    stockCode: 'BAG 1111', qty: 1, description: 'AN426AD4-5',
    contents: [
      { stockCode: 'AN426AD4-5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1122', qty: 1, description: 'POP RIVET CCR264SS3-2',
    contents: [
      { stockCode: 'RIVET CCR-264SS-3-2', qty: 12, description: '3/32 FLUSH SS' },
    ],
  },
  {
    stockCode: 'BAG 1501', qty: 1, description: 'AN426AD3-3.5',
    contents: [
      { stockCode: 'AN426AD3-3.5', qty: 0.040, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1502', qty: 1, description: 'AN426AD3-4',
    contents: [
      { stockCode: 'AN426AD3-4', qty: 0.080, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1510', qty: 1, description: 'AN470AD3-4',
    contents: [
      { stockCode: 'AN470AD3-4', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1512', qty: 1, description: 'AN470AD4-5',
    contents: [
      { stockCode: 'AN470AD4-5', qty: 0.020, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1516', qty: 1, description: 'RIVET LP4-3',
    contents: [
      { stockCode: 'RIVET LP4-3', qty: 36, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1518', qty: 1, description: 'AN3/AN5 BOLTS',
    contents: [
      { stockCode: 'AN3-10A', qty: 4, description: 'AN BOLT' },
      // Page 5
      { stockCode: 'AN3-21A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN5-21A', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN5-24A', qty: 2, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1520', qty: 1, description: 'AN4 BOLTS',
    contents: [
      { stockCode: 'AN4-14A', qty: 6, description: 'AN BOLT' },
      { stockCode: 'AN4-15A', qty: 6, description: 'AN BOLT' },
      { stockCode: 'AN4-6A', qty: 10, description: 'AN BOLT' },
      { stockCode: 'AN4-7A', qty: 6, description: 'AN BOLT' },
      { stockCode: 'AN4H4A', qty: 4, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1522', qty: 1, description: 'AN6/AN7 BOLTS',
    contents: [
      { stockCode: 'AN6-22A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN6-23', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN6-23A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN6-25A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN6-65A', qty: 1, description: 'AN BOLT: RV-10/14 NOSE WHEEL' },
      { stockCode: 'AN7-22', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN7-26', qty: 1, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1523', qty: 1, description: 'SCREWS 632/832',
    contents: [
      { stockCode: 'AN507C632R8', qty: 40, description: 'SCREW, FLT HD SS' },
      { stockCode: 'AN507C832R8', qty: 20, description: 'SCREW, FLT HD SS' },
    ],
  },
  {
    stockCode: 'BAG 1524', qty: 1, description: 'MISC. NUTS',
    contents: [
      { stockCode: 'AN310-6', qty: 2, description: 'NUT, CASTLE 3/8' },
      { stockCode: 'AN310-7', qty: 3, description: 'NUT, CASTLE 7/16' },
      { stockCode: 'AN365-428', qty: 25, description: 'NUT, STOP 1/4-28' },
      { stockCode: 'AN365-524', qty: 5, description: '5/16-24 LOCK NUT' },
      { stockCode: 'AN365-624A', qty: 3, description: 'NUT, STOP 3/8-24' },
    ],
  },
  {
    stockCode: 'BAG 1525', qty: 1, description: 'SCREWS: FLATHEAD',
    contents: [
      { stockCode: 'AN509-10R11', qty: 22, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN509-10R13', qty: 8, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN509-10R14', qty: 8, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN509-10R16', qty: 20, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN509-8R14', qty: 2, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN509-8R8', qty: 2, description: 'SCREW, FLT HD STRUCT' },
    ],
  },
  {
    stockCode: 'BAG 1526-1', qty: 1, description: 'SCREWS SS 632/832/SMS',
    contents: [
      { stockCode: 'AN526-8R12', qty: 2, description: 'SCREW, TRUSS HD' },
      { stockCode: 'AN526C632R8', qty: 4, description: 'SCREW, TRUSS HD SS' },
      { stockCode: 'AN526C832R8', qty: 48, description: 'SCREW, TRUSS HD SS' },
      { stockCode: 'SCREW #6X1/2 SS SMS', qty: 8, description: '100 DG FLT HD SS SMS' },
    ],
  },
  {
    stockCode: 'BAG 1527', qty: 1, description: 'NUTS: 10-32',
    contents: [
      { stockCode: 'AN365-1032', qty: 48, description: 'NUT, STOP' },
      { stockCode: 'MS21042-3', qty: 16, description: '10-32 METAL LOCK NUT' },
    ],
  },
  {
    stockCode: 'BAG 1528', qty: 1, description: 'HOSE CLAMPS',
    contents: [
      { stockCode: 'HW-00018', qty: 5, description: 'DYNAFLO #28 SS HOSE CLAMP 1.25-2.' },
    ],
  },
  {
    stockCode: 'BAG 1529', qty: 1, description: 'MISC. LARGE WASHERS',
    contents: [
      { stockCode: 'NAS1149F0432P', qty: 12, description: 'REPLACES AN960-416L' },
      { stockCode: 'NAS1149F0463P', qty: 40, description: 'REPLACES AN960-416' },
      { stockCode: 'NAS1149F0563P', qty: 25, description: 'REPLACES AN960-516' },
      { stockCode: 'NAS1149F0632P', qty: 5, description: 'REPLACES AN960-616L' },
      // Page 6
      { stockCode: 'NAS1149F0663P', qty: 6, description: 'REPLACES AN960-616' },
      { stockCode: 'NAS1149F0763P', qty: 4, description: 'REPLACES AN960-716' },
    ],
  },
  {
    stockCode: 'BAG 1530', qty: 1, description: 'MISC. SMALL WASHERS',
    contents: [
      { stockCode: 'NAS1149F0363P', qty: 60, description: 'REPLACES AN960-10' },
      { stockCode: 'NAS1149FN632P', qty: 14, description: 'REPLACES AN960-6' },
      { stockCode: 'NAS1149FN832P', qty: 2, description: 'REPLACES AN960-8' },
    ],
  },
  {
    stockCode: 'BAG 1531', qty: 1, description: 'COWL CAMLOCKS',
    contents: [
      { stockCode: 'HW 212-12', qty: 2, description: 'PLATENUT (COWL)' },
      { stockCode: 'HW 2600-3W', qty: 2, description: 'CAMLOCK FSTNR (COWL)' },
      { stockCode: 'HW 2600-LW', qty: 2, description: 'LOCKWASHER (COWL)' },
    ],
  },
  {
    stockCode: 'BAG 1532', qty: 1, description: 'MISC PLATENUTS',
    contents: [
      { stockCode: 'K1000-3', qty: 4, description: 'PLATENUT 10-32 MS21047L3' },
      { stockCode: 'MS21045-5', qty: 1, description: '5/16-24 METAL LCK NUT' },
    ],
  },
  {
    stockCode: 'BAG 1533', qty: 1, description: 'K1000-06 PLATENUTS',
    contents: [
      { stockCode: 'K1000-06', qty: 40, description: '6-32 PLATENUT "FIGURE 8 SHAPE"' },
    ],
  },
  {
    stockCode: 'BAG 1534', qty: 1, description: 'K1000-08 PLATENUTS',
    contents: [
      { stockCode: 'K1000-08', qty: 60, description: 'PLATENUT 8-32 Kaynar' },
    ],
  },
  {
    stockCode: 'BAG 1535-1', qty: 1, description: 'AXLE HWR',
    contents: [
      { stockCode: 'HW LP24693C296', qty: 2, description: 'LOCKING 1/4-28 SCREW' },
      { stockCode: 'MS15002-1', qty: 1, description: 'ZERK GREASE FITTING' },
      { stockCode: 'MS16562-42', qty: 4, description: 'ROLL PIN' },
      { stockCode: 'MS20392-1C15', qty: 4, description: 'CLEVIS PIN' },
      { stockCode: 'MS21025-24', qty: 1, description: 'AXLE NUT 1.5"' },
      { stockCode: 'MS24665-360', qty: 3, description: 'COTTER PIN MAIN GEAR' },
      { stockCode: 'SCREW 3/8-24X1 3/4', qty: 2, description: 'SHCS 3/8-24x1 3/4' },
    ],
  },
  {
    stockCode: 'BAG 1536', qty: 1, description: 'MISC. HI TEMP STOPNUT',
    contents: [
      { stockCode: 'MS21042-06', qty: 2, description: '6-32 METAL LOCK NUT' },
      { stockCode: 'MS21042-08', qty: 4, description: '8-32 METAL LOCK NUT' },
      { stockCode: 'MS21045-6', qty: 7, description: '3/8- LOCK NUT' },
    ],
  },
  {
    stockCode: 'BAG 1539-1', qty: 1, description: 'COTTER PINS',
    contents: [
      { stockCode: 'MS24665-153', qty: 2, description: 'COTTER PIN' },
      { stockCode: 'MS24665-208', qty: 6, description: 'COTTER PIN - CLEVIS' },
      { stockCode: 'MS24665-283', qty: 5, description: 'COTTER PIN 3/8 BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1541', qty: 1, description: 'NOSE GEAR HWR',
    contents: [
      { stockCode: 'K2750-0-219', qty: 2, description: 'BELLVILLE WASHER' },
      { stockCode: 'NAS517-5-9', qty: 2, description: 'SCREW' },
      { stockCode: 'SCREW 5/16-24X3/4', qty: 2, description: 'SOCKET HEAD CAP SCREW' },
    ],
  },
  {
    stockCode: 'BAG 1542', qty: 1, description: 'WASHERS',
    contents: [
      { stockCode: 'WASHER 062 25783054', qty: 2, description: 'HARDENED GR. 8 WASHER' },
      { stockCode: 'WASHER 5610-18-31', qty: 40, description: '#8 NYLON FLAT RETAINING WASHER' },
      { stockCode: 'WASHER 5710-243-060', qty: 1, description: 'FOR RV-10 NOSE WHEEL' },
      { stockCode: 'WASHER LOCK 3/8', qty: 2, description: '3/8" LOCKWASHER' },
      { stockCode: 'WASHER-00017', qty: 6, description: '.375x.750x.090' },
    ],
  },
  {
    stockCode: 'BAG 1545', qty: 1, description: 'MISC. HARDWARE',
    contents: [
      { stockCode: 'BUSH-F-ST438X750X1.32', qty: 2, description: 'BUSHING, FLANGED STEEL' },
      { stockCode: 'C-1006A', qty: 2, description: 'HANDLE PLATE' },
      { stockCode: 'C-1006B', qty: 2, description: 'HANDLE PIVOT' },
      { stockCode: 'C-1006C', qty: 2, description: 'HANDLE PIVOT' },
      // Page 7
      { stockCode: 'C-1006D', qty: 2, description: 'HANDLE FACEPLATE' },
      { stockCode: 'C-1014', qty: 2, description: 'HANDLE SPUR GEAR' },
      { stockCode: 'F-1001Y', qty: 1, description: 'COWL UPPER PIN RETAIN' },
      { stockCode: 'F-1001Z', qty: 1, description: 'FILLER PLATE' },
      { stockCode: 'SPRING-00003', qty: 1, description: '1.40X2.25 COMP SPRING' },
      { stockCode: 'U-01420-1', qty: 1, description: 'CAP, LINK ASSEMBLY' },
      { stockCode: 'U-1002', qty: 2, description: 'ISOLATOR WASHER' },
      { stockCode: 'U-1005', qty: 2, description: 'SPACER' },
    ],
  },
  {
    stockCode: 'BAG 1546', qty: 1, description: 'MISC. HARDWARE',
    contents: [
      { stockCode: 'AT6-058X3/8X4', qty: 3, description: 'ALUM TUBE (INCHES)' },
      { stockCode: 'AT6-058X5/16X4', qty: 2, description: 'ALUM TUBE x 4"' },
      { stockCode: 'BUSH-ST 375X750X1.563', qty: 2, description: 'STEEL BUSHING' },
      { stockCode: 'C-1007', qty: 2, description: 'HANDLE SLIDE' },
      { stockCode: 'C-656', qty: 2, description: 'EXTERIOR CANOPY HANDL' },
      { stockCode: 'MS21025-20', qty: 1, description: 'CASTLE NUT 1 1/4' },
      { stockCode: 'ST4130-058X3/8X4', qty: 1, description: 'STEEL TUBE (INCHES)' },
      { stockCode: 'U-00711', qty: 1, description: 'SPACER, AXLE' },
      { stockCode: 'U-00712', qty: 1, description: 'AXLE NUT PIN' },
      { stockCode: 'U-1021', qty: 8, description: 'SHOULDER BUSHING' },
      { stockCode: 'SR4130-1/2', qty: 0.180, description: '1/2" ROUND STEEL ROD' },
      { stockCode: 'VA-143', qty: 1, description: 'BUSHING' },
      { stockCode: 'VA-197', qty: 2, description: 'SS SPRING 5/8 X 2.5 COMPR' },
    ],
  },
  {
    stockCode: 'BAG 1547', qty: 1, description: 'MISC. HARDWARE',
    contents: [
      { stockCode: 'C-1009', qty: 2, description: 'PIN BLOCK' },
      { stockCode: 'C-1010', qty: 4, description: 'CABIN PIN BLOCK' },
      { stockCode: 'C-1013', qty: 2, description: 'DOOR STRUT ATACH BRKT' },
      { stockCode: 'C-1015', qty: 2, description: 'HANDLE SLIDE CAP' },
      { stockCode: 'C-1017', qty: 2, description: 'PIN BLOCK' },
    ],
  },
  {
    stockCode: 'BAG 1548', qty: 1, description: 'MISC. HARDWARE',
    contents: [
      { stockCode: 'AB3-3/4X1 1/2X1.188', qty: 2, description: 'ALUM BAR' },
      { stockCode: 'WD-1018-L', qty: 2, description: 'CABIN HINGE' },
      { stockCode: 'WD-1018-R', qty: 2, description: 'CABIN HINGE' },
      { stockCode: 'WD-1019-L', qty: 2, description: 'CABIN DOOR HINGE' },
      { stockCode: 'WD-1019-R', qty: 2, description: 'CABIN DOOR HINGE' },
    ],
  },
  {
    stockCode: 'BAG 1934', qty: 1, description: 'AN426AD3-5',
    contents: [
      { stockCode: 'AN426AD3-5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 805', qty: 1, description: 'AN426AD3-4.5',
    contents: [
      { stockCode: 'AN426AD3-4.5', qty: 0.030, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },

  // ── SPINNER HARDWARE ──────────────────────────────────────
  {
    stockCode: 'BAG 924-3', qty: 1, description: 'C/S SPINNER HARDWARE',
    contents: [
      { stockCode: 'AN426AD3-4', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'AN470AD4-5', qty: 0.020, description: 'UNIVERSAL HEAD RIVETS (LB)' },
      { stockCode: 'AN4H4A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN526C832R8', qty: 22, description: 'SCREW, TRUSS HD SS' },
      { stockCode: 'K1000-08', qty: 22, description: 'PLATENUT 8-32 Kaynar' },
      { stockCode: 'NAS1149F0463P', qty: 12, description: 'REPLACES AN960-416' },
      { stockCode: 'WASHER 5610-18-31', qty: 22, description: '#8 NYLON FLAT RETAINING WASHER' },
    ],
  },
  {
    stockCode: 'BAG 945', qty: 1, description: 'ADDED SPINNER HWDRE',
    contents: [
      { stockCode: 'AN426AD4-5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      // Page 8
      { stockCode: 'AN526C832R8', qty: 24, description: 'SCREW, TRUSS HD SS' },
      { stockCode: 'WASHER 5610-18-31', qty: 24, description: '#8 NYLON FLAT RETAINING WASHER' },
    ],
  },

  // ── INDIVIDUAL PARTS / PLANS ──────────────────────────────
  { stockCode: '10A PLANS FINISH', qty: 1, description: 'PLANS & MANUAL' },
  { stockCode: "AN257-P3X6'", qty: 2, description: "HINGE X 6'" },
  { stockCode: 'AS3-020X1/2X48', qty: 2, description: 'WINGTIP BACK STRIP' },
  { stockCode: 'C-1002A-L', qty: 1, description: 'CABIN DOOR OUTR.SHELL' },
  { stockCode: 'C-1002A-R', qty: 1, description: 'CABIN DOOR OUTR.SHELL' },
  { stockCode: 'C-1002B-L', qty: 1, description: 'CABIN DOOR INER.SHELL' },
  { stockCode: 'C-1002B-R', qty: 1, description: 'CABIN DOOR INER.SHELL' },
  { stockCode: 'C-1003-L SC-15', qty: 1, description: 'LEFT DOOR WINDOW, LOW UV' },
  { stockCode: 'C-1003-R SC-15', qty: 1, description: 'RIGHT DOOR WINDOW, LOW UV' },
  { stockCode: 'COWL, 10 BOT.IO-540', qty: 1, description: 'COWL BOTTOM' },
  { stockCode: 'COWL, 10 TOP IO-540', qty: 1, description: 'COWL TOP' },
  { stockCode: 'DOC SPINNER', qty: 1, description: 'DWG C-4' },
  { stockCode: "HINGE PIANO 063X3'", qty: 1, description: 'LEG FAIRING HINGE ALL' },
  { stockCode: "HINGE PIANO 063X6'", qty: 1, description: '063 PIANO HINGE' },
  { stockCode: "RUBBER DOOR SEALX25'", qty: 1, description: 'VA-198 DOOR SEAL' },
  { stockCode: 'S-601-1', qty: 1, description: 'FG SPINNER BOWL 13"' },
  { stockCode: 'S-602-1', qty: 1, description: 'FP,CS,SEN 13"BACK PLT' },
  { stockCode: 'S-602B', qty: 1, description: 'CS BACK PLT DOUBLER' },
  { stockCode: 'S-603', qty: 1, description: 'FRONT BLKHD CS 7 7/8"' },
  { stockCode: "SSP-090X6'", qty: 1, description: 'STAINLESS STEEL PIN' },
  { stockCode: "SSP-120X6'", qty: 1, description: 'STAINLESS STEEL PIN' },
  { stockCode: 'U-00022', qty: 2, description: 'SPACER, ELASTOMER' },
  { stockCode: 'U-01407', qty: 1, description: 'PAD ELASTOMER' },
  { stockCode: 'U-1001-L-PC', qty: 1, description: 'MAIN GEAR LEG' },
  { stockCode: 'U-1001-R-PC', qty: 1, description: 'MAIN GEAR LEG' },
  { stockCode: 'U-1013A', qty: 1, description: 'WHL.FAIR.NOSE FRONT' },
  { stockCode: 'U-1013B', qty: 1, description: 'WHL.FAIR.NOSE REAR' },
  { stockCode: 'U-1019-L', qty: 1, description: 'LWR.INTERSECT.FAIRING' },
  { stockCode: 'U-1019-R', qty: 1, description: 'LWR.INTERSECT.FAIRING' },
  { stockCode: 'U-1020-L', qty: 1, description: 'UPR.INTERSECT.FAIRING' },
  { stockCode: 'U-1020-R', qty: 1, description: 'UPR.INTERSECT.FAIRING' },
  { stockCode: 'U-1057A', qty: 2, description: 'MAIN WHL.FAIRNG.FRONT' },
  { stockCode: 'U-1057B', qty: 2, description: 'MAIN WHL.FAIRING REAR' },
  { stockCode: "VENT SCAT 2X6'", qty: 1, description: 'SCAT TUBE X 6 FT' },
  { stockCode: 'VENT SV-10', qty: 2, description: 'VENT FRESH AIR' },
  { stockCode: 'WD-01001-D1-1', qty: 1, description: '10 ENGINE MOUNT COATED' },
  { stockCode: 'WD-1016-1', qty: 1, description: 'LINK, ASSY. NOSE GEAR COATED' },
  { stockCode: 'WD-1017-1-PC', qty: 1, description: 'NOSE GEAR STRUT RV-10' },
];
