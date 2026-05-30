import type { DeviceTemplate } from '../types';

// Dynon SV-AP-PANEL — autopilot control panel with integrated 2-channel
// trim controller. Per "SkyView System Installation Guide – Revision AV" §24.
//   D15 — trim power/ground + dual motor outputs and pilot/copilot trim
//         button inputs. Network/power for the panel buttons is provided
//         through the SkyView Network connector (not this D15).
// "No Connect" pin (1) omitted.
const device: DeviceTemplate = {
  id: 'dynon-sv-ap-panel',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-AP-PANEL',
  name: 'SV-AP-PANEL',
  category: 'autopilot',
  description: 'Dynon autopilot control panel with built-in two-channel speed-scheduled trim controller.',
  width: 280,
  height: 380,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D15',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '9',  name: 'TRIM +12V',           side: 'left',  role: 'power',  current: '4A', comment: 'Trim motor supply' },
        { pinNumber: '2',  name: 'TRIM POWER GROUND',   side: 'left',  role: 'ground' },
        { pinNumber: '3',  name: 'PILOT TRIM UP',       side: 'right' },
        { pinNumber: '4',  name: 'PILOT TRIM DOWN',     side: 'right' },
        { pinNumber: '5',  name: 'COPILOT TRIM UP',     side: 'right' },
        { pinNumber: '6',  name: 'COPILOT TRIM DOWN',   side: 'right' },
        { pinNumber: '10', name: 'PILOT TRIM RIGHT',    side: 'right' },
        { pinNumber: '11', name: 'PILOT TRIM LEFT',     side: 'right' },
        { pinNumber: '12', name: 'COPILOT TRIM RIGHT',  side: 'right' },
        { pinNumber: '13', name: 'COPILOT TRIM LEFT',   side: 'right' },
        { pinNumber: '7',  name: 'MOTOR 1 WIRE A',      side: 'right', comment: 'Pitch trim motor (UP/DOWN buttons)' },
        { pinNumber: '8',  name: 'MOTOR 1 WIRE B',      side: 'right' },
        { pinNumber: '14', name: 'MOTOR 2 WIRE A',      side: 'right', comment: 'Roll trim motor (LEFT/RIGHT buttons)' },
        { pinNumber: '15', name: 'MOTOR 2 WIRE B',      side: 'right' },
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
