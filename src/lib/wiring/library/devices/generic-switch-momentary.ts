import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-switch-momentary',
  manufacturer: 'Generic',
  partNumber: 'SW-PB-NO',
  name: 'Momentary Switch (NO)',
  category: 'generic',
  designatorPrefix: 'SW',
  description: 'Normally-open momentary pushbutton — press to make.',
  width: 60,
  height: 32,
  symbolType: 'switch-momentary',
  connectors: [{
    name: 'SW',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left'  },
      { pinNumber: '2', name: 'B', side: 'right' },
    ],
  }],
};

export default device;
