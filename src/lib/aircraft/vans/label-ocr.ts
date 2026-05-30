import type { OcrVendorConfig } from '@/lib/ocrVendors';

// ─── Van's Aircraft OCR patterns ──────────────────────────────────

const VANS_PATTERNS: RegExp[] = [
  // Standard aviation hardware: AN, MS, NAS prefixes (AN3-5A, MS20426AD3-4, NAS1149FN632P)
  /\b((?:AN|MS|NAS)\d[\dA-Z\-\.\/]{2,})\b/i,

  // Van's material specs: AA, AS, AT, PT, ST prefixes with X-dimensions
  // e.g. AA3-032X3/4X3/4, AS3-125X1.000X9.75, AT6-058X5/16, AT0-032X1/4
  /\b((?:AA|AS|AT|PT|ST)\d[\dA-Z\-\.\/X]{2,})\b/i,

  // Van's kit parts: 1-4 letter prefix + dash + 2+ digits + optional suffixes
  // Covers: E-1001A, F-01002-L-1, HS-1001, VS-01010-1, FL-1001A-L, VB-10, WD-605-L-1-PC,
  //         CA-10001A-L, VA-112, COWL-10-01A, etc.
  /\b([A-Z]{1,4}-\d{2,}[\dA-Z\-\.\/]*)\b/i,

  // Descriptive parts: single letter + dash + words (E-TRAILING EDGE RIB, W-PITOT,
  // F-DRILL BUSHING, T-VENT LINE, W-SPAR ASSY-L, C-RACK, etc.)
  /\b([A-Z]-[A-Z]{2,}(?:[\s-][A-Z]+)*(?:-[A-Z\d]+)?)\b/i,

  // Named-prefix parts: BUSH, BUSHING, COWL, VENT, SEAT, FUEL, TOOL, SPRING, BRAKE, WASHER
  // Comma in separator handles COWL, 10 INLET LEFT etc.
  /\b((?:BUSH|BUSHING|COWL|VENT|SEAT|FUEL|TOOL|SPRING|BRAKE|WASHER)[,\s-][\dA-Z\-\.\/X\s]{2,})\b/i,

  // CT, WH, ES prefix parts (CT Q-43, WH-F1001, ES-MSTS-8A, ES-FA-PA-270-12-5)
  /\b((?:CT|WH|ES)[\s-][\dA-Z\-\.\/]+)\b/i,

  // U-prefix vendor items with space (U 15X6.0-6, U CLEVELAND 199-10400, U NW501.25)
  /\b(U\s[\dA-Z][\dA-Z\.\-X]+(?:\s[\dA-Z][\dA-Z\.\-]+)?)\b/i,

  // Van's vendor parts: CR, LP, SB prefixes (CR3213-4-2, LP4-3, SB-375-4-8)
  /\b((?:CR|LP|SB)\d[\dA-Z\-\.\/]{2,})\b/i,

  // General: letters + digit + alphanumeric with separator (catch-all for other formats)
  /\b([A-Z]{1,5}\d[\dA-Z]+-[\dA-Z]+(?:[-\/][\dA-Z]+)*)\b/i,

  // Compact: letters + digits, no separator (F1001A) - last resort
  /\b([A-Z]{1,5}\d[\dA-Z]{3,})\b/i,
];

const VANS_SUB_KITS = [
  'ELEV', 'TAILCONE', 'H STAB', 'RUDDER', 'V STAB',
  'AIL', 'WING', 'FLAP', 'TANK',
  'FUSE', 'FINISH',
];

/** Map unambiguous part-number prefixes to sub-kits */
const VANS_PREFIX_MAP: Record<string, string> = {
  'E-': 'ELEV',
  'HS-': 'H STAB',
  'R-': 'RUDDER',
  'VS-': 'V STAB',
  'A-': 'AIL',
  'FL-': 'FLAP',
  'T-': 'TANK',
  'W-': 'WING',
  'S-': 'FINISH',
  'U-': 'FINISH',
  'C-': 'FINISH',
  // F- is ambiguous (FUSE or TAILCONE) — left out intentionally
  // WD- spans multiple kits — left out
  // VA- spans multiple kits — left out
};

export const VANS_VENDOR: OcrVendorConfig = {
  id: 'vans',
  label: "Van's Aircraft",
  partNumberPatterns: VANS_PATTERNS,
  subKits: VANS_SUB_KITS,
  prefixToSubKit: VANS_PREFIX_MAP,
};
