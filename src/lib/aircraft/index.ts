/**
 * Aircraft taxonomy — top-level registry.
 *
 * To add a manufacturer: create src/lib/aircraft/<manufacturer>/index.ts,
 * import it here, push into MANUFACTURERS.
 *
 * To add a model under an existing manufacturer: create
 * src/lib/aircraft/<manufacturer>/<model>/index.ts and add it to that
 * manufacturer's `models` array.
 */

import type {
  AircraftModel, Manufacturer, PlanSection, ParsedPlanFilename,
  ServiceBulletin, SbPlacement, SbStatus,
  WorkPackagesTemplate, WorkPackageNode,
} from './types';
import { aircraftId, splitAircraftId } from './types';
import { VANS } from './vans';

export const MANUFACTURERS: Manufacturer[] = [
  VANS,
];

// ─── Lookups by flat slug (e.g. 'vans-rv10') ─────────────────────

export function getManufacturer(manufacturerId: string): Manufacturer | undefined {
  return MANUFACTURERS.find(m => m.id === manufacturerId);
}

export function getModel(manufacturerId: string, modelId: string): AircraftModel | undefined {
  return getManufacturer(manufacturerId)?.models.find(m => m.id === modelId);
}

export function getAircraft(slug: string): { manufacturer: Manufacturer; model: AircraftModel } | undefined {
  const parts = splitAircraftId(slug);
  if (!parts) return undefined;
  const manufacturer = getManufacturer(parts.manufacturerId);
  const model = manufacturer?.models.find(m => m.id === parts.modelId);
  if (!manufacturer || !model) return undefined;
  return { manufacturer, model };
}

// ─── Listings for the settings UI (cascading dropdowns) ──────────

export interface ManufacturerOption {
  id: string;
  label: string;
}

export interface ModelOption {
  id: string;
  label: string;
  /** Flat slug for this model, e.g. 'vans-rv10' — what the wire format stores. */
  slug: string;
}

export function listManufacturers(): ManufacturerOption[] {
  return MANUFACTURERS.map(m => ({ id: m.id, label: m.label }));
}

export function listModels(manufacturerId: string): ModelOption[] {
  return (getManufacturer(manufacturerId)?.models ?? []).map(m => ({
    id: m.id,
    label: m.label,
    slug: aircraftId(manufacturerId, m.id),
  }));
}

// ─── Plan sections + filename parsing ────────────────────────────

/** Plan-section catalog for an aircraft (by flat slug). Empty array if model isn't in registry. */
export function getPlanSections(slug: string): PlanSection[] {
  return getAircraft(slug)?.model.planSections ?? [];
}

/** Parse a plan-PDF filename using the manufacturer-level parser. */
export function parsePlanFilename(slug: string, filename: string): ParsedPlanFilename | null {
  const entry = getAircraft(slug);
  if (!entry?.manufacturer.planFilenameParser) return null;
  return entry.manufacturer.planFilenameParser(filename);
}

/** Look up a single plan section by ID for an aircraft. */
export function getPlanSection(slug: string, sectionId: string): PlanSection | undefined {
  const needle = sectionId.trim().toUpperCase();
  return getPlanSections(slug).find(s => s.id.toUpperCase() === needle);
}

// ─── Service bulletins ────────────────────────────────────────────

/** All SBs applicable to an aircraft model. Empty array if the model
 *  isn't in the registry or has no SBs configured. */
export function listAllServiceBulletins(slug: string): ServiceBulletin[] {
  return getAircraft(slug)?.model.serviceBulletins ?? [];
}

/** SB placements that pin to a specific page of a specific plan section.
 *  Returns one entry per matching placement, joined with its parent SB. */
export function getSbPlacementsForPage(
  slug: string,
  sectionId: string,
  pageNumber: number,
): Array<{ sb: ServiceBulletin; placement: SbPlacement }> {
  const sbs = listAllServiceBulletins(slug);
  const out: Array<{ sb: ServiceBulletin; placement: SbPlacement }> = [];
  for (const sb of sbs) {
    for (const placement of sb.placements ?? []) {
      if (placement.sectionId === sectionId && placement.page === pageNumber) {
        out.push({ sb, placement });
      }
    }
  }
  return out;
}

/** Look up a single SB by its identifier (case-insensitive). */
export function findSbById(slug: string, sbId: string): ServiceBulletin | undefined {
  const needle = sbId.trim().toUpperCase();
  return listAllServiceBulletins(slug).find(sb => sb.sbId.toUpperCase() === needle);
}

// ─── Work-packages template ───────────────────────────────────────

/** Default work-packages tree for an aircraft, used to seed new
 *  tenants and to back the "Reset to default" action in settings.
 *  Returns undefined if the model has no template configured. */
export function getWorkPackagesTemplate(slug: string): WorkPackagesTemplate | undefined {
  return getAircraft(slug)?.model.workPackagesTemplate;
}

export { aircraftId, splitAircraftId };
// ManufacturerOption / ModelOption are already exported at their declaration
// sites above — re-exporting them here would conflict (TS2484).
export type {
  Manufacturer, AircraftModel,
  PlanSection, ParsedPlanFilename,
  ServiceBulletin, SbPlacement, SbStatus,
  WorkPackagesTemplate, WorkPackageNode,
};
