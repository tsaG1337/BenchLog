import type { DeviceTemplate } from '../types';

// Dynon SkyView autopilot servo (SV32 / SV42 / SV52).
// Per Dynon "SkyView System Installation Guide – Revision AV" §24.
//   D9 — combines SkyView Network data, aircraft power/ground, and the
//        AP disconnect / Control Wheel Steering (CWS) input.
const device: DeviceTemplate = {
  id: 'dynon-sv-net-servo',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV32 / SV42 / SV52',
  name: 'SkyView AP Servo',
  category: 'autopilot',
  description: 'Dynon SkyView autopilot servo — pitch, roll, or yaw axis. SV32/SV42/SV52 share the same harness pinout.',
  width: 220,
  height: 280,
  manuals: [
    { label: 'SkyView Installation Guide', url: 'https://docs.dynon.com/skyview/SkyView_System_Installation_Guide-Rev_AV.pdf' },
  ],
  connectors: [
    {
      name: 'D9',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        { pinNumber: '7', name: 'POWER',            side: 'left',  role: 'power',  comment: '10–30 V DC' },
        { pinNumber: '2', name: 'AIRCRAFT GROUND',  side: 'left',  role: 'ground' },
        { pinNumber: '1', name: 'NETWORK DATA 1A',  side: 'right', twistGroup: 'NET1' },
        { pinNumber: '6', name: 'NETWORK DATA 1B',  side: 'right', twistGroup: 'NET1' },
        { pinNumber: '4', name: 'NETWORK DATA 2B',  side: 'right', twistGroup: 'NET2' },
        { pinNumber: '8', name: 'NETWORK DATA 2A',  side: 'right', twistGroup: 'NET2' },
        { pinNumber: '3', name: 'AP DISCONNECT / CWS', side: 'right', comment: 'PBNO disconnect / Control Wheel Steering' },
      ],
    },
  ],
};

export default device;
