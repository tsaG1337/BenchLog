/**
 * Van's RV-10 Empennage Kit — Packing List
 * Source: Empennage_Packing_list.pdf (7 pages)
 * Order Date: 10/22/25 | Ship Date: 11/20/25 | Purchase Order: EMP
 *
 * Format: Each top-level entry is a BAG or SUB-KIT.
 * `contents` lists the individual items inside that bag/sub-kit.
 * Quantities for rivets sold by weight (LB) are noted in description.
 */

export interface PackingListItem {
  stockCode: string;
  qty: number;
  description: string;
}

export interface PackingListBag {
  stockCode: string;
  qty: number;
  description: string;
  contents: PackingListItem[];
}

export const EMPENNAGE_PACKING_LIST: (PackingListItem | PackingListBag)[] = [
  // ════════════════════════════════════════════════════════════
  // TOP-LEVEL: RV-10 EMP/CONE KIT
  // ════════════════════════════════════════════════════════════

  // ── 10A EMP/CONE HARDWARE ──────────────────────────────────
  {
    stockCode: 'BAG 1001', qty: 1, description: 'MISC EMP HDWRE',
    contents: [
      { stockCode: 'E-910', qty: 4, description: 'ELEV HINGE REINF PLTE' },
      { stockCode: 'E-917', qty: 1, description: 'OUTBD TRIM TAB HORN' },
      { stockCode: 'E-918', qty: 1, description: 'INBD TRIM TAB HORN' },
      { stockCode: 'E-921', qty: 2, description: 'ELEVATOR GUSSET 9/10' },
      { stockCode: 'E-DRILL BUSHING', qty: 1, description: 'DRILL BUSHING' },
      { stockCode: 'HS-911-PC', qty: 2, description: 'HORIZONTAL HINGE BRKT' },
      { stockCode: 'HS-912-PC', qty: 8, description: 'HORIZONTAL HINGE BRKT' },
      { stockCode: 'R-607PP', qty: 1, description: 'RUDDER RE-INF PLATE' },
      { stockCode: 'R-608PP', qty: 1, description: 'RUDDER RE-INF PLATE' },
      { stockCode: 'VS-01010-1-PC', qty: 1, description: 'HINGE BRKT RUDR BOTM' },
      { stockCode: 'VS-1011-PC', qty: 2, description: 'MID RUDR HINGE BRAKET' },
      { stockCode: 'VS-1012-PC', qty: 2, description: 'TOP RUDR HINGE BRAKET' },
      { stockCode: 'WD-415-1', qty: 2, description: 'TRIM CABLE ANCHOR' },
    ],
  },

  // ── RIVET BAGS ─────────────────────────────────────────────
  {
    stockCode: 'BAG 1101', qty: 1, description: 'AN426AD3-3',
    contents: [
      { stockCode: 'AN426AD3-3', qty: 0.070, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1102', qty: 1, description: 'AN426AD3-3.5',
    contents: [
      { stockCode: 'AN426AD3-3.5', qty: 0.550, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1103', qty: 1, description: 'AN426AD3-4',
    contents: [
      { stockCode: 'AN426AD3-4', qty: 0.200, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1104', qty: 1, description: 'AN426AD3-4.5',
    contents: [
      { stockCode: 'AN426AD3-4.5', qty: 0.050, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1105', qty: 1, description: 'AN426AD3-5',
    contents: [
      { stockCode: 'AN426AD3-5', qty: 0.020, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1106', qty: 1, description: 'AN426AD3-6',
    contents: [
      { stockCode: 'AN426AD3-6', qty: 0.040, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  // Page 2
  {
    stockCode: 'BAG 1108', qty: 1, description: 'AN470AD4-9',
    contents: [
      { stockCode: 'AN470AD4-9', qty: 0.020, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1109', qty: 1, description: 'AN470AD4-10',
    contents: [
      { stockCode: 'AN470AD4-10', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1110', qty: 1, description: 'AN426AD4-4',
    contents: [
      { stockCode: 'AN426AD4-4', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1111', qty: 1, description: 'AN426AD4-5',
    contents: [
      { stockCode: 'AN426AD4-5', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1115', qty: 1, description: 'AN470AD3-4',
    contents: [
      { stockCode: 'AN470AD3-4', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1117', qty: 1, description: 'AN470AD4-4',
    contents: [
      { stockCode: 'AN470AD4-4', qty: 0.210, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1118', qty: 1, description: 'AN470AD4-5',
    contents: [
      { stockCode: 'AN470AD4-5', qty: 0.110, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1119', qty: 1, description: 'AN470AD4-6',
    contents: [
      { stockCode: 'AN470AD4-6', qty: 0.100, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1120', qty: 1, description: 'AN470AD4-7',
    contents: [
      { stockCode: 'AN470AD4-7', qty: 0.080, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },
  // Pop rivets
  {
    stockCode: 'BAG 1122', qty: 1, description: 'POP RIVET CCR264SS3-2',
    contents: [
      { stockCode: 'RIVET CCR-264SS-3-2', qty: 12, description: '3/32 FLUSH SS' },
    ],
  },
  {
    stockCode: 'BAG 1123', qty: 1, description: 'POP RIVET AD-41-ABS',
    contents: [
      { stockCode: 'RIVET AD-41-ABS', qty: 95, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1124', qty: 1, description: 'POP RIVET CS4-4',
    contents: [
      { stockCode: 'RIVET CS4-4', qty: 270, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1125-1', qty: 1, description: 'POP RIVET LP4-3',
    contents: [
      { stockCode: 'RIVET LP4-3', qty: 225, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1126', qty: 1, description: 'POP RIVET MK-319-BS',
    contents: [
      { stockCode: 'RIVET MK-319-BS', qty: 12, description: 'POP RIVET' },
    ],
  },
  {
    stockCode: 'BAG 1127', qty: 1, description: 'POP RIVET MSP-42',
    contents: [
      { stockCode: 'RIVET MSP-42', qty: 16, description: 'POP RIVET' },
    ],
  },

  // ── PLATE NUT BAGS ─────────────────────────────────────────
  {
    stockCode: 'BAG 1130', qty: 1, description: 'K1000-06/-6 PLATENUTS',
    contents: [
      { stockCode: 'K1000-06', qty: 40, description: '6-32 PLATENUT "FIGURE 8 SHAPE"' },
      { stockCode: 'K1000-6', qty: 7, description: 'PLATENUT 3/8-24 MS21047L6' },
    ],
  },
  {
    stockCode: 'BAG 1131', qty: 1, description: 'K1000-08/-4 PLATENUTS',
    contents: [
      { stockCode: 'K1000-08', qty: 52, description: 'PLATENUT 8-32 KAYNAR' },
      { stockCode: 'K1000-4', qty: 4, description: 'PLATENUT 1/4-28' },
    ],
  },
  {
    stockCode: 'BAG 1132-1', qty: 1, description: 'PLATENUTS',
    contents: [
      { stockCode: 'K1000-3', qty: 16, description: 'PLATENUT 10-32 MS21047L3' },
      { stockCode: 'K1100-06', qty: 25, description: 'PLATENUT SCREW HOLE DIMPLED 6-32' },
      { stockCode: 'MS21051-L08', qty: 4, description: '832 SINGLE LUG P/NUT' },
    ],
  },

  // ── BUSHING BAGS ───────────────────────────────────────────
  {
    stockCode: 'BAG 1133-1', qty: 1, description: 'BUSHINGS SB625-7/-8',
    contents: [
      { stockCode: 'BUSHING SB625-7', qty: 10, description: 'SNAP-IN 7/16ID 5/8 OD' },
      { stockCode: 'BUSHING SB625-8', qty: 6, description: 'SNAP-IN 1/2ID 5/8 OD' },
    ],
  },

  // ── SCREW BAGS ─────────────────────────────────────────────
  {
    stockCode: 'BAG 1134', qty: 1, description: 'AN507-6R6 SCREWS',
    contents: [
      { stockCode: 'AN507-6R6', qty: 36, description: 'SCREW, FLT HD' },
    ],
  },
  {
    stockCode: 'BAG 1135', qty: 1, description: 'AN507C632R8 SCREWS',
    contents: [
      { stockCode: 'AN507C632R8', qty: 36, description: 'SCREW, FLT HD SS' },
    ],
  },
  {
    stockCode: 'BAG 1136', qty: 1, description: 'AN509-8R/10R AN515-6R SCREWS',
    contents: [
      { stockCode: 'AN509-10R11', qty: 2, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN509-8R11', qty: 4, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN509-8R12', qty: 2, description: 'SCREW, FLT HD STRUCT' },
      { stockCode: 'AN515-6R8', qty: 4, description: '632X1/2 PAN HEAD SCREW' },
    ],
  },
  {
    stockCode: 'BAG 1137', qty: 1, description: 'AN515-8R8 SCREWS',
    contents: [
      { stockCode: 'AN515-8R8', qty: 55, description: '832X1/2 PAN HEAD SCREW' },
    ],
  },

  // ── BOLT BAGS ──────────────────────────────────────────────
  {
    stockCode: 'BAG 1138-1', qty: 1, description: 'MISC AN3 BOLTS',
    contents: [
      { stockCode: 'AN3-10A', qty: 10, description: 'AN BOLT' },
      { stockCode: 'AN3-11A', qty: 4, description: 'AN BOLT' },
      { stockCode: 'AN3-12A', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN3-13A', qty: 5, description: 'AN BOLT' },
      { stockCode: 'AN3-4A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN3-5A', qty: 36, description: 'AN BOLT' },
      { stockCode: 'AN3-6', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN3-6A', qty: 18, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1139', qty: 1, description: 'MISC HARDWARE',
    contents: [
      { stockCode: 'AN665-21R', qty: 2, description: 'CLEVIS ROD END' },
      { stockCode: 'MS20392-1C11', qty: 2, description: 'CLEVIS PIN' },
      { stockCode: 'MS20392-2C11', qty: 2, description: 'CLEVIS PIN' },
      { stockCode: 'MS24665-132', qty: 5, description: 'COTTER PIN' },
      { stockCode: 'NAS1149FN416P', qty: 5, description: 'REPLACES AN960-4L' },
    ],
  },
  {
    stockCode: 'BAG 1140-1', qty: 1, description: 'MISC AN4 BOLTS',
    contents: [
      { stockCode: 'AN4-11A', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN4-13A', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN4-14A', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN4-4A', qty: 2, description: 'AN BOLT' },
      { stockCode: 'AN4-5', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN4-6', qty: 1, description: 'AN BOLT' },
      { stockCode: 'AN4-7A', qty: 2, description: 'AN BOLT' },
    ],
  },
  {
    stockCode: 'BAG 1141', qty: 1, description: 'MISC HARDWARE',
    contents: [
      { stockCode: 'AN315-3R', qty: 5, description: 'NUT, JAM 3/16' },
      { stockCode: 'BEARING MW-3M', qty: 2, description: 'ROD END THROTTLE CABL' },
    ],
  },
  {
    stockCode: 'BAG 1142', qty: 1, description: 'AN365-832/-428 MS21042-3/-08 NUTS',
    contents: [
      { stockCode: 'AN365-428', qty: 4, description: 'NUT, STOP 1/4-28' },
      { stockCode: 'AN365-632A', qty: 4, description: 'NUT, STOP 6-32' },
      { stockCode: 'MS21042-08', qty: 4, description: '8-32 METAL LOCK NUT' },
      { stockCode: 'MS21042-3', qty: 2, description: '10-32 METAL LOCK NUT' },
    ],
  },
  {
    stockCode: 'BAG 1143', qty: 1, description: 'AN365-1032 NUTS',
    contents: [
      { stockCode: 'AN365-1032', qty: 62, description: 'NUT, STOP' },
    ],
  },
  {
    stockCode: 'BAG 1144', qty: 1, description: 'AN316-6/310-3/310-4',
    contents: [
      { stockCode: 'AN310-3', qty: 2, description: 'NUT, CASTLE 3/16' },
      { stockCode: 'AN310-4', qty: 2, description: 'NUT, CASTLE 1/4' },
      { stockCode: 'AN316-6R', qty: 9, description: 'NUT, THIN JAM 3/8' },
    ],
  },

  // ── BEARING/ROD END BAG ────────────────────────────────────
  {
    stockCode: 'BAG 1145', qty: 1, description: 'MD3614M/MD3616M/VA-146',
    contents: [
      { stockCode: 'BEARING MD3614M', qty: 7, description: '3/16 X 3/8 ROD END' },
      { stockCode: 'BEARING MD3616M', qty: 2, description: '3/16X3/8M LONG RD END' },
      { stockCode: 'VA-146', qty: 2, description: 'FLANGE BEARING' },
    ],
  },

  // ── WASHER BAGS ────────────────────────────────────────────
  {
    stockCode: 'BAG 1146', qty: 1, description: 'AN960-8/-416 WASHERS',
    contents: [
      { stockCode: 'NAS1149F0432P', qty: 4, description: 'REPLACES AN960-416L' },
      { stockCode: 'NAS1149F0463P', qty: 16, description: 'REPLACES AN960-416' },
      { stockCode: 'NAS1149FN832P', qty: 24, description: 'REPLACES AN960-8' },
    ],
  },
  {
    stockCode: 'BAG 1147', qty: 1, description: 'AN960-10/-10L WASHERS',
    contents: [
      { stockCode: 'NAS1149F0332P', qty: 10, description: 'REPLACES AN960-10L' },
      { stockCode: 'NAS1149F0363P', qty: 104, description: 'REPLACES AN960-10' },
    ],
  },
  {
    stockCode: 'BAG 1148-1', qty: 1, description: 'COTTER PINS AND CUSHION CLAMPS',
    contents: [
      { stockCode: 'MS21919WDG6', qty: 2, description: 'CUSHION CLAMP 3/8' },
      { stockCode: 'MS24665-132', qty: 2, description: 'COTTER PIN' },
      { stockCode: 'MS24665-208', qty: 2, description: 'COTTER PIN - CLEVIS' },
    ],
  },
  {
    stockCode: 'BAG 1149', qty: 1, description: 'MISC EMP/CONE PARTS',
    contents: [
      { stockCode: 'AS3-063X0.5X1.4375', qty: 1, description: 'AL SHEET' },
      { stockCode: 'F-1085', qty: 1, description: 'RUDDER CABLE BRACKET' },
      { stockCode: 'F-1095B', qty: 1, description: 'TRIM BELLCRANK' },
      { stockCode: 'F-1095D', qty: 2, description: 'TRIM SERVO LINK' },
      { stockCode: 'F-1095E', qty: 2, description: 'TRIM SERVO LINK SPACR' },
      { stockCode: 'F-1095F', qty: 1, description: 'TRIM SERVO SPACER' },
      { stockCode: 'F-636', qty: 2, description: 'SHOULDER HARN ANCHOR' },
      { stockCode: 'PS UHMW-125X1/2X2', qty: 2, description: 'PLASTIC STRIP' },
      { stockCode: 'PS UHMW-125X1X2', qty: 2, description: 'PLASTIC STRIP F-6114C' },
      { stockCode: 'R-01007A-1', qty: 2, description: 'PLATE, STRIKER' },
      { stockCode: 'R-01007B-1', qty: 2, description: 'STOP, RUDDER' },
    ],
  },
  {
    stockCode: 'WASHER 5702-475-48 Z3', qty: 2, description: '.190X.562X.048 WASHER',
    contents: [],
  },
  {
    stockCode: 'WASHER 5702-95-30', qty: 4, description: 'STEEL WASHER FOR AN4',
    contents: [],
  },

  // ── BAG 1150-1 (misc emp parts) ────────────────────────────
  {
    stockCode: 'BAG 1150-1', qty: 1, description: 'EMPENNAGE PARTS',
    contents: [
      { stockCode: 'E-1017', qty: 1, description: 'RIGHT TRIM TAB HORN' },
      { stockCode: 'E-1018', qty: 1, description: 'RIGHT INBD TRIM HORN' },
      { stockCode: 'E-1022', qty: 1, description: 'ELEV TRIM SPAR CLIP' },
      { stockCode: 'VS-1017', qty: 1, description: 'HINGE DOUBLER' },
    ],
  },
  {
    stockCode: 'BAG 1151', qty: 1, description: 'THREADED INSERTS, VA-101',
    contents: [
      { stockCode: 'VA-101', qty: 2, description: 'THREADED INSERT' },
    ],
  },

  // ── ADDITIONAL RIVET BAGS (page 4) ─────────────────────────
  {
    stockCode: 'BAG 1230', qty: 1, description: 'AN426AD4-8',
    contents: [
      { stockCode: 'AN426AD4-8', qty: 0.010, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1906', qty: 1, description: 'AN426AD4-6',
    contents: [
      { stockCode: 'AN426AD4-6', qty: 0.020, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 1907', qty: 1, description: 'AN426AD4-7',
    contents: [
      { stockCode: 'AN426AD4-7', qty: 0.020, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
    ],
  },
  {
    stockCode: 'BAG 822', qty: 1, description: 'AN470AD4-8',
    contents: [
      { stockCode: 'AN470AD4-8', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #1 (E1B)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #1', qty: 1, description: 'E1B',
    contents: [
      { stockCode: 'AS3-125X1X13', qty: 1, description: 'ALUM SHEET' },
      { stockCode: 'E-913', qty: 2, description: 'ELEVATOR C.BAL.SKIN' },
      { stockCode: 'F-1011B', qty: 1, description: 'STOP/DOUBLER' },
      { stockCode: 'F-1011C', qty: 2, description: 'HORIZ STAB ATTACH BAR' },
      { stockCode: 'F-1079', qty: 1, description: 'TAIL AFT BOTTOM SKIN' },
      { stockCode: 'F-635', qty: 1, description: 'ELEV BELCRK (SET OF 2)' },
      { stockCode: 'HS-1004', qty: 8, description: 'HORIZ STAB INSPAR RIB' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #2 (E1B)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #2', qty: 1, description: 'E1B',
    contents: [
      { stockCode: 'E-1015', qty: 1, description: 'RIGHT ELEV TRIM BRAKT' },
      { stockCode: 'E-615PP', qty: 1, description: 'ELEV TRIM MNTG PLATE' },
      { stockCode: 'F-1006A', qty: 1, description: 'FUSELAGE BULKHEAD' },
      { stockCode: 'F-1006B', qty: 1, description: 'FUSELAGE BULKHEAD' },
      { stockCode: 'F-1006C', qty: 1, description: 'FUSELAGE BULKHEAD' },
      { stockCode: 'F-1006D', qty: 1, description: 'FUSELAGE BULKHEAD' },
      { stockCode: 'F-1009', qty: 1, description: 'FUSELAGE FRAME' },
      { stockCode: 'F-1029-L', qty: 1, description: 'BELLCRANK RIB' },
      { stockCode: 'F-1029-R', qty: 1, description: 'BELLCRANK RIB' },
      { stockCode: 'VS-1004', qty: 1, description: 'V-STAB LOWER RIB' },
      { stockCode: 'VS-1005', qty: 1, description: 'VERT STAB NOSE RIB' },
      { stockCode: 'VS-1013', qty: 1, description: 'V-STAB MID NOSE RIB' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #3 (E1B)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #3', qty: 1, description: 'E1B',
    contents: [
      { stockCode: 'F-1006E', qty: 1, description: 'UPPER BAGGAGE BLKHD' },
      { stockCode: 'F-1006F', qty: 1, description: 'LOWER BAGGAGE BLKHD' },
      { stockCode: 'F-1007-L', qty: 1, description: 'FUSELAGE FRAME' },
      { stockCode: 'F-1007-R', qty: 1, description: 'FUSELAGE FRAME' },
      { stockCode: 'F-1008-L', qty: 1, description: 'FUSELAGE FRAME' },
      { stockCode: 'F-1008-R', qty: 1, description: 'FUSELAGE FRAME' },
      { stockCode: 'F-1010', qty: 1, description: 'FUSELAGE BULKHEAD' },
      { stockCode: 'F-1010C', qty: 1, description: 'DOUBLER MAKES L&R' },
      { stockCode: 'F-1011', qty: 1, description: 'FUSELAGE BULKHEAD' },
      { stockCode: 'F-1014', qty: 1, description: 'AFT DECK' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #4 (V1)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #4', qty: 1, description: 'V1',
    contents: [
      { stockCode: 'AB4-125X1 1/2X8', qty: 1, description: 'ALUM BAR' },
      { stockCode: 'HS-1007', qty: 1, description: 'FRONT SPAR DOUBLER' },
      { stockCode: 'HS-904', qty: 6, description: 'HORIZONTAL STAB RIB' },
      { stockCode: 'HS-905', qty: 8, description: 'HORIZ STAB NOSE RIB' },
      { stockCode: 'HS-906', qty: 1, description: 'H STAB REAR SPAR DBLR' },
      { stockCode: 'R-1003', qty: 1, description: 'RUDDER TIP RIB' },
      { stockCode: 'R-1004', qty: 1, description: 'RUDDER ROOT RIB' },
      { stockCode: 'R-1012', qty: 1, description: 'COUNTERBALANCE RIB' },
      { stockCode: 'VS-1006', qty: 1, description: 'VERTICAL STAB RIB TOP' },
      { stockCode: 'VS-1007', qty: 1, description: 'V-STAB MID INSPAR RIB' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #5 (E1B)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #5', qty: 1, description: 'E1B',
    contents: [
      { stockCode: 'AA6-125X1X1X5', qty: 1, description: 'ALUM ANGLE (INCHES)' },
      { stockCode: 'AEX TIE DOWN X7.5', qty: 1, description: 'TIE DOWN X 7 1/2"' },
      { stockCode: 'BOLT HEX 1/4X28-8', qty: 2, description: 'BATTERY CLAMP 8-1&10' },
      { stockCode: 'E-00903-1', qty: 2, description: 'ELEVATOR TIP RIB' },
      { stockCode: 'E-00904-1', qty: 2, description: 'ELEVATOR TIP RIB' },
      { stockCode: 'E-905', qty: 2, description: 'LEFT ELE. RIB 9/10' },
      { stockCode: 'F-1012A', qty: 1, description: 'FUSELAGE BULKHEAD' },
      { stockCode: 'F-1012B', qty: 1, description: 'FUSELAGE BULKHEAD' },
      { stockCode: 'F-1035', qty: 1, description: 'BATTERY/B.CRANK MOUNT' },
      { stockCode: 'F-1036', qty: 1, description: 'BATTERY CHANNELS' },
      { stockCode: 'F-1094A', qty: 2, description: 'EMPENNAGE GAP COVER' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #6 (E1A)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #6', qty: 1, description: 'E1A',
    contents: [
      { stockCode: 'AT6-035X1 1/2X83', qty: 1, description: 'PUSH ROD TUBE, 83 INCHES' },
      { stockCode: 'E-1007', qty: 2, description: 'ELEVATOR REAR SPAR' },
      { stockCode: 'J-CHANNEL X6\'', qty: 6, description: 'ALUM STIFFENER ANGLE' },
      { stockCode: 'J-CHANNEL X8\'', qty: 6, description: 'ALUM STIFFENER ANGLE' },
      { stockCode: 'VS-1002', qty: 1, description: 'VERT STAB FRONT SPAR' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #7 (not separately called out on page 6)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #7', qty: 1, description: 'E1A (cont.)',
    contents: [
      { stockCode: 'F-1095A', qty: 1, description: 'TRIM MOUNT BRACKET' },
      { stockCode: 'R-1010', qty: 1, description: 'STIFFENER SHEAR CLIP' },
      { stockCode: 'VS-1008', qty: 1, description: 'REAR SPAR DOUBLER' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #8 (E1A)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #8', qty: 1, description: 'E1A',
    contents: [
      { stockCode: 'AA6-063X3/4X3/4X18', qty: 1, description: '18 INCH ALUM ANGLE C-612/C-712' },
      { stockCode: 'AA6-125X1X1X17', qty: 1, description: 'ANGLE' },
      { stockCode: 'AA6-125X3/4X3/4X17', qty: 1, description: 'AL. ANGLE HS-610/810' },
      { stockCode: 'AA6-125X3/4X3/4X98.5', qty: 2, description: 'ALUM ANGLE' },
      { stockCode: 'AN257-P3X6\'', qty: 1, description: 'HINGE X 6\'' },
      { stockCode: 'E-1002', qty: 2, description: 'ELEVATOR SPAR' },
      { stockCode: 'E-1020', qty: 1, description: 'RIGHT TRIM TAB SPAR' },
      { stockCode: 'E-920', qty: 1, description: 'TRIM TAB SPAR' },
      { stockCode: 'F-1028', qty: 1, description: 'BAG BULKHEAD CHANNEL' },
      { stockCode: 'F-1037', qty: 1, description: 'BELLCRANK ANGLES' },
      { stockCode: 'F-1055', qty: 1, description: 'SKIN STIFFENER' },
      { stockCode: 'HS-1002', qty: 1, description: 'HORIZ STAB FRONT SPAR' },
      { stockCode: 'HS-1003', qty: 1, description: 'HORIZ STAB REAR SPAR' },
      { stockCode: 'HS-1013', qty: 2, description: 'HORIZ STAB SPAR CAP' },
      { stockCode: 'HS-1014', qty: 2, description: 'HORIZ STAB STRINGER' },
      { stockCode: 'HS-1015', qty: 2, description: 'HORIZ STAB STRINGER' },
      { stockCode: 'R-1002', qty: 1, description: 'RUDDER SPAR' },
      { stockCode: 'R-1015', qty: 7, description: 'RUDDER STIFFENER' },
      { stockCode: 'VA-140', qty: 2, description: 'TRAILING EDGE' },
      { stockCode: 'VS-1003', qty: 2, description: 'VERT STAB REAR SPAR' },
      { stockCode: 'VS-1014', qty: 2, description: 'REAR SPAR CAP' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A EMPCONE SUBKIT #9 (E1B)
  // ════════════════════════════════════════════════════════════
  {
    stockCode: '10A EMPCONE SUBKIT #9', qty: 1, description: 'E1B',
    contents: [
      { stockCode: 'AA6-187X2X2 1/2X5', qty: 1, description: 'ALUM ANGLE' },
      { stockCode: 'E-1008', qty: 16, description: 'ELEVATOR RIB' },
      { stockCode: 'E-616PP', qty: 2, description: 'ELEV TRIM COVER' },
      { stockCode: 'F-824B', qty: 2, description: 'COVER PLATE, AFT FUSE' },
      { stockCode: 'FOAM, PVC-750X2X5.25', qty: 5, description: 'FOAM BLOCK' },
      { stockCode: 'HS-1016', qty: 1, description: 'STRINGER WEB' },
      { stockCode: 'R-1005', qty: 1, description: 'RUDDER HORN' },
      { stockCode: 'VS-1016', qty: 1, description: 'FRNT SPAR ATTACH BRKT' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 10A PLANS EMP.SET
  // ════════════════════════════════════════════════════════════
  { stockCode: '10A PLANS EMP.SET', qty: 1, description: 'PLANS & MANUAL', contents: [] },
  { stockCode: 'DWG 1 RV-10', qty: 1, description: '3 VIEW RV-10 D SIZE', contents: [] },
  { stockCode: 'DWG 2 RV-10', qty: 1, description: 'CUTAWAY RV-10 D SIZE', contents: [] },

  // ════════════════════════════════════════════════════════════
  // BAG SHEET METAL BASIC
  // ════════════════════════════════════════════════════════════
  {
    stockCode: 'BAG SHEET METAL BASIC', qty: 1, description: 'METALWORKING PROJECT',
    contents: [
      { stockCode: 'AA3-025X5/8X5/8X5"', qty: 1, description: 'SHEET METAL BASICS' },
      { stockCode: 'AN426AD3-3.5', qty: 0, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'AN426AD3-4', qty: 0, description: 'COUNTERSUNK HEAD RIVETS (LB)' },
      { stockCode: 'AN470AD4-4', qty: 0.010, description: 'UNIVERSAL HEAD RIVETS (LB)' },
      { stockCode: 'AS3-020X4"X5"', qty: 1, description: 'SHEET METAL BASIC' },
      { stockCode: 'AS3-032X4X5', qty: 1, description: 'EET-602A' },
      { stockCode: 'DWG OP-51', qty: 1, description: 'SHEET METAL BASICS' },
      { stockCode: 'K1000-08', qty: 2, description: 'PLATENUT 8-32 KAYNAR' },
      { stockCode: 'RIVET LP4-3', qty: 6, description: 'POP RIVET' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // SKINS & LARGE PARTS (page 7)
  // ════════════════════════════════════════════════════════════
  { stockCode: 'CT Q-43', qty: 2, description: 'RV-10 ELEV TRIM CABLE', contents: [] },
  { stockCode: 'E-1001A', qty: 2, description: 'TOP ELEVATOR SKIN', contents: [] },
  { stockCode: 'E-1001B', qty: 2, description: 'BOTTOM ELEV SKIN', contents: [] },
  { stockCode: 'E-1019', qty: 1, description: 'R ELEV TRIM TAB SKIN', contents: [] },
  { stockCode: 'E-614', qty: 4, description: 'LEAD C\'BALANCE 1.43LB', contents: [] },
  { stockCode: 'E-912', qty: 2, description: 'FIBERGLASS ELVTOR TIP 9/10/14', contents: [] },
  { stockCode: 'E-919', qty: 1, description: 'TRIM TAB SKIN 9/10L', contents: [] },
  { stockCode: 'ES-MSTS-8A', qty: 1, description: 'MAC TRIM DRIVE 1.2"', contents: [] },
  { stockCode: 'F-1073-L', qty: 1, description: 'TAIL CONE SIDE SKIN', contents: [] },
  { stockCode: 'F-1073-R', qty: 1, description: 'TAIL CONE SIDE SKIN', contents: [] },
  { stockCode: 'F-1074', qty: 1, description: 'TAIL FWD TOP SKIN', contents: [] },
  { stockCode: 'F-1075', qty: 1, description: 'TAIL AFT TOP SKIN', contents: [] },
  { stockCode: 'F-1078', qty: 1, description: 'TAIL FWD BOTTOM SKIN', contents: [] },
  { stockCode: 'HS-1001', qty: 2, description: 'HORIZ STAB SKIN', contents: [] },
  { stockCode: 'HS-910', qty: 2, description: 'FIBERGLASS HS TIP', contents: [] },
  { stockCode: 'R-1001', qty: 2, description: 'RUDDER SKIN', contents: [] },
  { stockCode: 'R-1009', qty: 1, description: 'RUDDER TIP FAIRING', contents: [] },
  { stockCode: 'R-1011', qty: 1, description: 'RUDDER BOT FAIRING', contents: [] },
  { stockCode: 'R-1014', qty: 1, description: 'LEAD C\'BALANCE 1.36LB', contents: [] },
  { stockCode: 'TRIM BUNDLE, EMP', qty: 1, description: 'ASSORTED SHEET METAL', contents: [] },
  { stockCode: 'VS-1001', qty: 1, description: 'VERTICAL STAB SKIN', contents: [] },
  { stockCode: 'VS-1009', qty: 1, description: 'V.STAB TIP FAIRING', contents: [] },
  { stockCode: 'WD-605-L-1 PC', qty: 1, description: 'ELEVATOR HORN PWDR CT', contents: [] },
  { stockCode: 'WD-605-R-1 PC', qty: 1, description: 'ELEVATOR HORN PWDR CT', contents: [] },

  // Additional parts from page 5-6 not yet listed
  { stockCode: 'VS-1015', qty: 1, description: 'V STAB FRNT SPAR DBLR', contents: [] },
  { stockCode: 'E-1023', qty: 1, description: 'ELEVATOR TRAILING EDGE', contents: [] },
  { stockCode: 'F-1032-L', qty: 1, description: 'TAILCONE LONGERON', contents: [] },
  { stockCode: 'F-1032-R', qty: 1, description: 'TAILCONE LONGERON', contents: [] },
  { stockCode: 'F-1047A', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047B-L', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047B-R', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047C-L', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047C-R', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047D-L', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047D-R', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047E-L', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047E-R', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047F-L', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047F-R', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1047G', qty: 1, description: 'J-STIFFENER', contents: [] },
  { stockCode: 'F-1056', qty: 1, description: 'ELEVATOR SPAR STIFFENER', contents: [] },
  { stockCode: 'F-1091-1', qty: 1, description: 'ELEVATOR PUSHROD', contents: [] },
  { stockCode: 'HS-1008-L', qty: 1, description: 'H STAB SKIN STIFFENER', contents: [] },
  { stockCode: 'HS-1008-R', qty: 1, description: 'H STAB SKIN STIFFENER', contents: [] },
  { stockCode: 'R-1006', qty: 1, description: 'RUDDER COUNTERBALANCE', contents: [] },
  { stockCode: 'VS-1011', qty: 1, description: 'MID RUDDER HINGE', contents: [] },
  { stockCode: 'VB-10', qty: 1, description: 'TEMPLATE ON BOX LID', contents: [] },
];
