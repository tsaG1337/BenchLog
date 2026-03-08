import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { SectionConfig, DEFAULT_SECTIONS } from '@/lib/types';
import { fetchSections } from '@/lib/api';

interface SectionsContextValue {
  sections: SectionConfig[];
  labels: Record<string, string>;
  icons: Record<string, string>;
  reload: () => Promise<void>;
}

const SectionsContext = createContext<SectionsContextValue>({
  sections: DEFAULT_SECTIONS,
  labels: {},
  icons: {},
  reload: async () => {},
});

export function useSections() {
  return useContext(SectionsContext);
}

export function SectionsProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<SectionConfig[]>(DEFAULT_SECTIONS);

  const buildMaps = (secs: SectionConfig[]) => {
    const labels: Record<string, string> = {};
    const icons: Record<string, string> = {};
    for (const s of secs) {
      labels[s.id] = s.label;
      icons[s.id] = s.icon;
    }
    return { labels, icons };
  };

  const [maps, setMaps] = useState(() => buildMaps(DEFAULT_SECTIONS));

  const reload = useCallback(async () => {
    try {
      const data = await fetchSections();
      setSections(data);
      setMaps(buildMaps(data));
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <SectionsContext.Provider value={{ sections, labels: maps.labels, icons: maps.icons, reload }}>
      {children}
    </SectionsContext.Provider>
  );
}
