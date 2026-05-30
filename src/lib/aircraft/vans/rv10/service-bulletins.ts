/**
 * Van's RV-10 — Service Bulletin catalog.
 *
 * Add new SBs here as you encounter them. Each entry has:
 *   - sbId        Van's official identifier (e.g. 'SB-16-03-28')
 *   - title       Short title shown in the popover
 *   - description 2-4 sentence summary
 *   - status      'incorporated' (FYI only, parts already updated) or
 *                 'action-required' (builder must do something)
 *   - url         Link to Van's official SB page
 *   - placements  Array of pins — one entry per place on the plans where
 *                 the marker should appear. Use the in-app coordinate
 *                 picker (admin-only "SB" toolbar button) to capture
 *                 (sectionId, page, x, y).
 */

import type { ServiceBulletin } from '@/lib/aircraft/types';

export const VANS_RV10_SERVICE_BULLETINS: ServiceBulletin[] = [
  // Example (uncomment + edit when adding a real SB):
  //
  // {
  //   sbId: 'SB-16-03-28',
  //   title: 'Fuel tank vent line modification',
  //   description: 'Replace the original-style vent line with the updated routing per Van\'s notice.',
  //   status: 'action-required',
  //   url: 'https://vansaircraft.com/service-information-and-revisions/',
  //   placements: [
  //     { sectionId: '18', page: 3, x: 0.42, y: 0.61 },
  //   ],
  // },
  {
  sbId: "SB 14-12-22",
  title: "Nose Stop Flange Installation",
  description: "Check the Strop Flange Installation to allow sufficient rotation of the nose fork.",
  status: 'incorporated',
  url: "https://www.vansaircraft.com/service-information-and-revisions/sb-14-12-22/",
  placements: [
    { sectionId: '46', page: 6, x: 0.6543, y: 0.2973 },
  ],
},
  {
  sbId: "SB 16-03-28",
  title: "Cracking of wing aft spar web at the inboard aileron hinge bracket attach rivets.",
  description: "The the Aileron Bracket assembly has been updated from W-1013B to W1013C and Aileron attach doublers in new kits. The plans have been updated.",
  status: 'incorporated',
  url: "https://www.vansaircraft.com/service-information-and-revisions/sb-16-03-28/",
  placements: [
    { sectionId: '15', page: 2, x: 0.8872, y: 0.0635 },
  ],
},
  {
  sbId: "SB 19-09-09",
  title: "RV-10 updated nose gear leg",
  description: "All kits delivered after 10.2019 shall have received the updated WD-1017-1 (instead of WD-1017) nose gear leg. The plans have been updated.",
  status: 'incorporated',
  url: "https://www.vansaircraft.com/service-information-and-revisions/sb-19-09-09/",
  placements: [
    { sectionId: '46', page: 6, x: 0.58, y: 0.5735 },
  ],
},
  {
  sbId: "SB 18-03-30",
  title: "Elevator Control Stop",
  description: "Change in the shape of F-1012D. The Part shall be contained in the kit but it is not mentioned in the plans",
  status: 'action-required',
  url: "https://www.vansaircraft.com/service-information-and-revisions/sb-18-03-30/",
  placements: [
    { sectionId: '10', page: 13, x: 0.4643, y: 0.6069 },
    { sectionId: '10', page: 1, x: 0.9342, y: 0.6823 },
  ],
},
];
