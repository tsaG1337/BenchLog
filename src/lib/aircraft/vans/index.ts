/**
 * Van's Aircraft — manufacturer entry point.
 * Lists every Van's model BenchLog supports and the shared label-OCR config
 * (the bag-label format is identical across RV-7, RV-9, RV-10, RV-14, etc.).
 */

import type { Manufacturer } from '@/lib/aircraft/types';
import { VANS_RV10 } from './rv10';
import { VANS_VENDOR } from './label-ocr';
import { parseVansRv10PlanFilename } from './rv10/plan-sections';

export const VANS: Manufacturer = {
  id: 'vans',
  label: "Van's Aircraft",
  models: [VANS_RV10],
  labelOcr: VANS_VENDOR,
  // Single-model for now. When other Van's models are added, replace
  // with a dispatcher that tries each model's parser in turn.
  planFilenameParser: parseVansRv10PlanFilename,
};
