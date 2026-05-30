import type { DeviceTemplate } from '../types';

// Ray Allen RS2 — manual trim rocker switch.
// Four-wire flying-lead pigtail per the Ray Allen wiring drawings:
//   Red   = 12 V+ power in
//   Black = ground
//   White = motor output 1 (→ trim servo White)
//   Gray  = motor output 2 (→ trim servo Gray)
// Reversing the White and Gray motor outputs flips the rocker direction —
// useful when the servo travel ends up backwards from the rocker action.
const device: DeviceTemplate = {
  id: 'ray-allen-rs2',
  manufacturer: 'Ray Allen',
  partNumber: 'RS2',
  name: 'RS2 Trim Rocker Switch',
  category: 'autopilot',
  description: 'Ray Allen manual trim rocker switch. Direct-wires to a Ray Allen trim servo (or to the SV-AP-PANEL trim inputs) — reverse Gray/White to flip rocker direction.',
  width: 180,
  height: 200,
  manuals: [
    { label: 'Ray Allen Company', url: 'https://www.rayallencompany.com/' },
  ],
  connectors: [
    {
      name: 'LEADS',
      connectorType: 'pigtail',
      pins: [
        { pinNumber: 'R',  name: '12 V+ POWER', side: 'left',  role: 'power' },
        { pinNumber: 'B',  name: 'GROUND',      side: 'left',  role: 'ground' },
        { pinNumber: 'WH', name: 'MOTOR OUT 1', side: 'right', comment: 'White — to trim servo White' },
        { pinNumber: 'GY', name: 'MOTOR OUT 2', side: 'right', comment: 'Gray — to trim servo Gray' },
      ],
    },
  ],
};

export default device;
