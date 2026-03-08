export interface SectionConfig {
  id: string;
  label: string;
  icon: string;
}

export interface WorkSession {
  id: string;
  section: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  plansReference?: string;
  imageUrls?: string[];
}

// Default sections used as fallback
export const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: 'empennage', label: 'Empennage', icon: '🔺' },
  { id: 'wings', label: 'Wings', icon: '✈️' },
  { id: 'fuselage', label: 'Fuselage', icon: '🛩️' },
  { id: 'finishing-kit', label: 'Finishing Kit', icon: '🔧' },
  { id: 'engine', label: 'Engine', icon: '⚙️' },
  { id: 'avionics', label: 'Avionics', icon: '📡' },
  { id: 'paint', label: 'Paint & Finish', icon: '🎨' },
  { id: 'other', label: 'Other', icon: '📋' },
];

// Helper to build lookup maps from section configs
export function buildSectionMaps(sections: SectionConfig[]) {
  const labels: Record<string, string> = {};
  const icons: Record<string, string> = {};
  for (const s of sections) {
    labels[s.id] = s.label;
    icons[s.id] = s.icon;
  }
  return { labels, icons };
}
