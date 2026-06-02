/**
 * TourController — driver.js wrapper that runs the welcome tour.
 *
 * Activation rules:
 *   1. User must be past the wizard (`wizardCompleted === true`).
 *   2. `tourStatus === 'pending'` — fresh sign-ups, or users who hit
 *      "Show the welcome tour again" in Settings.
 *   3. Desktop only. The tour spotlights the nav rail, which is
 *      `hidden md:flex` — mobile users get the wizard + empty-state
 *      hints on pages; they can run the tour later if they pull up
 *      the app on a laptop.
 *
 * Why the route navigation:
 *   The tour spotlights rail items (always visible on /tracker via
 *   AppShell) AND Tracker-page elements (timer, section picker,
 *   notes, photos). Running it from anywhere else would leave the
 *   tracker-specific targets unmounted. So the controller redirects
 *   to /tracker before starting and polls for every target to be in
 *   the DOM — driver.js with a missing target shows a popover with
 *   no spotlight, which is worse than waiting an extra frame.
 *
 * Exit paths:
 *   • "Done" on the last step → POST /api/onboarding/tour/complete
 *   • "Skip" at any step      → POST /api/onboarding/tour/skip
 *   • Esc / overlay click     → treated as skip
 *
 * Either way the wizard's context state flips so the tour never
 * auto-shows again until the user explicitly resets it.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboardingStatus } from '@/contexts/OnboardingContext';
import { markTourCompleted, markTourSkipped } from '@/lib/api';
import { TOUR_STEPS, TOUR_ROUTE } from './tour-steps';

// Tailwind `md` breakpoint — keep in sync with the rail's
// `hidden md:flex`. If you ever change one, change both.
const MD_BREAKPOINT = 768;

// Element-readiness polling. The Tracker page is lazy-imported and
// mounts asynchronously after route change; we wait up to ~5 s for
// every step's target to appear before giving up. 100ms cadence is
// fast enough that the user never notices the delay on a warm cache.
const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 5000;

export function TourController() {
  const { status, setTourStatus } = useOnboardingStatus();
  const navigate = useNavigate();
  const location = useLocation();
  // Stash the driver instance so the unmount cleanup can call
  // `destroy()` even if status flips mid-tour (e.g. logout).
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    if (!status) return;
    if (!status.wizardCompleted) return;
    if (status.tourStatus !== 'pending') return;
    if (typeof window === 'undefined' || window.innerWidth < MD_BREAKPOINT) {
      // Mobile: skip silently so we don't try the tour again on the
      // next mount. Desktop users can still re-run from Settings.
      markTourSkipped().catch(() => {});
      setTourStatus('skipped');
      return;
    }
    // The tour expects to be on TOUR_ROUTE so every target exists.
    // If we're elsewhere, navigate first; the next effect run
    // (triggered by the route change) picks up here.
    if (location.pathname !== TOUR_ROUTE) {
      navigate(TOUR_ROUTE);
      return;
    }

    let cancelled = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const startTour = () => {
      if (cancelled) return;
      const d = driver({
        showProgress: true,
        allowClose: true,
        animate: true,
        stagePadding: 6,
        stageRadius: 8,
        progressText: '{{current}} of {{total}}',
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Done',
        steps: TOUR_STEPS.map(s => ({
          element: s.selector,
          popover: {
            title: s.title,
            description: s.description,
          },
        })),
        onDestroyStarted: () => {
          // Fires for Esc / overlay click / explicit close button OR
          // a normal "Done" on the last step. We discriminate by
          // checking the active index.
          const lastIndex = TOUR_STEPS.length - 1;
          const onLast = d.getActiveIndex?.() === lastIndex && d.isLastStep?.();
          if (onLast) {
            markTourCompleted().catch(() => {});
            setTourStatus('completed');
          } else {
            markTourSkipped().catch(() => {});
            setTourStatus('skipped');
          }
          d.destroy();
        },
      });
      driverRef.current = d;
      d.drive();
    };

    // Poll until every target exists. The rail is rendered
    // synchronously by AppShell so its targets land in tick 1; the
    // Tracker page chunk is lazy, so its targets take a bit longer
    // on a cold cache. Once all are present, fire driver.js.
    const allTargetsPresent = () =>
      TOUR_STEPS.every(s => document.querySelector(s.selector));

    if (allTargetsPresent()) {
      startTour();
    } else {
      pollHandle = setInterval(() => {
        if (allTargetsPresent()) {
          if (pollHandle) clearInterval(pollHandle);
          if (timeoutHandle) clearTimeout(timeoutHandle);
          startTour();
        }
      }, POLL_INTERVAL_MS);
      timeoutHandle = setTimeout(() => {
        // Give up after the budget — leave tourStatus at 'pending'
        // so the next nav back to /tracker tries again rather than
        // permanently marking the user as having skipped.
        if (pollHandle) clearInterval(pollHandle);
      }, POLL_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      if (pollHandle) clearInterval(pollHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      // Component unmount or status change — kill the active tour
      // without writing anything to the server (it's a navigation or
      // logout, not a user decision).
      driverRef.current?.destroy();
      driverRef.current = null;
    };
    // Intentionally only re-run when wizard/tour status or the
    // current pathname changes. setTourStatus / navigate are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.wizardCompleted, status?.tourStatus, location.pathname]);

  return null;
}
