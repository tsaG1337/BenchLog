import type { DeviceTemplate } from '../types';

// Per Garmin G3X Touch Install Manual 190-01115-01 Rev. AK §26.9.
const device: DeviceTemplate = {
  id: 'garmin-gmc-507',
  manufacturer: 'Garmin',
  partNumber: '011-04880-00',
  name: 'GMC 507',
  category: 'autopilot',
  description: 'AFCS mode controller (autopilot keypad). 14/28 V DC.',
  width: 220,
  height: 280,
  connectors: [{
    name: 'J7001',
    gender: 'F',
    connectorType: 'dsub',
    pins: [
      { pinNumber: '3',  name: 'CAN HI',           side: 'right' },
      { pinNumber: '4',  name: 'CAN LO',           side: 'right' },
      { pinNumber: '6',  name: 'CAN BUS TERM 2',   side: 'right' },
      { pinNumber: '7',  name: 'AIRCRAFT POWER 1', side: 'left',  role: 'power'  },
      { pinNumber: '8',  name: 'CAN BUS TERM 1',   side: 'right' },
      { pinNumber: '9',  name: 'AIRCRAFT POWER 2', side: 'left',  role: 'power'  },
      { pinNumber: '10', name: 'TO/GA DISCRETE IN', side: 'right' },
      { pinNumber: '11', name: 'LIGHTING BUS HI',  side: 'right' },
      { pinNumber: '15', name: 'POWER GROUND',     side: 'left',  role: 'ground' },
    ],
  }],
};

export default device;
