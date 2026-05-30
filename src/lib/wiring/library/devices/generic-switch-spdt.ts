import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-switch-spdt',
  manufacturer: 'Generic',
  partNumber: 'SPDT',
  name: 'SPDT Switch',
  category: 'generic',
  designatorPrefix: 'SW',
  description: 'Single-pole double-throw switch. Common + NO + NC terminals.',
  width: 80,
  height: 50,
  symbolType: 'switch-spdt',
  connectors: [{
    name: 'SW',
    pins: [
      { pinNumber: '1', name: 'COM', side: 'left'  },
      { pinNumber: '2', name: 'NO',  side: 'right' },
      { pinNumber: '3', name: 'NC',  side: 'right' },
    ],
  }],
};

export default device;
