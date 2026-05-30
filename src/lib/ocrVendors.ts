/**
 * OCR vendor recognition configurations.
 * Each vendor defines part-number regex patterns, sub-kit options, and optional
 * prefix-to-subkit mapping for auto-detection from scanned labels.
 *
 * Vendor data lives in src/lib/ocr/<vendor>.ts.
 * To add a new vendor: create the template, then add one import + one array entry here.
 */

// ─── Types ────────────────────────────────────────────────────────

export interface OcrVendorConfig {
  id: string;
  label: string;
  /** Regexes tested in order; first match wins */
  partNumberPatterns: RegExp[];
  /** Available sub-kit values for this vendor */
  subKits: string[];
  /** Map part-number prefix → sub-kit (for auto-fill after scan) */
  prefixToSubKit?: Record<string, string>;
}

// ─── Registry ─────────────────────────────────────────────────────
// Vendor OCR configs are sourced from the aircraft registry at
// `src/lib/aircraft/<manufacturer>/label-ocr.ts` (one file per manufacturer,
// because Van's bag labels are identical across RV-7/9/10/14, etc.). The
// generic fallback stays here — it isn't tied to an aircraft.

import { MANUFACTURERS } from '@/lib/aircraft';
import { GENERIC_VENDOR } from '@/lib/ocr/generic';

const MANUFACTURER_VENDORS: OcrVendorConfig[] = MANUFACTURERS
  .map(m => m.labelOcr)
  .filter((v): v is OcrVendorConfig => !!v);

export const OCR_VENDORS: OcrVendorConfig[] = [
  ...MANUFACTURER_VENDORS,
  GENERIC_VENDOR,
];

// ─── Helpers ──────────────────────────────────────────────────────

export function getVendorConfig(vendorId: string): OcrVendorConfig {
  return OCR_VENDORS.find(v => v.id === vendorId) || OCR_VENDORS[0];
}

/** Given a part number and vendor config, attempt to auto-detect the sub-kit */
export function detectSubKit(partNumber: string, vendor: OcrVendorConfig): string {
  if (!vendor.prefixToSubKit) return '';
  const upper = partNumber.toUpperCase();
  // Try longest prefixes first (HS- before H-)
  const prefixes = Object.keys(vendor.prefixToSubKit).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (upper.startsWith(prefix)) return vendor.prefixToSubKit[prefix];
  }
  return '';
}
