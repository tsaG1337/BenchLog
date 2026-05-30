import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-solenoid-spdt',
  manufacturer: 'Generic',
  partNumber: 'SOL-SPDT',
  name: 'Relay / Solenoid (SPDT)',
  category: 'generic',
  designatorPrefix: 'K',
  description: 'Relay coil + single-pole double-throw contact. Common (C) on bottom, throws A / B on top.',
  width: 80,
  height: 100,
  symbolType: 'solenoid-spdt',
  connectors: [{
    name: 'K',
    // Index order: 0 = coil+, 1 = coil−, 2 = C (common, bottom), 3 = A
    // (top-left throw = NC), 4 = B (top-right throw = NO). Coil pins omit
    // pinNumber so ids stay positional (no collision with contact A/B).
    pins: [
      { name: 'COIL+', side: 'left'   },
      { name: 'COIL-', side: 'left'   },
      { pinNumber: 'C', name: 'C', side: 'bottom' },
      { pinNumber: 'A', name: 'A', side: 'top'    },
      { pinNumber: 'B', name: 'B', side: 'top'    },
    ],
  }],
};

export default device;
