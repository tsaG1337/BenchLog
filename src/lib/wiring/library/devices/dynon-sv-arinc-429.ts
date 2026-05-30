import type { DeviceTemplate } from '../types';

// Dynon SV-ARINC-429 module — adds ARINC-429 transmit/receive to a SkyView system.
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
//   D25  — ARINC RX/TX pairs + GPS aviation-format serial RX
//   D9   — SkyView Network port to displays
// "No Connect" pins (1, 2, 4–9, 14–19, 21) omitted.
// Pins 12/13 share the same TX-B signal, and 24/25 share the same TX-A
// signal — they're duplicated on the connector to make daisy-chaining ARINC
// receivers easier. We expose all four so the user can pick whichever lands
// closest to the destination device.
const device: DeviceTemplate = {
  id: 'dynon-sv-arinc-429',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-ARINC-429',
  name: 'SV-ARINC-429',
  category: 'generic',
  description: 'Dynon SkyView ARINC-429 interface module. Two ARINC-429 receivers and one transmitter pair.',
  width: 280,
  height: 360,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D25',
      gender: 'F',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '20', name: 'GROUND',     side: 'left',  role: 'ground' },
        { pinNumber: '3',  name: 'SERIAL RX',  side: 'right', comment: 'Aviation format only, from connected ARINC-429 GPS' },
        { pinNumber: '11', name: 'ARINC 1 RX B', side: 'right' },
        { pinNumber: '23', name: 'ARINC 1 RX A', side: 'right' },
        { pinNumber: '10', name: 'ARINC 2 RX B', side: 'right' },
        { pinNumber: '22', name: 'ARINC 2 RX A', side: 'right' },
        { pinNumber: '12', name: 'ARINC TX B',   side: 'right', comment: 'Pins 12 & 13 are the same TX signal' },
        { pinNumber: '13', name: 'ARINC TX B',   side: 'right' },
        { pinNumber: '24', name: 'ARINC TX A',   side: 'right', comment: 'Pins 24 & 25 are the same TX signal' },
        { pinNumber: '25', name: 'ARINC TX A',   side: 'right' },
      ],
    },
    {
      name: 'J-NET',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1', name: 'NETWORK DATA 1A', side: 'right',                  twistGroup: 'NET1' },
        { pinNumber: '2', name: 'NETWORK GROUND 1', side: 'left',  role: 'ground', twistGroup: 'PWR1' },
        { pinNumber: '3', name: 'NETWORK GROUND 2', side: 'left',  role: 'ground', twistGroup: 'PWR2' },
        { pinNumber: '4', name: 'NETWORK DATA 2B', side: 'right',                  twistGroup: 'NET2' },
        { pinNumber: '5', name: 'EMS AUX',         side: 'right' },
        { pinNumber: '6', name: 'NETWORK DATA 1B', side: 'right',                  twistGroup: 'NET1' },
        { pinNumber: '7', name: 'NETWORK POWER 1', side: 'left',  role: 'power',  twistGroup: 'PWR1' },
        { pinNumber: '8', name: 'NETWORK DATA 2A', side: 'right',                  twistGroup: 'NET2' },
        { pinNumber: '9', name: 'NETWORK POWER 2', side: 'left',  role: 'power',  twistGroup: 'PWR2' },
      ],
    },
  ],
};

export default device;
