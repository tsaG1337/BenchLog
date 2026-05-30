import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-breaker',
  manufacturer: 'Generic',
  partNumber: 'BRK',
  name: 'Circuit Breaker',
  category: 'generic',
  designatorPrefix: 'BRK',
  description: 'Thermal circuit breaker. Edit the rating and designator in the inspector.',
  width: 80,
  height: 40,
  symbolType: 'breaker',
  connectors: [{
    name: 'BRK',
    pins: [
      { pinNumber: '1', name: 'IN',  side: 'left'  },
      { pinNumber: '2', name: 'OUT', side: 'right' },
    ],
  }],
};

export default device;
