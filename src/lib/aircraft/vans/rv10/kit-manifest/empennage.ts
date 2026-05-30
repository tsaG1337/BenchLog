import type { KitDefinition } from '@/lib/kitManifest';

export const empennageKit: KitDefinition = {
  id: 'empennage',
  label: 'Empennage Kit',
  subKits: ['ELEV', 'TAILCONE', 'H STAB', 'RUDDER', 'V STAB'],
  entries: [
    // ══════════════════════════════════════════════════════════════
    // MANUFACTURED / MATERIAL (from manifest)
    // ══════════════════════════════════════════════════════════════

    // ── ELEV ──
    { partNumber: 'E-1001A', nomenclature: 'TOP ELEVATOR SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.016 2024-T3 ALCLAD', subKit: 'ELEV' },
    { partNumber: 'E-1001B', nomenclature: 'BOTTOM ELEVATOR SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.016 2024-T3 ALCLAD', subKit: 'ELEV' },
    { partNumber: 'E-1002', nomenclature: 'ELEVATOR FRONT SPAR', qtyRequired: 2, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'E-1007', nomenclature: 'ELEVATOR REAR SPAR', qtyRequired: 2, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #6' },
    { partNumber: 'E-1008', nomenclature: 'ELEVATOR RIB', qtyRequired: 16, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #9' },
    { partNumber: 'E-1015', nomenclature: 'RIGHT TRIM ACCESS REINFORCEMENT PLATE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'E-1017', nomenclature: 'RIGHT OUTBOARD TRIM TAB HORN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: 'BAG 1150-1' },
    { partNumber: 'E-1018', nomenclature: 'RIGHT INBOARD TRIM TAB HORN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: 'BAG 1150-1' },
    { partNumber: 'E-1019', nomenclature: 'RIGHT ELEVATOR TRIM TAB SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.016 2024-T3 ALCLAD', subKit: 'ELEV' },
    { partNumber: 'E-1020', nomenclature: 'RIGHT ELEVATOR TRIM TAB SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'E-1022', nomenclature: 'SHEAR CLIP (4 CLIPS PER PART)', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'ELEV', bag: 'BAG 1150-1' },
    { partNumber: 'E-1023', nomenclature: 'ELEVATOR TRAILING EDGE', qtyRequired: 1, partType: 'MATERIAL', material: 'VA-140', subKit: 'ELEV' },
    { partNumber: 'E-614', nomenclature: 'ELEVATOR COUNTERWEIGHT', qtyRequired: 4, partType: 'MANUFACTURED', material: 'LEAD', subKit: 'ELEV' },
    { partNumber: 'E-615PP', nomenclature: 'TRIM ACCESS REINFORCEMENT PLATE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'E-616PP', nomenclature: 'COVER PLATE - ELEVATOR TRIM', qtyRequired: 2, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #9' },
    { partNumber: 'E-905', nomenclature: 'ELEVATOR ROOT RIB', qtyRequired: 2, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'E-910', nomenclature: 'ELEVATOR HINGE REINFORCEMENT PLATE', qtyRequired: 4, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'ELEV', bag: 'BAG 1001' },
    { partNumber: 'E-912', nomenclature: 'ELEVATOR TIP FAIRING', qtyRequired: 2, partType: 'MANUFACTURED', material: 'Polyester Resin Fiberglass Cloth', subKit: 'ELEV' },
    { partNumber: 'E-913', nomenclature: 'ELEVATOR COUNTERBALANCE SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #1' },
    { partNumber: 'E-917', nomenclature: 'OUTBOARD TRIM TAB HORN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: 'BAG 1001' },
    { partNumber: 'E-918', nomenclature: 'INBOARD TRIM TAB HORN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: 'BAG 1001' },
    { partNumber: 'E-919', nomenclature: 'TRIM TAB SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.016 2024-T3 ALCLAD', subKit: 'ELEV' },
    { partNumber: 'E-920', nomenclature: 'TRIM TAB SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'ELEV', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'E-921', nomenclature: 'ELEVATOR GUSSET', qtyRequired: 2, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'ELEV', bag: 'BAG 1001' },
    { partNumber: 'E-DRILL BUSHING', nomenclature: 'DRILL BUSHING', qtyRequired: 1, partType: 'MATERIAL', material: 'ST4130-035X1/4', subKit: 'ELEV', bag: 'BAG 1001' },
    { partNumber: 'ES-MSTS-8A', nomenclature: 'TRIM SERVO', qtyRequired: 1, partType: 'MANUFACTURED', material: 'N/A', subKit: 'ELEV' },
    { partNumber: 'E-TRAILING EDGE RIB', nomenclature: 'TRAILING EDGE RIB (2 RIBS PER BLOCK)', qtyRequired: 4, partType: 'MATERIAL', material: 'PVC-750 X 2 X 5.25 (3lb/ft^3)', subKit: 'ELEV' },
    { partNumber: 'E-TRIM TAB HINGE', nomenclature: 'TRIM TAB HINGE', qtyRequired: 2, partType: 'MATERIAL', material: 'AN257-P3', subKit: 'ELEV' },
    { partNumber: 'E-TRIM TAB RIB', nomenclature: 'TRIM TAB RIB (2 RIBS PER BLOCK)', qtyRequired: 6, partType: 'MATERIAL', material: 'PVC-750 X 2 X 4.5 (3lb/ft^3)', subKit: 'ELEV' },
    { partNumber: 'WD-605-L-1-PC', nomenclature: 'ELEVATOR HORN', qtyRequired: 1, partType: 'MANUFACTURED', material: '4130 STEEL', subKit: 'ELEV' },
    { partNumber: 'WD-605-R-1-PC', nomenclature: 'ELEVATOR HORN', qtyRequired: 1, partType: 'MANUFACTURED', material: '4130 STEEL', subKit: 'ELEV' },

    // ── TAILCONE ──
    { partNumber: 'CT Q-43', nomenclature: 'ELEVATOR TRIM CABLE', qtyRequired: 2, partType: 'MANUFACTURED', material: 'N/A', subKit: 'TAILCONE' },
    { partNumber: 'F-1006A', nomenclature: 'FUSELAGE BULKHEAD', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'F-1006B', nomenclature: 'FUSELAGE BULKHEAD', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'F-1006C', nomenclature: 'FUSELAGE BULKHEAD', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'F-1006D', nomenclature: 'FUSELAGE BULKHEAD', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'F-1006E', nomenclature: 'UPPER BAGGAGE BULKHEAD CORRUGATION', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1006F', nomenclature: 'LOWER BAGGAGE BULKHEAD CORRUGATION', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1007-L', nomenclature: 'FUSELAGE FRAME', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1007-R', nomenclature: 'FUSELAGE FRAME', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1008-L', nomenclature: 'FUSELAGE FRAME', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1008-R', nomenclature: 'FUSELAGE FRAME', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1009', nomenclature: 'FUSELAGE FRAME', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'F-1010', nomenclature: 'FUSELAGE BULKHEAD', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1010A', nomenclature: 'HORIZONTAL STABILIZER ATTACHMENT ANGLE', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-125X1X1', subKit: 'TAILCONE' },
    { partNumber: 'F-1010B', nomenclature: 'SPACER', qtyRequired: 1, partType: 'MATERIAL', material: 'AS3-125X1.000X9.75', subKit: 'TAILCONE' },
    { partNumber: 'F-1010C', nomenclature: 'BULKHEAD DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1011', nomenclature: 'FUSELAGE BULKHEAD', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.032 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1011A', nomenclature: 'BULKHEAD STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1011B', nomenclature: 'STOP/DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #1' },
    { partNumber: 'F-1011C', nomenclature: 'HORIZ STAB ATTACH BAR', qtyRequired: 2, partType: 'MANUFACTURED', material: '.188 2024-T3 BARE', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #1' },
    { partNumber: 'F-1011D', nomenclature: 'ATTACH BAR SUPPORT ANGLE', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-125X3/4X3/4', subKit: 'TAILCONE' },
    { partNumber: 'F-1011E', nomenclature: 'RUDDER CABLE ANGLE', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-063X3/4X3/4', subKit: 'TAILCONE' },
    { partNumber: 'F-1012A', nomenclature: 'FUSELAGE BULKHEAD', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.032 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'F-1012B', nomenclature: 'FUSELAGE BULKHEAD', qtyRequired: 1, partType: 'MANUFACTURED', material: '0.032 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'F-1012D', nomenclature: 'UP ELEVATOR STOP', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-125X3/4X3/4', subKit: 'TAILCONE' },
    { partNumber: 'F-1012E', nomenclature: 'TIE DOWN BAR', qtyRequired: 1, partType: 'MATERIAL', material: '.AEX TIE DOWN X 7.500', subKit: 'TAILCONE' },
    { partNumber: 'F-1014', nomenclature: 'AFT DECK', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #3' },
    { partNumber: 'F-1028', nomenclature: 'BAGGAGE BULKHEAD CHANNEL', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'F-1029-L', nomenclature: 'BELLCRANK RIB LEFT', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'F-1029-R', nomenclature: 'BELLCRANK RIB RIGHT', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'F-1032-L', nomenclature: 'TAILCONE LONGERON LEFT', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-125X3/4X3/4', subKit: 'TAILCONE' },
    { partNumber: 'F-1032-R', nomenclature: 'TAILCONE LONGERON RIGHT', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-125X3/4X3/4', subKit: 'TAILCONE' },
    { partNumber: 'F-1035-1', nomenclature: 'BATTERY/BELLCRANK MOUNT', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TAILCONE' },
    { partNumber: 'F-1036', nomenclature: 'BATTERY CHANNELS', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'F-1037', nomenclature: 'BELLCRANK RIB ANGLES', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'F-1047A', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047B-L', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047B-R', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047C-L', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047C-R', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047D-L', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047D-R', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047E-L', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047E-R', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047F-L', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047F-R', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1047G', nomenclature: 'TAILCONE SKIN J STIFFENER', qtyRequired: 1, partType: 'MATERIAL', material: 'J-STIF', subKit: 'TAILCONE' },
    { partNumber: 'F-1055', nomenclature: 'RUDDER STOP SKIN STIFFENER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'F-1056', nomenclature: 'RUDDER STOP BRACE', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-063X3/4X3/4', subKit: 'TAILCONE' },
    { partNumber: 'F-1073-L', nomenclature: 'TAILCONE SIDE SKIN LEFT', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE' },
    { partNumber: 'F-1073-R', nomenclature: 'TAILCONE SIDE SKIN RIGHT', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE' },
    { partNumber: 'F-1074', nomenclature: 'TAILCONE FORWARD TOP SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE' },
    { partNumber: 'F-1075', nomenclature: 'TAILCONE AFT TOP SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE' },
    { partNumber: 'F-1078', nomenclature: 'TAILCONE FORWARD BOTTOM SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE' },
    { partNumber: 'F-1079', nomenclature: 'TAILCONE AFT BOTTOM SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #1' },
    { partNumber: 'F-1085', nomenclature: 'RUDDER CABLE BRACKET', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: 'BAG 1149' },
    { partNumber: 'F-1091-1', nomenclature: 'ELEVATOR PUSHROD (AFT)', qtyRequired: 1, partType: 'MATERIAL', material: 'AT6-049X1 1/2', subKit: 'TAILCONE' },
    { partNumber: 'F-1094A', nomenclature: 'EMPENNAGE GAP COVER', qtyRequired: 2, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'F-1095A', nomenclature: 'TRIM MOUNT BRACKET', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'F-1095B', nomenclature: 'TRIM BELLCRANK', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: 'BAG 1149' },
    { partNumber: 'F-1095C', nomenclature: 'TRIM BELLCRANK BRACKET', qtyRequired: 2, partType: 'MATERIAL', material: 'AA6-063X3/4X3/4', subKit: 'TAILCONE' },
    { partNumber: 'F-1095D', nomenclature: 'TRIM SERVO LINK', qtyRequired: 2, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: 'BAG 1149' },
    { partNumber: 'F-1095E', nomenclature: 'TRIM SERVO LINK SPACER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: 'BAG 1149' },
    { partNumber: 'F-1095F', nomenclature: 'TRIM SERVO SPACER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: 'BAG 1149' },
    { partNumber: 'F-1095G', nomenclature: 'TRIM CABLE ANCHOR BRACKET', qtyRequired: 2, partType: 'MATERIAL', material: 'AA6-125X1X1 1/4', subKit: 'TAILCONE' },
    { partNumber: 'F-1098', nomenclature: 'SHIM', qtyRequired: 4, partType: 'MATERIAL', material: 'AB4-125X 1/2', subKit: 'TAILCONE' },
    { partNumber: 'F-6114B', nomenclature: 'WEAR BLOCK', qtyRequired: 2, partType: 'MATERIAL', material: '1/2 X 2 .125 UHMW', subKit: 'TAILCONE' },
    { partNumber: 'F-6114C', nomenclature: 'WEAR BLOCK', qtyRequired: 2, partType: 'MATERIAL', material: '1 X 2 .125 UHMW', subKit: 'TAILCONE' },
    { partNumber: 'F-636', nomenclature: 'SHOULDER HARNESS ANCHOR', qtyRequired: 2, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: 'BAG 1149' },
    { partNumber: 'F-824B', nomenclature: 'COVER PLATE', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'TAILCONE', bag: '10A EMPCONE SUBKIT #9' },

    // ── H STAB ──
    { partNumber: 'HS-1001', nomenclature: 'HORIZONTAL STABILIZER SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'H STAB' },
    { partNumber: 'HS-1002', nomenclature: 'HORIZONTAL STABILIZER FRONT SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'HS-1003', nomenclature: 'HORIZONTAL STABILIZER REAR SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'HS-1004', nomenclature: 'HORIZONTAL STABILIZER INSPAR RIB', qtyRequired: 8, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #1' },
    { partNumber: 'HS-1007', nomenclature: 'HORIZONTAL STABILIZER FRONT SPAR DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'HS-1008-L', nomenclature: 'HORIZ STAB FRONT SPAR ATTACHMENT BCKT', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-187X2X2 1/2', subKit: 'H STAB' },
    { partNumber: 'HS-1008-R', nomenclature: 'HORIZ STAB FRONT SPAR ATTACHMENT BCKT', qtyRequired: 1, partType: 'MATERIAL', material: 'AA6-187X2X2 1/2', subKit: 'H STAB' },
    { partNumber: 'HS-1013', nomenclature: 'HORIZONTAL STABILIZER FRONT SPAR CAP', qtyRequired: 2, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'HS-1014', nomenclature: 'HORIZONTAL STABILIZER LONG STRINGER', qtyRequired: 2, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'HS-1015', nomenclature: 'HORIZONTAL STABILIZER SHORT STRINGER', qtyRequired: 2, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'HS-1016', nomenclature: 'HORIZONTAL STABILIZER STRINGER WEB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #9' },
    { partNumber: 'HS-904', nomenclature: 'HORIZONTAL STABILIZER INSPAR RIB', qtyRequired: 6, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'HS-905', nomenclature: 'HORIZONTAL STABILIZER NOSE RIB', qtyRequired: 8, partType: 'MANUFACTURED', material: '.025 2024-T0 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'HS-906', nomenclature: 'HORIZONTAL STABILIZER REAR SPAR DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T0 ALCLAD', subKit: 'H STAB', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'HS-910', nomenclature: 'HORIZONTAL STABILIZER TIP FAIRING', qtyRequired: 2, partType: 'MANUFACTURED', material: 'Polyester Resin Fiberglass Cloth', subKit: 'H STAB' },
    { partNumber: 'HS-911-PC', nomenclature: 'HORIZONTAL STABILIZER INBD HINGE BRACKET', qtyRequired: 2, partType: 'MANUFACTURED', material: '.050 4130 COND N', subKit: 'H STAB', bag: 'BAG 1001' },
    { partNumber: 'HS-912-PC', nomenclature: 'HORIZONTAL STABILIZER HINGE BRACKET', qtyRequired: 8, partType: 'MANUFACTURED', material: '.050 4130 COND N', subKit: 'H STAB', bag: 'BAG 1001' },

    // ── RUDDER ──
    { partNumber: 'R-01007A-1', nomenclature: 'PLATE, STRIKER', qtyRequired: 2, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'RUDDER', bag: 'BAG 1149' },
    { partNumber: 'R-01007B-1', nomenclature: 'STOP, RUDDER', qtyRequired: 2, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'RUDDER', bag: 'BAG 1149' },
    { partNumber: 'R-1001', nomenclature: 'RUDDER SKIN', qtyRequired: 2, partType: 'MANUFACTURED', material: '.016 2024-T3 ALCLAD', subKit: 'RUDDER' },
    { partNumber: 'R-1002', nomenclature: 'RUDDER SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'RUDDER', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'R-1003', nomenclature: 'RUDDER TOP RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'RUDDER', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'R-1004', nomenclature: 'RUDDER BOTTOM RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'RUDDER', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'R-1005', nomenclature: 'RUDDER HORN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'RUDDER', bag: '10A EMPCONE SUBKIT #9' },
    { partNumber: 'R-1006', nomenclature: 'RUDDER TRAILING EDGE', qtyRequired: 1, partType: 'MATERIAL', material: 'VA-140', subKit: 'RUDDER' },
    { partNumber: 'R-1009', nomenclature: 'RUDDER TIP FAIRING', qtyRequired: 1, partType: 'MANUFACTURED', material: 'Polyester Resin Fiberglass Cloth', subKit: 'RUDDER' },
    { partNumber: 'R-1010', nomenclature: 'RUDDER STIFFENER SHEAR CLIP (7 CLIPS PER PART)', qtyRequired: 1, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'RUDDER', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'R-1011', nomenclature: 'RUDDER BOTTOM FAIRING', qtyRequired: 1, partType: 'MANUFACTURED', material: 'Polyester Resin Fiberglass Cloth', subKit: 'RUDDER' },
    { partNumber: 'R-1012', nomenclature: 'RUDDER COUNTERBALANCE RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'RUDDER', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'R-1014', nomenclature: 'RUDDER COUNTERBALANCE WEIGHT', qtyRequired: 1, partType: 'MANUFACTURED', material: 'LEAD', subKit: 'RUDDER' },
    { partNumber: 'R-1015', nomenclature: 'RUDDER STIFFENER (2 STIFFENERS PER PART)', qtyRequired: 7, partType: 'MANUFACTURED', material: '.020 2024-T3 ALCLAD', subKit: 'RUDDER', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'R-607PP', nomenclature: 'REINFORCEMENT PLATE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'RUDDER', bag: 'BAG 1001' },
    { partNumber: 'R-608PP', nomenclature: 'REINFORCEMENT PLATE', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'RUDDER', bag: 'BAG 1001' },

    // ── V STAB ──
    { partNumber: 'VS-1001', nomenclature: 'VERTICAL STAB SKIN', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'V STAB' },
    { partNumber: 'VS-1002', nomenclature: 'VERTICAL STAB FRONT SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #6' },
    { partNumber: 'VS-1003', nomenclature: 'VERTICAL STAB REAR SPAR', qtyRequired: 1, partType: 'MANUFACTURED', material: '.032 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'VS-1004', nomenclature: 'VERTICAL STAB BOTTOM INSPAR RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'VS-1005', nomenclature: 'VERTICAL STAB BOTTOM NOSE RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'VS-1006', nomenclature: 'VERTICAL STAB TOP RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'VS-1007', nomenclature: 'VERTICAL STAB MIDDLE INSPAR RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #4' },
    { partNumber: 'VS-1008', nomenclature: 'VERTICAL STAB REAR SPAR DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.125 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'VS-1009', nomenclature: 'VERTICAL STAB TIP FAIRING', qtyRequired: 1, partType: 'MANUFACTURED', material: 'Polyester Resin Fiberglass Cloth', subKit: 'V STAB' },
    { partNumber: 'VS-1013', nomenclature: 'VERTICAL STAB MIDDLE NOSE RIB', qtyRequired: 1, partType: 'MANUFACTURED', material: '.025 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #2' },
    { partNumber: 'VS-1014', nomenclature: 'VERTICAL STAB REAR SPAR CAP', qtyRequired: 2, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'VS-1015', nomenclature: 'VERTICAL STAB FRONT SPAR DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #1' },
    { partNumber: 'VS-1016', nomenclature: 'VERTICAL STAB FRONT SPAR ATTACH BCKT', qtyRequired: 1, partType: 'MANUFACTURED', material: '.063 2024-T3 ALCLAD', subKit: 'V STAB', bag: '10A EMPCONE SUBKIT #9' },
    { partNumber: 'VS-1017', nomenclature: 'HINGE DOUBLER', qtyRequired: 1, partType: 'MANUFACTURED', material: '.040 2024-T3 ALCLAD', subKit: 'V STAB', bag: 'BAG 1150-1' },

    // ══════════════════════════════════════════════════════════════
    // HARDWARE (from packing list bags — items not in manifest)
    // ══════════════════════════════════════════════════════════════

    // ── BAG 1001 — additional hardware-only items ──
    { partNumber: 'VS-01010-1-PC', nomenclature: 'HINGE BRKT RUDR BOTM', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1001' },
    { partNumber: 'VS-1011-PC', nomenclature: 'MID RUDR HINGE BRAKET', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1001' },
    { partNumber: 'VS-1012-PC', nomenclature: 'TOP RUDR HINGE BRAKET', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1001' },
    { partNumber: 'WD-415-1', nomenclature: 'TRIM CABLE ANCHOR', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1001' },

    // ── BAG 1101 ──
    { partNumber: 'AN426AD3-3', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.070, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1101', unit: 'lb' },

    // ── BAG 1102 ──
    { partNumber: 'AN426AD3-3.5', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.550, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1102', unit: 'lb' },

    // ── BAG 1103 ──
    { partNumber: 'AN426AD3-4', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.200, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1103', unit: 'lb' },

    // ── BAG 1104 ──
    { partNumber: 'AN426AD3-4.5', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.050, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1104', unit: 'lb' },

    // ── BAG 1105 ──
    { partNumber: 'AN426AD3-5', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1105', unit: 'lb' },

    // ── BAG 1106 ──
    { partNumber: 'AN426AD3-6', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.040, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1106', unit: 'lb' },

    // ── BAG 1108 ──
    { partNumber: 'AN470AD4-9', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1108', unit: 'lb' },

    // ── BAG 1109 ──
    { partNumber: 'AN470AD4-10', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1109', unit: 'lb' },

    // ── BAG 1110 ──
    { partNumber: 'AN426AD4-4', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1110', unit: 'lb' },

    // ── BAG 1111 ──
    { partNumber: 'AN426AD4-5', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1111', unit: 'lb' },

    // ── BAG 1115 ──
    { partNumber: 'AN470AD3-4', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1115', unit: 'lb' },

    // ── BAG 1117 ──
    { partNumber: 'AN470AD4-4', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.210, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1117', unit: 'lb' },

    // ── BAG 1118 ──
    { partNumber: 'AN470AD4-5', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.110, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1118', unit: 'lb' },

    // ── BAG 1119 ──
    { partNumber: 'AN470AD4-6', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.100, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1119', unit: 'lb' },

    // ── BAG 1120 ──
    { partNumber: 'AN470AD4-7', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.080, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1120', unit: 'lb' },

    // ── BAG 1122 ──
    { partNumber: 'RIVET CCR-264SS-3-2', nomenclature: '3/32 FLUSH SS', qtyRequired: 12, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1122' },

    // ── BAG 1123 ──
    { partNumber: 'RIVET AD-41-ABS', nomenclature: 'POP RIVET', qtyRequired: 95, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1123' },

    // ── BAG 1124 ──
    { partNumber: 'RIVET CS4-4', nomenclature: 'POP RIVET', qtyRequired: 270, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1124' },

    // ── BAG 1125-1 ──
    { partNumber: 'RIVET LP4-3', nomenclature: 'POP RIVET', qtyRequired: 225, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1125-1' },

    // ── BAG 1126 ──
    { partNumber: 'RIVET MK-319-BS', nomenclature: 'POP RIVET', qtyRequired: 12, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1126' },

    // ── BAG 1127 ──
    { partNumber: 'RIVET MSP-42', nomenclature: 'POP RIVET', qtyRequired: 16, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1127' },

    // ── BAG 1130 ──
    { partNumber: 'K1000-06', nomenclature: '6-32 PLATENUT "FIGURE 8 SHAPE"', qtyRequired: 40, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1130' },
    { partNumber: 'K1000-6', nomenclature: 'PLATENUT 3/8-24 MS21047L6', qtyRequired: 7, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1130' },

    // ── BAG 1131 ──
    { partNumber: 'K1000-08', nomenclature: 'PLATENUT 8-32 KAYNAR', qtyRequired: 52, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1131' },
    { partNumber: 'K1000-4', nomenclature: 'PLATENUT 1/4-28', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1131' },

    // ── BAG 1132-1 ──
    { partNumber: 'K1000-3', nomenclature: 'PLATENUT 10-32 MS21047L3', qtyRequired: 16, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1132-1' },
    { partNumber: 'K1100-06', nomenclature: 'PLATENUT SCREW HOLE DIMPLED 6-32', qtyRequired: 25, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1132-1' },
    { partNumber: 'MS21051-L08', nomenclature: '832 SINGLE LUG P/NUT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1132-1' },

    // ── BAG 1133-1 ──
    { partNumber: 'BUSHING SB625-7', nomenclature: 'SNAP-IN 7/16ID 5/8 OD', qtyRequired: 10, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1133-1' },
    { partNumber: 'BUSHING SB625-8', nomenclature: 'SNAP-IN 1/2ID 5/8 OD', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1133-1' },

    // ── BAG 1134 ──
    { partNumber: 'AN507-6R6', nomenclature: 'SCREW, FLT HD', qtyRequired: 36, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1134' },

    // ── BAG 1135 ──
    { partNumber: 'AN507C632R8', nomenclature: 'SCREW, FLT HD SS', qtyRequired: 36, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1135' },

    // ── BAG 1136 ──
    { partNumber: 'AN509-10R11', nomenclature: 'SCREW, FLT HD STRUCT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1136' },
    { partNumber: 'AN509-8R11', nomenclature: 'SCREW, FLT HD STRUCT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1136' },
    { partNumber: 'AN509-8R12', nomenclature: 'SCREW, FLT HD STRUCT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1136' },
    { partNumber: 'AN515-6R8', nomenclature: '632X1/2 PAN HEAD SCREW', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1136' },

    // ── BAG 1137 ──
    { partNumber: 'AN515-8R8', nomenclature: '832X1/2 PAN HEAD SCREW', qtyRequired: 55, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1137' },

    // ── BAG 1138-1 ──
    { partNumber: 'AN3-10A', nomenclature: 'AN BOLT', qtyRequired: 10, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1138-1' },
    { partNumber: 'AN3-11A', nomenclature: 'AN BOLT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1138-1' },
    { partNumber: 'AN3-12A', nomenclature: 'AN BOLT', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1138-1' },
    { partNumber: 'AN3-13A', nomenclature: 'AN BOLT', qtyRequired: 5, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1138-1' },
    { partNumber: 'AN3-4A', nomenclature: 'AN BOLT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1138-1' },
    { partNumber: 'AN3-5A', nomenclature: 'AN BOLT', qtyRequired: 36, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1138-1' },
    { partNumber: 'AN3-6', nomenclature: 'AN BOLT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1138-1' },
    { partNumber: 'AN3-6A', nomenclature: 'AN BOLT', qtyRequired: 18, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1138-1' },

    // ── BAG 1139 ──
    { partNumber: 'AN665-21R', nomenclature: 'CLEVIS ROD END', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1139' },
    { partNumber: 'MS20392-1C11', nomenclature: 'CLEVIS PIN', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1139' },
    { partNumber: 'MS20392-2C11', nomenclature: 'CLEVIS PIN', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1139' },
    { partNumber: 'MS24665-132', nomenclature: 'COTTER PIN', qtyRequired: 5, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1139' },
    { partNumber: 'NAS1149FN416P', nomenclature: 'REPLACES AN960-4L', qtyRequired: 5, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1139' },

    // ── BAG 1140-1 ──
    { partNumber: 'AN4-11A', nomenclature: 'AN BOLT', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1140-1' },
    { partNumber: 'AN4-13A', nomenclature: 'AN BOLT', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1140-1' },
    { partNumber: 'AN4-14A', nomenclature: 'AN BOLT', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1140-1' },
    { partNumber: 'AN4-4A', nomenclature: 'AN BOLT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1140-1' },
    { partNumber: 'AN4-5', nomenclature: 'AN BOLT', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1140-1' },
    { partNumber: 'AN4-6', nomenclature: 'AN BOLT', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1140-1' },
    { partNumber: 'AN4-7A', nomenclature: 'AN BOLT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1140-1' },

    // ── BAG 1141 ──
    { partNumber: 'AN315-3R', nomenclature: 'NUT, JAM 3/16', qtyRequired: 5, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1141' },
    { partNumber: 'BEARING MW-3M', nomenclature: 'ROD END THROTTLE CABL', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1141' },

    // ── BAG 1142 ──
    { partNumber: 'AN365-428', nomenclature: 'NUT, STOP 1/4-28', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1142' },
    { partNumber: 'AN365-632A', nomenclature: 'NUT, STOP 6-32', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1142' },
    { partNumber: 'MS21042-08', nomenclature: '8-32 METAL LOCK NUT', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1142' },
    { partNumber: 'MS21042-3', nomenclature: '10-32 METAL LOCK NUT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1142' },

    // ── BAG 1143 ──
    { partNumber: 'AN365-1032', nomenclature: 'NUT, STOP', qtyRequired: 62, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1143' },

    // ── BAG 1144 ──
    { partNumber: 'AN310-3', nomenclature: 'NUT, CASTLE 3/16', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1144' },
    { partNumber: 'AN310-4', nomenclature: 'NUT, CASTLE 1/4', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1144' },
    { partNumber: 'AN316-6R', nomenclature: 'NUT, THIN JAM 3/8', qtyRequired: 9, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1144' },

    // ── BAG 1145 ──
    { partNumber: 'BEARING MD3614M', nomenclature: '3/16 X 3/8 ROD END', qtyRequired: 7, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1145' },
    { partNumber: 'BEARING MD3616M', nomenclature: '3/16X3/8M LONG RD END', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1145' },
    { partNumber: 'VA-146', nomenclature: 'FLANGE BEARING', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1145' },

    // ── BAG 1146 ──
    { partNumber: 'NAS1149F0432P', nomenclature: 'REPLACES AN960-416L', qtyRequired: 4, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1146' },
    { partNumber: 'NAS1149F0463P', nomenclature: 'REPLACES AN960-416', qtyRequired: 16, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1146' },
    { partNumber: 'NAS1149FN832P', nomenclature: 'REPLACES AN960-8', qtyRequired: 24, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1146' },

    // ── BAG 1147 ──
    { partNumber: 'NAS1149F0332P', nomenclature: 'REPLACES AN960-10L', qtyRequired: 10, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1147' },
    { partNumber: 'NAS1149F0363P', nomenclature: 'REPLACES AN960-10', qtyRequired: 104, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1147' },

    // ── BAG 1148-1 ──
    { partNumber: 'MS21919WDG6', nomenclature: 'CUSHION CLAMP 3/8', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1148-1' },
    { partNumber: 'MS24665-132', nomenclature: 'COTTER PIN', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1148-1' },
    { partNumber: 'MS24665-208', nomenclature: 'COTTER PIN - CLEVIS', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1148-1' },

    // ── BAG 1149 — additional hardware-only items ──
    { partNumber: 'AS3-063X0.5X1.4375', nomenclature: 'AL SHEET', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1149' },
    { partNumber: 'PS UHMW-125X1/2X2', nomenclature: 'PLASTIC STRIP', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1149' },
    { partNumber: 'PS UHMW-125X1X2', nomenclature: 'PLASTIC STRIP F-6114C', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1149' },

    // ── BAG 1150-1 — no additional hardware-only items ──

    // ── BAG 1151 ──
    { partNumber: 'VA-101', nomenclature: 'THREADED INSERT', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1151' },

    // ── BAG 1230 ──
    { partNumber: 'AN426AD4-8', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1230', unit: 'lb' },

    // ── BAG 1906 ──
    { partNumber: 'AN426AD4-6', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1906', unit: 'lb' },

    // ── BAG 1907 ──
    { partNumber: 'AN426AD4-7', nomenclature: 'COUNTERSUNK HEAD RIVETS', qtyRequired: 0.020, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1907', unit: 'lb' },

    // ── BAG 822 ──
    { partNumber: 'AN470AD4-8', nomenclature: 'UNIVERSAL HEAD RIVETS', qtyRequired: 0.010, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 822', unit: 'lb' },

    // ── 10A EMPCONE SUBKIT #1 — hardware-only items ──
    { partNumber: 'AS3-125X1X13', nomenclature: 'ALUM SHEET', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #1' },
    { partNumber: 'F-635', nomenclature: 'ELEV BELCRK (SET OF 2)', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #1' },

    // ── 10A EMPCONE SUBKIT #4 — hardware-only items ──
    { partNumber: 'AB4-125X1 1/2X8', nomenclature: 'ALUM BAR', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #4' },

    // ── 10A EMPCONE SUBKIT #5 — hardware-only items ──
    { partNumber: 'AA6-125X1X1 1/4X5', nomenclature: 'ALUM ANGLE (INCHES)', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'AEX TIE DOWN X7.5', nomenclature: 'TIE DOWN X 7 1/2"', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'BOLT HEX 1/4X28-8', nomenclature: 'BATTERY CLAMP 8-1&10', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'E-00903-1', nomenclature: 'ELEVATOR TIP RIB', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'E-00904-1', nomenclature: 'ELEVATOR TIP RIB', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #5' },
    { partNumber: 'F-1035', nomenclature: 'BATTERY/B.CRANK MOUNT', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #5' },

    // ── 10A EMPCONE SUBKIT #6 — hardware-only items ──
    { partNumber: 'AT6-035X1 1/2X83', nomenclature: 'PUSH ROD TUBE, 83 INCHES', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #6' },
    { partNumber: 'J-CHANNEL X6\'', nomenclature: 'ALUM STIFFENER ANGLE', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #6' },
    { partNumber: 'J-CHANNEL X8\'', nomenclature: 'ALUM STIFFENER ANGLE', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #6' },

    // ── 10A EMPCONE SUBKIT #8 — hardware-only items ──
    { partNumber: 'AA6-063X3/4X3/4X18', nomenclature: '18 INCH ALUM ANGLE C-612/C-712', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'AA6-125X1X1X17', nomenclature: 'ANGLE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'AA6-125X3/4X3/4X17', nomenclature: 'AL. ANGLE HS-610/810', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'AA6-125X3/4X3/4X98.5', nomenclature: 'ALUM ANGLE', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'AN257-P3X6\'', nomenclature: 'HINGE X 6\'', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #8' },
    { partNumber: 'VA-140', nomenclature: 'TRAILING EDGE', qtyRequired: 2, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #8' },

    // ── 10A EMPCONE SUBKIT #9 — hardware-only items ──
    { partNumber: 'AA6-187X2X2 1/2X5', nomenclature: 'ALUM ANGLE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #9' },
    { partNumber: 'FOAM, PVC-750X2X5.25', nomenclature: 'FOAM BLOCK', qtyRequired: 5, partType: 'HARDWARE', material: '', subKit: '', bag: '10A EMPCONE SUBKIT #9' },

    // ── BAG SHEET METAL BASIC — all hardware-only ──
    { partNumber: 'AA3-025X5/8X5/8X5"', nomenclature: 'SHEET METAL BASICS', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG SHEET METAL BASIC' },
    { partNumber: 'AN515-8R8', nomenclature: 'SCREW', qtyRequired: 50, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG SHEET METAL BASIC' },
    { partNumber: 'AS3-020X4"X5"', nomenclature: 'SHEET METAL BASIC', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG SHEET METAL BASIC' },
    { partNumber: 'AS3-032X4X5', nomenclature: 'EET-602A', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG SHEET METAL BASIC' },
    { partNumber: 'DWG OP-51', nomenclature: 'SHEET METAL BASICS', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG SHEET METAL BASIC' },

    // ══════════════════════════════════════════════════════════════
    // STANDALONE PACKING LIST ITEMS (not in manifest, no bag)
    // ══════════════════════════════════════════════════════════════
    { partNumber: 'WASHER 5702-475-48 Z3', nomenclature: 'WASHER', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1145' },
    { partNumber: 'WASHER 5702-95-30', nomenclature: 'WASHER', qtyRequired: 6, partType: 'HARDWARE', material: '', subKit: '', bag: 'BAG 1145' },
    { partNumber: '10A PLANS EMP.SET', nomenclature: 'PLANS & MANUAL', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'DWG 1 RV-10', nomenclature: '3 VIEW RV-10 D SIZE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'DWG 2 RV-10', nomenclature: 'CUTAWAY RV-10 D SIZE', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
    { partNumber: 'TRIM BUNDLE, EMP', nomenclature: 'ASSORTED SHEET METAL', qtyRequired: 1, partType: 'HARDWARE', material: '', subKit: '' },
  ],

  bags: [
    // ── Hardware bags ──
    { id: 'BAG 1001', description: 'MISC EMP HDWRE', contents: [
        { partNumber: 'E-910', qty: 4 },
        { partNumber: 'E-917', qty: 1 },
        { partNumber: 'E-918', qty: 1 },
        { partNumber: 'E-921', qty: 2 },
        { partNumber: 'E-DRILL BUSHING', qty: 1 },
        { partNumber: 'HS-911-PC', qty: 2 },
        { partNumber: 'HS-912-PC', qty: 8 },
        { partNumber: 'R-607PP', qty: 1 },
        { partNumber: 'R-608PP', qty: 1 },
        { partNumber: 'VS-01010-1-PC', qty: 1 },
        { partNumber: 'VS-1011-PC', qty: 2 },
        { partNumber: 'VS-1012-PC', qty: 2 },
        { partNumber: 'WD-415-1', qty: 2 },
      ] },
    { id: 'BAG 1101', description: 'AN426AD3-3', contents: [{ partNumber: 'AN426AD3-3', qty: 0.07 }] },
    { id: 'BAG 1102', description: 'AN426AD3-3.5', contents: [{ partNumber: 'AN426AD3-3.5', qty: 0.55 }] },
    { id: 'BAG 1103', description: 'AN426AD3-4', contents: [{ partNumber: 'AN426AD3-4', qty: 0.2 }] },
    { id: 'BAG 1104', description: 'AN426AD3-4.5', contents: [{ partNumber: 'AN426AD3-4.5', qty: 0.05 }] },
    { id: 'BAG 1105', description: 'AN426AD3-5', contents: [{ partNumber: 'AN426AD3-5', qty: 0.02 }] },
    { id: 'BAG 1106', description: 'AN426AD3-6', contents: [{ partNumber: 'AN426AD3-6', qty: 0.04 }] },
    { id: 'BAG 1108', description: 'AN470AD4-9', contents: [{ partNumber: 'AN470AD4-9', qty: 0.02 }] },
    { id: 'BAG 1109', description: 'AN470AD4-10', contents: [{ partNumber: 'AN470AD4-10', qty: 0.01 }] },
    { id: 'BAG 1110', description: 'AN426AD4-4', contents: [{ partNumber: 'AN426AD4-4', qty: 0.01 }] },
    { id: 'BAG 1111', description: 'AN426AD4-5', contents: [{ partNumber: 'AN426AD4-5', qty: 0.01 }] },
    { id: 'BAG 1115', description: 'AN470AD3-4', contents: [{ partNumber: 'AN470AD3-4', qty: 0.01 }] },
    { id: 'BAG 1117', description: 'AN470AD4-4', contents: [{ partNumber: 'AN470AD4-4', qty: 0.21 }] },
    { id: 'BAG 1118', description: 'AN470AD4-5', contents: [{ partNumber: 'AN470AD4-5', qty: 0.11 }] },
    { id: 'BAG 1119', description: 'AN470AD4-6', contents: [{ partNumber: 'AN470AD4-6', qty: 0.1 }] },
    { id: 'BAG 1120', description: 'AN470AD4-7', contents: [{ partNumber: 'AN470AD4-7', qty: 0.08 }] },
    { id: 'BAG 1122', description: 'POP RIVET CCR264SS3-2', contents: [{ partNumber: 'RIVET CCR-264SS-3-2', qty: 12 }] },
    { id: 'BAG 1123', description: 'POP RIVET AD-41-ABS', contents: [{ partNumber: 'RIVET AD-41-ABS', qty: 95 }] },
    { id: 'BAG 1124', description: 'POP RIVET CS4-4', contents: [{ partNumber: 'RIVET CS4-4', qty: 270 }] },
    { id: 'BAG 1125-1', description: 'POP RIVET LP4-3', contents: [{ partNumber: 'RIVET LP4-3', qty: 225 }] },
    { id: 'BAG 1126', description: 'POP RIVET MK-319-BS', contents: [{ partNumber: 'RIVET MK-319-BS', qty: 12 }] },
    { id: 'BAG 1127', description: 'POP RIVET MSP-42', contents: [{ partNumber: 'RIVET MSP-42', qty: 16 }] },
    { id: 'BAG 1130', description: 'K1000-06/-6 PLATENUTS', contents: [{ partNumber: 'K1000-06', qty: 40 }, { partNumber: 'K1000-6', qty: 7 }] },
    { id: 'BAG 1131', description: 'K1000-08/-4 PLATENUTS', contents: [{ partNumber: 'K1000-08', qty: 52 }, { partNumber: 'K1000-4', qty: 4 }] },
    { id: 'BAG 1132-1', description: 'PLATENUTS', contents: [{ partNumber: 'K1000-3', qty: 16 }, { partNumber: 'K1100-06', qty: 25 }, { partNumber: 'MS21051-L08', qty: 4 }] },
    { id: 'BAG 1133-1', description: 'BUSHINGS SB625-7/-8', contents: [{ partNumber: 'BUSHING SB625-7', qty: 10 }, { partNumber: 'BUSHING SB625-8', qty: 6 }] },
    { id: 'BAG 1134', description: 'AN507-6R6 SCREWS', contents: [{ partNumber: 'AN507-6R6', qty: 36 }] },
    { id: 'BAG 1135', description: 'AN507C632R8 SCREWS', contents: [{ partNumber: 'AN507C632R8', qty: 36 }] },
    { id: 'BAG 1136', description: 'AN509-8R/10R AN515-6R SCREWS', contents: [
        { partNumber: 'AN509-10R11', qty: 2 },
        { partNumber: 'AN509-8R11', qty: 4 },
        { partNumber: 'AN509-8R12', qty: 2 },
        { partNumber: 'AN515-6R8', qty: 4 },
      ] },
    { id: 'BAG 1137', description: 'AN515-8R8 SCREWS', contents: [{ partNumber: 'AN515-8R8', qty: 55 }] },
    { id: 'BAG 1138-1', description: 'MISC AN3 BOLTS', contents: [
        { partNumber: 'AN3-10A', qty: 10 },
        { partNumber: 'AN3-11A', qty: 4 },
        { partNumber: 'AN3-12A', qty: 1 },
        { partNumber: 'AN3-13A', qty: 5 },
        { partNumber: 'AN3-4A', qty: 2 },
        { partNumber: 'AN3-5A', qty: 36 },
        { partNumber: 'AN3-6', qty: 2 },
        { partNumber: 'AN3-6A', qty: 18 },
      ] },
    { id: 'BAG 1139', description: 'MISC HARDWARE', contents: [
        { partNumber: 'AN665-21R', qty: 2 },
        { partNumber: 'MS20392-1C11', qty: 2 },
        { partNumber: 'MS20392-2C11', qty: 2 },
        { partNumber: 'MS24665-132', qty: 5 },
        { partNumber: 'NAS1149FN416P', qty: 5 },
      ] },
    { id: 'BAG 1140-1', description: 'MISC AN4 BOLTS', contents: [
        { partNumber: 'AN4-11A', qty: 1 },
        { partNumber: 'AN4-13A', qty: 1 },
        { partNumber: 'AN4-14A', qty: 1 },
        { partNumber: 'AN4-4A', qty: 2 },
        { partNumber: 'AN4-5', qty: 1 },
        { partNumber: 'AN4-6', qty: 1 },
        { partNumber: 'AN4-7A', qty: 2 },
      ] },
    { id: 'BAG 1141', description: 'MISC HARDWARE', contents: [{ partNumber: 'AN315-3R', qty: 5 }, { partNumber: 'BEARING MW-3M', qty: 2 }] },
    { id: 'BAG 1142', description: 'AN365-832/-428 MS21042-3/-08 NUTS', contents: [
        { partNumber: 'AN365-428', qty: 4 },
        { partNumber: 'AN365-632A', qty: 4 },
        { partNumber: 'MS21042-08', qty: 4 },
        { partNumber: 'MS21042-3', qty: 2 },
      ] },
    { id: 'BAG 1143', description: 'AN365-1032 NUTS', contents: [{ partNumber: 'AN365-1032', qty: 62 }] },
    { id: 'BAG 1144', description: 'AN316-6/310-3/310-4', contents: [{ partNumber: 'AN310-3', qty: 2 }, { partNumber: 'AN310-4', qty: 2 }, { partNumber: 'AN316-6R', qty: 9 }] },
    { id: 'BAG 1145', description: 'MD3614M/MD3616M/VA-146', contents: [{ partNumber: 'BEARING MD3614M', qty: 7 }, { partNumber: 'BEARING MD3616M', qty: 2 }, { partNumber: 'VA-146', qty: 2 }, { partNumber: 'WASHER 5702-475-48 Z3', qty: 6 }, { partNumber: 'WASHER 5702-95-30', qty: 6 }] },
    { id: 'BAG 1146', description: 'AN960-8/-416 WASHERS', contents: [{ partNumber: 'NAS1149F0432P', qty: 4 }, { partNumber: 'NAS1149F0463P', qty: 16 }, { partNumber: 'NAS1149FN832P', qty: 24 }] },
    { id: 'BAG 1147', description: 'AN960-10/-10L WASHERS', contents: [{ partNumber: 'NAS1149F0332P', qty: 10 }, { partNumber: 'NAS1149F0363P', qty: 104 }] },
    { id: 'BAG 1148-1', description: 'COTTER PINS AND CUSHION CLAMPS', contents: [{ partNumber: 'MS21919WDG6', qty: 2 }, { partNumber: 'MS24665-132', qty: 2 }, { partNumber: 'MS24665-208', qty: 2 }] },
    { id: 'BAG 1149', description: 'MISC EMP/CONE PARTS', contents: [
        { partNumber: 'AS3-063X0.5X1.4375', qty: 1 },
        { partNumber: 'F-1085', qty: 1 },
        { partNumber: 'F-1095B', qty: 1 },
        { partNumber: 'F-1095D', qty: 2 },
        { partNumber: 'F-1095E', qty: 1 },
        { partNumber: 'F-1095F', qty: 1 },
        { partNumber: 'F-636', qty: 2 },
        { partNumber: 'PS UHMW-125X1/2X2', qty: 2 },
        { partNumber: 'PS UHMW-125X1X2', qty: 2 },
        { partNumber: 'R-01007A-1', qty: 2 },
        { partNumber: 'R-01007B-1', qty: 2 },
      ] },
    { id: 'BAG 1150-1', description: 'EMPENNAGE PARTS', contents: [{ partNumber: 'E-1017', qty: 1 }, { partNumber: 'E-1018', qty: 1 }, { partNumber: 'E-1022', qty: 1 }, { partNumber: 'VS-1017', qty: 1 }] },
    { id: 'BAG 1151', description: 'THREADED INSERTS, VA-101', contents: [{ partNumber: 'VA-101', qty: 2 }] },
    { id: 'BAG 1230', description: 'AN426AD4-8', contents: [{ partNumber: 'AN426AD4-8', qty: 0.01 }] },
    { id: 'BAG 1906', description: 'AN426AD4-6', contents: [{ partNumber: 'AN426AD4-6', qty: 0.02 }] },
    { id: 'BAG 1907', description: 'AN426AD4-7', contents: [{ partNumber: 'AN426AD4-7', qty: 0.02 }] },
    { id: 'BAG 822', description: 'AN470AD4-8', contents: [{ partNumber: 'AN470AD4-8', qty: 0.01 }] },
    { id: 'BAG SHEET METAL BASIC', description: 'METALWORKING PROJECT', contents: [
        { partNumber: 'AA3-025X5/8X5/8X5"', qty: 1 },
        { partNumber: 'AN426AD3-3.5', qty: 0 },
        { partNumber: 'AN426AD3-4', qty: 0 },
        { partNumber: 'AN470AD4-4', qty: 0.01 },
        { partNumber: 'AN515-8R8', qty: 50 },
        { partNumber: 'AS3-020X4"X5"', qty: 1 },
        { partNumber: 'AS3-032X4X5', qty: 1 },
        { partNumber: 'DWG OP-51', qty: 1 },
        { partNumber: 'K1000-08', qty: 2 },
        { partNumber: 'RIVET LP4-3', qty: 6 },
      ] },

    // ── Sub-kit containers ──
    { id: '10A EMPCONE SUBKIT #1', description: 'E1B', contents: [
        { partNumber: 'AS3-125X1X13', qty: 1 }, { partNumber: 'E-913', qty: 2 }, { partNumber: 'F-1011B', qty: 1 }, { partNumber: 'F-1011C', qty: 2 }, { partNumber: 'F-1079', qty: 1 }, { partNumber: 'F-635', qty: 1 }, { partNumber: 'HS-1004', qty: 8 }, { partNumber: 'VS-1015', qty: 1 },
      ] },
    { id: '10A EMPCONE SUBKIT #2', description: 'E1B', contents: [
        { partNumber: 'E-1015', qty: 1 }, { partNumber: 'E-615PP', qty: 1 }, { partNumber: 'F-1006A', qty: 1 }, { partNumber: 'F-1006B', qty: 1 }, { partNumber: 'F-1006C', qty: 1 }, { partNumber: 'F-1006D', qty: 1 }, { partNumber: 'F-1009', qty: 1 }, { partNumber: 'F-1029-L', qty: 1 }, { partNumber: 'F-1029-R', qty: 1 }, { partNumber: 'VS-1004', qty: 1 }, { partNumber: 'VS-1005', qty: 1 }, { partNumber: 'VS-1013', qty: 1 },
      ] },
    { id: '10A EMPCONE SUBKIT #3', description: 'E1B', contents: [
        { partNumber: 'F-1006E', qty: 1 }, { partNumber: 'F-1006F', qty: 1 }, { partNumber: 'F-1007-L', qty: 1 }, { partNumber: 'F-1007-R', qty: 1 }, { partNumber: 'F-1008-L', qty: 1 }, { partNumber: 'F-1008-R', qty: 1 }, { partNumber: 'F-1010', qty: 1 }, { partNumber: 'F-1010C', qty: 1 }, { partNumber: 'F-1011', qty: 1 }, { partNumber: 'F-1014', qty: 1 },
      ] },
    { id: '10A EMPCONE SUBKIT #4', description: 'V1', contents: [
        { partNumber: 'AB4-125X1 1/2X8', qty: 1 }, { partNumber: 'HS-1007', qty: 1 }, { partNumber: 'HS-904', qty: 6 }, { partNumber: 'HS-905', qty: 8 }, { partNumber: 'HS-906', qty: 1 }, { partNumber: 'R-1003', qty: 1 }, { partNumber: 'R-1004', qty: 1 }, { partNumber: 'R-1012', qty: 1 }, { partNumber: 'VS-1006', qty: 1 }, { partNumber: 'VS-1007', qty: 1 },
      ] },
    { id: '10A EMPCONE SUBKIT #5', description: 'E1B', contents: [
        { partNumber: 'AA6-125X1X1 1/4X5', qty: 1 }, { partNumber: 'AEX TIE DOWN X7.5', qty: 1 }, { partNumber: 'BOLT HEX 1/4X28-8', qty: 2 }, { partNumber: 'E-00903-1', qty: 2 }, { partNumber: 'E-00904-1', qty: 2 }, { partNumber: 'E-905', qty: 2 }, { partNumber: 'F-1012A', qty: 1 }, { partNumber: 'F-1012B', qty: 1 }, { partNumber: 'F-1035', qty: 1 }, { partNumber: 'F-1036', qty: 1 }, { partNumber: 'F-1094A', qty: 2 }, { partNumber: 'F-1095A', qty: 1 }, { partNumber: 'R-1010', qty: 1 }, { partNumber: 'VS-1008', qty: 1 },
      ] },
    { id: '10A EMPCONE SUBKIT #6', description: 'E1A', contents: [
        { partNumber: 'AT6-035X1 1/2X83', qty: 1 }, { partNumber: 'E-1007', qty: 2 }, { partNumber: 'J-CHANNEL X6\'', qty: 6 }, { partNumber: 'J-CHANNEL X8\'', qty: 6 }, { partNumber: 'VS-1002', qty: 1 },
      ] },
    { id: '10A EMPCONE SUBKIT #8', description: 'E1A', contents: [
        { partNumber: 'AA6-063X3/4X3/4X18', qty: 1 }, { partNumber: 'AA6-125X1X1X17', qty: 1 }, { partNumber: 'AA6-125X3/4X3/4X17', qty: 1 }, { partNumber: 'AA6-125X3/4X3/4X98.5', qty: 2 }, { partNumber: 'AN257-P3X6\'', qty: 1 }, { partNumber: 'E-1002', qty: 2 }, { partNumber: 'E-1020', qty: 1 }, { partNumber: 'E-920', qty: 1 }, { partNumber: 'F-1028', qty: 1 }, { partNumber: 'F-1037', qty: 1 }, { partNumber: 'F-1055', qty: 1 }, { partNumber: 'HS-1002', qty: 1 }, { partNumber: 'HS-1003', qty: 1 }, { partNumber: 'HS-1013', qty: 2 }, { partNumber: 'HS-1014', qty: 2 }, { partNumber: 'HS-1015', qty: 2 }, { partNumber: 'R-1002', qty: 1 }, { partNumber: 'R-1015', qty: 7 }, { partNumber: 'VA-140', qty: 2 }, { partNumber: 'VS-1003', qty: 1 }, { partNumber: 'VS-1014', qty: 2 },
      ] },
    { id: '10A EMPCONE SUBKIT #9', description: 'E1B', contents: [
        { partNumber: 'AA6-187X2X2 1/2X5', qty: 1 }, { partNumber: 'E-1008', qty: 16 }, { partNumber: 'E-616PP', qty: 2 }, { partNumber: 'F-824B', qty: 2 }, { partNumber: 'FOAM, PVC-750X2X5.25', qty: 5 }, { partNumber: 'HS-1016', qty: 1 }, { partNumber: 'R-1005', qty: 1 }, { partNumber: 'VS-1016', qty: 1 },
      ] },
  ],
};
