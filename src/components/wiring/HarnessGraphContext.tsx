import { createContext, useContext } from 'react';
import type { HarnessGraph } from '@/lib/wiring/types';

/**
 * Shares the single derived `HarnessGraph` for the active sheet. `WiringPage`
 * derives it once (a `useMemo`) and provides it; the Inspector and any other
 * harness child consume it via `useHarnessGraph` — so the graph is never
 * derived twice with separately-maintained dependency arrays.
 */
const HarnessGraphContext = createContext<HarnessGraph | null>(null);

export function HarnessGraphProvider(
  { value, children }: { value: HarnessGraph; children: React.ReactNode },
) {
  return (
    <HarnessGraphContext.Provider value={value}>
      {children}
    </HarnessGraphContext.Provider>
  );
}

/** The active sheet's derived harness graph. Throws if used outside the
 *  provider — a developer guard; every real caller sits inside `WiringPage`. */
export function useHarnessGraph(): HarnessGraph {
  const g = useContext(HarnessGraphContext);
  if (!g) throw new Error('useHarnessGraph must be used within a HarnessGraphProvider');
  return g;
}
