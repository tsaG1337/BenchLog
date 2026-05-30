/**
 * PDF.js worker setup — shared across every PDF-rendering surface.
 *
 * react-pdf bundles pdfjs-dist but expects us to point it at the worker.
 * Vite's `?url` import yields a hashed asset URL that survives bundling.
 *
 * Import this module once (any side-effect import) before mounting any
 * `<Document>` from react-pdf. Subsequent imports are no-ops.
 */
import { pdfjs } from 'react-pdf';
// @ts-expect-error — Vite's ?url import has no .d.ts
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
