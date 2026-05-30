import type { DeviceTemplate } from '../types';

// Dynon Heated AOA/Pitot Probe Controller (P/N 100640-000).
// Per Dynon "AOA/Pitot Probe and Heated AOA/Pitot Probe Installation Guide
// Revision G" §3 (Heater Controller Mounting and Wiring), Figure 7.
//
// The controller has two electrical interfaces, both as flying-lead pigtails:
//   PROBE   — five leads going to the Heated AOA/Pitot Probe:
//             • 3× Faston-terminated heater wires (Blue, Orange, Black)
//             • 2× white temperature-sensor wires through a Molex Micro-Fit
//               43640-0200 (controller-side female) connector
//   PANEL   — three leads to the cockpit:
//             • Red:   12–15 V DC power (via 10A breaker/fuse + PITOT HEAT switch)
//             • Black: ground (constant, NOT switched — must be present so the
//                      STATUS line can pull low when the controller is off)
//             • White: PITOT HEAT STATUS — pulls to ground on off/fault, open
//                      otherwise (max 1A); typically routed to a panel indicator
//                      or an SV-EMS-220/221 General-Purpose contact input.
//
// Power leads are sized 18 AWG inside the unit; runs longer than ~16 ft must
// be extended with 14 AWG, longer than ~24 ft with 12 AWG (FAA AC 43.13-1B).
const device: DeviceTemplate = {
  id: 'dynon-heated-aoa-pitot-controller',
  manufacturer: 'Dynon Avionics',
  partNumber: '100640-000',
  name: 'Heated AOA/Pitot Probe Controller',
  category: 'generic',
  description: 'Dynon Heated AOA/Pitot Probe heater controller. 12 V DC only; 100 W @ 10 A. Drives the probe heater to a regulated 70–80 °C.',
  width: 240,
  height: 320,
  manuals: [
    { label: 'AOA/Pitot Probe Installation Guide', url: 'https://docs.dynon.com/skyview/Heated_Unheated_AOA_Pitot_Probe_Installation_Guide_Rev_G.pdf' },
  ],
  connectors: [
    {
      name: 'PROBE',
      connectorType: 'pigtail',
      pins: [
        { pinNumber: 'BL', name: 'HEATER (BLUE)',     side: 'right', current: '10A', wireGauge: '18', comment: 'Faston — mate with probe Blue heater wire' },
        { pinNumber: 'OR', name: 'HEATER (ORANGE)',   side: 'right', current: '10A', wireGauge: '18', comment: 'Faston — mate with probe Orange heater wire' },
        { pinNumber: 'BK', name: 'HEATER GND (BLACK)', side: 'left',  role: 'ground', current: '10A', wireGauge: '18', comment: 'Faston — mate with probe Black heater ground' },
        { pinNumber: 'W1', name: 'TEMP SENSE A',      side: 'right', wireGauge: '26', comment: 'White — Molex Micro-Fit 43640-0200 (non-polarised pair with W2)' },
        { pinNumber: 'W2', name: 'TEMP SENSE B',      side: 'right', wireGauge: '26', comment: 'White — Molex Micro-Fit 43640-0200 (non-polarised pair with W1)' },
      ],
    },
    {
      name: 'PANEL',
      connectorType: 'pigtail',
      pins: [
        { pinNumber: 'R',  name: '12-15 V POWER IN',  side: 'left',  role: 'power',  current: '10A', wireGauge: '14', comment: 'Through PITOT HEAT switch + 10A breaker/fuse' },
        { pinNumber: 'B',  name: 'GROUND',            side: 'left',  role: 'ground', current: '10A', wireGauge: '14', comment: 'Constant ground — do NOT route through a switch' },
        { pinNumber: 'W',  name: 'PITOT HEAT STATUS', side: 'right', current: '1A', comment: 'Pulled low on off/fault. Drives panel indicator or EMS GP contact input.' },
      ],
    },
  ],
};

export default device;
