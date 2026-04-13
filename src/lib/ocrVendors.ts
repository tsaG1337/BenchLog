/**
 * OCR vendor recognition configurations.
 * Each vendor defines part-number regex patterns, sub-kit options, and optional
 * prefix-to-subkit mapping for auto-detection from scanned labels.
 *
 * Vendor data lives in src/templates/ocr/<vendor>.ts.
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

import { VANS_VENDOR } from '@/templates/ocr/vans';
import { GENERIC_VENDOR } from '@/templates/ocr/generic';

export const OCR_VENDORS: OcrVendorConfig[] = [
  VANS_VENDOR,
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
