import type { DeviceTemplate } from '../types';

// Per Garmin G3X Touch Install Manual 190-01115-01 Rev. AK §26.11.
// Powered from the GSU 25's magnetometer power output (not aircraft bus).
const device: DeviceTemplate = {
  id: 'garmin-gmu-22',
  manufacturer: 'Garmin',
  partNumber: '011-01129-00',
  name: 'GMU 22',
  category: 'ahrs',
  description: 'Magnetometer for the G3X system. Wired to GSU 25 via RS-485 + 12 V from GSU.',
  width: 200,
  height: 240,
  manuals: [
    { label: 'Manuals', url: 'https://support.garmin.com/en-US/?productID=139236&tab=manuals' },
  ],
  connectors: [{
    name: 'J441',
    gender: 'F',
    connectorType: 'dsub',
    pins: [
      { pinNumber: '1', name: 'SIGNAL GROUND', side: 'left',  role: 'ground' },
      { pinNumber: '2', name: 'RS-485 OUT B',  side: 'right' },
      { pinNumber: '3', name: 'SIGNAL GROUND', side: 'left',  role: 'ground' },
      { pinNumber: '4', name: 'RS-485 OUT A',  side: 'right' },
      { pinNumber: '6', name: 'POWER GROUND',  side: 'left',  role: 'ground' },
      { pinNumber: '8', name: 'RS-232 IN',     side: 'right' },
      { pinNumber: '9', name: '+12 VDC POWER', side: 'left',  role: 'power'  },
    ],
  }],
};

export default device;
