import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-diode-led',
  manufacturer: 'Generic',
  partNumber: 'LED',
  name: 'LED',
  category: 'diodes',
  designatorPrefix: 'D',
  description: 'Light-emitting diode. Set the color in the inspector.',
  width: 50,
  height: 28,
  symbolType: 'diode-led',
  connectors: [{
    name: 'D',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left'  },
      { pinNumber: '2', name: 'K', side: 'right' },
    ],
  }],
};

export default device;
