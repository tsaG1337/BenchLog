/**
 * OnboardingContext — single source of truth for whether the welcome
 * wizard and the spotlight tour have been completed.
 *
 * Mounted INSIDE AuthProvider (so we know there's a token before we
 * fetch) but ABOVE AppShell (so the wizard can paint over the route
 * tree without flashing the dashboard underneath).
 *
 * Fetches `/api/onboarding` exactly once on mount, then mutates local
 * state when the wizard finishes / the tour is dismissed. Server is
 * the source of truth, but we don't re-fetch after every action —
 * the optimistic update + the server's own write is enough.
 */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchOnboardingStatus,
  type OnboardingStatus,
  type TourStatus,
} from '@/lib/api';

interface OnboardingContextValue {
  /** Null while the initial fetch is in flight. Treat as "don't render
   *  the wizard yet" — we'd rather flash the dashboard for half a
   *  second than flash the wizard to a user who's already done it. */
  status: OnboardingStatus | null;
  /** Optimistic local update — call after submitOnboardingWizard
   *  resolves so the modal unmounts immediately. */
  setWizardCompleted: () => void;
  /** Optimistic local update — call after the tour endpoints resolve. */
  setTourStatus: (next: TourStatus) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    fetchOnboardingStatus()
      .then(s => { if (!cancelled) setStatus(s); })
      .catch(() => {
        // Treat fetch failure as "already onboarded" — better to let the
        // user reach the app than block them behind a wizard we can't
        // reliably surface. They can still hit Settings if they want to
        // pick an aircraft.
        if (!cancelled) setStatus({ wizardCompleted: true, tourStatus: 'skipped' });
      });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const setWizardCompleted = useCallback(() => {
    setStatus(prev => prev ? { ...prev, wizardCompleted: true } : prev);
  }, []);

  const setTourStatus = useCallback((next: TourStatus) => {
    setStatus(prev => prev ? { ...prev, tourStatus: next } : prev);
  }, []);

  return (
    <OnboardingContext.Provider value={{ status, setWizardCompleted, setTourStatus }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingStatus(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboardingStatus must be used inside OnboardingProvider');
  return ctx;
}
