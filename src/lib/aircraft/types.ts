/**
 * Aircraft taxonomy: types shared by every manufacturer + model under
 * src/lib/aircraft/<manufacturer>/<model>/.
 *
 * The flat slug `<manufacturer>-<model>` (e.g. `vans-rv10`) is the canonical
 * identifier used everywhere on the wire and in the database. The two-level
 * folder layout is purely for source-code organisation.
 */

import type { AircraftManifest } from '@/lib/kitManifest';
import type { OcrVendorConfig } from '@/lib/ocrVendors';

// ─── Manufacturer / model descriptors ─────────────────────────────

/**
 * Work-packages template — the tree structure shown in the build
 * flowchart, seeded for new tenants and re-loadable from settings.
 * Top-level keys are KitPhase IDs (`empennage`, `wings`, …); values
 * are nested node trees of `{ id, label, children? }`. The schema is
 * deliberately loose so JSON files authored by hand stay easy to
 * read; the server treats them as opaque payloads.
 */
export interface WorkPackageNode {
  id: string;
  label: string;
  children?: WorkPackageNode[];
}
export type WorkPackagesTemplate = Record<string, WorkPackageNode[]>;

export interface AircraftModel {
  /** Slug-safe ID, e.g. 'rv10' */
  id: string;
  /** Display name, e.g. 'RV-10' */
  label: string;
  /** Build hours target seeded into general settings on new tenants */
  targetHours: number;
  /** Kit manifest (inventory) */
  manifest: AircraftManifest;
  /** Plan-section catalog — populated in sub-project #2. Optional for now. */
  planSections?: PlanSection[];
  /** Service bulletins applicable to this model. */
  serviceBulletins?: ServiceBulletin[];
  /** Work-packages template (build flowchart tree). Seeded for new
   *  tenants and re-loadable via the "Reset to default" action in
   *  settings. Optional so a kit without a hand-curated template
   *  simply doesn't show the reset action. */
  workPackagesTemplate?: WorkPackagesTemplate;
}

export interface Manufacturer {
  /** Slug-safe ID, e.g. 'vans' */
  id: string;
  /** Display name, e.g. "Van's Aircraft" */
  label: string;
  /** Aircraft models offered by this manufacturer */
  models: AircraftModel[];
  /** OCR / label-parser config — applies to every model from this manufacturer */
  labelOcr?: OcrVendorConfig;
  /**
   * Parser that extracts the section ID + (optionally) model slug from
   * an uploaded plan PDF's filename. Van's filenames follow a consistent
   * pattern across RV-7/9/10/14, so the parser lives at manufacturer
   * level. Returns null when no pattern matches — the upload UI then
   * falls back to manual assignment.
   */
  planFilenameParser?: (filename: string) => ParsedPlanFilename | null;
}

export interface ParsedPlanFilename {
  sectionId: string;
  modelSlug: string;
  description?: string;
}

// ─── Plan-section catalog (used by sub-project #2 onwards) ────────

/** Build phase used by BenchLog's section picker (timer, dashboard, etc.) */
export type KitPhase =
  | 'empennage' | 'wings' | 'fuselage' | 'finishing-kit'
  | 'engine' | 'avionics' | 'paint' | 'other';

export interface PlanSection {
  /** Section identifier as it appears on the drawing, e.g. '18', '31Q', 'OP-38' */
  id: string;
  /** Human-readable title, e.g. 'Fuel Tank' */
  title: string;
  /** Which BenchLog build phase this section belongs to */
  phase: KitPhase;
  /** Known filenames the manufacturer ships for this section. Used by
   *  the per-model filename parser as the source of truth for auto-
   *  classification. Match is case-insensitive on the basename. Files
   *  whose names aren't listed here fall through to manual assignment. */
  filenames?: string[];
}

// ─── Service Bulletins (per-aircraft catalog) ─────────────────────

/** Status badge color and semantics.
 *  - 'incorporated': parts already updated in current kit revisions, FYI only.
 *  - 'action-required': builder must take action (acquire parts, perform step). */
export type SbStatus = 'incorporated' | 'action-required';

/** Where a service bulletin pins to the plans. */
export interface SbPlacement {
  /** Plan section ID this marker belongs to (matches plan-sections.ts). */
  sectionId: string;
  /** 1-indexed page within that section's PDF. */
  page: number;
  /** Normalized (0..1) position from the top-left of the page. */
  x: number;
  y: number;
  /** Optional builder-visible note pinned to this specific placement. */
  note?: string;
}

/** A single Van's service bulletin entry. */
export interface ServiceBulletin {
  /** Van's official SB identifier, e.g. 'SB-16-03-28'. */
  sbId: string;
  /** Short title shown in the popover. */
  title: string;
  /** 2-4 sentence description shown in the popover body. */
  description: string;
  status: SbStatus;
  /** Link to Van's official SB page. */
  url: string;
  /** ISO date the SB was issued. Optional. */
  issuedAt?: string;
  /** Where this SB pins to the plans. One SB can appear on multiple
   *  sections/pages — e.g., a fuel-system SB might pin to both
   *  section 18 (Fuel Tank) and section 37 (Fuel System). Optional so a
   *  new SB can be added to the catalog first, then have its placements
   *  filled in via the in-app coordinate picker on the next deploy. */
  placements?: SbPlacement[];
}

// ─── Convenience helpers (look-up by slug) ────────────────────────

/** Split a flat aircraft slug like 'vans-rv10' → ['vans', 'rv10']. */
export function splitAircraftId(slug: string): { manufacturerId: string; modelId: string } | null {
  const dash = slug.indexOf('-');
  if (dash <= 0) return null;
  return {
    manufacturerId: slug.slice(0, dash),
    modelId: slug.slice(dash + 1),
  };
}

/** Compose a flat aircraft slug from its parts. */
export function aircraftId(manufacturerId: string, modelId: string): string {
  return `${manufacturerId}-${modelId}`;
}
