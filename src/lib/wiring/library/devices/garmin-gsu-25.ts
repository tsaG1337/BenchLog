import type { DeviceTemplate } from '../types';

// Per Garmin G3X Touch Install Manual 190-01115-01 Rev. AK §26.14.
const device: DeviceTemplate = {
  id: 'garmin-gsu-25',
  manufacturer: 'Garmin',
  partNumber: '011-03977-00',
  name: 'GSU 25',
  category: 'ahrs',
  description: 'Air-data and AHRS sensor unit. Drives OAT, magnetometer, and pitot/static.',
  width: 240,
  height: 320,
  manuals: [
    { label: 'Manuals', url: 'https://support.garmin.com/en-US/?partNumber=010-01071-50&tab=manuals' },
  ],
  connectors: [
    {
      name: 'J251',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1', name: 'CAN H',            side: 'right' },
        { pinNumber: '2', name: 'CAN L',            side: 'right' },
        { pinNumber: '4', name: 'RS-232 RX 1',      side: 'right' },
        { pinNumber: '5', name: 'RS-232 TX 1',      side: 'right' },
        { pinNumber: '6', name: 'GROUND',           side: 'left',  role: 'ground' },
        { pinNumber: '7', name: 'AIRCRAFT POWER 1', side: 'left',  role: 'power'  },
        { pinNumber: '8', name: 'AIRCRAFT POWER 2', side: 'left',  role: 'power'  },
        { pinNumber: '9', name: 'GROUND',           side: 'left',  role: 'ground' },
      ],
    },
    {
      name: 'J252',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1',  name: 'OAT POWER',            side: 'right' },
        { pinNumber: '2',  name: 'OAT HIGH',             side: 'right' },
        { pinNumber: '3',  name: 'OAT LOW',              side: 'right' },
        { pinNumber: '4',  name: 'UNIT ID 1 GROUND',     side: 'right', role: 'ground' },
        { pinNumber: '5',  name: 'UNIT ID 1',            side: 'right' },
        { pinNumber: '6',  name: '+12V MAGNETOMETER POWER', side: 'right' },
        { pinNumber: '7',  name: 'MAGNETOMETER GROUND',  side: 'right', role: 'ground' },
        { pinNumber: '9',  name: 'RS-232 TX 3',          side: 'right' },
        { pinNumber: '10', name: 'RS-232 RX 3',          side: 'right' },
        { pinNumber: '11', name: 'GROUND',               side: 'left',  role: 'ground' },
        { pinNumber: '12', name: 'RS-485 RX A',          side: 'right' },
        { pinNumber: '13', name: 'RS-485 RX B',          side: 'right' },
        { pinNumber: '14', name: 'GROUND',               side: 'left',  role: 'ground' },
        { pinNumber: '15', name: 'RS-232 TX 2',          side: 'right' },
      ],
    },
  ],
};

export default device;
