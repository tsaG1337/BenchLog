/**
 * Index one plan PDF: fetch bytes (cache or network), extract part refs
 * using the aircraft's vendor patterns, POST to /api/plans/:id/index.
 *
 * Called from PlansPage after upload completes — runs in the background
 * (per-file Promise, not awaited) so the UI stays responsive while large
 * batches index.
 */
import { fetchPlanPdf, indexPlan as postIndex } from '@/lib/api';
import { getAircraft } from '@/lib/aircraft';
import { extractPartRefsFromPdf } from './extractParts';

export async function indexPlanFile(fileId: string, aircraftSlug: string): Promise<number> {
  const aircraft = getAircraft(aircraftSlug);
  const vendor = aircraft?.manufacturer.labelOcr;
  if (!vendor) {
    // No vendor patterns for this aircraft — skip silently. The plan still
    // shows up in the library, it just doesn't contribute to the part index.
    return 0;
  }
  const buf = await fetchPlanPdf(fileId);
  // Clone the buffer because pdfjs detaches transferred ArrayBuffers, and
  // the cached copy is shared across callers (reader + indexer).
  const cloned = buf.slice(0);
  const refs = await extractPartRefsFromPdf(cloned, vendor);
  if (refs.length === 0) return 0;
  await postIndex(fileId, refs);
  return refs.length;
}
