import type { DeviceTemplate } from '../types';

// Dynon SV-AP-TRIMAMP — Electric Trim Signal Amplifier.
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
//   D15 — power, ground, motor + clutch outputs, trim activity / interrupt
//         lines back to a SkyView display and SV-AP-PANEL.
const device: DeviceTemplate = {
  id: 'dynon-sv-ap-trimamp',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-AP-TRIMAMP',
  name: 'SV-AP-TRIMAMP',
  category: 'autopilot',
  description: 'Dynon Electric Trim Signal Amplifier — drives high-current trim motors with clutch control.',
  width: 240,
  height: 320,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D15',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '15', name: 'POWER',                  side: 'left',  role: 'power',  current: '5A',   comment: 'Electrical bus, 5A breaker/fuse' },
        { pinNumber: '13', name: 'POWER (TO AP-PANEL)',    side: 'left',  role: 'power',  comment: 'To SV-AP-PANEL pin 9' },
        { pinNumber: '8',  name: 'GROUND',                 side: 'left',  role: 'ground', comment: 'Common airframe ground' },
        { pinNumber: '5',  name: 'GROUND (TO AP-PANEL)',   side: 'left',  role: 'ground', comment: 'To SV-AP-PANEL pin 2' },
        { pinNumber: '9',  name: 'TRIM CLUTCH GROUND',     side: 'left',  role: 'ground', comment: 'Trim motor clutch return' },
        { pinNumber: '2',  name: 'TRIM ACTIVITY',          side: 'right', comment: 'To display D37 pin 14 (Contact Input 3)' },
        { pinNumber: '3',  name: 'TRIM MOTOR IN B',        side: 'right', comment: 'To SV-AP-PANEL pin 8' },
        { pinNumber: '4',  name: 'TRIM MOTOR IN A',        side: 'right', comment: 'To SV-AP-PANEL pin 7' },
        { pinNumber: '6',  name: 'TRIM INTERRUPT',         side: 'right', comment: 'AP disconnect button' },
        { pinNumber: '10', name: 'TRIM CLUTCH +',          side: 'right', comment: 'Positive terminal on trim motor clutch' },
        { pinNumber: '11', name: 'TRIM MOTOR B',           side: 'right' },
        { pinNumber: '12', name: 'TRIM MOTOR A',           side: 'right' },
      ],
    },
  ],
};

export default device;
