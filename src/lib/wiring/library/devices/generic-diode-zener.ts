import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-diode-zener',
  manufacturer: 'Generic',
  partNumber: 'DZ',
  name: 'Zener Diode',
  category: 'diodes',
  designatorPrefix: 'D',
  description: 'Zener diode — conducts in reverse at its breakdown (Vz) voltage. Edit Vz in the inspector.',
  width: 50,
  height: 20,
  symbolType: 'diode-zener',
  connectors: [{
    name: 'D',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left'  },
      { pinNumber: '2', name: 'K', side: 'right' },
    ],
  }],
};

export default device;
