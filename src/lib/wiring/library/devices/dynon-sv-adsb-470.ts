import type { DeviceTemplate } from '../types';

// Dynon SV-ADSB-470 / SV-ADSB-472 ADS-B (978 MHz UAT) receiver.
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
//   D9 — power, ground, and a serial pair to a SkyView display.
// Note: this D9F is NOT a SkyView Network connector — it carries a plain
// RS-232 serial pair plus aircraft power/ground.
const device: DeviceTemplate = {
  id: 'dynon-sv-adsb-470',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-ADSB-470',
  name: 'SV-ADSB-470 / 472',
  category: 'ads-b',
  description: 'Dynon ADS-B IN receiver (978 MHz UAT). Provides traffic and FIS-B weather to SkyView via RS-232.',
  width: 240,
  height: 280,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D9',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1', name: '10–30 V DC',     side: 'left',  role: 'power' },
        { pinNumber: '4', name: 'GROUND',         side: 'left',  role: 'ground' },
        { pinNumber: '2', name: 'ADSB SERIAL RX', side: 'right', comment: 'Data input from SkyView' },
        { pinNumber: '3', name: 'ADSB SERIAL TX', side: 'right', comment: 'Data output to SkyView' },
      ],
    },
  ],
};

export default device;
