import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-switch-momentary-nc',
  manufacturer: 'Generic',
  partNumber: 'SW-PB-NC',
  name: 'Momentary Switch (NC)',
  category: 'generic',
  designatorPrefix: 'SW',
  description: 'Normally-closed momentary pushbutton — press to break.',
  width: 60,
  height: 32,
  symbolType: 'switch-momentary-nc',
  connectors: [{
    name: 'SW',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left'  },
      { pinNumber: '2', name: 'B', side: 'right' },
    ],
  }],
};

export default device;
