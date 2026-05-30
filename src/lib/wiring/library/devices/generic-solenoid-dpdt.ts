import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-solenoid-dpdt',
  manufacturer: 'Generic',
  partNumber: 'SOL-DPDT',
  name: 'Relay / Solenoid (DPDT)',
  category: 'generic',
  designatorPrefix: 'K',
  description: 'Relay coil + two mechanically-linked SPDT contacts. A1/B1/A2/B2 on top, C1/C2 on bottom.',
  width: 130,
  height: 100,
  symbolType: 'solenoid-dpdt',
  connectors: [{
    name: 'K',
    // Index order: 0 = coil+, 1 = coil−, 2 = C1, 3 = C2 (commons, bottom),
    // 4 = A1, 5 = B1, 6 = A2, 7 = B2 (throws, top). Coil pins omit pinNumber
    // so ids stay positional and don't collide with contact A1/A2.
    pins: [
      { name: 'COIL+', side: 'left'   },
      { name: 'COIL-', side: 'left'   },
      { pinNumber: 'C1', name: 'C1', side: 'bottom' },
      { pinNumber: 'C2', name: 'C2', side: 'bottom' },
      { pinNumber: 'A1', name: 'A1', side: 'top'    },
      { pinNumber: 'B1', name: 'B1', side: 'top'    },
      { pinNumber: 'A2', name: 'A2', side: 'top'    },
      { pinNumber: 'B2', name: 'B2', side: 'top'    },
    ],
  }],
};

export default device;
