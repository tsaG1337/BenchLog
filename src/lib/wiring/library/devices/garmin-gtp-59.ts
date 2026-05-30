import type { DeviceTemplate } from '../types';

// Per Garmin G5 STC Install Manual 190-01112-10 Rev. 19, Appendix A.5.
// Pre-installed lead wires identified by colour rather than DSUB pin number.
const device: DeviceTemplate = {
  id: 'garmin-gtp-59',
  manufacturer: 'Garmin',
  partNumber: '011-00978-00',
  name: 'GTP 59',
  category: 'ahrs',
  description: 'OAT (Outside Air Temperature) probe — passive RTD with 3 lead wires.',
  width: 160,
  height: 120,
  manuals: [
    { label: 'Manuals', url: 'https://support.garmin.com/en-US/?productID=9537&tab=manuals' },
  ],
  connectors: [{
    name: 'WIRES',
    connectorType: 'pigtail',
    pins: [
      { pinNumber: 'WH', name: 'TEMP PROBE POWER IN', side: 'right' },
      { pinNumber: 'BL', name: 'TEMP PROBE OUT HI',   side: 'right' },
      { pinNumber: 'OR', name: 'TEMP PROBE OUT LO',   side: 'right' },
    ],
  }],
};

export default device;
