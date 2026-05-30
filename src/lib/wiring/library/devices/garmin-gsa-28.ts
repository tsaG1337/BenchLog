import type { DeviceTemplate } from '../types';

// Per Garmin G3X Touch Install Manual 190-01115-01 Rev. AK §26.13.
const device: DeviceTemplate = {
  id: 'garmin-gsa-28',
  manufacturer: 'Garmin',
  partNumber: '011-03980-00',
  name: 'GSA 28',
  category: 'autopilot',
  description: 'Smart autopilot servo. CAN bus + ID strap pins set servo role (pitch/roll/yaw).',
  width: 220,
  height: 320,
  manuals: [
    { label: 'Manuals', url: 'https://support.garmin.com/en-US/?productID=113734&tab=manuals' },
  ],
  connectors: [{
    name: 'J281',
    gender: 'F',
    connectorType: 'dsub',
    pins: [
      { pinNumber: '1',  name: 'CAN_H',                            side: 'right' },
      { pinNumber: '2',  name: 'CAN_L',                            side: 'right' },
      { pinNumber: '3',  name: 'CAN_TERM_1',                       side: 'right' },
      { pinNumber: '4',  name: 'CAN_TERM_2',                       side: 'right' },
      { pinNumber: '5',  name: 'ID_STRAP_1',                       side: 'right' },
      { pinNumber: '6',  name: 'ID_STRAP_2',                       side: 'right' },
      { pinNumber: '7',  name: 'ID_STRAP_3 / RS-232 TX (Roll only)', side: 'right' },
      { pinNumber: '8',  name: 'ID_STRAP_4 / RS-232 RX (Roll only)', side: 'right' },
      { pinNumber: '9',  name: 'AIRCRAFT GROUND',                  side: 'left',  role: 'ground' },
      { pinNumber: '10', name: 'AIRCRAFT POWER',                   side: 'left',  role: 'power'  },
      { pinNumber: '11', name: 'TRIM_IN_1',                        side: 'right' },
      { pinNumber: '12', name: 'TRIM_IN_2',                        side: 'right' },
      { pinNumber: '13', name: 'TRIM_OUT_1',                       side: 'right' },
      { pinNumber: '14', name: 'TRIM_OUT_2',                       side: 'right' },
      { pinNumber: '15', name: 'CWS / DISCONNECT',                 side: 'right' },
    ],
  }],
};

export default device;
