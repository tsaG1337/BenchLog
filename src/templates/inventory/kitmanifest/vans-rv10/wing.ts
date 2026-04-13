import type { KitDefinition } from '@/lib/kitManifest';

export const wingKit: KitDefinition = {
  id: 'wing',
  label: 'Wing Kit',
  subKits: ['AIL', 'WING', 'FLAP', 'TANK'],
  entries: [
    // ══════════════════════════════════════════════════════════
    // MANUFACTURED / MATERIAL  (from kit manifest)
    // ══════════════════════════════════════════════════════════

    // ── AIL ──
    { partNumber: 'A-1001A-1L', nomenclature: 'NOSE SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 6061-T6 BARE', subKit: 'AIL' },
    { partNumber: 'A-1001A-1R', nomenclature: 'NOSE SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 6061-T6 BARE', subKit: 'AIL' },
    { partNumber: 'A-1001B-1', nomenclature: 'TOP SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.016 2024-T3 ALCLAD', subKit: 'AIL' },
    { partNumber: 'A-1002-1', nomenclature: 'BOTTOM SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.016 2024-T3 ALCLAD', subKit: 'AIL' },
    { partNumber: 'A-1003-1L', nomenclature: 'SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'AIL' },
    { partNumber: 'A-1003-1R', nomenclature: 'SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'AIL' },
    { partNumber: 'A-1004-1L', nomenclature: 'NOSE RIB', qtyRequired: 2, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'AIL' },
    { partNumber: 'A-1004-1R', nomenclature: 'NOSE RIB', qtyRequired: 2, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'AIL' },
    { partNumber: 'A-1005-1L', nomenclature: 'MAIN RIB', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'AIL' },
    { partNumber: 'A-1005-1R', nomenclature: 'MAIN RIB', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'AIL' },
    { partNumber: 'A-1006-1', nomenclature: 'OUTBD HINGE BRACKET', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'AIL', bag: 'BAG 1215-1' },
    { partNumber: 'A-1007-1', nomenclature: 'INBD HINGE BRACKET', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'AIL', bag: 'BAG 1215-1' },
    { partNumber: 'A-1008-1', nomenclature: 'DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'AIL', bag: 'BAG 1215-1' },
    { partNumber: 'A-1009', nomenclature: 'COUNTERBALANCE', qtyRequired: 2, partType: 'MATERIAL', material: 'ST304-065X1.375', subKit: 'AIL' },
    { partNumber: 'A-1011', nomenclature: 'TRAILING EDGE', qtyRequired: 2, partType: 'MATERIAL', material: 'VA-140', subKit: 'AIL' },
    { partNumber: 'A-1012', nomenclature: 'SPACER', qtyRequired: 2, partType: 'MATERIAL', material: 'AT6-058 X 5/16', subKit: 'WING' },
    { partNumber: 'A-1013', nomenclature: 'SPACER', qtyRequired: 2, partType: 'MATERIAL', material: 'AT6-058 X 5/16', subKit: 'WING' },
    { partNumber: 'A-710', nomenclature: 'STIFFENER (4 PER PART)', qtyRequired: 8, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'AIL' },

    // ── FLAP ──
    { partNumber: 'F-1066G', nomenclature: 'BUSHING, -1 FLAP MOTOR', qtyRequired: 2, partType: 'MATERIAL', material: 'BUSHING-AL.313X.438X.469', subKit: 'FLAP' },
    { partNumber: 'FL-1001A-L', nomenclature: 'INBOARD NOSE SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 6061-T6 BARE', subKit: 'FLAP' },
    { partNumber: 'FL-1001A-R', nomenclature: 'INBOARD NOSE SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 6061-T6 BARE', subKit: 'FLAP' },
    { partNumber: 'FL-1001B-L', nomenclature: 'OUTBOARD NOSE SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 6061-T6 BARE', subKit: 'FLAP' },
    { partNumber: 'FL-1001B-R', nomenclature: 'OUTBOARD NOSE SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 6061-T6 BARE', subKit: 'FLAP' },
    { partNumber: 'FL-1001C', nomenclature: 'TOP SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1002', nomenclature: 'BOTTOM SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1002A', nomenclature: 'ROCK SHIELD', qtyRequired: 2, partType: 'MANUFACTURED', material: '.040 304 STAINLESS SHEET', subKit: 'FLAP' },
    { partNumber: 'FL-1003-L', nomenclature: 'SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1003-R', nomenclature: 'SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1004-L', nomenclature: 'NOSE RIB', qtyRequired: 10, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1004-R', nomenclature: 'NOSE RIB', qtyRequired: 10, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1005-L', nomenclature: 'MAIN RIB', qtyRequired: 11, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1005-R', nomenclature: 'MAIN RIB', qtyRequired: 11, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1006', nomenclature: 'DOUBLER', qtyRequired: 4, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1007-L', nomenclature: 'HINGE BRACKET', qtyRequired: 6, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1007-R', nomenclature: 'HINGE BRACKET', qtyRequired: 6, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1008', nomenclature: 'HINGE SPACER', qtyRequired: 4, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'FLAP' },
    { partNumber: 'FL-1009', nomenclature: 'TRAILING EDGE', qtyRequired: 2, partType: 'MATERIAL', material: 'VA-140', subKit: 'FLAP' },

    // ── TANK ──
    { partNumber: 'T-1001-L', nomenclature: 'FUEL TANK SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1001-R', nomenclature: 'FUEL TANK SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1002', nomenclature: 'TANK BAFFLE', qtyRequired: 2, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1003B-L', nomenclature: 'TANK INBD RIB - AFT', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1003B-R', nomenclature: 'TANK INBD RIB - AFT', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1003C-L', nomenclature: 'TANK INBD RIB - FWD', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1003C-R', nomenclature: 'TANK INBD RIB - FWD', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1003-L', nomenclature: 'TANK OUTBD RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1003-R', nomenclature: 'TANK OUTBD RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1004-L-1', nomenclature: 'TANK INTERIOR RIB', qtyRequired: 5, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1004-R-1', nomenclature: 'TANK INTERIOR RIB', qtyRequired: 5, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1005BC', nomenclature: 'SHIM', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1005-L', nomenclature: 'TANK ATTACH BRACKET', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1005-R', nomenclature: 'TANK ATTACH BRACKET', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1009', nomenclature: 'TANK J STIFFENER', qtyRequired: 2, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TANK' },
    { partNumber: 'T-1010', nomenclature: 'ANTI ROTATION PLATE', qtyRequired: 2, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TANK', bag: 'BAG 1217-1' },
    { partNumber: 'T-1011', nomenclature: 'TANK STIFFENER', qtyRequired: 7, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-1012', nomenclature: 'TANK ATTACH ZEE', qtyRequired: 2, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TANK' },
    { partNumber: 'T-VENT LINE', nomenclature: 'FUEL TANK VENT LINE', qtyRequired: 2, partType: 'MATERIAL', material: 'AT0-032 X 1/4', subKit: 'TANK' },
    { partNumber: 'VA-112', nomenclature: 'DRAIN FLANGE', qtyRequired: 2, partType: 'MANUFACTURED', material: '2024-T351', subKit: 'TANK', bag: 'BAG 1217-1' },
    { partNumber: 'VA-141', nomenclature: 'FINGER STRAINER FLANGE', qtyRequired: 2, partType: 'MANUFACTURED', material: '2024-T351 AL BAR', subKit: 'TANK', bag: 'BAG 1217-1' },
    { partNumber: 'VA-261', nomenclature: 'FUEL STRAINER', qtyRequired: 2, partType: 'MANUFACTURED', material: 'AN816-6-6D/SCREEN', subKit: 'TANK', bag: 'BAG 1218-2' },

    // ── WING ──
    { partNumber: 'A-1015-1L', nomenclature: 'INBOARD NOSE RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'A-1015-1R', nomenclature: 'INBOARD NOSE RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'VA-193', nomenclature: 'WING TIP LIGHT LENS', qtyRequired: 1, partType: 'MANUFACTURED', material: 'TRANSPARENT PLASTIC', subKit: 'WING' },
    { partNumber: 'VA-195A', nomenclature: 'STALL WARNING MOUNT PLATE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING', bag: 'BAG 1217-1' },
    { partNumber: 'VA-195B', nomenclature: 'STALL WARNING KEEPER PLATE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING', bag: 'BAG 1217-1' },
    { partNumber: 'VA-195C', nomenclature: 'ACCESS HATCH DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'VA-195D', nomenclature: 'ACCESS HATCH', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'VA-196', nomenclature: 'STALL WARNING VANE', qtyRequired: 1, partType: 'MANUFACTURED', material: 'T-304 STAINLESS STEEL', subKit: 'WING', bag: 'BAG 1216-1' },
    { partNumber: 'VB-11', nomenclature: 'WING LEADING EDGE VEE BLOCK', qtyRequired: 2, partType: 'MANUFACTURED', material: '3/4 MDF', subKit: 'WING' },
    { partNumber: 'W-1001-L', nomenclature: 'LEADING EDGE SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1001-R', nomenclature: 'LEADING EDGE SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1002', nomenclature: 'TOP INBD WING SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1003', nomenclature: 'TOP OUTBD WING SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1004-L', nomenclature: 'BOTTOM INBD WING SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1004-R', nomenclature: 'BOTTOM INBD WING SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1005-L', nomenclature: 'BOTTOM OUTBD WING SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1005-R', nomenclature: 'BOTTOM OUTBD WING SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1006E-L', nomenclature: 'MAIN SPAR WEB EXTENSION', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1006E-R', nomenclature: 'MAIN SPAR WEB EXTENSION', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1006F', nomenclature: 'SPAR SPLICE PLATE', qtyRequired: 8, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1007A-L', nomenclature: 'REAR SPAR WEB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1007A-R', nomenclature: 'REAR SPAR WEB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1007B', nomenclature: 'REAR SPAR REINF FORK', qtyRequired: 2, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1007C', nomenclature: 'REAR SPAR DOUBLER PLATE', qtyRequired: 2, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1007D', nomenclature: 'REAR SPAR DOUBLER PLATE', qtyRequired: 4, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1007E', nomenclature: 'REAR SPAR DOUBLER PLATE', qtyRequired: 2, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1008-L-1', nomenclature: 'SPLICE RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1008-R-1', nomenclature: 'SPLICE RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1009-L-3', nomenclature: 'LEADING EDGE RIB', qtyRequired: 6, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1009-R-3', nomenclature: 'LEADING EDGE RIB', qtyRequired: 6, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1010-L-1', nomenclature: 'INBD WING RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1010-R-1', nomenclature: 'INBD WING RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1011-L', nomenclature: 'INBD WING RIB', qtyRequired: 11, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1011-R', nomenclature: 'INBD WING RIB', qtyRequired: 11, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1012-L', nomenclature: 'OUTBD WING RIB', qtyRequired: 3, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1012-R', nomenclature: 'OUTBD WING RIB', qtyRequired: 3, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1013A', nomenclature: 'AILERON HINGE BRACKET SPACER', qtyRequired: 2, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1013C-L', nomenclature: 'AILERON HINGE BRACKET SIDE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1013C-LX', nomenclature: 'AILERON HINGE BRACKET SIDE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1013C-R', nomenclature: 'AILERON HINGE BRACKET SIDE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1013C-RX', nomenclature: 'AILERON HINGE BRACKET SIDE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1015-L', nomenclature: 'WING TIP', qtyRequired: 1, partType: 'MANUFACTURED', material: 'GLASS FABRIC/POLYESTER RESIN', subKit: 'WING' },
    { partNumber: 'W-1015-R', nomenclature: 'WING TIP', qtyRequired: 1, partType: 'MANUFACTURED', material: 'GLASS FABRIC/POLYESTER RESIN', subKit: 'WING' },
    { partNumber: 'W-1016-L', nomenclature: 'WING TIP RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1016-R', nomenclature: 'WING TIP RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1017A-1', nomenclature: 'TORQUE TUBE TO BELLCRANK PUSHROD', qtyRequired: 2, partType: 'MATERIAL', material: 'AT6-125 X 1 1/4', subKit: 'WING' },
    { partNumber: 'W-1018A-1', nomenclature: 'BELLCRANK TO AILERON PUSHROD', qtyRequired: 2, partType: 'MATERIAL', material: 'ST4130-049 X 1/2', subKit: 'WING' },
    { partNumber: 'W-1020', nomenclature: 'TIE-DOWN', qtyRequired: 2, partType: 'MATERIAL', material: '.AEX TIE-DOWN', subKit: 'WING' },
    { partNumber: 'W-1021B', nomenclature: 'FLAP GAP STIFFENER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1021-L', nomenclature: 'FLAP GAP FAIRING', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1021-R', nomenclature: 'FLAP GAP FAIRING', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1024-L', nomenclature: 'AILERON GAP FAIRING', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1024-R', nomenclature: 'AILERON GAP FAIRING', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1025A', nomenclature: 'FLAP HINGE BRACKET', qtyRequired: 6, partType: 'MANUFACTURED', material: '.190 2024-T3 BARE', subKit: 'WING' },
    { partNumber: 'W-1025B', nomenclature: 'FLAP HINGE RIB', qtyRequired: 3, partType: 'MANUFACTURED', material: '.032 2024-T0 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1026', nomenclature: 'LEADING EDGE J-STIFFENER', qtyRequired: 2, partType: 'MATERIAL', material: 'J-STIF', subKit: 'WING' },
    { partNumber: 'W-1027A', nomenclature: 'WING WALK DOUBLER - FWD', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1027B', nomenclature: 'WING WALK DOUBLER - AFT', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1028A-LWR', nomenclature: 'WING BOX J-STIFFENER - LONG', qtyRequired: 2, partType: 'MATERIAL', material: 'J-STIF', subKit: 'WING' },
    { partNumber: 'W-1028A-UPR', nomenclature: 'WING BOX J-STIFFENER - LONG', qtyRequired: 2, partType: 'MATERIAL', material: 'J-STIF', subKit: 'WING' },
    { partNumber: 'W-1028B', nomenclature: 'WING BOX J-STIFFENER - SHORT', qtyRequired: 4, partType: 'MATERIAL', material: 'J-STIF', subKit: 'WING' },
    { partNumber: 'W-1029A-L', nomenclature: 'TORQUE TUBE SUPPORT BRACKET', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1029A-R', nomenclature: 'TORQUE TUBE SUPPORT BRACKET', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1029B-L', nomenclature: 'TORQUE TUBE SUPPORT BRACKET', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1029B-R', nomenclature: 'TORQUE TUBE SUPPORT BRACKET', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-1029C', nomenclature: 'ANGLE', qtyRequired: 2, partType: 'MATERIAL', material: 'AA6-063X3/4X3/4', subKit: 'WING' },
    { partNumber: 'W-1029D', nomenclature: 'SPACER', qtyRequired: 2, partType: 'MATERIAL', material: 'AS3-063 .625 X 6.475', subKit: 'WING' },
    { partNumber: 'W-1029E', nomenclature: 'SPACER', qtyRequired: 2, partType: 'MATERIAL', material: 'AS3-063 .625 X 1.397', subKit: 'WING' },
    { partNumber: 'W-1031', nomenclature: 'AILERON BELLCRANK SPACER', qtyRequired: 2, partType: 'MATERIAL', material: 'AT6-058 X 5/16', subKit: 'WING' },
    { partNumber: 'W-730', nomenclature: 'BELLCRANK JIG', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-822PP', nomenclature: 'WING ACCESS PLATE', qtyRequired: 2, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'W-822PP-', nomenclature: 'WING ACCESS PLATE', qtyRequired: 4, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'WING' },
    { partNumber: 'WD-1014C', nomenclature: 'TORQUE TUBE COLLAR', qtyRequired: 2, partType: 'MATERIAL', material: 'ST4130-035 X 7/8', subKit: 'WING' },
    { partNumber: 'WH-F1001', nomenclature: 'STALL WARNING WIRE', qtyRequired: 2, partType: 'MATERIAL', material: 'WIRE MS22759/16-18', subKit: 'WING' },
    { partNumber: 'W-PITOT', nomenclature: 'WING PITOT LINE', qtyRequired: 1, partType: 'MATERIAL', material: 'AT0-032 X 1/4', subKit: 'WING' },

    // ══════════════════════════════════════════════════════════
    // HARDWARE  (from packing list — items not in manifest)
    // ══════════════════════════════════════════════════════════

    // ── BAG 1101: AN426AD3-3 ──
    { partNumber: 'AN426AD3-3', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.070, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1101', unit: 'lb' },

    // ── BAG 1153: AN426AD3-3.5 ──
    { partNumber: 'AN426AD3-3.5', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 1.000, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1153', unit: 'lb' },

    // ── BAG 1154: AN426AD3-4 ──
    { partNumber: 'AN426AD3-4', nomenclature: 'RIVET', qtyRequired: 0.400, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1154', unit: 'lb' },

    // ── BAG 1155: AN426AD3-4.5 ──
    { partNumber: 'AN426AD3-4.5', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.040, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1155', unit: 'lb' },

    // ── BAG 1157: AN426AD3-6 ──
    { partNumber: 'AN426AD3-6', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1157', unit: 'lb' },

    // ── BAG 1159: AN426AD4-8 ──
    { partNumber: 'AN426AD4-8', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1159', unit: 'lb' },

    // ── BAG 1160: AN470AD4-4 ──
    { partNumber: 'AN470AD4-4', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.260, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1160', unit: 'lb' },

    // ── BAG 1161: AN470AD4-5 ──
    { partNumber: 'AN470AD4-5', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.210, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1161', unit: 'lb' },

    // ── BAG 1162: AN470AD4-6 ──
    { partNumber: 'AN470AD4-6', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.140, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1162', unit: 'lb' },

    // ── BAG 1163: AN470AD4-7 ──
    { partNumber: 'AN470AD4-7', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.230, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1163', unit: 'lb' },

    // ── BAG 1165: AN470AD4-10 ──
    { partNumber: 'AN470AD4-10', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1165', unit: 'lb' },

    // ── BAG 1172: POP RIVET AD-41H ──
    { partNumber: 'RIVET AD-41H', nomenclature: 'POP RIVET TANK BAFFLE', qtyRequired: 22, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1172' },

    // ── BAG 1173: POP RIVET AD-42-H ──
    { partNumber: 'RIVET AD-42-H', nomenclature: 'POP RIVET TANK BAFFLE', qtyRequired: 64, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1173' },

    // ── BAG 1174-1: CS4-4 BLIND RIVETS ──
    { partNumber: 'RIVET CS4-4', nomenclature: 'POP RIVET', qtyRequired: 100, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1174-1' },

    // ── BAG 1175-1: LP4-3 BLIND RIVETS ──
    { partNumber: 'RIVET LP4-3', nomenclature: 'POP RIVET', qtyRequired: 105, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1175-1' },

    // ── BAG 1176-1: MK-319-BS BLIND RIVET ──
    { partNumber: 'RIVET MK-319-BS', nomenclature: 'POP RIVET', qtyRequired: 270, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1176-1' },

    // ── BAG 1177: POP RIVET MSP-42 ──
    { partNumber: 'RIVET MSP-42', nomenclature: 'POP RIVET', qtyRequired: 36, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1177' },

    // ── BAG 1178: K1000-06 PLATENUTS ──
    { partNumber: 'K1000-06', nomenclature: '6-32 PLATENUT "FIGURE 8 SHAPE"', qtyRequired: 26, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1178' },

    // ── BAG 1179: K1000-08 PLATENUTS ──
    { partNumber: 'K1000-08', nomenclature: 'PLATENUT 8-32 Kaynar', qtyRequired: 30, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1179' },

    // ── BAG 1180: K1000-3 PLATENUTS ──
    { partNumber: 'K1000-3', nomenclature: 'PLATENUT 10-32 MS21047L3', qtyRequired: 56, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1180' },

    // ── BAG 1181: K1000-4/MK1000-428 ──
    { partNumber: 'K1000-4', nomenclature: 'PLATENUT 1/4-28', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1181' },
    { partNumber: 'MK1000-428', nomenclature: 'MINI PLATENUT MS21069L4', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1181' },

    // ── BAG 1182: K1100-08 PLATENUTS ──
    { partNumber: 'K1100-08', nomenclature: 'PLATENUT SCREW HOLE DIMPLED 8-32', qtyRequired: 224, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1182' },

    // ── BAG 1183: MS21051-L08 PLATENUTS ──
    { partNumber: 'MS21051-L08', nomenclature: '8-32 SINGLE LUG P/NUT', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1183' },

    // ── BAG 1184: MS21053-L08 PLATENUTS ──
    { partNumber: 'MS21053-L08', nomenclature: '100 DG CS S/L PLT NUT', qtyRequired: 22, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1184' },

    // ── BAG 1185: K1100-06 PLATENUTS ──
    { partNumber: 'K1100-06', nomenclature: 'PLATENUT SCREW HOLE DIMPLED 6-32', qtyRequired: 12, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1185' },

    // ── BAG 1186-1: MISC FLUID FITTINGS ──
    { partNumber: 'AN818-4D', nomenclature: 'NUT, FLARE COUPLING', qtyRequired: 5, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1186-1' },
    { partNumber: 'AN819-4D', nomenclature: 'SLEEVE, FLARE COUPLING', qtyRequired: 5, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1186-1' },
    { partNumber: 'AN832-4D', nomenclature: 'UNION, BLKHD TUBE-TUBE', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1186-1' },
    { partNumber: 'AN924-4D', nomenclature: 'NUT, BLKHD', qtyRequired: 3, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1186-1' },

    // ── BAG 1187-1: BUSHINGS SB-3/-4/-7 ──
    { partNumber: 'BUSHING SB375-3', nomenclature: 'SNAP-IN 3/16ID 3/8 OD', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1187-1' },
    { partNumber: 'BUSHING SB437-4', nomenclature: 'SNAP-IN 1/4ID 7/16 OD', qtyRequired: 24, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1187-1' },
    { partNumber: 'BUSHING SB625-7', nomenclature: 'SNAP-IN 7/16ID 5/8 OD', qtyRequired: 32, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1187-1' },

    // ── BAG 1188: AN507-6R6 SCREWS ──
    { partNumber: 'AN507-6R6', nomenclature: 'SCREW, FLT HD', qtyRequired: 36, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1188' },

    // ── BAG 1189: AN509-8R8 SCREWS ──
    { partNumber: 'AN509-8R8', nomenclature: 'SCREW, FLT HD STRUCT', qtyRequired: 275, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1189' },

    // ── BAG 1190: AN515-8R8 SCREWS ──
    { partNumber: 'AN515-8R8', nomenclature: '8-32X1/2 PAN HEAD SCREW', qtyRequired: 12, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1190' },

    // ── BAG 1191-1: AN526C632R8 SCREWS ──
    { partNumber: 'AN526C632R8', nomenclature: 'SCREW, TRUSS HD SS', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1191-1' },

    // ── BAG 1192: SCREWS, FINE ──
    { partNumber: 'MS24693S10', nomenclature: '100 DG 440 CS M/S', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1192' },
    { partNumber: 'MS24694C14', nomenclature: 'SCREW 100DEG CS SS #8', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1192' },

    // ── BAG 1194-1: AN3-BOLTS ──
    { partNumber: 'AN3-4A', nomenclature: 'AN BOLT', qtyRequired: 40, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1194-1' },

    // ── BAG 1195: AN3-BOLTS ──
    { partNumber: 'AN3-5A', nomenclature: 'AN BOLT', qtyRequired: 30, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1195' },

    // ── BAG 1196: AN3-BOLTS ──
    { partNumber: 'AN3-10A', nomenclature: 'AN BOLT', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1196' },
    { partNumber: 'AN3-11A', nomenclature: 'AN BOLT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1196' },
    { partNumber: 'AN3-12A', nomenclature: 'AN BOLT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1196' },
    { partNumber: 'AN3-13A', nomenclature: 'AN BOLT', qtyRequired: 12, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1196' },
    { partNumber: 'AN3-14A', nomenclature: 'AN BOLT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1196' },
    { partNumber: 'AN3-15A', nomenclature: 'AN BOLT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1196' },
    { partNumber: 'AN3-6A', nomenclature: 'AN BOLT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1196' },
    { partNumber: 'AN3-7A', nomenclature: 'AN BOLT', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1196' },

    // ── BAG 1197: AN3-BOLTS ──
    { partNumber: 'AN3-16A', nomenclature: 'AN BOLT', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1197' },
    { partNumber: 'AN3-17A', nomenclature: 'AN BOLT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1197' },
    { partNumber: 'AN3-20A', nomenclature: 'AN BOLT', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1197' },
    { partNumber: 'AN3-21A', nomenclature: 'AN BOLT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1197' },

    // ── BAG 1199: AN4-BOLTS ──
    { partNumber: 'AN4-11A', nomenclature: 'AN BOLT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1199' },
    { partNumber: 'AN4-14A', nomenclature: 'AN BOLT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1199' },
    { partNumber: 'AN4-32A', nomenclature: 'AN BOLT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1199' },
    { partNumber: 'AN4-7', nomenclature: 'AN BOLT', qtyRequired: 12, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1199' },

    // ── BAG 1200: WING TIP ATTACH ──
    { partNumber: 'AN507-6R6', nomenclature: 'SCREW, FLT HD', qtyRequired: 88, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1200' },
    { partNumber: 'K1000-06', nomenclature: '6-32 PLATENUT "FIGURE 8 SHAPE"', qtyRequired: 88, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1200' },

    // ── BAG 1201: NAS1306-58/NAS1309-58 ──
    { partNumber: 'NAS1306-58', nomenclature: 'HEX HD. CL. TOL. BOLT', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1201' },
    { partNumber: 'NAS1309-58', nomenclature: 'HEX HD. CL. TOL. BOLT', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1201' },

    // ── BAG 1203-1: AN365-1032 NUTS ──
    { partNumber: 'AN365-1032', nomenclature: 'NUT, STOP', qtyRequired: 80, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1203-1' },

    // ── BAG 1204-1: NUTS 428/624/632/918 ──
    { partNumber: 'AN365-428', nomenclature: 'NUT, STOP 1/4-28', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1204-1' },
    { partNumber: 'AN365-624A', nomenclature: 'NUT, STOP 3/8-24', qtyRequired: 10, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1204-1' },
    { partNumber: 'AN365-632A', nomenclature: 'NUT, STOP 6-32', qtyRequired: 10, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1204-1' },
    { partNumber: 'AN365-832A', nomenclature: 'NUT, STOP 8-32', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1204-1' },
    { partNumber: 'AN365-918A', nomenclature: 'MS21044N9', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1204-1' },

    // ── BAG 1206: MISC. JAM NUTS ──
    { partNumber: 'AN310-4', nomenclature: 'NUT, CASTLE 1/4', qtyRequired: 14, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1206' },
    { partNumber: 'AN316-4R', nomenclature: 'NUT, THIN JAM 1/4', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1206' },
    { partNumber: 'AN316-6R', nomenclature: 'NUT, THIN JAM 3/8', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1206' },
    { partNumber: 'MS21044N04', nomenclature: 'NUT 440 LOCK HEX', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1206' },
    { partNumber: 'MS21083-N3', nomenclature: 'AN364-1032 STOP NUT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1206' },

    // ── BAG 1208: ROD END BEARINGS, INSERTS ──
    { partNumber: 'BEARING CM-4M', nomenclature: '1/4X1/4 ROD END BRNG', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1208' },
    { partNumber: 'BEARING COM-3-5', nomenclature: '5/8 OD AILERON BEAR', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1208' },
    { partNumber: 'BEARING F3414M', nomenclature: '3/16X1/4FEM R/E BEARG', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1208' },
    { partNumber: 'BEARING MD3614M', nomenclature: '3/16 X 3/8 ROD END', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1208' },
    { partNumber: 'VA-146', nomenclature: 'FLANGE BEARING', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1208' },
    { partNumber: 'VA-162', nomenclature: 'THREADED INSERT, MALE', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1208' },
    { partNumber: 'VA-169', nomenclature: 'THREADED INSERT, FEMALE', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1208' },
    { partNumber: 'VA-4908P', nomenclature: 'THREADED ROD END', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1208' },

    // ── BAG 1210-1: NAS1149F0363P WASHERS ──
    { partNumber: 'NAS1149F0363P', nomenclature: 'REPLACES AN960-10', qtyRequired: 150, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1210-1' },

    // ── BAG 1211: NAS1149F04 WASHERS ──
    { partNumber: 'NAS1149F0432P', nomenclature: 'REPLACES AN960-416L', qtyRequired: 18, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1211' },
    { partNumber: 'NAS1149F0463P', nomenclature: 'REPLACES AN960-416', qtyRequired: 48, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1211' },

    // ── BAG 1212: WHRS #4 -9/16 ──
    { partNumber: 'AN970-3', nomenclature: 'WASHER, 7/8 OD', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1212' },
    { partNumber: 'NAS1149F0663P', nomenclature: 'REPLACES AN960-616', qtyRequired: 10, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1212' },
    { partNumber: 'NAS1149F0963P', nomenclature: 'REPLACES AN960-916', qtyRequired: 10, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1212' },
    { partNumber: 'NAS1149FN416P', nomenclature: 'REPLACES AN960-4L', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1212' },
    { partNumber: 'NAS1149FN432P', nomenclature: 'REPLACES AN960-4', qtyRequired: 18, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1212' },
    { partNumber: 'NAS1149FN832P', nomenclature: 'REPLACES AN960-8', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1212' },

    // ── BAG 1213-1: COTTER PINS/WASHERS ──
    { partNumber: 'MS24665-151', nomenclature: 'COTTER PIN', qtyRequired: 12, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1213-1' },
    { partNumber: 'NAS1149F0332P', nomenclature: 'REPLACES AN960-10L', qtyRequired: 8, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1213-1' },

    // ── BAG 1214: BUSHINGS/CAV-110 ──
    { partNumber: 'BUSH-BZ.25X.375X.250', nomenclature: 'BRONZE BUSHING', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1214' },
    { partNumber: 'CAV-110', nomenclature: 'FUEL DRAIN VALVE, 1/8-27 NPT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1214' },

    // ── BAG 1215-1: AILERON BRACKETS ──
    // A-1006-1, A-1007-1, A-1008-1 already in manifest above with bag tag
    { partNumber: 'WASHER 5702-475-48Z3', nomenclature: '.190X.562X.048 WASHER', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1215-1' },

    // ── BAG 1216-1: STALL WARN HARDWARE ──
    // AN515-8R8 (2) and K1000-08 (2) and VA-196 (1) are bag contents; VA-196 already in manifest with bag tag
    { partNumber: 'AN515-8R8', nomenclature: '8-32X1/2 PAN HEAD SCREW', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1216-1' },
    { partNumber: 'ES 421-0107 CONNECTOR', nomenclature: 'MALE SLIP-ON CONN.', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1216-1' },
    { partNumber: 'ES 421-0108 CONNECTOR', nomenclature: 'FEMALE SLIP-ON CONN.', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1216-1' },
    { partNumber: 'ES DVI8-188B-M', nomenclature: 'FEMALE DISCONNECT TERMINAL, NYLON', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1216-1' },
    { partNumber: 'ES E22-50K MICRO SW', nomenclature: 'MICRO SWITCH', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1216-1' },
    { partNumber: 'K1000-08', nomenclature: 'PLATENUT 8-32 Kaynar', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1216-1' },

    // ── BAG 1217-1: MISC WING PARTS ──
    // T-1010, VA-112, VA-141, VA-195A, VA-195B already in manifest above with bag tag

    // ── BAG 1218-2: BUSHINGS/FUEL SCREEN ──
    // VA-261 already in manifest above with bag tag
    { partNumber: 'AT6-058X5/16X4', nomenclature: 'ALUM TUBE X 4"', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1218-2' },
    { partNumber: 'BUSH AL.197X.313X.438', nomenclature: 'SPACER', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1218-2' },
    { partNumber: 'BUSH AL.197X.313X.594', nomenclature: 'SPACER', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1218-2' },
    { partNumber: 'BUSH-BS.245X375X2.781', nomenclature: 'BELLCRANK BUSHING 7/8/9/10', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1218-2' },

    // ── BAG 1219: AILERON HARDWARE ──
    { partNumber: 'AN470AD4-6', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1219', unit: 'lb' },
    { partNumber: 'AN509-10R25', nomenclature: 'SCREW, FLT HD STRUCT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1219' },
    { partNumber: 'MS21042-3', nomenclature: '10-32 METAL LOCK NUT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1219' },
    { partNumber: 'MS21055-L3', nomenclature: '10-32 RT ANGLE P/NUT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1219' },

    // ── BAG 1314: AN426AD4-11 ──
    { partNumber: 'AN426AD4-11', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1314', unit: 'lb' },

    // ── BAG 1320: AN470AD4-9 ──
    { partNumber: 'AN470AD4-9', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1320', unit: 'lb' },

    // ── BAG 1907: AN426AD4-7 ──
    { partNumber: 'AN426AD4-7', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1907', unit: 'lb' },

    // ── BAG 1934: AN426AD3-5 ──
    { partNumber: 'AN426AD3-5', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1934', unit: 'lb' },

    // ── BAG 2323: AN470AD4-8 ──
    { partNumber: 'AN470AD4-8', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.040, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 2323', unit: 'lb' },

    // ── BAG 323: AN470AD4-11 ──
    { partNumber: 'AN470AD4-11', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 323', unit: 'lb' },

    // ── BAG 422: AN426AD4-4 ──
    { partNumber: 'AN426AD4-4', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 422', unit: 'lb' },

    // ── BAG 527-1: STALL WARNER PARTS ──
    { partNumber: 'AN365-632A', nomenclature: 'NUT, STOP 6-32', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 527-1' },
    { partNumber: 'AN515-6R8', nomenclature: '6-32X1/2 PAN HEAD SCREW', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 527-1' },
    { partNumber: 'BUSHING SB750-10', nomenclature: 'SNAP-IN 5/8 ID 3/4 OD', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 527-1' },
    { partNumber: 'ES 31890', nomenclature: '#18-22WIRE/#8 RING', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 527-1' },
    { partNumber: 'ES 320559', nomenclature: '#18-22 SPLICE', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 527-1' },
    { partNumber: 'ES AUDIO WARN', nomenclature: 'TONE GENERATOR', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 527-1' },
    { partNumber: 'MS21266-1N', nomenclature: 'GROMMET STRIP 12"', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 527-1' },
    { partNumber: 'NAS1149FN632P', nomenclature: 'REPLACES AN960-6', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 527-1' },

    // ── BAG 822: AN470AD4-8 ──
    { partNumber: 'AN470AD4-8', nomenclature: 'UNIVERSAL HEAD RIVETS (LB)', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 822', unit: 'lb' },

    // ── BAG 967: TIP LENS HARDWARE ALL ──
    { partNumber: 'AN426AD3-5', nomenclature: 'COUNTERSUNK HEAD RIVETS (LB)', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 967', unit: 'lb' },
    { partNumber: 'AN507C632R8', nomenclature: 'SCREW, FLT HD SS', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 967' },
    { partNumber: 'DOC W/TIP LENS 7/9', nomenclature: 'LENS INSTALL INSTRUC.', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 967' },
    { partNumber: 'K1000-06', nomenclature: '6-32 PLATENUT "FIGURE 8 SHAPE"', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 967' },

    // ── BAG 1010: ELEC. AIL TRIM RV-10 ──
    { partNumber: 'ES-00044', nomenclature: 'MOLEX PLUG MFIT 6 POS Fits ES-00047', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1010' },
    { partNumber: 'ES-00047', nomenclature: 'MOLEX MICRO-FIT PIN', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1010' },
    { partNumber: 'VA-158', nomenclature: 'AILERON TRIM SPG', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1010' },
    { partNumber: 'W-1017B', nomenclature: 'AIL.TRIM SPRING BRCKT', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1010' },
    { partNumber: 'W-1033B', nomenclature: 'AILERON TRIM LINK', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1010' },
    { partNumber: 'W-1033C', nomenclature: 'AILERON TRIM ARM', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1010' },

    // ── BAG 1011: ELEC. AIL TRIM RV-10 ──
    { partNumber: 'AN365-632A', nomenclature: 'NUT, STOP 6-32', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },
    { partNumber: 'AN509-8R8', nomenclature: 'SCREW, FLT HD STRUCT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },
    { partNumber: 'AN515-6R8', nomenclature: '6-32X1/2 PAN HEAD SCREW', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },
    { partNumber: 'BUSHING SB375-3', nomenclature: 'SNAP-IN 3/16ID 3/8 OD', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },
    { partNumber: 'K1100-08', nomenclature: 'PLATENUT SCREW HOLE DIMPLED 8-32', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },
    { partNumber: 'MS20392-1C9', nomenclature: 'CLEVIS PIN', qtyRequired: 3, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },
    { partNumber: 'MS24665-132', nomenclature: 'COTTER PIN', qtyRequired: 3, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },
    { partNumber: 'NAS1149FN432P', nomenclature: 'REPLACES AN960-4', qtyRequired: 3, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },
    { partNumber: 'RIVET LP4-3', nomenclature: 'POP RIVET', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1011' },

    // ══════════════════════════════════════════════════════════
    // STANDALONE PACKING LIST ITEMS (not in manifest, no bag)
    // ══════════════════════════════════════════════════════════
    { partNumber: '10A PLANS WING', nomenclature: 'PLANS & MANUAL', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'AA6-063X3/4X3/4X18', nomenclature: '18 INCH ALUM ANGLE C-612/C-712', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'AEX TIE DOWN X7.5', nomenclature: 'TIE DOWN X 7 1/2"', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'AS3-063X5/8X13 1/2', nomenclature: 'ALUM SHEET', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'AT0-032X1/4X19\'', nomenclature: 'SOFT ALUM TUBE COIL', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'AT6-049X1.25X8', nomenclature: '6061 T6 TUBE 1 1/4 x 8\'', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'EA-10 KIT', nomenclature: 'ELEC.AILERON/ROLL TRIM RV-10/14', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'IE F-385B', nomenclature: 'STEWART WARNER FUEL LEVEL SENDER, LEFT TANK', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'IE F-385C', nomenclature: 'STEWART WARNER FUEL LEVEL SENDER, RIGHT TANK', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'J-CHANNEL X6\'', nomenclature: 'ALUM STIFFENER ANGLE', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'J-CHANNEL X8\'', nomenclature: 'ALUM STIFFENER ANGLE', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'ST304-065X1.375X34.62', nomenclature: 'COUNTERBALANCE 10', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'ST4130-035X1/2X48-PC', nomenclature: 'PUSHROD TUBE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'ST4130-035X7/8X22', nomenclature: 'MAKES 2 WD-1014C or CS-00009B', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'T-00007-1', nomenclature: 'METAL FUEL CAP AND FLANGE', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'VA-140', nomenclature: 'TRAILING EDGE', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-00007CD', nomenclature: 'DOUBLER, AILERON ATTACH', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-1006-L', nomenclature: 'MAIN SPAR LEFT-10', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-1006-R', nomenclature: 'MAIN SPAR RIGHT-10', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-1013D-L', nomenclature: 'BRACKET, AIL.HINGE SIDE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-1013D-R', nomenclature: 'BRACKET, AIL.HINGE SIDE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-1013E-L', nomenclature: 'BRACKET, AILERON HINGE SIDE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-1013E-R', nomenclature: 'BRACKET, AILERON HINGE SIDE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-1013FG', nomenclature: 'BRACKET, AILERON HINGE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-1033A', nomenclature: 'AIL. TRIM MNT.BRACKET', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'W-823PP-PC', nomenclature: 'AILERON BRACKET', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'WD-1014-PC', nomenclature: 'AILERON TORQUE TUBE', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'WD-421-L-PC', nomenclature: 'AIL.BELCRANK 7/8/9/10/14', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'WD-421-R-PC', nomenclature: 'AIL.BELCRANK 7/8/9/10/14', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'DWG OP-38 (1-6)', nomenclature: 'RV-10 ELEC. AIL. TRIM', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'ES MSTS-6A', nomenclature: 'MAC TRIM DRIVE .95"', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'ES MSTS-WIRE', nomenclature: '26G FIVE CONDCTR 20\'', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'WIRE #18X20\'', nomenclature: 'WIRE M22759/16-18 TEFZELx 20\'', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
  ],
  bags: [
    { id: 'BAG 1101', description: 'AN426AD3-3', contents: [{ partNumber: 'AN426AD3-3', qty: 0.07 }] },
    { id: 'BAG 1153', description: 'AN426AD3-3.5', contents: [{ partNumber: 'AN426AD3-3.5', qty: 1 }] },
    { id: 'BAG 1154', description: 'RIVET', contents: [{ partNumber: 'AN426AD3-4', qty: 0.4 }] },
    { id: 'BAG 1155', description: 'AN426AD3-4.5', contents: [{ partNumber: 'AN426AD3-4.5', qty: 0.04 }] },
    { id: 'BAG 1157', description: 'AN426AD3-6', contents: [{ partNumber: 'AN426AD3-6', qty: 0.01 }] },
    { id: 'BAG 1159', description: 'AN426AD4-8', contents: [{ partNumber: 'AN426AD4-8', qty: 0.02 }] },
    { id: 'BAG 1160', description: 'AN470AD4-4', contents: [{ partNumber: 'AN470AD4-4', qty: 0.26 }] },
    { id: 'BAG 1161', description: 'AN470AD4-5', contents: [{ partNumber: 'AN470AD4-5', qty: 0.21 }] },
    { id: 'BAG 1162', description: 'AN470AD4-6', contents: [{ partNumber: 'AN470AD4-6', qty: 0.14 }] },
    { id: 'BAG 1163', description: 'AN470AD4-7', contents: [{ partNumber: 'AN470AD4-7', qty: 0.23 }] },
    { id: 'BAG 1165', description: 'AN470AD4-10', contents: [{ partNumber: 'AN470AD4-10', qty: 0.02 }] },
    { id: 'BAG 1172', description: 'POP RIVET AD-41H', contents: [{ partNumber: 'RIVET AD-41H', qty: 22 }] },
    { id: 'BAG 1173', description: 'POP RIVET AD-42-H', contents: [{ partNumber: 'RIVET AD-42-H', qty: 64 }] },
    { id: 'BAG 1174-1', description: 'CS4-4 BLIND RIVETS', contents: [{ partNumber: 'RIVET CS4-4', qty: 100 }] },
    { id: 'BAG 1175-1', description: 'LP4-3 BLIND RIVETS', contents: [{ partNumber: 'RIVET LP4-3', qty: 105 }] },
    { id: 'BAG 1176-1', description: 'MK-319-BS BLIND RIVET', contents: [{ partNumber: 'RIVET MK-319-BS', qty: 270 }] },
    { id: 'BAG 1177', description: 'POP RIVET MSP-42', contents: [{ partNumber: 'RIVET MSP-42', qty: 36 }] },
    { id: 'BAG 1178', description: 'K1000-06 PLATENUTS', contents: [{ partNumber: 'K1000-06', qty: 26 }] },
    { id: 'BAG 1179', description: 'K1000-08 PLATENUTS', contents: [{ partNumber: 'K1000-08', qty: 30 }] },
    { id: 'BAG 1180', description: 'K1000-3 PLATENUTS', contents: [{ partNumber: 'K1000-3', qty: 56 }] },
    { id: 'BAG 1181', description: 'K1000-4/MK1000-428', contents: [{ partNumber: 'K1000-4', qty: 4 }, { partNumber: 'MK1000-428', qty: 2 }] },
    { id: 'BAG 1182', description: 'K1100-08 PLATENUTS', contents: [{ partNumber: 'K1100-08', qty: 224 }] },
    { id: 'BAG 1183', description: 'MS21051-L08 PLATENUTS', contents: [{ partNumber: 'MS21051-L08', qty: 6 }] },
    { id: 'BAG 1184', description: 'MS21053-L08 PLATENUTS', contents: [{ partNumber: 'MS21053-L08', qty: 22 }] },
    { id: 'BAG 1185', description: 'K1100-06 PLATENUTS', contents: [{ partNumber: 'K1100-06', qty: 12 }] },
    { id: 'BAG 1186-1', description: 'MISC FLUID FITTINGS', contents: [
        { partNumber: 'AN818-4D', qty: 5 },
        { partNumber: 'AN819-4D', qty: 5 },
        { partNumber: 'AN832-4D', qty: 4 },
        { partNumber: 'AN924-4D', qty: 3 },
      ] },
    { id: 'BAG 1187-1', description: 'BUSHINGS SB-3/-4/-7', contents: [{ partNumber: 'BUSHING SB375-3', qty: 4 }, { partNumber: 'BUSHING SB437-4', qty: 24 }, { partNumber: 'BUSHING SB625-7', qty: 32 }] },
    { id: 'BAG 1188', description: 'AN507-6R6 SCREWS', contents: [{ partNumber: 'AN507-6R6', qty: 36 }] },
    { id: 'BAG 1189', description: 'AN509-8R8 SCREWS', contents: [{ partNumber: 'AN509-8R8', qty: 275 }] },
    { id: 'BAG 1190', description: 'AN515-8R8 SCREWS', contents: [{ partNumber: 'AN515-8R8', qty: 12 }] },
    { id: 'BAG 1191-1', description: 'AN526C632R8 SCREWS', contents: [{ partNumber: 'AN526C632R8', qty: 8 }] },
    { id: 'BAG 1192', description: 'SCREWS, FINE', contents: [{ partNumber: 'MS24693S10', qty: 2 }, { partNumber: 'MS24694C14', qty: 1 }] },
    { id: 'BAG 1194-1', description: 'AN3-BOLTS', contents: [{ partNumber: 'AN3-4A', qty: 40 }] },
    { id: 'BAG 1195', description: 'AN3-BOLTS', contents: [{ partNumber: 'AN3-5A', qty: 30 }] },
    { id: 'BAG 1196', description: 'AN3-BOLTS', contents: [
        { partNumber: 'AN3-10A', qty: 8 },
        { partNumber: 'AN3-11A', qty: 4 },
        { partNumber: 'AN3-12A', qty: 2 },
        { partNumber: 'AN3-13A', qty: 12 },
        { partNumber: 'AN3-14A', qty: 4 },
        { partNumber: 'AN3-15A', qty: 4 },
        { partNumber: 'AN3-6A', qty: 4 },
        { partNumber: 'AN3-7A', qty: 6 },
      ] },
    { id: 'BAG 1197', description: 'AN3-BOLTS', contents: [
        { partNumber: 'AN3-16A', qty: 6 },
        { partNumber: 'AN3-17A', qty: 2 },
        { partNumber: 'AN3-20A', qty: 6 },
        { partNumber: 'AN3-21A', qty: 4 },
      ] },
    { id: 'BAG 1199', description: 'AN4-BOLTS', contents: [{ partNumber: 'AN4-11A', qty: 2 }, { partNumber: 'AN4-14A', qty: 4 }, { partNumber: 'AN4-32A', qty: 2 }, { partNumber: 'AN4-7', qty: 12 }] },
    { id: 'BAG 1200', description: 'WING TIP ATTACH', contents: [{ partNumber: 'AN507-6R6', qty: 88 }, { partNumber: 'K1000-06', qty: 88 }] },
    { id: 'BAG 1201', description: 'NAS1306-58/NAS1309-58', contents: [{ partNumber: 'NAS1306-58', qty: 8 }, { partNumber: 'NAS1309-58', qty: 8 }] },
    { id: 'BAG 1203-1', description: 'AN365-1032 NUTS', contents: [{ partNumber: 'AN365-1032', qty: 80 }] },
    { id: 'BAG 1204-1', description: 'NUTS 428/624/632/918', contents: [
        { partNumber: 'AN365-428', qty: 8 },
        { partNumber: 'AN365-624A', qty: 10 },
        { partNumber: 'AN365-632A', qty: 10 },
        { partNumber: 'AN365-832A', qty: 2 },
        { partNumber: 'AN365-918A', qty: 8 },
      ] },
    { id: 'BAG 1206', description: 'MISC. JAM NUTS', contents: [
        { partNumber: 'AN310-4', qty: 14 },
        { partNumber: 'AN316-4R', qty: 6 },
        { partNumber: 'AN316-6R', qty: 6 },
        { partNumber: 'MS21044N04', qty: 2 },
        { partNumber: 'MS21083-N3', qty: 4 },
      ] },
    { id: 'BAG 1208', description: 'ROD END BEARINGS, INSERTS', contents: [
        { partNumber: 'BEARING CM-4M', qty: 2 },
        { partNumber: 'BEARING COM-3-5', qty: 4 },
        { partNumber: 'BEARING F3414M', qty: 4 },
        { partNumber: 'BEARING MD3614M', qty: 4 },
        { partNumber: 'VA-146', qty: 4 },
        { partNumber: 'VA-162', qty: 4 },
        { partNumber: 'VA-169', qty: 4 },
        { partNumber: 'VA-4908P', qty: 4 },
      ] },
    { id: 'BAG 1210-1', description: 'NAS1149F0363P WASHERS', contents: [{ partNumber: 'NAS1149F0363P', qty: 150 }] },
    { id: 'BAG 1211', description: 'NAS1149F04 WASHERS', contents: [{ partNumber: 'NAS1149F0432P', qty: 18 }, { partNumber: 'NAS1149F0463P', qty: 48 }] },
    { id: 'BAG 1212', description: 'WHRS #4 -9/16', contents: [
        { partNumber: 'AN970-3', qty: 8 },
        { partNumber: 'NAS1149F0663P', qty: 10 },
        { partNumber: 'NAS1149F0963P', qty: 10 },
        { partNumber: 'NAS1149FN416P', qty: 8 },
        { partNumber: 'NAS1149FN432P', qty: 18 },
        { partNumber: 'NAS1149FN832P', qty: 8 },
      ] },
    { id: 'BAG 1213-1', description: 'COTTER PINS/WASHERS', contents: [{ partNumber: 'MS24665-151', qty: 12 }, { partNumber: 'NAS1149F0332P', qty: 8 }] },
    { id: 'BAG 1214', description: 'BUSHINGS/CAV-110', contents: [{ partNumber: 'BUSH-BZ.25X.375X.250', qty: 6 }, { partNumber: 'CAV-110', qty: 2 }] },
    { id: 'BAG 1215-1', description: 'AILERON BRACKETS', contents: [
        { partNumber: 'A-1006-1', qty: 2 },
        { partNumber: 'A-1007-1', qty: 2 },
        { partNumber: 'A-1008-1', qty: 1 },
        { partNumber: 'WASHER 5702-475-48Z3', qty: 4 },
      ] },
    { id: 'BAG 1216-1', description: 'STALL WARN HARDWARE', contents: [
        { partNumber: 'AN515-8R8', qty: 2 },
        { partNumber: 'ES 421-0107 CONNECTOR', qty: 2 },
        { partNumber: 'ES 421-0108 CONNECTOR', qty: 2 },
        { partNumber: 'ES DVI8-188B-M', qty: 2 },
        { partNumber: 'ES E22-50K MICRO SW', qty: 1 },
        { partNumber: 'K1000-08', qty: 2 },
        { partNumber: 'VA-196', qty: 1 },
      ] },
    { id: 'BAG 1217-1', description: 'MISC WING PARTS', contents: [
        { partNumber: 'T-1010', qty: 2 },
        { partNumber: 'VA-112', qty: 2 },
        { partNumber: 'VA-141', qty: 2 },
        { partNumber: 'VA-195A', qty: 1 },
        { partNumber: 'VA-195B', qty: 1 },
      ] },
    { id: 'BAG 1218-2', description: 'BUSHINGS/FUEL SCREEN', contents: [
        { partNumber: 'AT6-058X5/16X4', qty: 1 },
        { partNumber: 'BUSH AL.197X.313X.438', qty: 2 },
        { partNumber: 'BUSH AL.197X.313X.594', qty: 2 },
        { partNumber: 'BUSH-BS.245X375X2.781', qty: 2 },
        { partNumber: 'VA-261', qty: 2 },
      ] },
    { id: 'BAG 1219', description: 'AILERON HARDWARE', contents: [
        { partNumber: 'AN470AD4-6', qty: 0.01 },
        { partNumber: 'AN509-10R25', qty: 2 },
        { partNumber: 'MS21042-3', qty: 4 },
        { partNumber: 'MS21055-L3', qty: 2 },
      ] },
    { id: 'BAG 1314', description: 'AN426AD4-11', contents: [{ partNumber: 'AN426AD4-11', qty: 0.01 }] },
    { id: 'BAG 1320', description: 'AN470AD4-9', contents: [{ partNumber: 'AN470AD4-9', qty: 0.01 }] },
    { id: 'BAG 1907', description: 'AN426AD4-7', contents: [{ partNumber: 'AN426AD4-7', qty: 0.02 }] },
    { id: 'BAG 1934', description: 'AN426AD3-5', contents: [{ partNumber: 'AN426AD3-5', qty: 0.01 }] },
    { id: 'BAG 2323', description: 'AN470AD4-8', contents: [{ partNumber: 'AN470AD4-8', qty: 0.04 }] },
    { id: 'BAG 323', description: 'AN470AD4-11', contents: [{ partNumber: 'AN470AD4-11', qty: 0.02 }] },
    { id: 'BAG 422', description: 'AN426AD4-4', contents: [{ partNumber: 'AN426AD4-4', qty: 0.02 }] },
    { id: 'BAG 527-1', description: 'STALL WARNER PARTS', contents: [
        { partNumber: 'AN365-632A', qty: 2 },
        { partNumber: 'AN515-6R8', qty: 2 },
        { partNumber: 'BUSHING SB750-10', qty: 1 },
        { partNumber: 'ES 31890', qty: 2 },
        { partNumber: 'ES 320559', qty: 2 },
        { partNumber: 'ES AUDIO WARN', qty: 1 },
        { partNumber: 'MS21266-1N', qty: 1 },
        { partNumber: 'NAS1149FN632P', qty: 2 },
      ] },
    { id: 'BAG 822', description: 'AN470AD4-8', contents: [{ partNumber: 'AN470AD4-8', qty: 0.01 }] },
    { id: 'BAG 967', description: 'TIP LENS HARDWARE ALL', contents: [
        { partNumber: 'AN426AD3-5', qty: 0.01 },
        { partNumber: 'AN507C632R8', qty: 4 },
        { partNumber: 'DOC W/TIP LENS 7/9', qty: 1 },
        { partNumber: 'K1000-06', qty: 4 },
      ] },
    { id: 'BAG 1010', description: 'ELEC. AIL TRIM RV-10', contents: [
        { partNumber: 'ES-00044', qty: 1 },
        { partNumber: 'ES-00047', qty: 6 },
        { partNumber: 'VA-158', qty: 2 },
        { partNumber: 'W-1017B', qty: 1 },
        { partNumber: 'W-1033B', qty: 1 },
        { partNumber: 'W-1033C', qty: 1 },
      ] },
    { id: 'BAG 1011', description: 'ELEC. AIL TRIM RV-10', contents: [
        { partNumber: 'AN365-632A', qty: 4 },
        { partNumber: 'AN509-8R8', qty: 4 },
        { partNumber: 'AN515-6R8', qty: 4 },
        { partNumber: 'BUSHING SB375-3', qty: 1 },
        { partNumber: 'K1100-08', qty: 4 },
        { partNumber: 'MS20392-1C9', qty: 3 },
        { partNumber: 'MS24665-132', qty: 3 },
        { partNumber: 'NAS1149FN432P', qty: 3 },
        { partNumber: 'RIVET LP4-3', qty: 6 },
      ] },
  ],
};
