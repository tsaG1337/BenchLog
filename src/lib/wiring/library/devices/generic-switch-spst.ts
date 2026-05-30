import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-switch-spst',
  manufacturer: 'Generic',
  partNumber: 'SPST',
  name: 'SPST Switch',
  category: 'generic',
  designatorPrefix: 'SW',
  description: 'Single-pole single-throw toggle switch. Two terminals.',
  width: 80,
  height: 30,
  symbolType: 'switch-spst',
  connectors: [{
    name: 'SW',
    pins: [
      { pinNumber: '1', name: 'IN',  side: 'left'  },
      { pinNumber: '2', name: 'OUT', side: 'right' },
    ],
  }],
};

export default device;
