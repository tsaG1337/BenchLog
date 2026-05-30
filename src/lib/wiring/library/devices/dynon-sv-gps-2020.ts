import type { DeviceTemplate } from '../types';

// Dynon SV-GPS-250 (legacy) and SV-GPS-2020 (FAA 2020 ADS-B compliant) GPS
// antenna/receiver modules. Both share the same four-wire flying-lead pigtail
// and serial pinout; only the internal receiver differs.
//
// Per Dynon "SkyView System Installation Guide – Revision AV" §8, the four
// leads match the SkyView display harness colours so the install is "plug to
// the same-coloured wires":
//   Solid Orange         = +8 V power output (from display D37 pin 29)
//   Solid Black          = ground (display D37 pin 24)
//   White / Orange stripe = serial TX from GPS  → display serial RX
//   White / Violet stripe = serial RX to GPS    ← display serial TX (unused
//                                                  by current Dynon software
//                                                  but reserved)
//
// Dynon recommends connecting the GPS serial pair to **Serial Port 5** of the
// SkyView (HDX or Classic) display. The RX/TX leads should be twisted
// together over the run to the display — tagged here as twistGroup "GPS".
const device: DeviceTemplate = {
  id: 'dynon-sv-gps-2020',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-GPS-2020',
  name: 'SV-GPS-250 / SV-GPS-2020',
  category: 'generic',
  description: 'Dynon GPS antenna/receiver. SV-GPS-2020 is the FAA 2020 ADS-B-compliant high-integrity GPS; SV-GPS-250 is the legacy SIL=1 variant. Identical four-wire pigtail.',
  width: 200,
  height: 200,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'LEADS',
      connectorType: 'pigtail',
      pins: [
        { pinNumber: 'PWR', name: '+8 V POWER',   side: 'left',  role: 'power',  comment: 'Solid orange — from SkyView display D37 pin 29' },
        { pinNumber: 'GND', name: 'GROUND',       side: 'left',  role: 'ground', comment: 'Solid black — to display D37 pin 24' },
        { pinNumber: 'TX',  name: 'SERIAL TX',    side: 'right', comment: 'White / Orange stripe — to display Serial 5 RX (recommended)', twistGroup: 'GPS' },
        { pinNumber: 'RX',  name: 'SERIAL RX',    side: 'right', comment: 'White / Violet stripe — from display Serial 5 TX (recommended)', twistGroup: 'GPS' },
      ],
    },
  ],
};

export default device;
