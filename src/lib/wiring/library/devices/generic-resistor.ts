import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-resistor',
  manufacturer: 'Generic',
  partNumber: 'R',
  name: 'Resistor',
  category: 'generic',
  designatorPrefix: 'R',
  description: 'Fixed resistor. Edit the value in the inspector.',
  width: 70,
  height: 20,
  symbolType: 'resistor',
  connectors: [{
    name: 'R',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left'  },
      { pinNumber: '2', name: 'B', side: 'right' },
    ],
  }],
};

export default device;
