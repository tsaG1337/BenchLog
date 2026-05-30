import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-switch-dpdt',
  manufacturer: 'Generic',
  partNumber: 'DPDT',
  name: 'DPDT Switch',
  category: 'generic',
  designatorPrefix: 'SW',
  description: 'Double-pole double-throw — two ganged SPDT contacts. 6 terminals.',
  width: 80,
  height: 100,
  symbolType: 'switch-dpdt',
  connectors: [{
    name: 'SW',
    pins: [
      { pinNumber: '1', name: 'COM 1', side: 'left'  },
      { pinNumber: '2', name: 'NO 1',  side: 'right' },
      { pinNumber: '3', name: 'NC 1',  side: 'right' },
      { pinNumber: '4', name: 'COM 2', side: 'left'  },
      { pinNumber: '5', name: 'NO 2',  side: 'right' },
      { pinNumber: '6', name: 'NC 2',  side: 'right' },
    ],
  }],
};

export default device;
