import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-thermocouple',
  manufacturer: 'Generic',
  partNumber: 'TC',
  name: 'Thermocouple',
  category: 'generic',
  designatorPrefix: 'TC',
  description: 'Non-polar thermocouple. Edit type (K/J/T/…) in the inspector.',
  width: 50,
  height: 40,
  symbolType: 'thermocouple',
  connectors: [{
    name: 'TC',
    pins: [
      { pinNumber: '1', name: 'A', side: 'left' },
      { pinNumber: '2', name: 'B', side: 'left' },
    ],
  }],
};

export default device;
