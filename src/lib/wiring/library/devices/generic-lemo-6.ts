import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-lemo-6',
  manufacturer: 'Generic',
  partNumber: 'LEMO-6',
  name: 'Lemo Connector (6-pin)',
  category: 'generic',
  designatorPrefix: 'J',
  description: 'Six-pin circular push-pull connector (Lemo-style). Default assignment matches a typical GA headset breakout.',
  width:  190,
  height: 120,
  symbolType: 'lemo-6',
  connectors: [{
    // Pin order here must match the symbol def — index 0 = pin 1 (2 o'clock),
    // then CCW through 2..6. All pins exit to the right in the stacked layout
    // drawn by Lemo6Body; `side` here is a placement hint used by the generic
    // instantiator but ignored when the device is rendered as a symbol.
    name: 'J',
    pins: [
      { pinNumber: '1', name: 'V+',    side: 'right', role: 'power'  },
      { pinNumber: '2', name: 'GND',   side: 'right', role: 'ground' },
      { pinNumber: '3', name: 'HP L',  side: 'right' },
      { pinNumber: '4', name: 'HP R',  side: 'right' },
      { pinNumber: '5', name: 'Mic +', side: 'right' },
      { pinNumber: '6', name: 'Mic −', side: 'right' },
    ],
  }],
};

export default device;
