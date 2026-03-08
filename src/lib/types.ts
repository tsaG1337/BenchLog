export type AssemblySection =
  | 'empennage'
  | 'wings'
  | 'fuselage'
  | 'finishing-kit'
  | 'engine'
  | 'avionics'
  | 'paint'
  | 'other';

export interface WorkSession {
  id: string;
  section: AssemblySection;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  plansReference?: string; // e.g. "Page 8, Section 5, Step 3"
}

export const SECTION_LABELS: Record<AssemblySection, string> = {
  empennage: 'Empennage',
  wings: 'Wings',
  fuselage: 'Fuselage',
  'finishing-kit': 'Finishing Kit',
  engine: 'Engine',
  avionics: 'Avionics',
  paint: 'Paint & Finish',
  other: 'Other',
};

export const SECTION_ICONS: Record<AssemblySection, string> = {
  empennage: '🔺',
  wings: '✈️',
  fuselage: '🛩️',
  'finishing-kit': '🔧',
  engine: '⚙️',
  avionics: '📡',
  paint: '🎨',
  other: '📋',
};
