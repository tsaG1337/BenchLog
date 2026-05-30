import type { DeviceTemplate } from '../types';

// Per Garmin G5 STC Install Manual 190-01112-10 Rev. 19, Appendix A.2.
// 9-pin DSUB. Same pin map as G5 J51, but unit-id strap normally left open
// (only one GMU 11 supported per STC).
const device: DeviceTemplate = {
  id: 'garmin-gmu-11',
  manufacturer: 'Garmin',
  partNumber: '011-04337-00',
  name: 'GMU 11',
  category: 'ahrs',
  description: 'Solid-state magnetometer for the G5 system. CAN bus interface.',
  width: 200,
  height: 240,
  manuals: [
    { label: 'Manuals', url: 'https://support.garmin.com/en-US/?partNumber=010-01788-00&tab=manuals' },
  ],
  connectors: [{
    name: 'J111',
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
};

export default device;
