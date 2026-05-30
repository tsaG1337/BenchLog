/**
 * Tiny module-level store bridging the (always-mounted) CommandPalette
 * with whichever PlanReader instance is currently displaying a PDF.
 *
 * PlanReader calls `registerActivePdf({...})` on mount and `unregister()`
 * on unmount. CommandPalette subscribes via `useActivePdf()` so its
 * "Search in this PDF" toggle is gated on whether a PDF is actually open.
 *
 * Avoids the alternative of lifting PlanReader's PDFDocumentProxy up to
 * the App level (which would require either a context provider above
 * AppShell or refactoring the route tree).
 */
import { useSyncExternalStore } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface ActivePdfHandle {
  fileId: string;
  fileName: string;
  sectionLabel: string;
  pdf: PDFDocumentProxy;
}

let current: ActivePdfHandle | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function registerActivePdf(handle: ActivePdfHandle) {
  current = handle;
  emit();
}

export function unregisterActivePdf(fileId: string) {
  // Only clear if the unmounting reader is the one currently registered.
  // Guards against an unmount race that wipes a freshly-registered handle
  // belonging to a different file.
  if (current && current.fileId === fileId) {
    current = null;
    emit();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ActivePdfHandle | null {
  return current;
}

/**
 * Hook: returns the currently-registered PDF handle (or null if no PDF
 * is open). Re-renders the caller when registration changes.
 */
export function useActivePdf(): ActivePdfHandle | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
