import type { DeviceTemplate } from '../types';

// Dynon SV-COM-425 — earlier-generation 25 kHz remote VHF transceiver.
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
//   D15 — different connector than the SV-COM-760/T25/T8 (which use D25M).
const device: DeviceTemplate = {
  id: 'dynon-sv-com-425',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-COM-425',
  name: 'SV-COM-425',
  category: 'nav-com',
  description: 'Dynon remote-mount VHF COM transceiver (legacy, 25 kHz channel spacing).',
  width: 240,
  height: 360,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D15',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '8',  name: 'POWER IN',          side: 'left',  role: 'power',  current: '5A', comment: '10–30 V DC' },
        { pinNumber: '7',  name: 'PANEL POWER OUT',   side: 'left',  role: 'power',  comment: 'To SV-COM-PANEL pin 1' },
        { pinNumber: '12', name: 'GROUND IN',         side: 'left',  role: 'ground', comment: 'Ground bus' },
        { pinNumber: '13', name: 'PANEL GROUND OUT',  side: 'left',  role: 'ground', comment: 'To SV-COM-PANEL pin 2' },
        { pinNumber: '2',  name: 'MIC / PTT GROUND',  side: 'left',  role: 'ground' },
        { pinNumber: '9',  name: 'PHONES GROUND',     side: 'left',  role: 'ground', comment: 'To SV-INTERCOM-2S pin 1 (shielded)' },
        { pinNumber: '4',  name: 'GROUND OUT',        side: 'left',  role: 'ground', comment: 'Optional ground available for use' },
        { pinNumber: '11', name: 'GROUND OUT',        side: 'left',  role: 'ground', comment: 'Optional ground available for use' },
        { pinNumber: '15', name: 'GROUND OUT',        side: 'left',  role: 'ground', comment: 'Optional ground available for use' },
        { pinNumber: '1',  name: 'MICROPHONE IN',     side: 'right', comment: 'To SV-INTERCOM-2S pin 25' },
        { pinNumber: '10', name: 'PHONES OUT',        side: 'right', comment: 'To SV-INTERCOM-2S pin 14 (shielded)' },
        { pinNumber: '5',  name: 'PTT IN',            side: 'right', comment: 'To SV-INTERCOM-2S pin 12 or PBNO to ground' },
        { pinNumber: '14', name: 'DATA RX (PANEL)',   side: 'right', comment: 'To SV-COM-PANEL pin 5' },
        { pinNumber: '6',  name: 'DATA TX (PANEL)',   side: 'right', comment: 'To SV-COM-PANEL pin 4' },
        { pinNumber: '3',  name: 'PANEL ENABLE',      side: 'right', comment: 'To SV-COM-PANEL pin 6' },
      ],
    },
  ],
};

export default device;
