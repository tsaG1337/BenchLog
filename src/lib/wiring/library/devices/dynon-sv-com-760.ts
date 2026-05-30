import type { DeviceTemplate } from '../types';

// Dynon SV-COM-760 / SV-COM-T25 / SV-COM-T8 remote VHF transceivers.
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
// All three radios share a common D25M pinout. SV-COM-760 is 25 kHz channel
// spacing; SV-COM-T25 (Trig TY91LA) is 25 kHz with TSO/ETSO; SV-COM-T8
// (Trig TY91L) supports 8.33 kHz channels in addition to 25 kHz.
// "No Connection" pins (3, 4, 7, 8, 11, 12, 14, 16, 17, 20, 21) omitted.
const device: DeviceTemplate = {
  id: 'dynon-sv-com-760',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-COM-760',
  name: 'SV-COM-760 / T25 / T8',
  category: 'nav-com',
  description: 'Dynon remote-mount VHF COM transceiver. T25 = TSO 25 kHz; T8 = TSO 25 kHz + 8.33 kHz channels.',
  width: 280,
  height: 420,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D25',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '24', name: 'POWER IN',         side: 'left',  role: 'power',  current: '5A', comment: '10–30 V DC' },
        { pinNumber: '25', name: 'POWER IN',         side: 'left',  role: 'power',  comment: '10–30 V DC (parallel with pin 24)' },
        { pinNumber: '19', name: 'GROUND IN',        side: 'left',  role: 'ground' },
        { pinNumber: '22', name: 'GROUND IN',        side: 'left',  role: 'ground' },
        { pinNumber: '10', name: 'GROUND',           side: 'left',  role: 'ground' },
        { pinNumber: '1',  name: 'PHONES GROUND',    side: 'left',  role: 'ground', comment: 'To SV-INTERCOM-2S pin 1 (shielded)' },
        { pinNumber: '9',  name: 'MIC / PTT GROUND', side: 'left',  role: 'ground', comment: 'To SV-INTERCOM-2S pin 1' },
        { pinNumber: '2',  name: 'PHONES OUT',       side: 'right', comment: 'To SV-INTERCOM-2S pin 14 (shielded)' },
        { pinNumber: '23', name: 'MICROPHONE IN',    side: 'right', comment: 'To SV-INTERCOM-2S pin 25 (shielded)' },
        { pinNumber: '15', name: 'PTT IN',           side: 'right', comment: 'To SV-INTERCOM-2S pin 12 or PBNO to ground' },
        { pinNumber: '5',  name: 'DATA RX (PANEL)',  side: 'right', comment: 'To SV-COM-PANEL pin 5' },
        { pinNumber: '6',  name: 'DATA TX (PANEL)',  side: 'right', comment: 'To SV-COM-PANEL pin 4' },
        { pinNumber: '13', name: 'PANEL ENABLE',     side: 'right', comment: 'To SV-COM-PANEL pin 6' },
        { pinNumber: '18', name: 'TRANSMIT INTERLOCK', side: 'right', comment: 'Only when two radios installed — to other radio PTT' },
      ],
    },
  ],
};

export default device;
