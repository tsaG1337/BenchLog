import type { DeviceTemplate } from '../types';

// Per Garmin AXIS Flight Displays Installation Manual for Experimental
// Aircraft, P/N 190-03123-20 Rev. 1 (July 2026), Appendix A.1.
//   J1011 — 9-pin  D-Sub (CAN, RS-232 backup path, optional battery-direct
//           power provision for future remote connectivity)
//   J1012 — 50-pin D-Sub (aircraft power, HSDB x3, CAN, RS-232 x5,
//           config module, lighting bus, mono audio). Identical pinout
//           across all three GDU 116 variants (B/C/NC) per the manual's
//           combined "GDU 116B/C/NC" connector tables.
// RESERVED pins are omitted to keep the schematic clean.
// The 116B has no J1013/J1015 — no built-in COM/NAV radio or audio panel,
// so there's nothing to wire there. See garmin-axis-gdu-116c.ts /
// garmin-axis-gdu-116nc.ts for those two extra connectors.
const device: DeviceTemplate = {
  id: 'garmin-axis-gdu-116b',
  manufacturer: 'Garmin',
  partNumber: '011-XXXXX-XX',
  name: 'AXIS GDU 116B',
  category: 'display',
  description:
    'AXIS flight display, VFR base variant. Internal WAAS GPS receiver supports ' +
    'VFR navigation only — no IFR GPS, no built-in VHF COM/NAV radio, no internal ' +
    'audio panel. Can use a glareshield-mounted GPS antenna instead of an external ' +
    'one. Two connectors only (J1011 + J1012) — no J1013/J1015, unlike the 116C/116NC.',
  width: 360,
  height: 600,
  connectors: [
    {
      name: 'J1011',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1', name: 'CAN HI',       side: 'right' },
        { pinNumber: '2', name: 'CAN LO',       side: 'right' },
        { pinNumber: '3', name: 'BAT POWER',    side: 'left',  role: 'power',
          comment: 'Optional provision for future remote connectivity / database updates — <42 µA at 12V. Own fuse close to the battery.' },
        { pinNumber: '4', name: 'RS-232 OUT 6', side: 'right' },
        { pinNumber: '5', name: 'RS-232 IN 6',  side: 'right' },
        { pinNumber: '6', name: 'GROUND',       side: 'left',  role: 'ground' },
        { pinNumber: '7', name: 'POWER OUT',    side: 'left',  role: 'power',
          comment: 'Optional pass-through power to a connected GEA 24 or GSU 25 — an independent power connection to that unit is generally recommended instead.' },
        { pinNumber: '8', name: 'POWER OUT',    side: 'left',  role: 'power' },
        { pinNumber: '9', name: 'GROUND',       side: 'left',  role: 'ground' },
      ],
    },
    {
      name: 'J1012',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1',  name: 'MONO AUDIO OUT HI',            side: 'right' },
        { pinNumber: '2',  name: 'HSDB TX 1B',                   side: 'right', twistGroup: 'HSDB-TX1' },
        { pinNumber: '3',  name: 'HSDB TX 1A',                   side: 'right', twistGroup: 'HSDB-TX1' },
        { pinNumber: '4',  name: 'HSDB TX 2B',                   side: 'right', twistGroup: 'HSDB-TX2' },
        { pinNumber: '5',  name: 'HSDB TX 2A',                   side: 'right', twistGroup: 'HSDB-TX2' },
        { pinNumber: '6',  name: 'HSDB RX 2B',                   side: 'right', twistGroup: 'HSDB-RX2' },
        { pinNumber: '7',  name: 'HSDB RX 2A',                   side: 'right', twistGroup: 'HSDB-RX2' },
        { pinNumber: '9',  name: 'POWER GROUND',                 side: 'left',  role: 'ground' },
        { pinNumber: '10', name: 'POWER GROUND',                 side: 'left',  role: 'ground' },
        { pinNumber: '11', name: 'POWER INPUT',                  side: 'left',  role: 'power' },
        { pinNumber: '12', name: 'POWER INPUT',                  side: 'left',  role: 'power' },
        { pinNumber: '13', name: 'RS-232 OUT 3',                 side: 'right' },
        { pinNumber: '14', name: 'RS-232 IN 2',                  side: 'right' },
        { pinNumber: '15', name: 'POWER GROUND',                 side: 'left',  role: 'ground' },
        { pinNumber: '16', name: 'POWER GROUND',                 side: 'left',  role: 'ground' },
        { pinNumber: '17', name: 'CONFIG MODULE POWER OUT',      side: 'right' },
        { pinNumber: '18', name: 'AUDIO MONO OUT LO',            side: 'right' },
        { pinNumber: '19', name: 'HSDB RX 1B',                   side: 'right', twistGroup: 'HSDB-RX1' },
        { pinNumber: '20', name: 'HSDB RX 1A',                   side: 'right', twistGroup: 'HSDB-RX1' },
        { pinNumber: '21', name: 'HSDB TX 3B',                   side: 'right', twistGroup: 'HSDB-TX3' },
        { pinNumber: '22', name: 'HSDB TX 3A',                   side: 'right', twistGroup: 'HSDB-TX3' },
        { pinNumber: '23', name: 'RS-232 IN 4',                  side: 'right' },
        { pinNumber: '24', name: 'RS-232 IN 5',                  side: 'right' },
        { pinNumber: '25', name: 'REVERSIONARY MODE',            side: 'right' },
        { pinNumber: '26', name: 'LIGHTING BUS #1',              side: 'right',
          comment: 'Reference voltage input (5/14/28 VDC), not a power source — do not wire to a lighting supply directly.' },
        { pinNumber: '27', name: 'SIGNAL GROUND',                side: 'left',  role: 'ground' },
        { pinNumber: '28', name: 'CAN BUS TERM',                 side: 'right',
          comment: 'Short to CAN LO (pin 45) to enable the internal 120 Ω terminator when this GDU sits at the end of the CAN bus.' },
        { pinNumber: '29', name: 'RS-232 IN 3',                  side: 'right' },
        { pinNumber: '30', name: 'RS-232 OUT 2',                 side: 'right' },
        { pinNumber: '31', name: 'POWER INPUT',                  side: 'left',  role: 'power' },
        { pinNumber: '32', name: 'POWER INPUT',                  side: 'left',  role: 'power' },
        { pinNumber: '33', name: 'CONFIG MODULE CLOCK',          side: 'right' },
        { pinNumber: '34', name: 'RS-232 SIGNAL GROUND 1',       side: 'left',  role: 'ground' },
        { pinNumber: '35', name: 'RS-232 SIGNAL GROUND 2',       side: 'left',  role: 'ground' },
        { pinNumber: '36', name: 'RS-232 SIGNAL GROUND 3',       side: 'left',  role: 'ground' },
        { pinNumber: '37', name: 'RS-232 SIGNAL GROUND 4',       side: 'left',  role: 'ground' },
        { pinNumber: '38', name: 'HSDB RX 3B',                   side: 'right', twistGroup: 'HSDB-RX3' },
        { pinNumber: '39', name: 'HSDB RX 3A',                   side: 'right', twistGroup: 'HSDB-RX3' },
        { pinNumber: '40', name: 'RS-232 OUT 4',                 side: 'right' },
        { pinNumber: '41', name: 'RS-232 OUT 5',                 side: 'right' },
        { pinNumber: '42', name: 'DEMO MODE',                    side: 'right' },
        { pinNumber: '43', name: 'LIGHTING BUS #2',               side: 'right',
          comment: 'Reference voltage input (5/14/28 VDC), not a power source — do not wire to a lighting supply directly.' },
        { pinNumber: '44', name: 'RS-232 SIGNAL GROUND 5',       side: 'left',  role: 'ground' },
        { pinNumber: '45', name: 'CAN LO',                       side: 'right' },
        { pinNumber: '46', name: 'CAN HI',                       side: 'right' },
        { pinNumber: '47', name: 'RS-232 IN 1',                  side: 'right' },
        { pinNumber: '48', name: 'RS-232 OUT 1',                 side: 'right' },
        { pinNumber: '49', name: 'CONFIG MODULE GROUND',         side: 'left',  role: 'ground' },
        { pinNumber: '50', name: 'CONFIG MODULE DATA',           side: 'right' },
      ],
    },
  ],
  // J1012 (power/HSDB/CAN — every AXIS install needs it) is the anchor;
  // J1011 (small CAN/RS-232/battery connector) peels off below it.
  placements: [
    { connectorNames: ['J1012'] },
    { connectorNames: ['J1011'], offset: { x: 0, y: 700 } },
  ],
};

export default device;
