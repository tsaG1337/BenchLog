import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Check, Loader2, RotateCcw, Package, AlertTriangle, CheckCircle2, ClipboardCheck, MapPin } from 'lucide-react';
import { MIcon } from '@/components/AppShell';
import { runOcr, ingestInvPart, verifyCheckBatch, createCheckSession, fetchCheckSessions, type InvPart, type InvLocation, type CheckSession } from '@/lib/api';
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

type Stage = 'kit-select' | 'camera' | 'processing' | 'confirm' | 'bag-prompt' | 'bag-verify' | 'no-match';

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
  const [pendingScan, setPendingScan] = useState<{ partNumber: string; name: string; subKit: string; mfgDate: string; inManifest: boolean } | null>(null);
  const [pendingBag, setPendingBag] = useState<{ bagId: string; kitId: string; bag: BagDefinition; entries: ManifestEntry[]; groups: BagEntryGroup[] } | null>(null);
  const [bagVerifyItems, setBagVerifyItems] = useState<BagVerifyEntry[]>([]);
  const [activeCheckSessionId, setActiveCheckSessionId] = useState<number | null>(initialCheckSessionId ?? null);
  const [existingSessions, setExistingSessions] = useState<CheckSession[]>([]);

  // Load existing check sessions for the kit-select screen
  useEffect(() => {
    fetchCheckSessions().then(setExistingSessions).catch(() => {});
  }, []);

  /** Mark part numbers as verified/missing in the active check session */
  const markChecked = useCallback(async (items: { partNumber: string; qtyFound: number; isShort?: boolean; bag?: string }[]) => {
    if (!activeCheckSessionId || items.length === 0) return;
    try { await verifyCheckBatch(activeCheckSessionId, items); }
    catch { /* non-critical — session tracking is best-effort */ }
  }, [activeCheckSessionId]);

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

  // ─── Camera ──────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
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
    } catch {
      setError('Camera access denied. Please allow camera permissions.');
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
      const label = `Mass Scan${selectedKit ? ' — ' + selectedKit.label : ''} (${items.length})`;
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
            bagId: found.bag.id,
            kitId: found.kitId,
            bag: found.bag,
            entries: found.entries,
            groups: found.groups,
          });
          setStage('bag-prompt');
          return;
        }
      }

      const detectedPN = pn?.text || bagDet?.text || '';

      if (!detectedPN) {
        setStage('no-match');
        return;
      }

      // Auto-fill from manifest
      const manifestHit = allManifestEntries.find(e => normPN(e.partNumber) === normPN(detectedPN));

      setPendingScan({
        partNumber: detectedPN,
        name: nm?.text || manifestHit?.nomenclature || '',
        subKit: manifestHit?.subKit || (detectedPN ? detectSubKit(detectedPN, vendor) : ''),
        mfgDate: dt?.text || '',
        inManifest: !!manifestHit,
      });
      setStage('confirm');
    } catch (err: any) {
      toast.error(err.message || 'OCR failed');
      setStage('camera');
    }
  }, [vendor, aircraftType, allManifestEntries]);

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

      const { part, created } = await ingestInvPart({
        partNumber: pendingScan.partNumber,
        name: pendingScan.name || manifestEntry?.nomenclature || pendingScan.partNumber,
        subKit: pendingScan.subKit || manifestEntry?.subKit || '',
        kit: selectedKit?.label || '',
        mfgDate: pendingScan.mfgDate,
        quantity: 1,
        unit: manifestEntry?.unit || 'pcs',
        ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
      });

      setItems(prev => {
        const idx = prev.findIndex(i => normPN(i.partNumber) === normPN(pendingScan.partNumber));
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], scannedQty: updated[idx].scannedQty + 1 };
          return updated;
        }
        return [...prev, {
          partNumber: pendingScan.partNumber,
          name: pendingScan.name || part.name,
          subKit: pendingScan.subKit || part.subKit,
          mfgDate: pendingScan.mfgDate,
          scannedQty: 1,
          part,
          wasCreated: created,
          expectedQty: manifestEntry?.qtyRequired ?? 0,
          locationId: selectedLocationId ?? undefined,
        }];
      });

      toast.success(`${created ? 'New' : '+'} ${pendingScan.partNumber}`);
      markChecked([{ partNumber: pendingScan.partNumber, qtyFound: 1 }]);
    } catch (err: any) {
      toast.error(err.message || 'Ingest failed');
    }

    setPendingScan(null);
    setStage('camera');
  }, [pendingScan, selectedKit, manifestEntries, allManifestEntries, markChecked, selectedLocationId]);

  // ─── Bag workflow: "No" — ingest all as not verified ──────────
  const bagSkipVerify = useCallback(async () => {
    if (!pendingBag) return;
    setStage('processing');
    let count = 0;
    try {
      for (const entry of pendingBag.entries) {
        const { part, created } = await ingestInvPart({
          partNumber: entry.partNumber,
          name: entry.nomenclature || entry.partNumber,
          subKit: entry.subKit || '',
          kit: selectedKit?.label || '',
          bag: pendingBag.bagId,
          notes: 'Bag not verified',
          quantity: entry.qtyRequired || 1,
          unit: entry.unit || 'pcs',
          ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
        });
        setItems(prev => {
          const idx = prev.findIndex(i => normPN(i.partNumber) === normPN(entry.partNumber));
          if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], scannedQty: u[idx].scannedQty + (entry.qtyRequired || 1) }; return u; }
          return [...prev, { partNumber: entry.partNumber, name: entry.nomenclature || part.name, subKit: entry.subKit || part.subKit, mfgDate: '', scannedQty: entry.qtyRequired || 1, part, wasCreated: created, expectedQty: entry.qtyRequired || 1, bag: pendingBag.bagId, locationId: selectedLocationId ?? undefined }];
        });
        count++;
      }
      toast.success(`${pendingBag.bagId}: ${count} items added (not verified)`);
      markChecked(pendingBag.entries.map(e => ({ partNumber: e.partNumber, qtyFound: e.qtyRequired || 1, bag: pendingBag.bagId })));
    } catch (err: any) { toast.error(err.message || 'Bag ingest failed'); }
    setPendingBag(null);
    setBagVerifyItems([]);
    setStage('camera');
  }, [pendingBag, selectedKit, markChecked, selectedLocationId]);

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

        // Ingest the part + stock for what we actually received
        const locExtra = selectedLocationId ? { locationId: selectedLocationId } : {};
        const { part, created } = await ingestInvPart({
          partNumber: entry.partNumber,
          name: entry.nomenclature || entry.partNumber,
          subKit: entry.subKit || '',
          kit: selectedKit?.label || '',
          bag: pendingBag.bagId,
          quantity: qty,
          unit: entry.unit || 'pcs',
          status: qty > 0 ? 'in_stock' : 'backordered',
          ...(notesArr.length > 0 ? { notes: notesArr.join(', ') } : {}),
          ...locExtra,
        });

        // If partial (received some but not all), create a backordered entry for the shortage
        if (qty > 0 && shortage > 0) {
          await ingestInvPart({
            partNumber: entry.partNumber,
            name: entry.nomenclature || entry.partNumber,
            subKit: entry.subKit || '',
            kit: selectedKit?.label || '',
            bag: pendingBag.bagId,
            quantity: shortage,
            unit: entry.unit || 'pcs',
            status: 'backordered',
            notes: `BACKORDERED — short ${shortage} of ${expected}`,
            ...locExtra,
          });
          boCount++;
        } else if (status === 'backordered') {
          boCount++;
        }

        setItems(prev => {
          const idx = prev.findIndex(i => normPN(i.partNumber) === normPN(entry.partNumber));
          if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], scannedQty: u[idx].scannedQty + qty }; return u; }
          return [...prev, { partNumber: entry.partNumber, name: entry.nomenclature || part.name, subKit: entry.subKit || part.subKit, mfgDate: '', scannedQty: qty, part, wasCreated: created, expectedQty: expected, bag: pendingBag.bagId, locationId: selectedLocationId ?? undefined }];
        });
        count++;
      }
      toast.success(`${pendingBag.bagId}: ${count} items added${boCount > 0 ? ` (${boCount} backordered)` : ''}`);
      // Mark items in check session with actual quantities
      // Items left as 'pending' (not verified) are skipped — they stay pending in the session
      // For each item, flag whether the user explicitly reduced qty below the bag's expected qty
      const checkItems = bagVerifyItems
        .filter(i => i.status !== 'pending')
        .map(i => {
          const bagExpected = i.entry.qtyRequired || 1;
          const qty = i.status === 'backordered' ? 0 : i.actualQty;
          return {
            partNumber: i.entry.partNumber,
            qtyFound: qty,
            isShort: qty < bagExpected,
            bag: pendingBag.bagId,  // match the correct bag entry in check session
          };
        });
      markChecked(checkItems);
    } catch (err: any) { toast.error(err.message || 'Bag ingest failed'); }
    setPendingBag(null);
    setBagVerifyItems([]);
    setStage('camera');
  }, [pendingBag, bagVerifyItems, selectedKit, manifestEntries, markChecked, selectedLocationId]);

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
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-2">
          <MIcon name="inventory_2" className="text-lg text-emerald-400" />
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
          <button onClick={handleClose} aria-label="Close mass ingestion" className="p-1 rounded hover:bg-white/10"><X className="w-5 h-5 text-foreground" /></button>
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
            Back — Scan without kit check
          </button>
        </div>
      )}

      {/* ─── Camera / Processing / Confirm / Bag ─── */}
      {(stage === 'camera' || stage === 'processing' || stage === 'confirm' || stage === 'no-match' || stage === 'bag-prompt' || stage === 'bag-verify') && (
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

            {stage === 'confirm' && pendingScan && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
                <div className="bg-card/95 backdrop-blur-sm rounded-xl p-5 mx-4 max-w-sm w-full space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Detected Part</p>
                  {!pendingScan.inManifest && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-600/20 border border-amber-500/30">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-300">
                        This part is <span className="font-bold">not in the manifest</span>{selectedKit ? ` for ${selectedKit.label}` : ''}. It may be misread or belong to a different kit.
                      </p>
                    </div>
                  )}
                  <input value={pendingScan.partNumber}
                    onChange={e => {
                      const pn = e.target.value;
                      const hit = allManifestEntries.find(m => normPN(m.partNumber) === normPN(pn));
                      setPendingScan({ ...pendingScan, partNumber: pn, inManifest: !!hit });
                    }}
                    className="w-full px-3 py-2 rounded bg-accent border border-border text-foreground text-lg font-mono font-bold" />
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
                  {locations.length > 0 && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <select
                        value={selectedLocationId ?? ''}
                        onChange={e => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
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
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md font-bold text-sm transition-colors ${pendingScan.inManifest ? 'bg-emerald-600 text-foreground hover:bg-emerald-500' : 'bg-amber-600 text-foreground hover:bg-amber-500'}`}>
                      <Check className="w-4 h-4" /> {pendingScan.inManifest ? 'Add' : 'Add Anyway'}
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
                        value={selectedLocationId ?? ''}
                        onChange={e => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
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
                {locations.length > 0 && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <select
                      value={selectedLocationId ?? ''}
                      onChange={e => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
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

                    return (
                      <div key={item.partNumber} className="flex items-center gap-3 px-4 py-3">
                        {/* Quantity badge */}
                        <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 text-xs font-bold ${
                          fulfilled ? 'bg-emerald-500/15 text-emerald-400' :
                          partial ? 'bg-amber-500/15 text-amber-400' :
                          'bg-accent text-foreground/80'
                        }`}>
                          <span className="text-base leading-none">{item.scannedQty}</span>
                          {hasManifest && <span className="text-[9px] opacity-60 leading-none mt-0.5">/{item.expectedQty}</span>}
                        </div>

                        {/* Part info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-bold text-foreground truncate">{item.partNumber}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.name}
                            {item.subKit && <span className="ml-1.5 text-emerald-400/60">[{item.subKit}]</span>}
                            {item.bag && <span className="ml-1.5 text-primary/60">[{item.bag}]</span>}
                            {item.mfgDate && <span className="ml-1.5 text-muted-foreground/60">{item.mfgDate}</span>}
                          </p>
                          {/* Per-item location */}
                          {locations.length > 0 && (
                            <select
                              value={item.locationId ?? ''}
                              onChange={e => {
                                const newLocId = e.target.value ? Number(e.target.value) : undefined;
                                setItems(prev => prev.map(i => i.partNumber === item.partNumber ? { ...i, locationId: newLocId } : i));
                              }}
                              onClick={e => e.stopPropagation()}
                              className="mt-1 px-1.5 py-0.5 rounded bg-accent/50 border border-border/50 text-[10px] text-muted-foreground focus:outline-none focus:border-emerald-500/50 max-w-[180px]"
                            >
                              <option value="">Incoming</option>
                              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          )}
                        </div>

                        {/* Status indicator */}
                        <div className="shrink-0">
                          {fulfilled && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                          {partial && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                          {item.wasCreated && !hasManifest && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold uppercase">new</span>
                          )}
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
