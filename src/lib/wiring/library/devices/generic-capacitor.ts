import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-capacitor',
  manufacturer: 'Generic',
  partNumber: 'C',
  name: 'Capacitor',
  category: 'generic',
  designatorPrefix: 'C',
  description: 'Non-polar capacitor. Edit the value in the inspector.',
  width: 40,
  height: 28,
  symbolType: 'capacitor',
  connectors: [{
    name: 'C',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left'  },
      { pinNumber: '2', name: 'B', side: 'right' },
    ],
  }],
};

export default device;
