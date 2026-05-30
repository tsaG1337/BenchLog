import type { DeviceTemplate } from '../types';

// Dynon Heated AOA/Pitot Probe (P/N 100667-000).
// Per Dynon "AOA/Pitot Probe and Heated AOA/Pitot Probe Installation Guide
// Revision G" §3 — wiring connectors documented page 3-6.
//
// The probe presents five flying leads that mate with the controller:
//   • 3× Faston-terminated heater wires (Blue, Orange, Black ground)
//   • 2× white temperature-sensor wires through a Molex Micro-Fit 43645-0200
//     (probe-side male) 2-position connector — non-polarised
//
// The probe also has two pneumatic ports (Pitot and AOA) which are physical
// 3/16" aluminium tubes, not electrical — they aren't modelled here.
//
// Note: on probes shipped after October 2014 the Blue and Orange wires are
// White with a short length of coloured heat-shrink tubing at the end.
const device: DeviceTemplate = {
  id: 'dynon-heated-aoa-pitot-probe',
  manufacturer: 'Dynon Avionics',
  partNumber: '100667-000',
  name: 'Heated AOA/Pitot Probe',
  category: 'generic',
  description: 'Dynon heated AOA/Pitot probe. Pairs with the Heated AOA/Pitot Probe Controller; 100 W heater regulated to 70–80 °C.',
  width: 220,
  height: 240,
  manuals: [
    { label: 'AOA/Pitot Probe Installation Guide', url: 'https://docs.dynon.com/skyview/Heated_Unheated_AOA_Pitot_Probe_Installation_Guide_Rev_G.pdf' },
  ],
  connectors: [
    {
      name: 'LEADS',
      connectorType: 'pigtail',
      pins: [
        { pinNumber: 'BL', name: 'HEATER (BLUE)',     side: 'left',  current: '10A', wireGauge: '18', comment: 'Faston — to controller PROBE Blue' },
        { pinNumber: 'OR', name: 'HEATER (ORANGE)',   side: 'left',  current: '10A', wireGauge: '18', comment: 'Faston — to controller PROBE Orange' },
        { pinNumber: 'BK', name: 'HEATER GND (BLACK)', side: 'left',  role: 'ground', current: '10A', wireGauge: '18', comment: 'Faston — to controller PROBE Black' },
        { pinNumber: 'W1', name: 'TEMP SENSE A',      side: 'left',  wireGauge: '26', comment: 'White — Molex Micro-Fit 43645-0200' },
        { pinNumber: 'W2', name: 'TEMP SENSE B',      side: 'left',  wireGauge: '26', comment: 'White — Molex Micro-Fit 43645-0200' },
      ],
    },
  ],
};

export default device;
