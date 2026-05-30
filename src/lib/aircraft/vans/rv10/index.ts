/**
 * Van's RV-10 — model entry point.
 * Aggregates kit manifest, packing lists, plan sections (added in
 * sub-project #2), and any model-specific metadata.
 */

import type { AircraftModel } from '@/lib/aircraft/types';
import { VANS_RV10_MANIFEST } from './kit-manifest';
import { VANS_RV10_PLAN_SECTIONS } from './plan-sections';
import { VANS_RV10_SERVICE_BULLETINS } from './service-bulletins';

export const VANS_RV10: AircraftModel = {
  id: 'rv10',
  label: 'RV-10',
  targetHours: 2500,
  manifest: VANS_RV10_MANIFEST,
  planSections: VANS_RV10_PLAN_SECTIONS,
  serviceBulletins: VANS_RV10_SERVICE_BULLETINS,
};
