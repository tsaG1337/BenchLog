import type { DeviceTemplate } from '../types';

// Dynon SV-ADAHRS-200 / SV-ADAHRS-201 Air Data, Attitude, and Heading Reference System.
// Per Dynon "SkyView System Installation Guide – Revision AV" §24, Figure 244.
//   D9    — SkyView Network connector to displays (Table 121 pinout)
//   OAT   — 2-pin Molex Micro-Fit, non-polarized, SV-OAT-340 only
// The SV-ADAHRS-201 is a secondary/redundant unit and shares the same pinout.
const device: DeviceTemplate = {
  id: 'dynon-sv-adahrs-200',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-ADAHRS-200',
  name: 'SV-ADAHRS-200 / 201',
  category: 'ahrs',
  description: 'Dynon SkyView Air Data, Attitude, and Heading Reference System. -201 is the secondary/redundant unit.',
  width: 240,
  height: 280,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
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
    {
      name: 'OAT',
      connectorType: 'molex-microfit',
      pins: [
        { pinNumber: '1', name: 'OAT', side: 'right', comment: 'Non-polarized — SV-OAT-340 only' },
        { pinNumber: '2', name: 'OAT', side: 'right', comment: 'Non-polarized — SV-OAT-340 only' },
      ],
    },
  ],
};

export default device;
