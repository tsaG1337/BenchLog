import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-switch-dpst',
  manufacturer: 'Generic',
  partNumber: 'DPST',
  name: 'DPST Switch',
  category: 'generic',
  designatorPrefix: 'SW',
  description: 'Double-pole single-throw — two ganged SPST contacts. 4 terminals.',
  width: 80,
  height: 60,
  symbolType: 'switch-dpst',
  connectors: [{
    name: 'SW',
    pins: [
      { pinNumber: '1', name: 'IN 1',  side: 'left'  },
      { pinNumber: '2', name: 'OUT 1', side: 'right' },
      { pinNumber: '3', name: 'IN 2',  side: 'left'  },
      { pinNumber: '4', name: 'OUT 2', side: 'right' },
    ],
  }],
};

export default device;
