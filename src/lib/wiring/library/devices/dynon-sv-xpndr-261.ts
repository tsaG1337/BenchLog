import type { DeviceTemplate } from '../types';

// Dynon SV-XPNDR-261 / -262 / -263 Mode S transponders (Trig TT22/TT21 OEM).
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
//   D25 — power, ground, GPS serial, RS-232 to SkyView, optional discretes.
// Pins 1/2 and 12/13 form two internal loopback pairs that must be jumpered
// in the harness; we expose them so the user can draw the loopbacks on the
// schematic. "No Connect" pins (4, 6, 8, 9, 10, 11, 16, 21–25) omitted.
const device: DeviceTemplate = {
  id: 'dynon-sv-xpndr-261',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-XPNDR-261',
  name: 'SV-XPNDR-261 / 262 / 263',
  category: 'transponder',
  description: 'Dynon Mode S transponder with 1090ES ADS-B Out. -261/-263 are Class 1; -262 is Class 2 (<15,000 ft / <175 kt).',
  width: 280,
  height: 380,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D25',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '15', name: '11–33 V DC',          side: 'left',  role: 'power' },
        { pinNumber: '14', name: 'GROUND',              side: 'left',  role: 'ground' },
        { pinNumber: '1',  name: 'LOOPBACK 1',          side: 'right', comment: 'Connect to pin 2' },
        { pinNumber: '2',  name: 'LOOPBACK 1',          side: 'right', comment: 'Connect to pin 1' },
        { pinNumber: '12', name: 'LOOPBACK 2',          side: 'right', comment: 'Connect to pin 13' },
        { pinNumber: '13', name: 'LOOPBACK 2',          side: 'right', comment: 'Connect to pin 12' },
        { pinNumber: '3',  name: 'GPS SERIAL IN',       side: 'right', comment: 'Aviation format' },
        { pinNumber: '5',  name: 'XPNDR SERIAL RX',     side: 'right', comment: 'From SkyView display' },
        { pinNumber: '7',  name: 'XPNDR SERIAL TX',     side: 'right', comment: 'To SkyView display' },
        { pinNumber: '17', name: 'EXT STANDBY IN',      side: 'right', comment: 'Optional' },
        { pinNumber: '18', name: 'MUTUAL SUPPRESSION',  side: 'right', comment: 'Optional' },
        { pinNumber: '19', name: 'SQUAT SWITCH IN',     side: 'right', comment: 'Optional' },
        { pinNumber: '20', name: 'IDENT SWITCH IN',     side: 'right', comment: 'Optional' },
      ],
    },
  ],
};

export default device;
