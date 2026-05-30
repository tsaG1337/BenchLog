import type { DeviceTemplate } from '../types';

// Dynon SV-COM-PANEL — front-panel control head for the SV-COM-425 / -760 /
// -T25 / -T8 / -X83 remote VHF radios.
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
//   D15 — power/ground in from the radio, serial pair to the radio,
//         optional external flip/flop pushbutton.
// "No Connect" pins (8–15) omitted.
const device: DeviceTemplate = {
  id: 'dynon-sv-com-panel',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-COM-PANEL',
  name: 'SV-COM-PANEL',
  category: 'nav-com',
  description: 'Dynon SkyView COM radio control panel — works with SV-COM-425, -760, -T25, -T8, and -X83.',
  width: 240,
  height: 280,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D15',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1', name: 'POWER IN',          side: 'left',  role: 'power',  comment: 'From SV-COM-425 pin 7' },
        { pinNumber: '2', name: 'GROUND IN',         side: 'left',  role: 'ground', comment: 'From SV-COM-425 pin 13' },
        { pinNumber: '3', name: 'GROUND OUT',        side: 'left',  role: 'ground', comment: 'Optional — for grounding pin 7 flip/flop switch' },
        { pinNumber: '4', name: 'PANEL RX',          side: 'right', comment: 'From radio TX (e.g. COM-760/T25/T8 pin 6)' },
        { pinNumber: '5', name: 'PANEL TX',          side: 'right', comment: 'To radio RX (e.g. COM-760/T25/T8 pin 5)' },
        { pinNumber: '6', name: 'ENABLE',            side: 'right', comment: 'To radio (e.g. COM-760/T25/T8 pin 13)' },
        { pinNumber: '7', name: 'EXT FLIP/FLOP SW',  side: 'right', comment: 'PBNO to ground — optional' },
      ],
    },
  ],
};

export default device;
