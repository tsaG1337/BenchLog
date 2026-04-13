import type { OcrVendorConfig } from '@/lib/ocrVendors';

// ─── Generic (no vendor) OCR patterns ─────────────────────────────

const GENERIC_PATTERNS: RegExp[] = [
  // Standard aviation: AN, MS, NAS
  /\b((?:AN|MS|NAS)\d[\dA-Z\-\.\/]{2,})\b/i,
  // Any letter(s)-digit pattern with separator
  /\b([A-Z]{1,5}\d[\dA-Z]+-[\dA-Z]+(?:[-\/][\dA-Z]+)*)\b/i,
  // Compact alphanumeric
  /\b([A-Z]{1,5}\d[\dA-Z]{3,})\b/i,
];

export const GENERIC_VENDOR: OcrVendorConfig = {
  id: 'generic',
  label: 'Generic / Other',
  partNumberPatterns: GENERIC_PATTERNS,
  subKits: [],
};
