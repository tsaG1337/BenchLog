/**
 * tenant-defaults.js
 *
 * Centralised defaults for every new tenant.
 * Edit this file to change what new users start with.
 */

const path = require('path');
const fs   = require('fs');

// ─── Default aircraft ────────────────────────────────────────────────
// Flat slug (manufacturer-model) used everywhere on the wire. Drives
// which work-packages template seeds new tenants; the user can change
// it later from Settings → General.
const DEFAULT_AIRCRAFT_SLUG = 'vans-rv10';

// ─── General settings ────────────────────────────────────────────────
// These are written to the `settings` table (key = 'general') on tenant creation.
//
// Notably absent: `aircraftType`. The onboarding wizard captures it on
// first login, then writes it via POST /api/onboarding/wizard along with
// the seeded work-packages template. Leaving it unset here is what
// triggers the wizard for new tenants — the read-side fallback in
// GET /api/onboarding treats a present `aircraftType` as proof that an
// older tenant already finished setup.
const DEFAULT_GENERAL = {
  projectName:          'Build Tracker',
  // Optional explicit byline for the public blog. When set, overrides the
  // tenant username (subdomain slug) in the BlogPosting JSON-LD author.
  // Blank → username is used; self-hosted with no tenant → Organization.
  authorName:           '',
  targetHours:          2500,
  progressMode:         'time',       // 'time' or 'packages'
  imageResizing:        true,
  imageMaxWidth:        1920,
  timeFormat:           '24h',            // '24h' or '12h'
  landingPage:          'blog',           // 'blog' or 'dashboard'
  homeCurrency:         'EUR',
  blogShowSessionStats: true,
  wafPercent:           100,
  // Per-tenant feature flags — admins can disable individual pages for non-admin
  // users (e.g. hide the Wiring page while it's still in beta). Missing keys
  // default to enabled. Admins always see every page regardless of these flags.
  featureFlags: {
    dashboard:   true,
    blog:        true,
    tracker:     true,
    expenses:    true,
    inventory:   true,
    inspections: true,
    wiring:      true,
    plans:       true,
  },
};

// ─── Assembly sections ───────────────────────────────────────────────
// Default sections shown in the timer dropdown and dashboard breakdown.
const DEFAULT_SECTIONS = [
  { id: 'empennage',     label: 'Empennage',     icon: '🔺' },
  { id: 'wings',         label: 'Wings',          icon: '✈️' },
  { id: 'fuselage',      label: 'Fuselage',       icon: '🛩️' },
  { id: 'finishing-kit', label: 'Finishing Kit',   icon: '🔧' },
  { id: 'engine',        label: 'Engine',          icon: '⚙️' },
  { id: 'avionics',      label: 'Avionics',        icon: '📡' },
  { id: 'paint',         label: 'Paint & Finish',  icon: '🎨' },
  { id: 'other',         label: 'Other',            icon: '📋' },
];

// ─── Default work-package template ───────────────────────────────────
// Templates now live alongside the aircraft taxonomy at
//   src/lib/aircraft/<manufacturer>/<model>/work-packages.json
// — same place the kit manifest, plan sections, and service bulletins
// live. Each aircraft owns its own template; adding a new model is
// just dropping a `work-packages.json` in its folder.
//
// The Docker image copies src/lib/aircraft alongside server code so
// the loader works at runtime (see Dockerfile).
const AIRCRAFT_ROOT = path.join(__dirname, '../src/lib/aircraft');

/**
 * Resolve the work-packages JSON path for an aircraft slug, or null
 * if no template exists for that aircraft.
 *
 * Slug format: `<manufacturer>-<model>` (e.g. `vans-rv10`). Splits on
 * the FIRST dash so model IDs that contain dashes (e.g. `rv-14a`)
 * round-trip correctly even though we don't ship any today.
 */
function workPackagesPath(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const dash = slug.indexOf('-');
  if (dash <= 0) return null;
  const manufacturer = slug.slice(0, dash);
  const model = slug.slice(dash + 1);
  const candidate = path.join(AIRCRAFT_ROOT, manufacturer, model, 'work-packages.json');
  // Guard against path-traversal — the resolved path must stay inside
  // AIRCRAFT_ROOT even if the slug contained "../" or other tricks.
  if (!candidate.startsWith(AIRCRAFT_ROOT)) return null;
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Load the work-packages template for the given aircraft slug.
 * Falls back to the default aircraft when no slug is provided.
 * Returns the parsed JSON or null if the aircraft has no template.
 */
function loadDefaultWorkPackages(slug = DEFAULT_AIRCRAFT_SLUG) {
  const templatePath = workPackagesPath(slug);
  if (!templatePath) return null;
  try {
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Onboarding ──────────────────────────────────────────────────────
// Two-state per tenant:
//   wizardCompleted — the mandatory aircraft / preferences modal. Gates
//     access to the app shell entirely. New tenants start at `false`.
//   tourStatus — the optional spotlight walkthrough. `pending` shows it
//     on next page load; `completed` and `skipped` both suppress it
//     until the user explicitly resets from Settings.
const DEFAULT_ONBOARDING = {
  wizardCompleted: false,
  tourStatus: 'pending', // 'pending' | 'completed' | 'skipped'
};

module.exports = {
  DEFAULT_GENERAL,
  DEFAULT_SECTIONS,
  DEFAULT_AIRCRAFT_SLUG,
  DEFAULT_ONBOARDING,
  loadDefaultWorkPackages,
};
