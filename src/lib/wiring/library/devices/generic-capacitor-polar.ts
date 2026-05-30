import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-capacitor-polar',
  manufacturer: 'Generic',
  partNumber: 'C+',
  name: 'Capacitor (polar)',
  category: 'generic',
  designatorPrefix: 'C',
  description: 'Polarised electrolytic capacitor. Left pin is +, right is −.',
  width: 40,
  height: 28,
  symbolType: 'capacitor-polar',
  connectors: [{
    name: 'C',
    pins: [
      { pinNumber: '1', name: '+', side: 'left'  },
      { pinNumber: '2', name: '−', side: 'right' },
    ],
  }],
};

export default device;
