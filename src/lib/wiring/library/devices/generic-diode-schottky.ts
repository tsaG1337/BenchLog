import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-diode-schottky',
  manufacturer: 'Generic',
  partNumber: 'DS',
  name: 'Schottky Diode',
  category: 'diodes',
  designatorPrefix: 'D',
  description: 'Schottky diode — low forward voltage drop, fast switching.',
  width: 50,
  height: 20,
  symbolType: 'diode-schottky',
  connectors: [{
    name: 'D',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left'  },
      { pinNumber: '2', name: 'K', side: 'right' },
    ],
  }],
};

export default device;
