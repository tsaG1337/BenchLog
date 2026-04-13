/**
 * tenant-defaults.js
 *
 * Centralised defaults for every new tenant.
 * Edit this file to change what new users start with.
 */

const path = require('path');
const fs   = require('fs');

// ─── General settings ────────────────────────────────────────────────
// These are written to the `settings` table (key = 'general') on tenant creation.
const DEFAULT_GENERAL = {
  projectName:          'Build Tracker',
  targetHours:          2500,
  progressMode:         'time',       // 'time' or 'packages'
  imageResizing:        true,
  imageMaxWidth:        1920,
  timeFormat:           '24h',            // '24h' or '12h'
  landingPage:          'blog',           // 'blog' or 'dashboard'
  homeCurrency:         'EUR',
  blogShowSessionStats: true,
  wafPercent:           100,
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
// File name inside /templates/work-packages/ to seed for new users.
// Set to null or '' to skip seeding work packages.
const DEFAULT_WP_TEMPLATE = 'work-packages-Vans-RV-10.json';

/**
 * Load the default work-package template from disk.
 * Returns the parsed JSON or null if not found / not configured.
 */
function loadDefaultWorkPackages() {
  if (!DEFAULT_WP_TEMPLATE) return null;
  try {
    const templatePath = path.join(__dirname, '../templates/work-packages', DEFAULT_WP_TEMPLATE);
    if (!fs.existsSync(templatePath)) return null;
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  DEFAULT_GENERAL,
  DEFAULT_SECTIONS,
  DEFAULT_WP_TEMPLATE,
  loadDefaultWorkPackages,
};
