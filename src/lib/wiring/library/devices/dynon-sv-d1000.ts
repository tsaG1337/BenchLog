import type { DeviceTemplate } from '../types';

// Dynon SkyView display — covers the entire SkyView display family that shares
// the SV-HARNESS-D37 pinout: SV-D600/D700/D900/D1000/D1000T (Classic/SE/Touch)
// and SV-HDX800/HDX1100 (HDX series).
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
//   D37M  — main harness (SV-HARNESS-D37): power, audio, serial ports, contact inputs, dim
//   J-NET — two D9M SkyView Network connectors (party-line bus to ADAHRS/EMS/AP modules)
// "Do Not Connect" pins (16–19, 32–37) and USB/RJ45/OAT/battery connectors omitted.
const device: DeviceTemplate = {
  id: 'dynon-sv-d1000',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-D1000',
  name: 'SkyView Display (D700/D900/D1000/D1000T/HDX800/HDX1100)',
  category: 'display',
  description: 'Dynon SkyView display — covers SV-D600/D700/D900/D1000/D1000T (Classic/SE/Touch) and SV-HDX800/HDX1100 (HDX). D37M harness for power/audio/serial/contacts plus two D9M SkyView Network ports.',
  width: 360,
  height: 720,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D37',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '1',  name: 'POWER INPUT',           side: 'left',  role: 'power' },
        { pinNumber: '20', name: 'POWER INPUT',           side: 'left',  role: 'power' },
        { pinNumber: '2',  name: 'SV-BAT-320 +',          side: 'left',  role: 'power',  comment: 'Backup battery input' },
        { pinNumber: '21', name: 'GROUND',                side: 'left',  role: 'ground' },
        { pinNumber: '22', name: 'GROUND',                side: 'left',  role: 'ground' },
        { pinNumber: '23', name: 'GROUND',                side: 'left',  role: 'ground', comment: 'SV-BAT-320 ground return' },
        { pinNumber: '24', name: 'GROUND',                side: 'left',  role: 'ground' },
        { pinNumber: '29', name: 'SV-GPS-250/2020 POWER', side: 'left',  role: 'power',  current: '0.1A', comment: '8 V output to GPS antenna' },
        { pinNumber: '30', name: 'AUDIO GROUND',          side: 'left',  role: 'ground' },
        { pinNumber: '3',  name: 'SERIAL 1 RX',           side: 'right' },
        { pinNumber: '4',  name: 'SERIAL 1 TX',           side: 'right' },
        { pinNumber: '5',  name: 'SERIAL 2 RX',           side: 'right' },
        { pinNumber: '6',  name: 'SERIAL 2 TX',           side: 'right' },
        { pinNumber: '7',  name: 'SERIAL 3 RX',           side: 'right' },
        { pinNumber: '8',  name: 'SERIAL 3 TX',           side: 'right' },
        { pinNumber: '9',  name: 'SERIAL 4 RX',           side: 'right' },
        { pinNumber: '10', name: 'SERIAL 4 TX',           side: 'right' },
        { pinNumber: '11', name: 'SERIAL 5 RX',           side: 'right' },
        { pinNumber: '12', name: 'SERIAL 5 TX',           side: 'right' },
        { pinNumber: '13', name: 'AUDIO OUTPUT LEFT',     side: 'right' },
        { pinNumber: '31', name: 'AUDIO OUTPUT RIGHT',    side: 'right' },
        { pinNumber: '14', name: 'CONTACT INPUT 3',       side: 'right', comment: 'Reserved for future use' },
        { pinNumber: '15', name: 'CONTACT INPUT 4',       side: 'right', comment: 'Reserved for future use' },
        { pinNumber: '25', name: 'DIM INPUT',             side: 'right', comment: '0–36 V external dim signal' },
        { pinNumber: '26', name: 'DIM OUTPUT',            side: 'right', comment: 'Drives compatible dimmable equipment' },
        { pinNumber: '27', name: 'CONTACT INPUT 2',       side: 'right', comment: 'Optional external GO AROUND button' },
        { pinNumber: '28', name: 'CONTACT INPUT 1',       side: 'right', comment: 'Optional external LEVEL button' },
      ],
    },
    {
      name: 'J-NET 1',
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
    {
      name: 'J-NET 2',
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
