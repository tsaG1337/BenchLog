/**
 * Spotlight tour steps. Each entry maps a DOM target (via the
 * `data-tour-id` attribute the AppShell + page components sprinkle on
 * key elements) to a title + body that drive driver.js's popover.
 *
 * The tour runs on the Tracker page (`/tracker`) — the controller
 * navigates there before the first step, so all rail-nav targets are
 * present (rail is in AppShell, always visible on md+) AND the
 * Tracker-page targets (timer, section picker, notes, images) exist.
 *
 * Order is intentional, top-to-bottom of the rail first so the user's
 * eye doesn't bounce, then a focused deep-dive on the Tracker itself:
 *
 *   1. Menu        (top of rail)        — "everything else lives here"
 *   2. Dashboard   (rail item 1)        — "progress + projection"
 *   3. Blog        (rail item 2)        — "build log"
 *   4. Tracker     (rail item 3)        — "core loop"
 *   5. Plans       (rail bottom)        — "PDFs in the app"
 *   6. Search      (rail base)          — "Ctrl+K finds everything"
 *   7. Section     (Tracker page)       — "pick before starting"
 *   8. Timer       (Tracker page)       — "Start / Stop, that's it"
 *   9. Notes       (Tracker page)       — "after-the-fact context"
 *  10. Images      (Tracker page)       — "drop photos for the session"
 *
 * Adding a step:
 *   1. Pick a target. Rail items + Tracker-page elements work.
 *      Anything elsewhere needs route-switching logic the controller
 *      doesn't have today.
 *   2. Drop a `data-tour-id="<id>"` on the element.
 *   3. Add an entry here in the position you want it shown.
 */

export interface TourStep {
  /** CSS selector used by driver.js. We always use the data attribute
   *  so steps survive Tailwind class churn or component refactors. */
  selector: string;
  title: string;
  description: string;
}

export const TOUR_STEPS: TourStep[] = [
  // ─── Rail nav, top to bottom ────────────────────────────────────
  {
    selector: '[data-tour-id="nav-menu"]',
    title: 'Settings live in the menu',
    description:
      'Aircraft, project name, MQTT, theme, export — everything’s behind the hamburger. You can re-run this tour from Settings → Data whenever.',
  },
  {
    selector: '[data-tour-id="nav-dashboard"]',
    title: 'Hours, progress, finish date',
    description:
      'Total hours against your target, breakdown by section, and an honest projection of when you’ll be done at your current pace.',
  },
  {
    selector: '[data-tour-id="nav-blog"]',
    title: 'Your build’s blog',
    description:
      'Every session can become a post — or write standalone. Private by default, public if you flip the switch in Settings.',
  },
  {
    selector: '[data-tour-id="nav-tracker"]',
    title: 'The core loop',
    description:
      'You’re looking at the Session Tracker now. The next few steps walk through it — picking a section, starting the timer, dropping notes and photos.',
  },
  {
    selector: '[data-tour-id="nav-plans"]',
    title: 'Your plans, in the app',
    description:
      'Upload your section PDFs once. They get sorted by filename, searchable by part number, and annotated per-builder. Ctrl+F works inside the PDFs the way the browser’s doesn’t.',
  },
  {
    selector: '[data-tour-id="nav-search"]',
    title: 'Ctrl+K finds everything',
    description:
      'Sessions, blog posts, parts, plan pages, part-number callouts across every PDF you’ve uploaded. Faster than the nav rail once you’re used to it.',
  },
  // ─── Tracker page deep-dive ─────────────────────────────────────
  {
    selector: '[data-tour-id="tracker-section"]',
    title: 'Pick a section first',
    description:
      'Sessions are grouped by build phase — empennage, wings, fuselage, finish, etc. Pick the one you’re working on before you hit Start. Add a work-package below if you want finer breakdown.',
  },
  {
    selector: '[data-tour-id="tracker-timer"]',
    title: 'Press Start. Press Stop. That’s a session.',
    description:
      'Start when you sit down at the bench, Stop when you get up. The timer keeps running on the server — close the tab, refresh, swap to your phone, the clock follows you.',
  },
  {
    selector: '[data-tour-id="tracker-notes"]',
    title: 'Notes for future-you',
    description:
      'Drop the things you’ll forget by next week — torque values, why you re-drilled a hole, which rivet line you double-checked. Or tap Dictate and talk; speech-to-text is wired up.',
  },
  {
    selector: '[data-tour-id="tracker-images"]',
    title: 'Photos stay with the session',
    description:
      'Drop or paste photos here while you work. They’re attached to the session when you hit Stop, and show up in the Build Log post if you publish it later. No reconstructing from your camera roll on Sunday night.',
  },
];

/** Route the tour controller navigates to before starting the tour.
 *  Every step's target must be present on this page (rail + tracker
 *  page elements are; anything else would need extra navigation). */
export const TOUR_ROUTE = '/tracker';
