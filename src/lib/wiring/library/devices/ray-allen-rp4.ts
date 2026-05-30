import type { DeviceTemplate } from '../types';

// Ray Allen RP4 — LED bar-graph trim position indicator.
// Six-wire flying-lead pigtail per the Ray Allen wiring drawings:
//   Red    = 12 V+ power in
//   Black  = ground
//   White  = dimmer input (tie to 12 V+ to enable the dimming circuit;
//            leave floating for full brightness)
//   Orange = position sensor reference (→ trim servo Orange)
//   Blue   = position sensor reference (→ trim servo Blue)
//   Green  = position sensor signal   (→ trim servo Green)
//
// The Orange/Blue/Green leads sit on the same three-wire net as the trim
// servo's position sensor — they're a shared sense bus, not driven outputs.
const device: DeviceTemplate = {
  id: 'ray-allen-rp4',
  manufacturer: 'Ray Allen',
  partNumber: 'RP4',
  name: 'RP4 LED Position Indicator',
  category: 'autopilot',
  description: 'Ray Allen LED bar-graph trim position indicator. Shares the position-sensor bus with the trim servo (Orange/Blue/Green) and has its own power + dimmer input.',
  width: 180,
  height: 220,
  manuals: [
    { label: 'Ray Allen Company', url: 'https://www.rayallencompany.com/' },
  ],
  connectors: [
    {
      name: 'LEADS',
      connectorType: 'pigtail',
      pins: [
        { pinNumber: 'R',  name: '12 V+ POWER',       side: 'left',  role: 'power' },
        { pinNumber: 'B',  name: 'GROUND',            side: 'left',  role: 'ground' },
        { pinNumber: 'WH', name: 'DIMMER',            side: 'left',  comment: 'Tie to 12 V+ to enable dimmer; leave floating for full brightness' },
        { pinNumber: 'OR', name: 'POSITION SENSOR +', side: 'right', comment: 'Orange — to trim servo Orange' },
        { pinNumber: 'BL', name: 'POSITION SENSOR -', side: 'right', comment: 'Blue — to trim servo Blue' },
        { pinNumber: 'GN', name: 'POSITION SIGNAL',   side: 'right', comment: 'Green — to trim servo Green (sensor wiper)' },
      ],
    },
  ],
};

export default device;
