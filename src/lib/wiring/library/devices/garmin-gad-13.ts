import type { DeviceTemplate } from '../types';

// Per Garmin G5 STC Install Manual 190-01112-10 Rev. 19, Appendix A.4.
const device: DeviceTemplate = {
  id: 'garmin-gad-13',
  manufacturer: 'Garmin',
  partNumber: '011-03682-00',
  name: 'GAD 13',
  category: 'ahrs',
  description: 'CAN bus OAT temperature adapter (passive RTD or active probe).',
  width: 200,
  height: 240,
  connectors: [{
    name: 'J131',
    gender: 'F',
    connectorType: 'dsub',
    pins: [
      { pinNumber: '1', name: 'CAN-H',                   side: 'right' },
      { pinNumber: '2', name: 'CAN-L',                   side: 'right' },
      { pinNumber: '3', name: 'TEMP PROBE IN HI',        side: 'right' },
      { pinNumber: '4', name: 'ACTIVE TEMP PROBE IN',    side: 'right' },
      { pinNumber: '5', name: 'ACTIVE TEMP PROBE POWER OUT', side: 'right' },
      { pinNumber: '6', name: 'TEMP PROBE IN LO',        side: 'right' },
      { pinNumber: '7', name: 'AIRCRAFT POWER',          side: 'left',  role: 'power'  },
      { pinNumber: '8', name: 'TEMP PROBE POWER OUT',    side: 'right' },
      { pinNumber: '9', name: 'GROUND',                  side: 'left',  role: 'ground' },
    ],
  }],
};

export default device;
