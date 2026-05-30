import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-headphone-jack-mono',
  manufacturer: 'Generic',
  partNumber: 'JACK-TS',
  name: 'Headphone Jack (TS, mono)',
  category: 'generic',
  designatorPrefix: 'J',
  description: 'Mono 2-conductor (Tip / Sleeve) phone jack. Tip is a spring contact; Sleeve mates with the outer shell.',
  width: 100,
  height: 45,
  symbolType: 'headphone-jack-mono',
  connectors: [{
    name: 'J',
    pins: [
      { pinNumber: 'T', name: 'TIP',    side: 'left' },
      { pinNumber: 'S', name: 'SLEEVE', side: 'left', role: 'ground' },
    ],
  }],
};

export default device;
