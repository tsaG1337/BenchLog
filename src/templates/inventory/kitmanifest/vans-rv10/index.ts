import type { AircraftManifest } from '@/lib/kitManifest';
import { empennageKit } from './empennage';
import { wingKit } from './wing';
import { fuselageKit } from './fuselage';
import { finishKit } from './finish';
import { extrasKit } from './extras';

export const VANS_RV10_MANIFEST: AircraftManifest = {
  id: 'vans-rv10',
  label: "Van's RV-10",
  kits: [empennageKit, wingKit, fuselageKit, finishKit, extrasKit],
};
