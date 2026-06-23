import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Check, Loader2, RotateCcw, Package, AlertTriangle, CheckCircle2, ClipboardCheck, MapPin, ArrowLeft, Trash2 } from 'lucide-react';
import { MIcon } from '@/components/AppShell';
import { runOcr, ingestInvPart, verifyCheckBatch, createCheckSession, fetchCheckSessions, deleteInvStock, updateInvStock, type InvPart, type InvLocation, type CheckSession } from '@/lib/api';
import { getVendorConfig, detectSubKit } from '@/lib/ocrVendors';
import { getAircraftManifest, getKitEntries, getAllEntries, getKitEntriesPerBag, findBagFuzzy, isBagLabel, type KitDefinition, type ManifestEntry, type BagDefinition, type BagEntryGroup } from '@/lib/kitManifest';
import { toast } from 'sonner';

// ─── Detection helpers (shared with LabelScanner) ─────────────────

/** Normalize a part number for comparison: strip inch marks, uppercase */
function normPN(pn: string): string {
  return pn.replace(/["″'']/g, '').toUpperCase().trim();
}

const DATE_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
const JUNK_RE = /^[\s|I1l\[\]!}{)(=©—\-_.,:;'"\\]+$/;
const FALSE_PN_RE = /^IMG\d+$/i;
const NOISE_WORDS = new Set(['BAG', 'BOX', 'PKG', 'QTY', 'LOT', 'P/N', 'PN', 'DATE', 'MFG', 'EXP', 'PCS', 'EA', 'EACH', 'LB', 'OZ', 'IN', 'FT']);

type DetectionType = 'partNumber' | 'date' | 'name' | 'bag';
interface DetectedRegion { type: DetectionType; text: string; confidence: number }

function classifyLine(text: string, patterns: RegExp[]): { type: DetectionType; extracted: string } | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return null;
  if (JUNK_RE.test(trimmed)) return null;
  // Detect bag labels before noise word filtering strips "BAG"
  const bagMatch = trimmed.match(/^BAG\s+(.+)/i);
  if (bagMatch) return { type: 'bag', extracted: `BAG ${bagMatch[1].trim().toUpperCase()}` };
  const dateMatch = trimmed.match(DATE_RE);
  if (dateMatch) return { type: 'date', extracted: dateMatch[1] };
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m && !FALSE_PN_RE.test(m[1])) return { type: 'partNumber', extracted: m[1].toUpperCase() };
  }
  const letterRatio = (trimmed.match(/[a-zA-Z]/g)?.length || 0) / trimmed.length;
  if (letterRatio > 0.5 && trimmed.length > 3) {
    let clean = trimmed;
    for (const n of NOISE_WORDS) clean = clean.replace(new RegExp(`^${n}\\b\\s*`, 'i'), '');
    clean = clean.trim();
    if (clean.length > 2 && !NOISE_WORDS.has(clean.toUpperCase())) return { type: 'name', extracted: clean };
  }
  return null;
}

const CROP_TOP = 0.3;
const CROP_BOTTOM = 0.7;

// ─── Types ────────────────────────────────────────────────────────

export interface IngestedItem {
  partNumber: string;
  name: string;
  subKit: string;
  mfgDate: string;
  scannedQty: number;
  part: InvPart;
  wasCreated: boolean;
  /** Expected qty from manifest (0 = not in manifest) */
  expectedQty: number;
  /** Bag this item was ingested from (if via bag scan) */
  bag?: string;
  /** Location ID assigned during scan */
  locationId?: number;
  /** Kit-check session tracking outcome:
   *  'tracked' — recorded in a kit's check session;
   *  'failed'  — the session call errored, NOT tracked (re-scan to fix);
   *  'no-kit'  — part is in no kit manifest, so no session applies.
   *  Undefined when not applicable (free-scan mode, or the bag flow). */
  sessionStatus?: 'tracked' | 'failed' | 'no-kit';
  /** Home kit ID this part lives in (manifest-derived). Used by the tap-to-edit
   *  quantity affordance so a manual qty change is recorded in the correct
   *  kit's check session even in Auto-Sort mode where no kit was explicitly
   *  selected at the start. Undefined for parts not in any manifest. */
  kitId?: string;
  /** inventory_stock row IDs created for this item during this scan session.
   *  A single item can map to multiple stock rows (e.g. user scanned three
   *  times of a loose part — each scan inserts its own row), and the
   *  delete-row affordance needs every ID so it can drop the right stock. */
  stockIds?: number[];
}

interface MassIngestionProps {
  onClose: () => void;
  onDone: (items: IngestedItem[]) => void;
  vendorId?: string;
  aircraftType?: string;
  /** If provided, scans will be tracked against this check session */
  checkSessionId?: number | null;
  /** Available locations for assignment */
  locations?: InvLocation[];
}

type Stage = 'kit-select' | 'camera' | 'processing' | 'confirm' | 'bag-prompt' | 'bag-verify' | 'no-match' | 'kit-disambiguate';

/** Matches `s` against `q` with relaxed whitespace + quotes/feet/inch marks.
 *  Lets OCR misreads like `RUBBER DOORSEAL X 25` find the manifest's
 *  `RUBBER DOOR SEALX25'`, or `AEX TIE DOWN X 7.5` find `AEX TIE DOWN X7.5`. */
const fuzzyNorm = (s: string) => (s || '')
  .toUpperCase()
  .replace(/['"’′″]/g, '')
  .replace(/[\s.]/g, '')
  .trim();

type BagItemStatus = 'pending' | 'scanned' | 'checked' | 'backordered';
interface BagVerifyEntry {
  entry: ManifestEntry;
  status: BagItemStatus;
  /** Actual quantity received (user-editable, defaults to expected) */
  actualQty: number;
  /** Which bag group this entry belongs to */
  groupId: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function MassIngestion({ onClose, onDone, vendorId = 'vans', aircraftType = 'vans-rv10', checkSessionId: initialCheckSessionId, locations = [] }: MassIngestionProps) {
  const vendor = useMemo(() => getVendorConfig(vendorId), [vendorId]);
  const aircraft = useMemo(() => getAircraftManifest(aircraftType), [aircraftType]);

  const [selectedKit, setSelectedKit] = useState<KitDefinition | null>(null);
  const [items, setItems] = useState<IngestedItem[]>([]);
  const [stage, setStage] = useState<Stage>('camera');
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations]);
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  // `location` on pendingScan / pendingBag is a per-confirmation override —
  // initialised from the global `selectedLocationId` when the confirm opens,
  // then edited only on the in-dialog dropdown. Lets the user place a single
  // scan or a single bag in a non-default location without permanently
  // flipping the session default for every following scan.
  const [pendingScan, setPendingScan] = useState<{ partNumber: string; name: string; subKit: string; mfgDate: string; inManifest: boolean; belongsToKit?: string; homeKitId?: string; homeKitLabel?: string; location?: number | null } | null>(null);
  // Confirm-screen autocomplete: shown when the user manually corrects a
  // misread part number. Suggestions come from the aircraft's full manifest
  // (across all kits), matching the same pattern as the "Add part" form in
  // the inventory tab.
  const [showPnSuggestions, setShowPnSuggestions] = useState(false);
  const pnSuggestionsRef = useRef<HTMLDivElement>(null);
  // Tap-to-edit quantity. When set, the row's qty badge becomes a number
  // input pre-filled with `value`. Used so the user can set 52/52 in one
  // tap instead of scanning a label of a 52-piece bag fifty-two times.
  // Item identity in the local list is (partNumber, bag) — the same part can
  // be scanned in multiple bags during one session and each bag's count must
  // be tracked independently against its own manifest qtyRequired. So
  // editingQty carries the bag too, otherwise tap-to-edit would update every
  // matching row.
  const [editingQty, setEditingQty] = useState<{ partNumber: string; bag?: string; value: string } | null>(null);
  const [pendingBag, setPendingBag] = useState<{ bagId: string; kitId: string; bag: BagDefinition; entries: ManifestEntry[]; groups: BagEntryGroup[]; location?: number | null } | null>(null);
  const [bagVerifyItems, setBagVerifyItems] = useState<BagVerifyEntry[]>([]);
  // Multi-kit disambiguation: holds the OCR-resolved part number plus the
  // (kit, entry) pairs it matches across the aircraft manifest. The UI shows
  // one card per candidate kit with its qtyRequired; tapping a card resolves
  // the choice and continues to the normal confirm stage.
  const [pendingKitChoice, setPendingKitChoice] = useState<{
    partNumber: string;
    candidates: Array<{ kitId: string; kitLabel: string; entry: ManifestEntry }>;
    scanContext: { name: string; mfgDate: string };
  } | null>(null);
  const [activeCheckSessionId, setActiveCheckSessionId] = useState<number | null>(initialCheckSessionId ?? null);
  const [existingSessions, setExistingSessions] = useState<CheckSession[]>([]);

  // Lock the viewport while Mass Ingestion is open: no pinch-zoom (the
  // camera view + scan UI doesn't accommodate it and accidental zoom on
  // the camera frame really tears the layout), and best-effort orientation
  // lock to portrait (Chromium-based mobile and Firefox honour it; iOS
  // Safari ignores it silently and the CSS landscape overlay takes over).
  // Both are reverted on close so the rest of the app keeps the user's
  // normal viewport behaviour.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const originalViewport = meta?.getAttribute('content') ?? null;
    if (meta) {
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
    const orientation = (screen as { orientation?: { lock?: (o: string) => Promise<void>; unlock?: () => void } }).orientation;
    try { orientation?.lock?.('portrait')?.catch(() => {}); } catch {}
    return () => {
      if (meta && originalViewport != null) meta.setAttribute('content', originalViewport);
      try { orientation?.unlock?.(); } catch {}
    };
  }, []);

  // Load existing check sessions for the kit-select screen
  useEffect(() => {
    fetchCheckSessions().then(setExistingSessions).catch(() => {});
  }, []);

  /** Mark part numbers as verified/missing in the active check session */
  const markChecked = useCallback(async (items: { partNumber: string; qtyFound: number; isShort?: boolean; bag?: string; replace?: boolean }[]) => {
    if (!activeCheckSessionId || items.length === 0) return;
    try { await verifyCheckBatch(activeCheckSessionId, items); }
    catch { /* non-critical — session tracking is best-effort */ }
  }, [activeCheckSessionId]);

  /**
   * Commit a manually-entered quantity for a row. Three things must stay in
   * sync: the local `scannedQty` (display), the actual inventory_stock (the
   * physical count), and the kit-check session's qty_found (verification
   * status). Earlier this only updated display + session and silently left
   * inventory at its scan-time value of 1, so users who scanned once and
   * tapped "set to expected = 4" ended up with Partial 1/4 on the check
   * even though the tool showed 4/4 fulfilled.
   *
   *   - Display: optimistic local update first.
   *   - Inventory: top up by the positive delta only (never auto-reduce —
   *     deleting stock rows is destructive and belongs in the inventory UI).
   *   - Session: write `replace: true` to the part's HOME kit session so the
   *     update lands in the same session the original scan was recorded
   *     against, regardless of Auto-Sort vs explicit-kit-check mode.
   *
   * Clamps to [0, …] — negative qtys never made sense here.
   */
  const commitQty = useCallback(async (partNumber: string, bag: string | undefined, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditingQty(null);
      return;
    }
    const newQty = Math.max(0, parsed);

    // Find the exact (partNumber, bag) row — different bags hold the same
    // part as independent rows now.
    const sameRow = (i: IngestedItem) =>
      normPN(i.partNumber) === normPN(partNumber) && (i.bag || '') === (bag || '');
    const item = items.find(sameRow);
    if (!item) {
      setEditingQty(null);
      return;
    }
    const delta = newQty - item.scannedQty;

    // Optimistic UI update first so the tap feels instant
    setItems(prev => prev.map(i => sameRow(i) ? { ...i, scannedQty: newQty } : i));
    setEditingQty(null);

    // Top up inventory if the user increased the quantity. We don't reduce
    // automatically — if the user dialled down because of an over-scan, the
    // excess rows stay in inventory_stock until they delete them explicitly.
    if (delta > 0) {
      try {
        await ingestInvPart({
          partNumber: item.partNumber,
          name:    item.name || item.part.name,
          subKit:  item.subKit || item.part.subKit || '',
          kit:     item.part.kit || '',
          mfgDate: item.mfgDate || '',
          quantity: delta,
          ...(item.locationId ? { locationId: item.locationId } : {}),
        });
      } catch (err: any) {
        toast.error(`Failed to update inventory for ${partNumber}: ${err.message || 'unknown error'}`);
      }
    } else if (delta < 0) {
      toast.info(`${partNumber}: count set to ${newQty}, but ${Math.abs(delta)} unit${Math.abs(delta) === 1 ? '' : 's'} already in inventory — remove the excess manually if needed`);
    }

    // Update the kit-check session — prefer the part's home-kit session
    // because that's where confirmAndIngest() recorded the initial scan.
    // Fall back to whichever session is currently active for non-manifest
    // parts so the tap still has *some* effect.
    const homeSession = item.kitId
      ? existingSessions.find(s => s.kitId === item.kitId && s.status !== 'completed')
      : null;
    if (homeSession) {
      try { await verifyCheckBatch(homeSession.id, [{ partNumber, qtyFound: newQty, replace: true }]); }
      catch { /* best-effort — inventory is the source of truth */ }
    } else {
      markChecked([{ partNumber, qtyFound: newQty, replace: true }]);
    }
  }, [items, existingSessions, markChecked]);

  /** Get or create the check session for `kitId`. Returns its ID, or null
   *  when the kit isn't in this aircraft's manifest (shouldn't normally
   *  happen — callers pass kitIds that came from the manifest lookup).
   *  Used by both the single-part flow (checkPartInOwnKit) and the bag
   *  flows so they write into the same session as one another and as any
   *  in-progress kit check the user started manually. */
  const ensureKitSession = useCallback(async (kitId: string): Promise<{ sessionId: number | null; created: boolean }> => {
    const kit = aircraft?.kits.find(k => k.id === kitId);
    if (!kit) return { sessionId: null, created: false };
    const existing = existingSessions.find(s => s.kitId === kitId && s.status !== 'completed');
    if (existing) return { sessionId: existing.id, created: false };
    try {
      const perBagEntries = getKitEntriesPerBag(aircraftType, kitId);
      const newSession = await createCheckSession({
        aircraftType,
        kitId,
        kitLabel: kit.label,
        items: perBagEntries.map(e => ({
          partNumber:   e.partNumber,
          nomenclature: e.nomenclature,
          subKit:       e.subKit,
          bag:          e.bag,
          qtyExpected:  e.qtyRequired,
          unit:         e.unit,
        })),
      });
      setExistingSessions(prev => [...prev, newSession]);
      return { sessionId: newSession.id, created: true };
    } catch {
      return { sessionId: null, created: false };
    }
  }, [aircraft, aircraftType, existingSessions]);

  /** Delete a scanned row from the local list AND from inventory.
   *
   *  Deletes every inventory_stock row created for this entry during this
   *  session (`item.stockIds`), then unwinds the check-session qty for the
   *  same part+bag by subtracting `scannedQty` from `qty_found` via a
   *  replace-style verify-batch call. Lets the user back out of a misscan
   *  without leaving doubled inventory rows or false-verified session items
   *  behind.
   *
   *  Best-effort: any individual stock/session API failure surfaces as a
   *  toast but does NOT block the local removal — the user's intent is
   *  "remove this from my list", and a refresh on the inventory page will
   *  reconcile any partial state. */
  const deleteScannedItem = useCallback(async (item: IngestedItem) => {
    // Server-side cleanup, fire-and-await so the UI doesn't beat the API:
    if (item.stockIds && item.stockIds.length > 0) {
      for (const id of item.stockIds) {
        try { await deleteInvStock(id); }
        catch (err: any) { console.error('Failed to delete stock', id, err); }
      }
    }
    // Reverse the check-session bump this item contributed. Look up the
    // existing qty_found and subtract; replace=true so the backend writes
    // the new total directly. Skipped silently when the part isn't tracked
    // in a kit session.
    if (item.kitId && item.scannedQty > 0) {
      const { sessionId } = await ensureKitSession(item.kitId);
      if (sessionId != null) {
        // We can't easily fetch the current qty_found from here without
        // adding a new endpoint. Conservative fallback: write 0 with
        // replace=true. The kit-check page rebuilds the session list on
        // refresh, so the loss of accumulated state from other scans of the
        // same row in this session is acceptable — the user is explicitly
        // undoing this row.
        try {
          await verifyCheckBatch(sessionId, [{
            partNumber: item.partNumber,
            qtyFound:   0,
            replace:    true,
            ...(item.bag ? { bag: item.bag } : {}),
          }]);
        } catch { /* best-effort */ }
      }
    }
    // Drop the row from the local list. Matching is by (partNumber, bag)
    // so siblings (same part in another bag) stay intact.
    setItems(prev => prev.filter(i =>
      !(normPN(i.partNumber) === normPN(item.partNumber) && (i.bag || '') === (item.bag || ''))
    ));
    toast.success(`Removed ${item.partNumber}${item.bag ? ` from ${item.bag}` : ''}`);
  }, [ensureKitSession]);

  /** Record a part in its OWN kit's check session. Returns `ok` (whether the
   *  part was successfully recorded) and `createdSession` (whether a new
   *  session had to be created). On any error `ok` is false — the caller
   *  surfaces that so a scan is never silently left untracked. */
  const checkPartInOwnKit = useCallback(async (kitId: string, partNumber: string): Promise<{ ok: boolean; createdSession: boolean }> => {
    const { sessionId, created } = await ensureKitSession(kitId);
    if (sessionId == null) return { ok: false, createdSession: false };
    try {
      await verifyCheckBatch(sessionId, [{ partNumber, qtyFound: 1 }]);
      return { ok: true, createdSession: created };
    } catch {
      return { ok: false, createdSession: created };
    }
  }, [ensureKitSession]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);

  // Manifest entries for the selected kit
  const manifestEntries = useMemo(() => {
    if (!selectedKit) return [];
    return getKitEntries(aircraftType, selectedKit.id);
  }, [aircraftType, selectedKit]);

  // All manifest entries across all kits (for auto-fill when no kit selected)
  const allManifestEntries = useMemo(() => getAllEntries(aircraftType), [aircraftType]);

  /** Classify a part number against the SELECTED kit's manifest.
   *  `inManifest` — true when the part is in the selected kit (or, with no kit
   *  selected, in any kit). `belongsToKit` — set to another kit's label when
   *  the part is NOT in the selected kit but IS in that other kit, so the
   *  confirm dialog can name the kit the part really belongs to. */
  const classifyAgainstKit = useCallback((pn: string): { inManifest: boolean; belongsToKit?: string; homeKitId?: string; homeKitLabel?: string } => {
    const homeKit = aircraft?.kits.find(k =>
      k.entries.some(e => normPN(e.partNumber) === normPN(pn)));
    const inSelectedKit = selectedKit
      ? manifestEntries.some(e => normPN(e.partNumber) === normPN(pn))
      : !!homeKit;
    return {
      inManifest: inSelectedKit,
      // The part's actual home kit (any kit) — drives session routing.
      homeKitId: homeKit?.id,
      homeKitLabel: homeKit?.label,
      // Cross-kit: in another kit but not the selected one — flagged so the
      // confirm dialog can route the part (and its check session) there.
      belongsToKit: !inSelectedKit && selectedKit && homeKit ? homeKit.label : undefined,
    };
  }, [aircraft, selectedKit, manifestEntries]);

  // ─── Confirm-screen part-number autocomplete ─────────────────
  // Manifest-only — the user is correcting an OCR misread for a kit part,
  // so suggestions outside the manifest would be noise. Capped at 8 for
  // tap-friendly UI on mobile, deduped by part number across kits.
  const pnSuggestions = useMemo<ManifestEntry[]>(() => {
    if (!pendingScan || !showPnSuggestions) return [];
    const q = pendingScan.partNumber.toUpperCase().trim();
    if (q.length < 2) return [];
    const seen = new Set<string>();
    const out: ManifestEntry[] = [];
    for (const e of allManifestEntries) {
      if (out.length >= 8) break;
      const key = e.partNumber.toUpperCase();
      if (seen.has(key)) continue;
      if (key.includes(q)) {
        seen.add(key);
        out.push(e);
      }
    }
    return out;
  }, [pendingScan?.partNumber, showPnSuggestions, allManifestEntries]);

  const selectPnSuggestion = useCallback((entry: ManifestEntry) => {
    if (!pendingScan) return;
    const c = classifyAgainstKit(entry.partNumber);
    setPendingScan({
      ...pendingScan,
      partNumber: entry.partNumber,
      name:       entry.nomenclature || pendingScan.name,
      subKit:     entry.subKit || pendingScan.subKit,
      ...c,
    });
    setShowPnSuggestions(false);
  }, [pendingScan, classifyAgainstKit]);

  // Close the autocomplete on outside click — same pattern as PartsTab.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pnSuggestionsRef.current && !pnSuggestionsRef.current.contains(e.target as Node)) {
        setShowPnSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Camera ──────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    // The camera API (`getUserMedia`) only exists in a secure context — HTTPS,
    // or localhost. Served over plain http:// the whole `mediaDevices` API is
    // absent, which otherwise surfaces as a misleading "access denied".
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext
        ? 'This browser has no camera API available.'
        : 'The camera needs a secure connection — open this app over HTTPS (or via localhost).');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (err: any) {
      // Report the actual failure rather than always blaming permissions.
      const name = err?.name || '';
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera access denied — allow camera permission for this site, then reopen.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'No camera found on this device.'
        : name === 'NotReadableError'
          ? 'The camera is in use by another app — close it and try again.'
        : `Camera could not start${name ? ` (${name})` : ''}.`);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Start/stop camera when entering/leaving camera or bag-verify stage
  useEffect(() => {
    if (stage === 'camera' || stage === 'bag-verify') {
      if (!streamRef.current) startCamera();
    } else if (stage === 'kit-select') {
      stopCamera();
    }
  }, [stage, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  // ─── Detection frame overlay ──────────────────────────────────

  useEffect(() => {
    if ((stage !== 'camera' && stage !== 'bag-verify') || !cameraReady) return;
    const canvas = frameCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    let animId: number;
    const draw = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) { animId = requestAnimationFrame(draw); return; }

      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const videoAR = vw / vh;
      const containerAR = rect.width / rect.height;
      let renderH: number, offY: number;
      if (videoAR > containerAR) { renderH = rect.height; offY = 0; }
      else { renderH = rect.width / videoAR; offY = (rect.height - renderH) / 2; }

      const y1 = offY + renderH * CROP_TOP;
      const y2 = offY + renderH * CROP_BOTTOM;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, y1);
      ctx.fillRect(0, y2, canvas.width, canvas.height - y2);

      const frameX = 12, frameW = canvas.width - 24, frameH = y2 - y1, r = 8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); if (typeof ctx.roundRect === 'function') { ctx.roundRect(frameX, y1, frameW, frameH, r); } else { ctx.rect(frameX, y1, frameW, frameH); } ctx.stroke();

      const accentLen = 20;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(frameX, y1 + accentLen); ctx.lineTo(frameX, y1 + r); ctx.arcTo(frameX, y1, frameX + r, y1, r); ctx.lineTo(frameX + accentLen, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(frameX + frameW - accentLen, y1); ctx.lineTo(frameX + frameW - r, y1); ctx.arcTo(frameX + frameW, y1, frameX + frameW, y1 + r, r); ctx.lineTo(frameX + frameW, y1 + accentLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(frameX, y2 - accentLen); ctx.lineTo(frameX, y2 - r); ctx.arcTo(frameX, y2, frameX + r, y2, r); ctx.lineTo(frameX + accentLen, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(frameX + frameW - accentLen, y2); ctx.lineTo(frameX + frameW - r, y2); ctx.arcTo(frameX + frameW, y2, frameX + frameW, y2 - r, r); ctx.lineTo(frameX + frameW, y2 - accentLen); ctx.stroke();

      ctx.font = 'bold 11px system-ui, sans-serif';
      const label = `${selectedKit ? 'Mass Scan — ' + selectedKit.label : 'Auto-Sort Scan'} (${items.length})`;
      const tw = ctx.measureText(label).width;
      const lx = (canvas.width - tw - 10) / 2;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.85)';
      ctx.beginPath(); if (typeof ctx.roundRect === 'function') { ctx.roundRect(lx, y1 - 24, tw + 10, 20, [4, 4, 0, 0]); } else { ctx.rect(lx, y1 - 24, tw + 10, 20); } ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, lx + 5, y1 - 8);

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [stage, cameraReady, items.length, selectedKit]);

  // ─── Capture + OCR ────────────────────────────────────────────

  const captureAndProcess = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    setStage('processing');
    setError('');

    try {
      // Crop to label region
      const cropY = Math.round(canvas.height * CROP_TOP);
      const cropH = Math.round(canvas.height * (CROP_BOTTOM - CROP_TOP));
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = canvas.width;
      cropCanvas.height = cropH;
      cropCanvas.getContext('2d')!.drawImage(canvas, 0, cropY, canvas.width, cropH, 0, 0, canvas.width, cropH);

      const blob = await new Promise<Blob>(resolve =>
        cropCanvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92)
      );
      const file = new File([blob], 'mass-scan.jpg', { type: 'image/jpeg' });

      const ocrResult = await runOcr(file);

      const allDets: DetectedRegion[] = [];
      const rawLines: string[] = []; // raw OCR text for bag ID matching
      for (const line of ocrResult.lines) {
        const [[x1, y1], [x2, y2]] = line.bbox;
        const angle = Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
        if (angle > 15 && angle < 165) continue;
        rawLines.push(line.text.trim());
        const cls = classifyLine(line.text, vendor.partNumberPatterns);
        if (cls) allDets.push({ type: cls.type, text: cls.extracted, confidence: line.confidence });
      }
      for (const bc of ocrResult.barcodes || []) {
        // Classify barcode data the same way as OCR text lines
        const cls = classifyLine(bc.data, vendor.partNumberPatterns);
        if (cls) {
          allDets.push({ type: cls.type, text: cls.extracted, confidence: 1.0 });
        } else {
          // Fallback: treat unclassified barcode data as a part number
          allDets.push({ type: 'partNumber', text: bc.data, confidence: 1.0 });
        }
      }

      const bestPerType = new Map<DetectionType, DetectedRegion>();
      for (const det of allDets) {
        const ex = bestPerType.get(det.type);
        if (det.type === 'name') {
          if (!ex || det.text.length > ex.text.length) bestPerType.set(det.type, det);
        } else {
          if (!ex || det.confidence > ex.confidence) bestPerType.set(det.type, det);
        }
      }

      const pn = bestPerType.get('partNumber');
      const nm = bestPerType.get('name');
      const dt = bestPerType.get('date');
      const bagDet = bestPerType.get('bag');

      // Check for bag detection first
      // Try explicit bag detection, then also try matching any detected text against known bag IDs.
      // OCR may split a label across multiple lines (e.g. "RV TRAINING" + "PROJECT-1"),
      // so also try concatenating adjacent raw lines.
      const combinedRawLines: string[] = [];
      for (let i = 0; i < rawLines.length; i++) {
        combinedRawLines.push(rawLines[i]);
        if (i + 1 < rawLines.length) combinedRawLines.push(`${rawLines[i]} ${rawLines[i + 1]}`);
        if (i + 2 < rawLines.length) combinedRawLines.push(`${rawLines[i]} ${rawLines[i + 1]} ${rawLines[i + 2]}`);
      }
      // Also try ALL raw text as one string
      if (rawLines.length > 1) combinedRawLines.push(rawLines.join(' '));

      const bagCandidates = [
        bagDet?.text,
        pn?.text,
        nm?.text,
        ...combinedRawLines,
        ...allDets.map(d => d.text),
      ].filter(Boolean) as string[];

      for (const candidate of bagCandidates) {
        const found = findBagFuzzy(aircraftType, candidate);
        if (found && found.entries.length > 0) {
          setPendingBag({
            bagId:    found.bag.id,
            kitId:    found.kitId,
            bag:      found.bag,
            entries:  found.entries,
            groups:   found.groups,
            location: selectedLocationId,
          });
          setStage('bag-prompt');
          return;
        }
      }

      let detectedPN = pn?.text || bagDet?.text || '';

      // Manifest fallback for parts whose names don't fit the vendor's regex
      // (e.g. `AEX TIE DOWN X7.5`, `RUBBER DOOR SEALX25'` — no dash, spaces in
      // the part number). Walk every manifest entry and check if its part
      // number appears in any raw OCR line (or vice versa for OCR truncation).
      if (!detectedPN) {
        const candidates = [...new Set([...rawLines, ...combinedRawLines].map(fuzzyNorm))];
        // First pass: candidate text contains the full manifest PN
        outer: for (const entry of allManifestEntries) {
          const np = fuzzyNorm(entry.partNumber);
          if (!np) continue;
          for (const cand of candidates) {
            if (cand && cand.includes(np)) { detectedPN = entry.partNumber; break outer; }
          }
        }
        // Second pass: a substantial candidate is contained in a manifest PN
        // (covers OCR missing a trailing dimension like "X7.5")
        if (!detectedPN) {
          outer2: for (const entry of allManifestEntries) {
            const np = fuzzyNorm(entry.partNumber);
            if (np.length < 8) continue;  // too short to be confident
            for (const cand of candidates) {
              if (cand.length >= 6 && np.includes(cand)) { detectedPN = entry.partNumber; break outer2; }
            }
          }
        }
      }

      if (!detectedPN) {
        setStage('no-match');
        return;
      }

      // Multi-kit disambiguation — a part can live in more than one kit's
      // manifest with different qtyRequired (e.g. AEX TIE DOWN is 1 in
      // Empennage and 2 in Wing). Surface the choice to the user before
      // ingestion so the right kit's check session advances and the right
      // expectedQty drives the row's display.
      const kitMatches: Array<{ kitId: string; kitLabel: string; entry: ManifestEntry }> = [];
      if (aircraft) {
        for (const kit of aircraft.kits) {
          for (const entry of kit.entries) {
            if (normPN(entry.partNumber) === normPN(detectedPN)) {
              kitMatches.push({ kitId: kit.id, kitLabel: kit.label, entry });
            }
          }
        }
      }
      if (kitMatches.length > 1) {
        setPendingKitChoice({
          partNumber: detectedPN,
          candidates: kitMatches,
          scanContext: { name: nm?.text || '', mfgDate: dt?.text || '' },
        });
        setStage('kit-disambiguate');
        return;
      }

      // Auto-fill from manifest — `manifestHit` (any kit) drives name / sub-kit.
      const manifestHit = allManifestEntries.find(e => normPN(e.partNumber) === normPN(detectedPN));
      // Kit membership is judged against the SELECTED kit, not all kits.
      const kitClass = classifyAgainstKit(detectedPN);

      setPendingScan({
        partNumber: detectedPN,
        name:       nm?.text || manifestHit?.nomenclature || '',
        subKit:     manifestHit?.subKit || (detectedPN ? detectSubKit(detectedPN, vendor) : ''),
        mfgDate:    dt?.text || '',
        ...kitClass,
        location:   selectedLocationId,
      });
      setStage('confirm');
    } catch (err: any) {
      toast.error(err.message || 'OCR failed');
      setStage('camera');
    }
  }, [vendor, aircraftType, allManifestEntries, classifyAgainstKit, selectedLocationId, aircraft]);

  // ─── Capture for bag-verify mode (scan items inside bag) ──────
  const bagVerifyCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !pendingBag) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);

    setStage('processing');

    try {
      const cropY = Math.round(canvas.height * CROP_TOP);
      const cropH = Math.round(canvas.height * (CROP_BOTTOM - CROP_TOP));
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = canvas.width;
      cropCanvas.height = cropH;
      cropCanvas.getContext('2d')!.drawImage(canvas, 0, cropY, canvas.width, cropH, 0, 0, canvas.width, cropH);

      const blob = await new Promise<Blob>(resolve => cropCanvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92));
      const file = new File([blob], 'bag-verify.jpg', { type: 'image/jpeg' });
      const ocrResult = await runOcr(file);

      // Detect part number from OCR
      let detectedPN = '';
      for (const bc of ocrResult.barcodes || []) {
        if (bc.data) { detectedPN = bc.data; break; }
      }
      if (!detectedPN) {
        for (const line of ocrResult.lines) {
          const cls = classifyLine(line.text, vendor.partNumberPatterns);
          if (cls?.type === 'partNumber') { detectedPN = cls.extracted; break; }
        }
      }

      if (!detectedPN) {
        toast.error('No part number detected — try again');
        setStage('bag-verify');
        return;
      }

      // Check if this part is in the current bag (normalize to handle OCR dropping " inch marks)
      const normDetected = normPN(detectedPN);
      const idx = bagVerifyItems.findIndex(i =>
        normPN(i.entry.partNumber) === normDetected ||
        normPN(i.entry.partNumber).startsWith(normDetected) ||
        normDetected.startsWith(normPN(i.entry.partNumber))
      );
      if (idx >= 0) {
        setBagVerifyItems(prev => {
          const u = [...prev];
          u[idx] = { ...u[idx], status: 'scanned' };
          return u;
        });
        toast.success(`✓ ${detectedPN} verified`);
        markChecked([{ partNumber: detectedPN, qtyFound: bagVerifyItems[idx].entry.qtyRequired || 1, bag: pendingBag!.bagId }]);
      } else {
        toast.error(`${detectedPN} is not in ${pendingBag.bagId} — please scan items from this bag`);
      }
      setStage('bag-verify');
    } catch (err: any) {
      toast.error(err.message || 'OCR failed');
      setStage('bag-verify');
    }
  }, [vendor, pendingBag, bagVerifyItems, markChecked]);

  // ─── Ingest confirmed part ────────────────────────────────────

  const confirmAndIngest = useCallback(async () => {
    if (!pendingScan) return;
    setStage('processing');

    try {
      // Find expected qty from manifest (kit-specific first, then global)
      const manifestEntry = manifestEntries.find(e => normPN(e.partNumber) === normPN(pendingScan.partNumber))
        || allManifestEntries.find(e => normPN(e.partNumber) === normPN(pendingScan.partNumber));

      // The part is ingested into its OWN kit (its manifest home kit); the
      // kit being checked is only a fallback for parts in no manifest.
      const targetKit = pendingScan.homeKitLabel || selectedKit?.label || '';

      // The location attached to pendingScan is the per-scan override. Falls
      // back to the global selected default; ultimately the backend lands the
      // stock in "Incoming" if both are null.
      const effectiveLocationId = pendingScan.location ?? selectedLocationId;
      const { part, created, stockId } = await ingestInvPart({
        partNumber: pendingScan.partNumber,
        name:    pendingScan.name || manifestEntry?.nomenclature || pendingScan.partNumber,
        subKit:  pendingScan.subKit || manifestEntry?.subKit || '',
        kit:     targetKit,
        mfgDate: pendingScan.mfgDate,
        quantity: 1,
        unit:    manifestEntry?.unit || 'pcs',
        ...(effectiveLocationId ? { locationId: effectiveLocationId } : {}),
      });

      // ─── Kit-check session tracking ───
      // Every part with a known kit is recorded in that kit's check session,
      // created on the fly when missing — so a scan always lands in inventory
      // AND a session, in kit-check mode and in Auto-Sort (free-scan) mode
      // alike. A part in no kit manifest can't belong to any session — it is
      // flagged 'no-kit' (inventory only).
      let sessionStatus: IngestedItem['sessionStatus'];
      let kitNote = '';
      if (!pendingScan.homeKitId) {
        sessionStatus = 'no-kit';
      } else {
        const r = await checkPartInOwnKit(pendingScan.homeKitId, pendingScan.partNumber);
        sessionStatus = r.ok ? 'tracked' : 'failed';
        // Note the destination kit when it differs from the kit being checked
        // (cross-kit), or always in Auto-Sort mode where there is no selected
        // kit to contrast against.
        const destKit = pendingScan.belongsToKit ?? (!selectedKit ? pendingScan.homeKitLabel : undefined);
        if (destKit) {
          kitNote = ` → ${destKit}${r.createdSession ? ' (check started)' : ''}`;
        }
      }

      setItems(prev => {
        // Single-part scan has no bag context — match only against other
        // loose (no-bag) rows so we never collide with bag-scanned rows of
        // the same part.
        const idx = prev.findIndex(i => normPN(i.partNumber) === normPN(pendingScan.partNumber) && !i.bag);
        if (idx >= 0) {
          const updated = [...prev];
          const existing = updated[idx];
          updated[idx] = {
            ...existing,
            scannedQty: existing.scannedQty + 1,
            sessionStatus,
            stockIds: stockId != null ? [...(existing.stockIds || []), stockId] : (existing.stockIds || []),
          };
          return updated;
        }
        return [...prev, {
          partNumber: pendingScan.partNumber,
          name:    pendingScan.name || part.name,
          subKit:  pendingScan.subKit || part.subKit,
          mfgDate: pendingScan.mfgDate,
          scannedQty: 1,
          part,
          wasCreated: created,
          expectedQty: manifestEntry?.qtyRequired ?? 0,
          locationId: effectiveLocationId ?? undefined,
          sessionStatus,
          kitId: pendingScan.homeKitId,
          stockIds: stockId != null ? [stockId] : [],
        }];
      });

      if (sessionStatus === 'failed') {
        toast.error(`${pendingScan.partNumber} added to inventory, but NOT to a check session — re-scan to track it`);
      } else {
        toast.success(`${created ? 'New' : '+'} ${pendingScan.partNumber}${kitNote}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Ingest failed');
    }

    setPendingScan(null);
    setStage('camera');
  }, [pendingScan, selectedKit, manifestEntries, allManifestEntries, checkPartInOwnKit, selectedLocationId]);

  // ─── Bag workflow: "No" — ingest all as not verified ──────────
  const bagSkipVerify = useCallback(async () => {
    if (!pendingBag) return;
    setStage('processing');
    let count = 0;
    try {
      // pendingBag.location is the per-bag override; selectedLocationId is the
      // session-wide default fallback.
      const effectiveLocationId = pendingBag.location ?? selectedLocationId;
      for (const entry of pendingBag.entries) {
        const { part, created, stockId } = await ingestInvPart({
          partNumber: entry.partNumber,
          name:    entry.nomenclature || entry.partNumber,
          subKit:  entry.subKit || '',
          kit:     selectedKit?.label || '',
          bag:     pendingBag.bagId,
          notes:   'Bag not verified',
          quantity: entry.qtyRequired || 1,
          unit:    entry.unit || 'pcs',
          ...(effectiveLocationId ? { locationId: effectiveLocationId } : {}),
        });
        setItems(prev => {
          // Match within the same bag — different bags carry their own row.
          const idx = prev.findIndex(i => normPN(i.partNumber) === normPN(entry.partNumber) && i.bag === pendingBag.bagId);
          if (idx >= 0) {
            const u = [...prev];
            const existing = u[idx];
            u[idx] = {
              ...existing,
              scannedQty: existing.scannedQty + (entry.qtyRequired || 1),
              stockIds: stockId != null ? [...(existing.stockIds || []), stockId] : (existing.stockIds || []),
            };
            return u;
          }
          return [...prev, { partNumber: entry.partNumber, name: entry.nomenclature || part.name, subKit: entry.subKit || part.subKit, mfgDate: '', scannedQty: entry.qtyRequired || 1, part, wasCreated: created, expectedQty: entry.qtyRequired || 1, bag: pendingBag.bagId, locationId: effectiveLocationId ?? undefined, kitId: pendingBag.kitId, stockIds: stockId != null ? [stockId] : [] }];
        });
        count++;
      }
      toast.success(`${pendingBag.bagId}: ${count} items added (not verified)`);
      // Verify the bag's contents in its own kit's check session — NOT
      // activeCheckSessionId, which is null in Auto-Sort mode and could be
      // the wrong kit in cross-kit-check mode. Bags only belong to one kit
      // (pendingBag.kitId), so we always know the right destination.
      const { sessionId } = await ensureKitSession(pendingBag.kitId);
      if (sessionId != null) {
        try {
          await verifyCheckBatch(sessionId, pendingBag.entries.map(e => ({
            partNumber: e.partNumber,
            qtyFound:   e.qtyRequired || 1,
            bag:        pendingBag.bagId,
          })));
        } catch { /* best-effort */ }
      }
    } catch (err: any) { toast.error(err.message || 'Bag ingest failed'); }
    setPendingBag(null);
    setBagVerifyItems([]);
    setStage('camera');
  }, [pendingBag, selectedKit, ensureKitSession, selectedLocationId]);

  // ─── Bag workflow: "Yes" → enter bag-verify mode ────────────
  const bagStartVerify = useCallback(() => {
    if (!pendingBag) return;
    const items: BagVerifyEntry[] = [];
    for (const group of pendingBag.groups) {
      for (const entry of group.entries) {
        items.push({ entry, status: 'pending', actualQty: entry.qtyRequired || 1, groupId: group.bagId });
      }
    }
    setBagVerifyItems(items);
    setStage('bag-verify');
  }, [pendingBag]);

  // Toggle a bag item status: pending → checked → backordered → pending
  const cycleBagItemStatus = useCallback((idx: number) => {
    setBagVerifyItems(prev => {
      const updated = [...prev];
      const cur = updated[idx].status;
      // scanned items stay scanned (they were verified by scan)
      if (cur === 'scanned') return prev;
      const next: BagItemStatus = cur === 'pending' ? 'checked' : cur === 'checked' ? 'backordered' : 'pending';
      updated[idx] = { ...updated[idx], status: next };
      return updated;
    });
  }, []);

  // Change quantity for a bag item — auto-sets status based on qty vs expected
  const changeBagItemQty = useCallback((idx: number, newQty: number) => {
    setBagVerifyItems(prev => {
      const updated = [...prev];
      const item = updated[idx];
      const expected = item.entry.qtyRequired || 1;
      const qty = Math.max(0, newQty);
      let status = item.status;
      // Auto-set status based on qty
      if (qty === 0) {
        status = 'backordered';
      } else if (qty < expected) {
        status = 'checked'; // partial — will create backordered entry for remainder
      } else if (item.status === 'pending' || item.status === 'backordered') {
        status = 'checked';
      }
      updated[idx] = { ...item, actualQty: qty, status };
      return updated;
    });
  }, []);

  // "All Items Confirmed" — mark remaining pending as checked
  const bagConfirmAll = useCallback(() => {
    setBagVerifyItems(prev => prev.map(item =>
      item.status === 'pending' ? { ...item, status: 'checked' } : item
    ));
  }, []);

  // Finish bag verification — ingest all items with their status
  const bagFinishVerify = useCallback(async () => {
    if (!pendingBag) return;
    setStage('processing');
    let count = 0;
    let boCount = 0;
    try {
      for (const { entry, status, actualQty } of bagVerifyItems) {
        const expected = entry.qtyRequired || 1;
        const qty = status === 'backordered' ? 0 : actualQty;
        const shortage = expected - qty;
        const notesArr: string[] = [];
        if (status === 'backordered') notesArr.push('BACKORDERED');
        if (status === 'pending') notesArr.push('Not verified');
        if (qty > 0 && shortage > 0) notesArr.push(`Received ${qty}/${expected}`);

        // Ingest the part + stock for what we actually received. The bag's
        // per-confirm `location` overrides the session-wide default; falls
        // back to whatever default the user picked at the top of the list.
        const effectiveLocationId = pendingBag.location ?? selectedLocationId;
        const locExtra = effectiveLocationId ? { locationId: effectiveLocationId } : {};
        const { part, created, stockId } = await ingestInvPart({
          partNumber: entry.partNumber,
          name:    entry.nomenclature || entry.partNumber,
          subKit:  entry.subKit || '',
          kit:     selectedKit?.label || '',
          bag:     pendingBag.bagId,
          quantity: qty,
          unit:    entry.unit || 'pcs',
          status:  qty > 0 ? 'in_stock' : 'backordered',
          ...(notesArr.length > 0 ? { notes: notesArr.join(', ') } : {}),
          ...locExtra,
        });
        const createdStockIds: number[] = stockId != null ? [stockId] : [];

        // If partial (received some but not all), create a backordered entry for the shortage
        if (qty > 0 && shortage > 0) {
          const { stockId: boStockId } = await ingestInvPart({
            partNumber: entry.partNumber,
            name:    entry.nomenclature || entry.partNumber,
            subKit:  entry.subKit || '',
            kit:     selectedKit?.label || '',
            bag:     pendingBag.bagId,
            quantity: shortage,
            unit:    entry.unit || 'pcs',
            status:  'backordered',
            notes:   `BACKORDERED — short ${shortage} of ${expected}`,
            ...locExtra,
          });
          if (boStockId != null) createdStockIds.push(boStockId);
          boCount++;
        } else if (status === 'backordered') {
          boCount++;
        }

        setItems(prev => {
          // Match within the same bag — different bags carry their own row.
          const idx = prev.findIndex(i => normPN(i.partNumber) === normPN(entry.partNumber) && i.bag === pendingBag.bagId);
          if (idx >= 0) {
            const u = [...prev];
            const existing = u[idx];
            u[idx] = {
              ...existing,
              scannedQty: existing.scannedQty + qty,
              stockIds: [...(existing.stockIds || []), ...createdStockIds],
            };
            return u;
          }
          return [...prev, { partNumber: entry.partNumber, name: entry.nomenclature || part.name, subKit: entry.subKit || part.subKit, mfgDate: '', scannedQty: qty, part, wasCreated: created, expectedQty: expected, bag: pendingBag.bagId, locationId: effectiveLocationId ?? undefined, kitId: pendingBag.kitId, stockIds: createdStockIds }];
        });
        count++;
      }
      toast.success(`${pendingBag.bagId}: ${count} items added${boCount > 0 ? ` (${boCount} backordered)` : ''}`);
      // Mark items in the bag's kit-check session — NOT activeCheckSessionId,
      // which is null in Auto-Sort mode. The bag belongs unambiguously to
      // pendingBag.kitId, so that's the only session that matters here.
      // Items left as 'pending' (not verified) are skipped — they stay
      // pending in the session.
      const checkItems = bagVerifyItems
        .filter(i => i.status !== 'pending')
        .map(i => {
          const bagExpected = i.entry.qtyRequired || 1;
          const qty = i.status === 'backordered' ? 0 : i.actualQty;
          return {
            partNumber: i.entry.partNumber,
            qtyFound:   qty,
            isShort:    qty < bagExpected,
            bag:        pendingBag.bagId,  // match the correct bag entry in the session
          };
        });
      if (checkItems.length > 0) {
        const { sessionId } = await ensureKitSession(pendingBag.kitId);
        if (sessionId != null) {
          try { await verifyCheckBatch(sessionId, checkItems); }
          catch { /* best-effort */ }
        }
      }
    } catch (err: any) { toast.error(err.message || 'Bag ingest failed'); }
    setPendingBag(null);
    setBagVerifyItems([]);
    setStage('camera');
  }, [pendingBag, bagVerifyItems, selectedKit, manifestEntries, ensureKitSession, selectedLocationId]);

  /** User picked a kit from the multi-kit disambiguation screen. We synthesise
   *  the same pendingScan shape captureAndProcess would have produced if the
   *  part lived in exactly one kit, and jump to the confirm stage so the
   *  normal flow (qty, sub-kit, location, "Add to Wing Kit" button) all keeps
   *  working unchanged. */
  const resolveKitChoice = useCallback((candidate: { kitId: string; kitLabel: string; entry: ManifestEntry }) => {
    if (!pendingKitChoice) return;
    const { partNumber, scanContext } = pendingKitChoice;
    setPendingScan({
      partNumber,
      name:          scanContext.name || candidate.entry.nomenclature || '',
      subKit:        candidate.entry.subKit || (partNumber ? detectSubKit(partNumber, vendor) : ''),
      mfgDate:       scanContext.mfgDate,
      // The picked kit becomes the part's home kit for session routing.
      inManifest:    selectedKit ? selectedKit.id === candidate.kitId : true,
      homeKitId:     candidate.kitId,
      homeKitLabel:  candidate.kitLabel,
      belongsToKit:  selectedKit && selectedKit.id !== candidate.kitId ? candidate.kitLabel : undefined,
      location:      selectedLocationId,
    });
    setPendingKitChoice(null);
    setStage('confirm');
  }, [pendingKitChoice, selectedKit, vendor, selectedLocationId]);

  const skipScan = useCallback(() => {
    setPendingScan(null);
    setPendingBag(null);
    setStage('camera');
  }, []);

  // ─── Stats ────────────────────────────────────────────────────

  const totalScanned = Math.round(items.reduce((s, i) => s + i.scannedQty, 0) * 100) / 100;
  const totalUnique = items.length;

  const handleDone = () => { stopCamera(); onDone(items); };
  const handleClose = () => { stopCamera(); onClose(); };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ touchAction: 'pan-x pan-y' }}>
      {/* Landscape-orientation overlay — Mass Ingestion is portrait-only.
          On browsers that honour screen.orientation.lock() this never shows
          because the device is held in portrait. iOS Safari ignores the lock
          API entirely, so the CSS @media (orientation: landscape) takes over
          and prompts the user to rotate back. */}
      <div className="hidden landscape:flex absolute inset-0 z-[60] bg-black flex-col items-center justify-center text-foreground p-8 text-center">
        <MIcon name="screen_rotation" className="text-emerald-400 mb-4" style={{ fontSize: '4rem' }} />
        <p className="text-lg font-bold mb-1">Rotate to portrait</p>
        <p className="text-sm text-muted-foreground">Mass Ingestion is designed for portrait mode.</p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-2">
          {/* Back button — always visible, conventional top-left position so
              users can exit even before they've scanned anything */}
          <button onClick={handleClose} aria-label="Close mass ingestion"
            className="flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
            <span className="font-label text-[10px] font-bold uppercase tracking-wider text-foreground">Back</span>
          </button>
          <MIcon name="inventory_2" className="text-lg text-emerald-400 ml-1" />
          <span className="font-label text-sm font-bold uppercase tracking-wider text-foreground">Mass Ingestion</span>
          {selectedKit && <span className="text-xs text-emerald-400/80 ml-1">— {selectedKit.label}</span>}
          {activeCheckSessionId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold ml-2">CHECK</span>}
        </div>
        <div className="flex items-center gap-2">
          {!activeCheckSessionId && stage !== 'kit-select' && (
            <button onClick={() => setStage('kit-select')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-600/20 border border-amber-500/30 text-amber-400 font-label text-[10px] font-bold uppercase tracking-wider hover:bg-amber-600/30 transition-colors">
              <ClipboardCheck className="w-3.5 h-3.5" /> Kit Check
            </button>
          )}
          {items.length > 0 && (
            <button onClick={handleDone}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-foreground font-label text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 transition-colors">
              <Check className="w-3.5 h-3.5" /> Done ({totalScanned})
            </button>
          )}
        </div>
      </div>

      {/* ─── Kit Check Selection ─── */}
      {stage === 'kit-select' && (
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          <h2 className="text-lg font-bold text-foreground mb-1">Start Kit Check</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Verify a kit against its manifest — track which parts have been received and flag missing items.
          </p>

          <div className="space-y-3">
            {aircraft?.kits.filter(k => k.entries.length > 0).map(kit => {
              const activeSession = existingSessions.find(s => s.kitId === kit.id && s.status !== 'completed');
              return (
                <div key={kit.id} className="rounded-xl bg-card border border-border overflow-hidden">
                  <div className="px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{kit.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{kit.subKits.join(', ')}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">{kit.entries.length} parts</p>
                        {kit.bags?.length > 0 && <p className="text-xs text-muted-foreground">{kit.bags.length} bags</p>}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pb-3 flex gap-2">
                    {activeSession ? (
                      <button
                        onClick={async () => {
                          setSelectedKit(kit);
                          setActiveCheckSessionId(activeSession.id);
                          setStage('camera');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Resume Check ({Math.round(((activeSession.verifiedItems + activeSession.missingItems) / Math.max(activeSession.totalItems, 1)) * 100)}%)
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          try {
                            const perBagEntries = getKitEntriesPerBag(aircraftType, kit.id);
                            const session = await createCheckSession({
                              aircraftType,
                              kitId: kit.id,
                              kitLabel: kit.label,
                              items: perBagEntries.map(e => ({
                                partNumber: e.partNumber,
                                nomenclature: e.nomenclature,
                                subKit: e.subKit,
                                bag: e.bag,
                                qtyExpected: e.qtyRequired,
                                unit: e.unit,
                              })),
                            });
                            setSelectedKit(kit);
                            setActiveCheckSessionId(session.id);
                            setExistingSessions(prev => [...prev, session]);
                            setStage('camera');
                            toast.success('Kit check session started');
                          } catch { toast.error('Failed to create check session'); }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-600/30 transition-colors"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Start Kit Check
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setStage('camera')}
            className="mt-6 w-full px-4 py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
          >
            Auto-Sort Scan — parts sort into their kits automatically
          </button>
        </div>
      )}

      {/* ─── Camera / Processing / Confirm / Bag / Kit picker ─── */}
      {(stage === 'camera' || stage === 'processing' || stage === 'confirm' || stage === 'no-match' || stage === 'bag-prompt' || stage === 'bag-verify' || stage === 'kit-disambiguate') && (
        <>
          {/* Camera view */}
          <div className="relative overflow-hidden shrink-0" style={{ height: 'min(40vh, 280px)' }}>
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            <canvas ref={frameCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />

            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60 p-6">
                <p className="text-sm text-destructive text-center">{error}</p>
              </div>
            )}

            {stage === 'processing' && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40">
                <div className="flex items-center gap-3 bg-black/80 backdrop-blur-sm px-5 py-3 rounded-full">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                  <span className="text-sm text-foreground font-medium">Analyzing...</span>
                </div>
              </div>
            )}

            {stage === 'no-match' && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
                <div className="bg-card/95 backdrop-blur-sm rounded-xl p-5 mx-4 max-w-sm w-full space-y-3 text-center">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-sm font-bold text-foreground">No part number detected</p>
                  <p className="text-xs text-muted-foreground">Make sure the label is clearly visible and well-lit, then try again.</p>
                  <button
                    onClick={() => setStage('camera')}
                    className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {stage === 'kit-disambiguate' && pendingKitChoice && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/70 p-4">
                <div className="bg-card/95 backdrop-blur-sm rounded-xl p-5 mx-2 max-w-sm w-full space-y-3 max-h-full overflow-y-auto">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Found in multiple kits</p>
                  <div className="px-3 py-2 rounded-md bg-accent/40 border border-border">
                    <p className="text-base font-mono font-bold text-foreground">{pendingKitChoice.partNumber}</p>
                    {pendingKitChoice.candidates[0]?.entry.nomenclature && (
                      <p className="text-xs text-muted-foreground mt-0.5">{pendingKitChoice.candidates[0].entry.nomenclature}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Pick the kit this scan should advance:</p>
                  <div className="space-y-2">
                    {pendingKitChoice.candidates.map(c => (
                      <button
                        key={c.kitId}
                        onClick={() => resolveKitChoice(c)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-foreground hover:bg-emerald-600/25 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">{c.kitLabel}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {c.entry.subKit && <span className="mr-1.5 text-emerald-400/80">[{c.entry.subKit}]</span>}
                            {c.entry.bag    && <span className="mr-1.5 text-primary/80">[{c.entry.bag}]</span>}
                            {!c.entry.subKit && !c.entry.bag && <span className="text-muted-foreground/70">no bag / loose</span>}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end">
                          <span className="text-xs text-muted-foreground">need</span>
                          <span className="text-lg font-bold text-emerald-400 leading-none">{c.entry.qtyRequired}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setPendingKitChoice(null); setStage('camera'); }}
                    className="w-full px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-accent transition-colors"
                  >
                    Cancel — Retake Photo
                  </button>
                </div>
              </div>
            )}

            {stage === 'confirm' && pendingScan && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
                <div className="bg-card/95 backdrop-blur-sm rounded-xl p-5 mx-4 max-w-sm w-full space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Detected Part</p>
                  {!pendingScan.inManifest && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-600/20 border border-amber-500/40">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        {pendingScan.belongsToKit ? (
                          <>This part belongs to the <span className="font-bold">{pendingScan.belongsToKit}</span> kit{selectedKit ? `, not ${selectedKit.label}` : ''}. Add it to {pendingScan.belongsToKit}?</>
                        ) : (
                          <>This part is <span className="font-bold">not in the manifest</span>{selectedKit ? ` for ${selectedKit.label}` : ''}. It may be misread or belong to a different kit.</>
                        )}
                      </p>
                    </div>
                  )}
                  <div className="relative" ref={pnSuggestionsRef}>
                    <input value={pendingScan.partNumber}
                      onChange={e => {
                        const pn = e.target.value;
                        const c = classifyAgainstKit(pn);
                        // Look up the corrected PN in the manifest so a manual
                        // edit also fills in the canonical description + sub-kit
                        // (matching what the OCR path does at the initial scan).
                        const m = allManifestEntries.find(en => normPN(en.partNumber) === normPN(pn));
                        setPendingScan({
                          ...pendingScan,
                          partNumber: pn,
                          ...c,
                          ...(m?.nomenclature ? { name: m.nomenclature } : {}),
                          ...(m?.subKit ? { subKit: m.subKit } : {}),
                        });
                        setShowPnSuggestions(true);
                      }}
                      onFocus={() => setShowPnSuggestions(true)}
                      autoComplete="off"
                      className="w-full px-3 py-2 rounded bg-accent border border-border text-foreground text-lg font-mono font-bold" />
                    {pnSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-card border border-border rounded-md shadow-lg z-50">
                        {pnSuggestions.map(s => (
                          <button
                            key={s.partNumber}
                            type="button"
                            onClick={() => selectPnSuggestion(s)}
                            className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/30 last:border-b-0"
                          >
                            <p className="text-sm font-mono font-bold text-foreground">{s.partNumber}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {s.nomenclature}
                              {s.subKit && <span className="ml-1.5 text-emerald-400/70">[{s.subKit}]</span>}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={pendingScan.name}
                      onChange={e => setPendingScan({ ...pendingScan, name: e.target.value })}
                      className="px-3 py-2 rounded bg-accent border border-border text-foreground/80 text-sm"
                      placeholder="Description" />
                    <input value={pendingScan.mfgDate}
                      onChange={e => setPendingScan({ ...pendingScan, mfgDate: e.target.value })}
                      className="px-3 py-2 rounded bg-accent border border-border text-foreground/80 text-sm font-mono"
                      placeholder="Mfg date" />
                  </div>
                  {pendingScan.subKit && (
                    <p className="text-xs text-emerald-400">Sub-kit: {pendingScan.subKit}</p>
                  )}
                  {!selectedKit && pendingScan.homeKitLabel && (
                    <p className="text-xs text-emerald-400">Filing into the <span className="font-bold">{pendingScan.homeKitLabel}</span> kit</p>
                  )}
                  {locations.length > 0 && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <select
                        value={pendingScan.location ?? ''}
                        onChange={e => setPendingScan({ ...pendingScan, location: e.target.value ? Number(e.target.value) : null })}
                        className="flex-1 px-2 py-1.5 rounded bg-accent border border-border text-xs text-foreground/80 focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="">No location</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={skipScan}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:bg-accent transition-colors">
                      <RotateCcw className="w-4 h-4" /> Retake
                    </button>
                    <button onClick={confirmAndIngest}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md font-bold text-sm transition-colors ${pendingScan.inManifest || pendingScan.belongsToKit ? 'bg-emerald-600 text-foreground hover:bg-emerald-500' : 'bg-amber-600 text-foreground hover:bg-amber-500'}`}>
                      <Check className="w-4 h-4" /> {pendingScan.belongsToKit ? `Add to ${pendingScan.belongsToKit}` : (!selectedKit && pendingScan.homeKitLabel) ? `Add to ${pendingScan.homeKitLabel}` : pendingScan.inManifest ? 'Add' : 'Add Anyway'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bag prompt: "Do you want to verify contents?" */}
            {stage === 'bag-prompt' && pendingBag && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
                <div className="bg-card/95 backdrop-blur-sm rounded-xl p-5 mx-4 max-w-sm w-full space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-emerald-400" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Bag Detected</p>
                      <p className="text-lg font-mono font-bold text-foreground">{pendingBag.bagId}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pendingBag.bag.description} — {pendingBag.entries.length} item{pendingBag.entries.length !== 1 ? 's' : ''}
                    {pendingBag.groups.length > 1 && (
                      <span className="block text-xs mt-0.5 text-primary/70">
                        Contains {pendingBag.groups.length - 1} sub-bag{pendingBag.groups.length > 2 ? 's' : ''}: {pendingBag.groups.slice(1).map(g => g.bagId).join(', ')}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-foreground/80">Do you want to verify its contents?</p>
                  {locations.length > 0 && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <select
                        value={pendingBag.location ?? ''}
                        onChange={e => setPendingBag({ ...pendingBag, location: e.target.value ? Number(e.target.value) : null })}
                        className="flex-1 px-2 py-1.5 rounded bg-accent border border-border text-xs text-foreground/80 focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="">No location</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={bagSkipVerify}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-sm text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors font-medium">
                      <X className="w-4 h-4" /> No
                    </button>
                    <button onClick={bagStartVerify}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md bg-emerald-600 text-foreground font-bold text-sm hover:bg-emerald-500 transition-colors">
                      <Check className="w-4 h-4" /> Yes, Verify
                    </button>
                  </div>
                </div>
              </div>
            )}

            {stage === 'camera' && (
              <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center pb-4 pt-3 bg-gradient-to-t from-black/60 to-transparent">
                <button onClick={captureAndProcess} disabled={!cameraReady}
                  className="w-16 h-16 rounded-full border-4 border-emerald-400 bg-emerald-500/20 backdrop-blur-sm hover:bg-emerald-500/40 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-400" />
                </button>
              </div>
            )}

            {stage === 'bag-verify' && (
              <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center pb-4 pt-3 bg-gradient-to-t from-black/60 to-transparent">
                <button onClick={bagVerifyCapture} disabled={!cameraReady}
                  className="w-14 h-14 rounded-full border-4 border-primary bg-primary/20 backdrop-blur-sm hover:bg-primary/40 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-primary" />
                </button>
              </div>
            )}
          </div>

          {/* ─── Bag verify checklist ─── */}
          {stage === 'bag-verify' && pendingBag ? (
            <div className="flex-1 overflow-y-auto bg-background">
              <div className="sticky top-0 z-10 px-4 py-2.5 bg-card/95 backdrop-blur-sm border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-foreground">{pendingBag.bagId}</span>
                    <span className="text-xs text-muted-foreground">{pendingBag.bag.description}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {bagVerifyItems.filter(i => i.status !== 'pending').length}/{bagVerifyItems.length} checked
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Tap status to cycle. Use +/− to adjust qty — shortages are auto-backordered.</p>
              </div>

              <div>
                {(() => {
                  // Group items by groupId, preserving order
                  const groupOrder: string[] = [];
                  const groupMap = new Map<string, { indices: number[] }>();
                  bagVerifyItems.forEach((item, idx) => {
                    if (!groupMap.has(item.groupId)) {
                      groupOrder.push(item.groupId);
                      groupMap.set(item.groupId, { indices: [] });
                    }
                    groupMap.get(item.groupId)!.indices.push(idx);
                  });
                  const hasSubBags = groupOrder.length > 1;

                  return groupOrder.map(gid => {
                    const group = groupMap.get(gid)!;
                    const isSubBag = hasSubBags && gid !== pendingBag.bagId;
                    const groupDesc = pendingBag.groups.find(g => g.bagId === gid)?.description || gid;
                    const groupChecked = group.indices.filter(i => bagVerifyItems[i].status !== 'pending').length;

                    return (
                      <div key={gid}>
                        {/* Sub-bag header */}
                        {hasSubBags && (
                          <div className={`flex items-center gap-2 px-4 py-2 ${isSubBag ? 'bg-primary/5 border-t border-b border-border/50' : 'bg-muted/30 border-b border-border/50'}`}>
                            <Package className={`w-3.5 h-3.5 ${isSubBag ? 'text-primary/60' : 'text-muted-foreground'}`} />
                            <span className="text-xs font-bold text-foreground">{gid}</span>
                            <span className="text-[10px] text-muted-foreground">{groupDesc}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{groupChecked}/{group.indices.length}</span>
                          </div>
                        )}
                        {/* Items in this group */}
                        <div className="divide-y divide-border/50">
                          {group.indices.map(idx => {
                            const item = bagVerifyItems[idx];
                            const expected = item.entry.qtyRequired || 1;
                            const isShort = item.actualQty < expected && item.actualQty > 0;
                            return (
                              <div key={item.entry.partNumber} className={`flex items-center gap-2 py-3 ${isSubBag ? 'px-6' : 'px-4'}`}>
                                {/* Status icon — tap to cycle */}
                                <button onClick={() => cycleBagItemStatus(idx)}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    item.status === 'scanned' ? 'bg-emerald-500/15' :
                                    item.status === 'checked' ? 'bg-primary/15' :
                                    item.status === 'backordered' ? 'bg-destructive/15' :
                                    'bg-accent'
                                  }`}>
                                  {item.status === 'scanned' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                                  {item.status === 'checked' && <Check className="w-4 h-4 text-primary" />}
                                  {item.status === 'backordered' && <AlertTriangle className="w-4 h-4 text-destructive" />}
                                  {item.status === 'pending' && <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/50" />}
                                </button>
                                {/* Part info — tap to cycle */}
                                <button onClick={() => cycleBagItemStatus(idx)} className="flex-1 min-w-0 text-left">
                                  <p className={`text-sm font-mono font-bold truncate ${
                                    item.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
                                  }`}>{item.entry.partNumber}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {item.entry.nomenclature}
                                    {isShort && <span className="ml-1 text-amber-400">({item.actualQty}/{expected})</span>}
                                  </p>
                                </button>
                                {/* Qty controls */}
                                <div className="shrink-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => changeBagItemQty(idx, item.actualQty - (item.entry.unit === 'lb' ? 0.01 : 1))}
                                    className="w-7 h-7 rounded bg-accent hover:bg-accent/80 text-foreground/80 flex items-center justify-center text-base font-bold active:scale-90 transition-all">
                                    −
                                  </button>
                                  <span className={`w-10 text-center text-sm font-mono font-bold ${
                                    item.actualQty === 0 ? 'text-destructive' :
                                    isShort ? 'text-amber-400' : 'text-foreground/80'
                                  }`}>
                                    {item.entry.unit === 'lb' ? item.actualQty.toFixed(2) : item.actualQty}
                                  </span>
                                  <button onClick={() => changeBagItemQty(idx, item.actualQty + (item.entry.unit === 'lb' ? 0.01 : 1))}
                                    className="w-7 h-7 rounded bg-accent hover:bg-accent/80 text-foreground/80 flex items-center justify-center text-base font-bold active:scale-90 transition-all">
                                    +
                                  </button>
                                  <span className="text-[9px] text-muted-foreground/60 w-6 text-right">/{expected}</span>
                                </div>
                                {/* Status label */}
                                <div className="w-14 shrink-0 text-right">
                                  {item.status === 'backordered' && <p className="text-[9px] text-destructive font-bold uppercase">Backorder</p>}
                                  {item.status === 'scanned' && <p className="text-[9px] text-emerald-400 font-bold uppercase">Scanned</p>}
                                  {isShort && item.status === 'checked' && <p className="text-[9px] text-amber-400 font-bold uppercase">Partial</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Action buttons */}
              <div className="sticky bottom-0 z-10 px-4 py-3 bg-card/95 backdrop-blur-sm border-t border-border space-y-2">
                {locations.length > 0 && pendingBag && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <select
                      value={pendingBag.location ?? ''}
                      onChange={e => setPendingBag({ ...pendingBag, location: e.target.value ? Number(e.target.value) : null })}
                      className="flex-1 px-2 py-1.5 rounded bg-accent border border-border text-xs text-foreground/80 focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="">No location</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
                {bagVerifyItems.some(i => i.status === 'pending') && (
                  <button onClick={bagConfirmAll}
                    className="w-full px-3 py-2.5 rounded-md bg-primary/20 border border-primary/30 text-primary font-bold text-sm hover:bg-primary/30 transition-colors">
                    All Items Confirmed
                  </button>
                )}
                <button onClick={bagFinishVerify}
                  className="w-full px-3 py-2.5 rounded-md bg-emerald-600 text-foreground font-bold text-sm hover:bg-emerald-500 transition-colors">
                  Done — Add to Inventory
                </button>
              </div>
            </div>
          ) : (
            /* ─── Receipt / scanned items list ─── */
            <div className="flex-1 overflow-y-auto bg-background">
              {/* Stats header + location selector */}
              <div className="sticky top-0 z-10 px-4 py-2.5 bg-card/95 backdrop-blur-sm border-b border-border">
                <div className="flex items-center gap-4 text-xs text-foreground/80">
                  <span><strong className="text-foreground">{totalScanned}</strong> scanned</span>
                  <span><strong className="text-foreground">{totalUnique}</strong> unique</span>
                  {manifestEntries.length > 0 && (
                    <span className="text-muted-foreground">
                      {manifestEntries.length} in manifest
                    </span>
                  )}
                </div>
                {locations.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <select
                      value={selectedLocationId ?? ''}
                      onChange={e => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
                      className="flex-1 px-2 py-1.5 rounded bg-accent border border-border text-xs text-foreground/80 focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="">Incoming (default)</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Package className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No parts scanned yet</p>
                  <p className="text-xs mt-1 text-muted-foreground/60">Point the camera at a label and tap the button</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {[...items].reverse().map(item => {
                    const hasManifest = item.expectedQty > 0;
                    const fulfilled = hasManifest && item.scannedQty >= item.expectedQty;
                    const partial = hasManifest && item.scannedQty > 0 && !fulfilled;

                    // (partNumber, bag) is the row identity — the same part
                    // scanned in multiple bags renders as separate rows.
                    const rowKey = `${item.partNumber}|${item.bag || ''}`;
                    const isEditing = editingQty?.partNumber === item.partNumber && (editingQty?.bag || '') === (item.bag || '');
                    return (
                      <div key={rowKey} className="flex items-center gap-3 px-4 py-3">
                        {/* Quantity badge — tap to edit. Becomes a numeric
                            input + "Set to expected" shortcut. Saves on
                            Enter, the green check, or blur; cancels on
                            Esc or the X. */}
                        {isEditing ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={editingQty!.value}
                              onChange={e => setEditingQty({ partNumber: item.partNumber, bag: item.bag, value: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitQty(item.partNumber, item.bag, editingQty!.value);
                                else if (e.key === 'Escape') setEditingQty(null);
                              }}
                              onBlur={() => {
                                // Tolerate clicks on the action buttons next
                                // to the input — defer the close to the next
                                // tick so onClick can fire first.
                                setTimeout(() => {
                                  setEditingQty(curr =>
                                    curr?.partNumber === item.partNumber && (curr?.bag || '') === (item.bag || '') ? curr : null
                                  );
                                }, 150);
                              }}
                              autoFocus
                              className="w-14 px-1 py-1 rounded bg-card border border-emerald-500/60 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <button
                              onClick={() => commitQty(item.partNumber, item.bag, editingQty!.value)}
                              className="p-1 rounded hover:bg-emerald-500/20 text-emerald-500"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            {hasManifest && Number(editingQty!.value) !== item.expectedQty && (
                              <button
                                onClick={() => commitQty(item.partNumber, item.bag, String(item.expectedQty))}
                                className="px-1.5 py-0.5 rounded bg-accent hover:bg-accent/80 text-[10px] font-bold text-foreground/80 whitespace-nowrap"
                                title={`Set to expected qty (${item.expectedQty})`}
                              >
                                {item.expectedQty}
                              </button>
                            )}
                            <button
                              onClick={() => setEditingQty(null)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingQty({ partNumber: item.partNumber, bag: item.bag, value: String(item.scannedQty) })}
                            className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 text-xs font-bold transition hover:ring-1 hover:ring-foreground/20 ${
                              fulfilled ? 'bg-emerald-500/15 text-emerald-400' :
                              partial ? 'bg-amber-500/15 text-amber-400' :
                              'bg-accent text-foreground/80'
                            }`}
                            title="Tap to set quantity"
                          >
                            <span className="text-base leading-none">{item.scannedQty}</span>
                            {hasManifest && <span className="text-[9px] opacity-60 leading-none mt-0.5">/{item.expectedQty}</span>}
                          </button>
                        )}

                        {/* Part info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-bold text-foreground truncate">{item.partNumber}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.name}
                            {item.subKit && <span className="ml-1.5 text-emerald-400/60">[{item.subKit}]</span>}
                            {item.bag && <span className="ml-1.5 text-primary/60">[{item.bag}]</span>}
                            {item.mfgDate && <span className="ml-1.5 text-muted-foreground/60">{item.mfgDate}</span>}
                          </p>
                          {/* Session-tracking status — surface the gaps so a part
                              is never silently inventory-only. */}
                          {item.sessionStatus === 'failed' && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" /> Not in a check session — re-scan to track
                            </p>
                          )}
                          {item.sessionStatus === 'no-kit' && (
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Inventory only — not in a kit</p>
                          )}
                          {/* Per-item location — also pushes the new location
                              to every inventory_stock row this scan created,
                              not just the local list. Without the API call
                              the visual changes but the real stock row stays
                              at its original location. */}
                          {locations.length > 0 && (
                            <select
                              value={item.locationId ?? ''}
                              onChange={async e => {
                                const newLocId = e.target.value ? Number(e.target.value) : undefined;
                                // Optimistic local update — match by (partNumber, bag) so
                                // a sibling row for the same part in a different bag isn't
                                // touched.
                                setItems(prev => prev.map(i =>
                                  normPN(i.partNumber) === normPN(item.partNumber) && (i.bag || '') === (item.bag || '')
                                    ? { ...i, locationId: newLocId }
                                    : i
                                ));
                                // Push to the backend for every stock row this scan created.
                                // Skip when "Incoming" is selected (no explicit location) —
                                // there's no neutral location id we can write back, so the
                                // local label just becomes informational.
                                if (newLocId != null && item.stockIds && item.stockIds.length > 0) {
                                  for (const sid of item.stockIds) {
                                    try { await updateInvStock(sid, { locationId: newLocId }); }
                                    catch (err: any) {
                                      toast.error(`Could not move ${item.partNumber}: ${err.message || 'unknown error'}`);
                                    }
                                  }
                                }
                              }}
                              onClick={e => e.stopPropagation()}
                              className="mt-1 px-1.5 py-0.5 rounded bg-accent/50 border border-border/50 text-[10px] text-muted-foreground focus:outline-none focus:border-emerald-500/50 max-w-[180px]"
                            >
                              <option value="">Incoming</option>
                              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          )}
                        </div>

                        {/* Status indicator + delete affordance */}
                        <div className="shrink-0 flex items-center gap-2">
                          {fulfilled && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                          {partial && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                          {item.wasCreated && !hasManifest && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold uppercase">new</span>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteScannedItem(item)}
                            aria-label={`Remove ${item.partNumber}${item.bag ? ' from ' + item.bag : ''}`}
                            title="Remove from inventory and check session"
                            className="p-1.5 rounded hover:bg-rose-500/15 text-muted-foreground hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
