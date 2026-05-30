import type { DeviceTemplate } from '../types';

// Per Garmin G5 STC Installation Manual 190-01112-10 Rev. 19, Appendix A.1.
const device: DeviceTemplate = {
  id: 'garmin-g5',
  manufacturer: 'Garmin',
  partNumber: '011-03809-00',
  name: 'G5',
  category: 'display',
  description: 'Electronic flight instrument / attitude indicator. 9-pin DSUB (J51).',
  width: 200,
  height: 240,
  connectors: [{
    name: 'J51',
    gender: 'F',
    connectorType: 'dsub',
    pins: [
      { pinNumber: '1', name: 'CAN-H',            side: 'right' },
      { pinNumber: '2', name: 'CAN-L',            side: 'right' },
      { pinNumber: '3', name: 'UNIT ID',          side: 'right' },
      { pinNumber: '4', name: 'RS-232 RX 1',      side: 'right' },
      { pinNumber: '5', name: 'RS-232 TX 1',      side: 'right' },
      { pinNumber: '6', name: 'SIGNAL GROUND',    side: 'right', role: 'ground' },
      { pinNumber: '7', name: 'AIRCRAFT POWER 1', side: 'left',  role: 'power'  },
      { pinNumber: '8', name: 'AIRCRAFT POWER 2', side: 'left',  role: 'power'  },
      { pinNumber: '9', name: 'POWER GROUND',     side: 'left',  role: 'ground' },
    ],
  }],
  manuals: [
    { label: 'Manuals', url: 'https://support.garmin.com/en-US/?partNumber=K10-00280-01&tab=manuals' },
  ],
};

export default device;
