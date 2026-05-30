import type { DeviceTemplate } from '../types';

// Dynon SV-INTERCOM-2S — 2-place stereo intercom for experimental / LSA panels.
// Per Dynon "SV-INTERCOM-2S Installation and User Guide – Revision A", §2 Figure 1.
//   D25 — single male connector on the unit; harness side is D25F.
// Pin 1 is the master shield-ground point — every shielded audio cable in the
// harness terminates its drain here (see manual §2 "Audio cable shields must
// terminate at a common point").
const device: DeviceTemplate = {
  id: 'dynon-sv-intercom-2s',
  manufacturer: 'Dynon Avionics',
  partNumber: 'SV-INTERCOM-2S',
  name: 'SV-INTERCOM-2S',
  category: 'audio',
  description: 'Dynon 2-place stereo intercom with dual radio outputs, stereo EFIS/music inputs, and primary-radio fail-safe to pilot headset.',
  width: 280,
  height: 520,
  manuals: [
    { label: 'SV-INTERCOM-2S Installation & User Guide', url: 'https://docs.dynon.com/skyview/SV-INTERCOM-2S_Installation_and_Pilots_User_Guide-Rev_A.pdf' },
  ],
  connectors: [
    {
      name: 'D25',
      gender: 'M',
      connectorType: 'dsub',
      pins: [
        // Power / grounds — left side
        { pinNumber: '13', name: 'POWER IN',                  side: 'left', role: 'power',  current: '0.1A', comment: '10–30 V DC' },
        { pinNumber: '1',  name: 'MASTER GROUND / SHIELD GND', side: 'left', role: 'ground', comment: 'Single-point return for all audio shields' },
        { pinNumber: '2',  name: 'MIC / PTT GROUND',          side: 'left', role: 'ground', comment: 'Pilot and copilot mic / PTT return' },
        { pinNumber: '18', name: 'MUSIC IN GROUND',           side: 'left', role: 'ground', comment: 'Stereo music ground — do not share' },
        { pinNumber: '20', name: 'EFIS AUDIO GROUND',         side: 'left', role: 'ground', comment: 'From SkyView D37 pin 30 — stereo EFIS ground only' },

        // SkyView / EFIS audio inputs (stereo, non-muting)
        { pinNumber: '19', name: 'EFIS AUDIO IN L',           side: 'right', comment: 'From SkyView D37 pin 13' },
        { pinNumber: '6',  name: 'EFIS AUDIO IN R',           side: 'right', comment: 'From SkyView D37 pin 31' },
        { pinNumber: '5',  name: 'LED DIM INPUT',             side: 'right', comment: 'From SkyView D37 pin 26 — connect to ONE display only' },

        // Radio 1
        { pinNumber: '14', name: 'RADIO 1 AUDIO IN',          side: 'right', comment: 'From COM 1 audio out (e.g. SV-COM-425 pin 10)' },
        { pinNumber: '25', name: 'RADIO 1 MIC OUT',           side: 'right', comment: 'To COM 1 mic in (e.g. SV-COM-425 pin 1)' },

        // Radio 2
        { pinNumber: '7',  name: 'RADIO 2 AUDIO IN',          side: 'right', comment: 'Non-muting; from COM 2 / NAV audio out' },
        { pinNumber: '15', name: 'RADIO 2 MIC OUT',           side: 'right', comment: 'To COM 2 mic in' },

        // PTT
        { pinNumber: '12', name: 'PTT OUT',                   side: 'right', comment: 'To radio PTT — external SPDT for dual-radio install' },
        { pinNumber: '10', name: 'PILOT PTT IN',              side: 'right', comment: 'PBNO to ground' },
        { pinNumber: '16', name: 'COPILOT PTT IN',            side: 'right', comment: 'PBNO to ground' },

        // Pilot headset
        { pinNumber: '23', name: 'PILOT MIC IN',              side: 'right' },
        { pinNumber: '9',  name: 'PILOT PHONES L',            side: 'right' },
        { pinNumber: '22', name: 'PILOT PHONES R',            side: 'right' },

        // Copilot headset
        { pinNumber: '3',  name: 'COPILOT MIC IN',            side: 'right' },
        { pinNumber: '8',  name: 'COPILOT PHONES L',          side: 'right' },
        { pinNumber: '21', name: 'COPILOT PHONES R',          side: 'right' },

        // Music & auxiliary inputs
        { pinNumber: '24', name: 'MUSIC IN L',                side: 'right', comment: 'Overridden by front-panel 3.5 mm jack' },
        { pinNumber: '11', name: 'MUSIC IN R',                side: 'right', comment: 'Overridden by front-panel 3.5 mm jack' },
        { pinNumber: '17', name: 'AUX NON-MUTING IN',         side: 'right', comment: 'Mono — for critical alerts (NAV, etc.)' },
        { pinNumber: '4',  name: 'AUX MUTING IN',             side: 'right', comment: 'Mono — non-critical, mutes on radio activity' },
      ],
    },
  ],
};

export default device;
