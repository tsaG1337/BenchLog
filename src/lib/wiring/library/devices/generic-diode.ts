import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-diode',
  manufacturer: 'Generic',
  partNumber: 'D',
  name: 'Junction Diode',
  category: 'diodes',
  designatorPrefix: 'D',
  description: 'Standard p-n junction diode. Anode on the left, cathode (bar) on the right.',
  width: 50,
  height: 20,
  symbolType: 'diode',
  connectors: [{
    name: 'D',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left'  },
      { pinNumber: '2', name: 'K', side: 'right' },
    ],
  }],
};

export default device;
