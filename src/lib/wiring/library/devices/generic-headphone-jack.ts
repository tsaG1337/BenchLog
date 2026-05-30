import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-headphone-jack',
  manufacturer: 'Generic',
  partNumber: 'JACK-TRS',
  name: 'Headphone Jack (TRS, stereo)',
  category: 'generic',
  designatorPrefix: 'J',
  description: 'Stereo 3-conductor (Tip / Ring / Sleeve) phone jack. Tip and Ring are spring contacts; Sleeve mates with the outer shell.',
  width: 100,
  height: 55,
  symbolType: 'headphone-jack',
  connectors: [{
    name: 'J',
    pins: [
      { pinNumber: 'T', name: 'TIP',    side: 'left' },
      { pinNumber: 'R', name: 'RING',   side: 'left' },
      { pinNumber: 'S', name: 'SLEEVE', side: 'left', role: 'ground' },
    ],
  }],
};

export default device;
