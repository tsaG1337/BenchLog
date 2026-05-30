import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-solenoid-dpst',
  manufacturer: 'Generic',
  partNumber: 'SOL-DPST',
  name: 'Relay / Solenoid (DPST)',
  category: 'generic',
  designatorPrefix: 'K',
  description: 'Relay coil + two mechanically-linked SPST contacts. B1/B2 on top, A1/A2 on bottom.',
  width: 100,
  height: 100,
  symbolType: 'solenoid-dpst',
  connectors: [{
    name: 'K',
    // Index order: 0 = coil+, 1 = coil−, 2 = A1, 3 = A2 (bottom pair),
    // 4 = B1, 5 = B2 (top pair). Coil pins omit pinNumber so ids stay
    // positional (K-P0 / K-P1) and don't collide with contact A1/A2.
    pins: [
      { name: 'COIL+', side: 'left'   },
      { name: 'COIL-', side: 'left'   },
      { pinNumber: 'A1', name: 'A1', side: 'bottom' },
      { pinNumber: 'A2', name: 'A2', side: 'bottom' },
      { pinNumber: 'B1', name: 'B1', side: 'top'    },
      { pinNumber: 'B2', name: 'B2', side: 'top'    },
    ],
  }],
};

export default device;
