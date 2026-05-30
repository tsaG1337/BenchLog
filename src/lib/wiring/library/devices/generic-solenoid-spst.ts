import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-solenoid-spst',
  manufacturer: 'Generic',
  partNumber: 'SOL-SPST',
  name: 'Relay / Solenoid (SPST)',
  category: 'generic',
  designatorPrefix: 'K',
  description: 'Relay coil + single-pole single-throw contact. B on top, A on bottom.',
  width: 70,
  height: 100,
  symbolType: 'solenoid-spst',
  connectors: [{
    name: 'K',
    // Pin index order matches the symbol def: 0 = coil+, 1 = coil−, 2 = A
    // (bottom), 3 = B (top). Coil pins deliberately omit pinNumber so their
    // ids stay positional (K-P0, K-P1) and don't collide with contact pins
    // that share A/B labelling on multi-pole variants.
    pins: [
      { name: 'COIL+', side: 'left'   },
      { name: 'COIL-', side: 'left'   },
      { pinNumber: 'A', name: 'A', side: 'bottom' },
      { pinNumber: 'B', name: 'B', side: 'top'    },
    ],
  }],
};

export default device;
