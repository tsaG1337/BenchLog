import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-speaker',
  manufacturer: 'Generic',
  partNumber: 'SPK',
  name: 'Speaker',
  category: 'generic',
  designatorPrefix: 'LS',
  description: 'Loudspeaker / audio driver.',
  width: 60,
  height: 40,
  symbolType: 'speaker',
  connectors: [{
    name: 'LS',
    pins: [
      { pinNumber: '1', name: '+', side: 'left' },
      { pinNumber: '2', name: '−', side: 'left' },
    ],
  }],
};

export default device;
