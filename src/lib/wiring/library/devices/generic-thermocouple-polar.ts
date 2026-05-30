import type { DeviceTemplate } from '../types';

const device: DeviceTemplate = {
  id: 'generic-thermocouple-polar',
  manufacturer: 'Generic',
  partNumber: 'TC',
  name: 'Thermocouple (polarized)',
  category: 'generic',
  designatorPrefix: 'TC',
  description: 'Polarized thermocouple. Upper lead is negative (−), lower is positive (+).',
  width: 50,
  height: 40,
  symbolType: 'thermocouple-polar',
  connectors: [{
    // Pin order here must match the symbol def: pin index 0 = upper (−), 1 = lower (+).
    name: 'TC',
    pins: [
      { pinNumber: '1', name: '−', side: 'left', role: 'ground' },
      { pinNumber: '2', name: '+', side: 'left' },
    ],
  }],
};

export default device;
