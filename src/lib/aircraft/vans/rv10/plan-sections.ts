/**
 * Van's RV-10 — plan-sections catalog + filename parser.
 *
 * Single source of truth: each section knows the filename(s) Van's ships
 * for it. The parser does a case-insensitive literal lookup against the
 * `filenames` field — no fuzzy text recognition. Files whose names
 * aren't in the catalog fall through to manual assignment on upload.
 *
 * Adding a new section:
 *   1. Add an entry below with `id`, `title`, `phase`, and `filenames`.
 *   2. That's it — the parser picks it up automatically.
 *
 * Sources:
 *   - Van's RV-10 plans (sections 6–50, FF1–FF6, 31Q/41Q/45A variants)
 *   - RV-10-applicable OP-* optional drawings (RV-6/7/8/9/14-only and
 *     non-IO-540 engine drawings excluded)
 *   - Builder's Manual sections 1–5 + appendices
 */

import type { PlanSection, ParsedPlanFilename } from '@/lib/aircraft/types';

export const VANS_RV10_PLAN_SECTIONS: PlanSection[] = [
  // ─── Builder's Manual (1–5) ─────────────────────────────────────
  // Non-build reference content. All under phase 'other'.
  { id: '1',  title: 'Introduction',                            phase: 'other' },
  { id: '2',  title: 'Design Philosophy',                       phase: 'other',
    filenames: ['RV-10 Manual - Design Philosophy.pdf'] },
  { id: '3',  title: 'Tools and Workspace',                     phase: 'other',
    filenames: ['Manual Section 3.pdf', 'RV-10 Manual - Section 3.pdf'] },
  { id: '4',  title: 'Parts Index',                             phase: 'other',
    filenames: ['RV-10 Manual - Section 4.pdf'] },
  { id: '5',  title: 'Standard Practices & Techniques',         phase: 'other', 
    filenames: ['Manual Section 5.pdf'] },

  // ─── Manual appendices ──────────────────────────────────────────
  // IDs are manufactured (no canonical Van's section number).
  { id: 'TITLE', title: 'Title Page',                           phase: 'other',
    filenames: ['RV-10 Manual - Title Page.pdf'] },
  { id: 'TOC',   title: 'Table of Contents',                    phase: 'other',
    filenames: ['RV-10 Manual - Table of Contents.pdf'] },
  { id: 'WARN',  title: 'Important Safety Warning',             phase: 'other',
    filenames: ['Plans Warning Cover Page_rev0.pdf'] },
  { id: 'WB',    title: 'Weight and Balance',                   phase: 'other' },
  { id: 'FT',    title: 'Final Inspection and Flight Test',     phase: 'other' },
  { id: 'MAIN',  title: 'Manual — Main (TOCs + W&B + Flight Test)', phase: 'other',
    filenames: ['RV-10 Manual - Main.pdf'] },
  { id: 'DWG',   title: 'Overview Drawings (3-View / Cutaway / Flowchart)', phase: 'other',
    filenames: ['10 DWG 1-3 3-View, Cutaway, Flowchart.pdf'] },

  // ─── Legacy generic manual sections (RV-ALL) ────────────────────
  // 'M' prefix disambiguates from canonical RV-10 sec 12 (Empennage
  // Fairings) and sec 13 (Main Spar), which are different content.
  { id: 'M12', title: 'Manual — Cowl/Spinner/Cooling (legacy)',  phase: 'other',
    filenames: ['Manual Section 12.pdf'] },
  { id: 'M13', title: 'Manual — Painting (legacy)',              phase: 'other',
    filenames: ['Manual Section 13.pdf'] },

  // ─── Empennage (6–12) ───────────────────────────────────────────
  { id: '6',  title: 'Vertical Stabilizer',                     phase: 'empennage',
    filenames: ['06_10.pdf', '6_10.pdf'] },
  { id: '7',  title: 'Rudder',                                  phase: 'empennage',
    filenames: ['07_10.pdf', '7_10.pdf'] },
  { id: '8',  title: 'Horizontal Stabilizer',                   phase: 'empennage',
    filenames: ['08_10.pdf', '8_10.pdf'] },
  { id: '9',  title: 'Elevators',                               phase: 'empennage',
    filenames: ['09_10.pdf', '9_10.pdf'] },
  { id: '10', title: 'Tailcone',                                phase: 'empennage',
    filenames: ['10_10.pdf'] },
  { id: '11', title: 'Empennage Attach',                        phase: 'empennage',
    filenames: ['11_10.pdf'] },
  { id: '12', title: 'Empennage Fairings',                      phase: 'empennage',
    filenames: ['12_10.pdf'] },

  // ─── Wings (13–24) ──────────────────────────────────────────────
  { id: '13', title: 'Main Spar',                               phase: 'wings',
    filenames: ['13_10.pdf'] },
  { id: '14', title: 'Wing Ribs',                               phase: 'wings',
    filenames: ['14_10.pdf'] },
  { id: '15', title: 'Rear Spar',                               phase: 'wings',
    filenames: ['15_10.pdf'] },
  { id: '16', title: 'Top Skins',                               phase: 'wings',
    filenames: ['16_10.pdf'] },
  { id: '17', title: 'Outboard Leading Edge',                   phase: 'wings',
    filenames: ['17_10.pdf'] },
  { id: '18', title: 'Fuel Tank',                               phase: 'wings',
    filenames: ['18_10.pdf'] },
  { id: '19', title: 'Stall Warning System',                    phase: 'wings',
    filenames: ['19_10.pdf'] },
  { id: '20', title: 'Bottom Skins',                            phase: 'wings',
    filenames: ['20_10.pdf'] },
  { id: '21', title: 'Aileron',                                 phase: 'wings',
    filenames: ['21_10.pdf'] },
  { id: '22', title: 'Flap',                                    phase: 'wings',
    filenames: ['22_10.pdf'] },
  { id: '23', title: 'Aileron Actuation',                       phase: 'wings',
    filenames: ['23_10.pdf'] },
  { id: '24', title: 'Wing Tip Installation',                   phase: 'wings',
    filenames: ['24_10.pdf'] },

  // ─── Fuselage (25–44) ───────────────────────────────────────────
  { id: '25',  title: 'Mid Fuselage Bulkheads',                 phase: 'fuselage',
    filenames: ['25_10.pdf'] },
  { id: '26',  title: 'Mid Fuse Ribs & Bottom Skins',           phase: 'fuselage',
    filenames: ['26_10.pdf'] },
  { id: '27',  title: 'Firewall',                               phase: 'fuselage',
    filenames: ['27_10.pdf'] },
  { id: '28',  title: 'Fwd Fuse Ribs, Bulkheads & Bottom Skin', phase: 'fuselage',
    filenames: ['28_10.pdf'] },
  { id: '29',  title: 'Fuse Side Skins',                        phase: 'fuselage',
    filenames: ['29_10.pdf'] },
  { id: '30',  title: 'Step Installation',                      phase: 'fuselage',
    filenames: ['30_10.pdf'] },
  { id: '31',  title: 'Upper Forward Fuselage',                 phase: 'fuselage',
    filenames: ['31_10.pdf'] },
  { id: '31Q', title: 'Upper Forward Fuselage — Quadrant',      phase: 'fuselage',
    filenames: ['31Q_10.pdf'] },
  { id: '32',  title: 'Tail Cone Attachment',                   phase: 'fuselage',
    filenames: ['32_10.pdf'] },
  { id: '33',  title: 'Baggage Area',                           phase: 'fuselage',
    filenames: ['33_10.pdf'] },
  { id: '34',  title: 'Baggage Door',                           phase: 'fuselage',
    filenames: ['34_10.pdf'] },
  { id: '35',  title: 'Access Covers & Floor Panels',           phase: 'fuselage',
    filenames: ['35_10.pdf'] },
  { id: '36',  title: 'Brake Lines',                            phase: 'fuselage',
    filenames: ['36_10.pdf'] },
  { id: '37',  title: 'Fuel System',                            phase: 'fuselage',
    filenames: ['37_10.pdf'] },
  { id: '38',  title: 'Rudder Pedals & Brake System',           phase: 'fuselage',
    filenames: ['38_10.pdf'] },
  { id: '39',  title: 'Control System',                         phase: 'fuselage',
    filenames: ['39_10.pdf'] },
  { id: '40',  title: 'Flap System',                            phase: 'fuselage',
    filenames: ['40_10.pdf'] },
  { id: '41',  title: 'Instrument Panel',                       phase: 'fuselage',
    filenames: ['41_10.pdf'] },
  { id: '41Q', title: 'Instrument Panel — Quadrant',            phase: 'fuselage',
    filenames: ['41Q_10.pdf'] },
  { id: '42',  title: 'Rear Seat Backs',                        phase: 'fuselage',
    filenames: ['42_10.pdf'] },
  { id: '43',  title: 'Cabin',                                  phase: 'fuselage',
    filenames: ['43_10.pdf'] },
  { id: '44',  title: 'Wing Attachment',                        phase: 'fuselage',
    filenames: ['44_10.pdf'] },

  // ─── Finish kit (45–50) ─────────────────────────────────────────
  { id: '45',  title: 'Cabin Doors & Transparencies',           phase: 'finishing-kit',
    filenames: ['45_10.pdf'] },
  { id: '45A', title: 'Cabin Door Safety Latch',                phase: 'finishing-kit',
    filenames: ['45A_10.pdf'] },
  { id: '46',  title: 'Engine Mount & Landing Gear',            phase: 'engine',
    filenames: ['46_10.pdf'] },
  { id: '47',  title: 'Spinner & Cowling',                      phase: 'engine',
    filenames: ['47_10.pdf'] },
  { id: '48',  title: 'Fairings & Wheel Pants',                 phase: 'finishing-kit',
    filenames: ['48_10.pdf'] },
  { id: '49',  title: 'Seats & Seat Belts',                     phase: 'finishing-kit',
    filenames: ['49_10.pdf'] },
  { id: '50',  title: 'Cabin Heat and Ventilation',             phase: 'finishing-kit',
    filenames: ['50_10.pdf'] },

  // ─── Firewall Forward (FF1–FF6) ─────────────────────────────────
  { id: 'M11', title: 'Manual — Engine and Propeller Selection and Installation', phase: 'engine',
    filenames: ['Manual Section 11.pdf'] },
  { id: 'FF1', title: 'Firewall Forward — Sheet 1', phase: 'engine',
    filenames: ['FF1_10.pdf'] },
  { id: 'FF2', title: 'Firewall Forward — Sheet 2', phase: 'engine',
    filenames: ['FF2_10.pdf'] },
  { id: 'FF3', title: 'Firewall Forward — Sheet 3', phase: 'engine',
    filenames: ['FF3_10.pdf'] },
  { id: 'FF4', title: 'Firewall Forward — Sheet 4', phase: 'engine',
    filenames: ['FF4_10.pdf'] },
  { id: 'FF5', title: 'Firewall Forward — Sheet 5', phase: 'engine',
    filenames: ['FF5_10.pdf'] },
  { id: 'FF6', title: 'Firewall Forward — Sheet 6', phase: 'engine',
    filenames: ['FF6_10.pdf'] },

  // ─── Optional drawings (Van's OP folder — full inventory) ──────
  // Source: Van's USB-stick "Optional Parts (OP's) Drawings" folder.
  // Listed in numeric order. Entries that apply to the RV-10 keep
  // their proper build phase so they group correctly in the sidebar;
  // everything else lands under 'other' (RV-6/7/8/9 drawings, non-IO-540
  // engine kits, tip-up canopy hardware, etc.). The non-RV-10 entries
  // are kept here as a reference so they can be copy-pasted into
  // future model catalogs (RV-7, RV-9, etc.) with a phase update.
  { id: 'OP-01',   title: 'RV-8/8A — Electric Aileron Trim',         phase: 'other',
    filenames: ['OP-01 RV-8,8A Elec Ail Trim.pdf'] },
  { id: 'OP-02',   title: 'RV-8/8A — Rear Seat Throttle',            phase: 'other',
    filenames: ['OP-02 RV-8,8A Rear Seat Throttle.pdf'] },
  { id: 'OP-03',   title: 'RV-8 — GA Rudder Pedals',                 phase: 'other',
    filenames: ['OP-03 RV,8 GA rudder pedals.pdf'] },
  { id: 'OP-03A',  title: 'RV-8A — GA Rudder Pedals',                phase: 'other',
    filenames: ['OP-03A RV,8A GA rudder pedals.pdf'] },
  { id: 'OP-04',   title: 'IO-360 Baffle',                           phase: 'other',
    filenames: ['OP-04 IO-360 Baffle.pdf'] },
  { id: 'OP-05',   title: 'RV-8 — Rear Seat Rudder Pedal',           phase: 'other',
    filenames: ['OP-05 RV,8 Rear Seat Rudder Pedal.pdf'] },
  { id: 'OP-05A',  title: 'RV-8A — Rear Seat Rudder Pedal',          phase: 'other',
    filenames: ['OP-05A RV-8A Rear Seat Rudder Pedal.pdf'] },
  { id: 'OP-06',   title: 'RV-8/8A — Manual Aileron Trim',           phase: 'other',
    filenames: ['OP-06 RV-8,8A Manual Aileron Trim.pdf'] },
  { id: 'OP-07',   title: 'RV-8 — Capacitive Fuel Sender',           phase: 'other',
    filenames: ['OP-07 RV-8 Cap Fuel Sndr.pdf'] },
  { id: 'OP-10',   title: 'RV-6/7/8/9 — Wiring Diagram',             phase: 'other',
    filenames: ['OP-10 RV-6,7,8,9 Wiring Diagram.pdf'] },
  { id: 'OP-11',   title: 'RV-8/8A — Wiring',                        phase: 'other',
    filenames: ['OP-11 RV-8,8A Wiring.pdf'] },
  { id: 'OP-12',   title: 'RV-6 — Wiring Install',                   phase: 'other',
    filenames: ['OP-12 RV-6 Wiring Install.pdf'] },
  { id: 'OP-13',   title: 'RV-9 — Capacitive Fuel Sender',           phase: 'other',
    filenames: ['OP-13 RV-9 Capacitive Fuel Sender.pdf'] },
  { id: 'OP-14',   title: 'Intercom Diagram',                        phase: 'avionics',
    filenames: ['OP-14 Intercom Diagram.pdf'] },
  { id: 'OP-15',   title: 'Map Box',                                 phase: 'fuselage',
    filenames: ['OP-15 Map Box.pdf'] },
  { id: 'OP-16',   title: 'RV-7 — Aft Battery Mount',                phase: 'other',
    filenames: ['OP-16 RV-7 Aft Battery Mount.pdf'] },
  { id: 'OP-19',   title: 'RV-7/9 — Electric Aileron Trim',          phase: 'other',
    filenames: ['OP-19 7,9 Electric Ail Trim.pdf'] },
  { id: 'OP-20',   title: 'RV-7/9 — Manual Trim',                    phase: 'other',
    filenames: ['OP-20 7,9 Manual Trim.pdf'] },
  { id: 'OP-21',   title: 'RV-7 — Fuel Boost Pump Installation',     phase: 'other',
    filenames: ['OP-21 RV-7 Fuel Boost Pump Instalation.pdf'] },
  { id: 'OP-22',   title: 'IO-360 — Mixture / Throttle',             phase: 'other',
    filenames: ['OP-22 IO-360 Mix-Throttle.pdf'] },
  { id: 'OP-23',   title: 'Intercom Installation',                   phase: 'avionics',
    filenames: ['OP-23 Intercom Installation.pdf'] },
  { id: 'OP-24',   title: 'Crotch Strap',                            phase: 'other',
    filenames: ['OP-24 Crotch Strap.pdf'] },
  { id: 'OP-25',   title: 'Tip-Up Canopy Brace',                     phase: 'other',
    filenames: ['OP-25 Tip-Up Canopy Brace.pdf'] },
  { id: 'OP-26',   title: 'Control Cables',                          phase: 'engine',
    filenames: ['OP-26 Control Cables.pdf'] },
  { id: 'OP-26A',  title: 'Control Cables — Variant',                phase: 'engine',
    filenames: ['OP-26A.pdf'] },
  { id: 'OP-27',   title: 'IO-360 — Oil System',                     phase: 'other',
    filenames: ['OP-27 Oil System.pdf'] },
  { id: 'OP-27A',  title: 'Baffle Mount Oil Cooler',                 phase: 'other',
    filenames: ['OP-27A Baffle Mount Oil Cooler.pdf'] },
  { id: 'OP-28',   title: 'Carb Fuel System',                        phase: 'other',
    filenames: ['OP-28 Carb Fuel System.pdf'] },
  { id: 'OP-29',   title: 'Cabin Heat (Alternate Install)',          phase: 'fuselage',
    filenames: ['OP-29 Cabin Heat.pdf'] },
  { id: 'OP-30',   title: 'RV-7/9 — Wiring Install',                 phase: 'other',
    filenames: ['OP-30 RV-7,9 Wiring Install.pdf'] },
  { id: 'OP-31',   title: 'RV-7/9 — Wiring Install',                 phase: 'other',
    filenames: ['OP-31 RV-7,9 Wiring Install.pdf'] },
  { id: 'OP-32',   title: 'RV-7 — IO-360 Fuel System',               phase: 'other',
    filenames: ['OP-32 RV-7 IO-360 Fuel System.pdf'] },
  { id: 'OP-33',   title: 'IO-360 — Cabin Heat',                     phase: 'other',
    filenames: ['OP-33 IO-360 Cabin Heat.pdf'] },
  { id: 'OP-34',   title: 'RV-8 — IO-360',                           phase: 'other',
    filenames: ['OP-34 RV-8 IO-360.pdf'] },
  { id: 'OP-35',   title: 'RV-8 — O-320/360 Firewall Layout',        phase: 'other',
    filenames: ['OP-35 RV-8 320-360 Fwl Layout.pdf'] },
  { id: 'OP-36',   title: 'Wingtip Lighting',                        phase: 'avionics',
    filenames: ['OP-36 RV-10 Wingtip Lighting.pdf'] },
  { id: 'OP-37',   title: 'RV-10 Wiring (Obsolete)',                 phase: 'other',
    filenames: ['OP-37 RV-10 Wiring (Obsolete).pdf'] },
  { id: 'OP-38',   title: 'Electric Aileron Trim',                   phase: 'wings',
    filenames: ['OP-38 RV-10 Elec Ail.pdf'] },
  { id: 'OP-38R2', title: 'Electric Aileron Trim — Rev 2',           phase: 'wings',
    filenames: ['OP-38R2 Electric Aileron Trim.pdf'] },
  { id: 'OP-39',   title: 'RV-7/8 — Wingtip Lighting',               phase: 'other',
    filenames: ['OP-39 RV-7.8 Wingtip lighting.pdf'] },
  { id: 'OP-40',   title: 'O-360 Baffle',                            phase: 'other',
    filenames: ['OP-40 0-360 BAF.pdf'] },
  { id: 'OP-41',   title: 'Strobe / ELT Bracket',                    phase: 'avionics',
    filenames: ['OP-41 RV-10 Strobe,ELT bracket.pdf'] },
  { id: 'OP-42',   title: 'RV-7/9 — Strobe / ELT Bracket',           phase: 'other',
    filenames: ['OP-42 RV-7,9 Strobe,ELT Bracket.pdf'] },
  { id: 'OP-43',   title: 'Access Panel Install',                    phase: 'fuselage',
    filenames: ['OP-43 Access Panel install.pdf'] },
  { id: 'OP-44',   title: 'O-320 Baffle',                            phase: 'other',
    filenames: ['OP-44 0-320 BAF.pdf'] },
  { id: 'OP-45',   title: 'Rotax Choke Kit',                         phase: 'other',
    filenames: ['OP-45 Rotax Choke Kit.pdf'] },
  { id: 'OP-46',   title: 'Stall Warning System',                    phase: 'wings',
    filenames: ['OP-46 Stall Warning System.pdf'] },
  { id: 'OP-47',   title: 'AHRS Bracket (generic)',                  phase: 'other',
    filenames: ['OP-47 AHRS Bracket.pdf'] },
  { id: 'OP-48',   title: 'AHRS Bracket',                            phase: 'avionics',
    filenames: ['OP-48 RV-10 AHRS Bracket.pdf'] },
  { id: 'OP-50',   title: 'Fuel Pump Noise Filter',                  phase: 'avionics',
    filenames: ['OP-50 Fuel Pump Noise Filter.pdf'] },
  { id: 'OP-51',   title: 'Sheetmetal Basics',                       phase: 'other',
    filenames: ['OP-51 Sheetmetal Basics.pdf'] },
  { id: 'OP-52',   title: 'Landing Light (RV-10 / RV-14)',           phase: 'avionics',
    filenames: ['OP-52 RV-10, RV-14 Landing Light.pdf'] },
  { id: 'OP-52A',  title: 'AERO LEDS Sunspot LX',                    phase: 'avionics',
    filenames: ['OP-52A AERO LEDS Sunspot LX.pdf'] },
  { id: 'OP-54',   title: 'O-320 / O-360 Exhaust',                   phase: 'other',
    filenames: ['OP-54 0-320_360 Exhaust.pdf'] },
  { id: 'OP-55',   title: 'Wing Tip Nav / Strobe Lighting',          phase: 'avionics',
    filenames: ['OP-55 Wing Tip Nav Strobe Lighting.pdf'] },
  { id: 'OP-56',   title: 'Tail Lighting',                           phase: 'avionics',
    filenames: ['OP-56 Tail Lighting.pdf'] },
  { id: 'OP-58',   title: 'Cowl Louvers',                            phase: 'engine',
    filenames: ['OP-58 Cowl Louvers.pdf'] },
  { id: 'OP-60',   title: 'ADAHRS Brackets',                         phase: 'avionics',
    filenames: ['OP-60 ADAHRS brackets.pdf'] },
  { id: 'OP-64R2', title: 'Flap Motor Retrofit',                     phase: 'wings',
    filenames: ['OP-64R2 Flap-motor-retrofit.pdf'] },
];

/**
 * Look up a Van's RV-10 section by ID. Returns undefined if the section
 * ID isn't in the catalog (the upload UI should fall back to manual
 * assignment in that case).
 */
export function findVansRv10Section(id: string): PlanSection | undefined {
  const needle = id.trim().toUpperCase();
  return VANS_RV10_PLAN_SECTIONS.find(s => s.id.toUpperCase() === needle);
}

/**
 * Parse an uploaded plan PDF's filename by matching it case-insensitively
 * against the `filenames` field of every catalog entry. No fuzzy logic —
 * the catalog is the single source of truth. Files Van's hasn't named in
 * a way we recognise fall through to manual assignment in the upload UI.
 */
export function parseVansRv10PlanFilename(filename: string): ParsedPlanFilename | null {
  // Strip leading path + lowercase for case-insensitive comparison.
  const base = filename.replace(/^.*[\\/]/, '').trim().toLowerCase();
  for (const section of VANS_RV10_PLAN_SECTIONS) {
    if (!section.filenames) continue;
    for (const candidate of section.filenames) {
      if (candidate.toLowerCase() === base) {
        return { sectionId: section.id, modelSlug: 'rv10' };
      }
    }
  }
  return null;
}
