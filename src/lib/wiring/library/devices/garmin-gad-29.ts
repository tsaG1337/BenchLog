import type { DeviceTemplate } from '../types';

// Per Garmin G5 STC Install Manual 190-01112-10 Rev. 19, Appendix A.3.
//   J291 — 9-pin DSUB (power + CAN)
//   J292 — 25-pin DSUB (ARINC 429 + GAD 29B analog HDG/CRS)
const device: DeviceTemplate = {
  id: 'garmin-gad-29',
  manufacturer: 'Garmin',
  partNumber: '011-03028-10',
  name: 'GAD 29 / 29B',
  category: 'ahrs',
  description: 'ARINC 429 adapter (CAN bus to ARINC 429 + analog autopilot HDG/CRS on 29B).',
  width: 240,
  height: 360,
  manuals: [
    { label: 'Manuals', url: 'https://support.garmin.com/en-US/?partNumber=010-01172-00&tab=manuals' },
  ],
  connectors: [
    {
      name: 'J291',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1', name: 'CAN-H',            side: 'right' },
        { pinNumber: '2', name: 'CAN-L',            side: 'right' },
        { pinNumber: '6', name: 'GROUND',           side: 'left',  role: 'ground' },
        { pinNumber: '7', name: 'AIRCRAFT POWER 1', side: 'left',  role: 'power'  },
        { pinNumber: '8', name: 'AIRCRAFT POWER 2', side: 'left',  role: 'power'  },
        { pinNumber: '9', name: 'GROUND',           side: 'left',  role: 'ground' },
      ],
    },
    {
      name: 'J292',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1',  name: 'AC REFERENCE HI',   side: 'right' },
        { pinNumber: '2',  name: 'AC REFERENCE LO',   side: 'right' },
        { pinNumber: '3',  name: 'HDG/CRS VALID',     side: 'right' },
        { pinNumber: '4',  name: 'ARINC 429 RX 4B',   side: 'right' },
        { pinNumber: '5',  name: 'ARINC 429 RX 3B',   side: 'right' },
        { pinNumber: '6',  name: 'ARINC 429 TX 2B',   side: 'right' },
        { pinNumber: '7',  name: 'ARINC 429 TX 2B',   side: 'right' },
        { pinNumber: '8',  name: 'HEADING ERROR HI',  side: 'right' },
        { pinNumber: '9',  name: 'CAN TERM 1',        side: 'right' },
        { pinNumber: '10', name: 'ARINC 429 RX 2B',   side: 'right' },
        { pinNumber: '11', name: 'ARINC 429 RX 1B',   side: 'right' },
        { pinNumber: '12', name: 'ARINC 429 TX 1B',   side: 'right' },
        { pinNumber: '13', name: 'ARINC 429 TX 1B',   side: 'right' },
        { pinNumber: '14', name: 'HEADING ERROR LO',  side: 'right' },
        { pinNumber: '15', name: 'COURSE ERROR HI',   side: 'right' },
        { pinNumber: '16', name: 'ARINC 429 RX 4A',   side: 'right' },
        { pinNumber: '17', name: 'ARINC 429 RX 3A',   side: 'right' },
        { pinNumber: '18', name: 'ARINC 429 TX 2A',   side: 'right' },
        { pinNumber: '19', name: 'ARINC 429 TX 2A',   side: 'right' },
        { pinNumber: '20', name: 'COURSE ERROR LO',   side: 'right' },
        { pinNumber: '21', name: 'CAN TERM 2',        side: 'right' },
        { pinNumber: '22', name: 'ARINC 429 RX 2A',   side: 'right' },
        { pinNumber: '23', name: 'ARINC 429 RX 1A',   side: 'right' },
        { pinNumber: '24', name: 'ARINC 429 TX 1A',   side: 'right' },
        { pinNumber: '25', name: 'ARINC 429 TX 1A',   side: 'right' },
      ],
    },
  ],
};

export default device;
