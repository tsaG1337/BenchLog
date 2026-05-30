import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-ground',
  manufacturer: 'Generic',
  partNumber: 'GND',
  name: 'Ground',
  category: 'generic',
  designatorPrefix: 'GND',
  description: 'Airframe ground connection.',
  width: 40,
  height: 24,
  symbolType: 'ground',
  connectors: [{
    name: 'G',
    pins: [{ pinNumber: '1', name: 'GND', side: 'top', role: 'ground' }],
  }],
};

export default device;
