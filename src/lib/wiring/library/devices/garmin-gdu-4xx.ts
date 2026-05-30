import type { DeviceTemplate } from '../types';

// Per Garmin G3X / G3X Touch Install Manual 190-01115-01 Rev. AK §26.4.
//   P4X01 — 9-pin DSUB (CAN + RS-232 to GSU 25 backup data path)
//   P4X02 — 50-pin (audio, power, lighting, RS-232, CAN, config module, …)
//   P4X03 — 9-pin DSUB (reserved for future use; CAN HI/LO active)
// Composite Video BNC is its own coaxial connector and is omitted here —
// it doesn't carry discrete wired signals on this schematic.
const device: DeviceTemplate = {
  id: 'garmin-gdu-4xx',
  manufacturer: 'Garmin',
  partNumber: '011-XXXXX-XX',
  name: 'GDU 4XX (G3X Touch)',
  category: 'display',
  description: 'G3X Touch primary flight / multi-function display unit.',
  width: 360,
  height: 600,
  manuals: [
    { label: 'Manuals', url: 'https://support.garmin.com/en-US/?productID=63892&tab=manuals' },
  ],
  connectors: [
    {
      name: 'P4X01',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1', name: 'CAN BUS HI', side: 'right' },
        { pinNumber: '2', name: 'CAN BUS LO', side: 'right' },
        { pinNumber: '4', name: 'RS-232 TX',  side: 'right' },
        { pinNumber: '5', name: 'RS-232 RX',  side: 'right' },
        { pinNumber: '6', name: 'GND',        side: 'left',  role: 'ground' },
        { pinNumber: '7', name: 'PWR 1',      side: 'left',  role: 'power'  },
        { pinNumber: '8', name: 'PWR 2',      side: 'left',  role: 'power'  },
        { pinNumber: '9', name: 'GND',        side: 'left',  role: 'ground' },
      ],
    },
    {
      name: 'P4X02',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1',  name: 'MONO AUDIO OUT HI',         side: 'right' },
        { pinNumber: '2',  name: 'STEREO AUDIO OUT LO',       side: 'right', role: 'ground' },
        { pinNumber: '3',  name: 'STEREO AUDIO OUT LEFT',     side: 'right' },
        { pinNumber: '9',  name: 'CDU SYSTEM ID PROGRAM 2',   side: 'right' },
        { pinNumber: '10', name: 'CDU SYSTEM ID PROGRAM 1',   side: 'right' },
        { pinNumber: '13', name: 'RS-232 OUT 3',              side: 'right' },
        { pinNumber: '14', name: 'RS-232 IN 2',               side: 'right' },
        { pinNumber: '15', name: 'POWER GROUND',              side: 'left',  role: 'ground' },
        { pinNumber: '16', name: 'POWER GROUND',              side: 'left',  role: 'ground' },
        { pinNumber: '17', name: 'CONFIG MODULE POWER OUT',   side: 'right' },
        { pinNumber: '18', name: 'MONO AUDIO OUT LO',         side: 'right', role: 'ground' },
        { pinNumber: '19', name: 'STEREO AUDIO OUT RIGHT',    side: 'right' },
        { pinNumber: '20', name: 'STEREO AUDIO OUT LO',       side: 'right', role: 'ground' },
        { pinNumber: '23', name: 'RS-232 IN 4',               side: 'right' },
        { pinNumber: '24', name: 'RS-232 IN 5',               side: 'right' },
        { pinNumber: '25', name: 'CDU SYSTEM ID PROGRAM 3',   side: 'right' },
        { pinNumber: '26', name: '28V LIGHTING BUS HI',       side: 'right' },
        { pinNumber: '27', name: 'SIGNAL GROUND',             side: 'right', role: 'ground' },
        { pinNumber: '28', name: 'CAN BUS TERMINATION',       side: 'right' },
        { pinNumber: '29', name: 'RS-232 IN 3',               side: 'right' },
        { pinNumber: '30', name: 'RS-232 OUT 2',              side: 'right' },
        { pinNumber: '31', name: 'AIRCRAFT POWER 2',          side: 'left',  role: 'power'  },
        { pinNumber: '32', name: 'AIRCRAFT POWER 1',          side: 'left',  role: 'power'  },
        { pinNumber: '33', name: 'CONFIG MODULE CLOCK',       side: 'right' },
        { pinNumber: '34', name: 'SIGNAL GROUND',             side: 'right', role: 'ground' },
        { pinNumber: '35', name: 'SIGNAL GROUND',             side: 'right', role: 'ground' },
        { pinNumber: '36', name: 'SIGNAL GROUND',             side: 'right', role: 'ground' },
        { pinNumber: '37', name: 'SIGNAL GROUND',             side: 'right', role: 'ground' },
        { pinNumber: '40', name: 'RS-232 OUT 4',              side: 'right' },
        { pinNumber: '41', name: 'RS-232 OUT 5',              side: 'right' },
        { pinNumber: '42', name: 'CDU SYSTEM ID PROGRAM 4',   side: 'right' },
        { pinNumber: '43', name: '14V LIGHTING BUS HI',       side: 'right' },
        { pinNumber: '44', name: 'SIGNAL GROUND',             side: 'right', role: 'ground' },
        { pinNumber: '45', name: 'CAN BUS LO',                side: 'right' },
        { pinNumber: '46', name: 'CAN BUS HI',                side: 'right' },
        { pinNumber: '47', name: 'RS-232 IN 1',               side: 'right' },
        { pinNumber: '48', name: 'RS-232 OUT 1',              side: 'right' },
        { pinNumber: '49', name: 'CONFIG MODULE GROUND',      side: 'right', role: 'ground' },
        { pinNumber: '50', name: 'CONFIG MODULE DATA',        side: 'right' },
      ],
    },
    {
      name: 'P4X03',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1', name: 'CAN BUS HI', side: 'right' },
        { pinNumber: '2', name: 'CAN BUS LO', side: 'right' },
      ],
    },
  ],
};

export default device;
