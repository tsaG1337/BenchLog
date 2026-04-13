import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Check, Loader2, RotateCcw } from 'lucide-react';
import { MIcon } from '@/components/AppShell';
import { runOcr } from '@/lib/api';
import { getVendorConfig, detectSubKit } from '@/lib/ocrVendors';

export interface ScanResult {
  partNumber: string;
  name: string;
  date: string;
  mfgDate: string;
  subKit: string;
  raw: string;
}

// ─── Detection ───────────────────────────────────────────────────────

const DATE_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
const JUNK_RE = /^[\s|I1l\[\]!}{)(=©—\-_.,:;'"\\]+$/;
const FALSE_PN_RE = /^IMG\d+$/i;
const NOISE_WORDS = new Set(['BAG', 'BOX', 'PKG', 'QTY', 'LOT', 'P/N', 'PN', 'DATE', 'MFG', 'EXP', 'PCS', 'EA', 'EACH', 'LB', 'OZ', 'IN', 'FT']);

type DetectionType = 'partNumber' | 'date' | 'name' | 'barcode';

interface DetectedRegion {
  type: DetectionType;
  text: string;
  bbox: number[][];
  confidence: number;
}

const DETECTION_COLORS: Record<DetectionType, string> = {
  barcode: '#f59e0b',
  partNumber: '#22c55e',
  date: '#3b82f6',
  name: '#a855f7',
};

const DETECTION_LABELS: Record<DetectionType, string> = {
  barcode: 'Barcode',
  partNumber: 'Part Number',
  date: 'Date',
  name: 'Description',
};

function classifyLine(text: string, patterns: RegExp[]): { type: DetectionType; extracted: string } | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return null;
  if (JUNK_RE.test(trimmed)) return null;

  // Detect bag labels before noise word filtering strips "BAG"
  const bagMatch = trimmed.match(/^BAG\s+(.+)/i);
  if (bagMatch) return { type: 'partNumber', extracted: `BAG ${bagMatch[1].trim().toUpperCase()}` };

  const dateMatch = trimmed.match(DATE_RE);
  if (dateMatch) return { type: 'date', extracted: dateMatch[1] };

  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m && !FALSE_PN_RE.test(m[1])) return { type: 'partNumber', extracted: m[1].toUpperCase() };
  }

  const letterRatio = (trimmed.match(/[a-zA-Z]/g)?.length || 0) / trimmed.length;
  if (letterRatio > 0.5 && trimmed.length > 3) {
    let clean = trimmed;
    for (const n of NOISE_WORDS) {
      clean = clean.replace(new RegExp(`^${n}\\b\\s*`, 'i'), '');
    }
    clean = clean.trim();
    if (clean.length > 2 && !NOISE_WORDS.has(clean.toUpperCase())) {
      return { type: 'name', extracted: clean };
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Crop fraction: center 40% of image height
const CROP_TOP = 0.3;
const CROP_BOTTOM = 0.7;

interface LabelScannerProps {
  onResult: (result: ScanResult) => void;
  onClose: () => void;
  vendorId?: string;
}

export function LabelScanner({ onResult, onClose, vendorId = 'vans' }: LabelScannerProps) {
  const vendor = useMemo(() => getVendorConfig(vendorId), [vendorId]);
  const [stage, setStage] = useState<'camera' | 'processing' | 'result'>('camera');
  const [detections, setDetections] = useState<DetectedRegion[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // ─── Camera lifecycle ─────────────────────────────────────────
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
    } catch (err: any) {
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

  // Start camera on mount, stop on unmount
  useEffect(() => {
    if (stage === 'camera') startCamera();
    return () => stopCamera();
  }, []);

  // ─── Draw detection frame on live video ───────────────────────
  useEffect(() => {
    if (stage !== 'camera' || !cameraReady) return;

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

      // Video covers the container (object-cover) — compute visible area
      const videoAR = vw / vh;
      const containerAR = rect.width / rect.height;
      let renderH: number, offY: number;
      if (videoAR > containerAR) {
        renderH = rect.height;
        offY = 0;
      } else {
        renderH = rect.width / videoAR;
        offY = (rect.height - renderH) / 2;
      }

      const y1 = offY + renderH * CROP_TOP;
      const y2 = offY + renderH * CROP_BOTTOM;

      // Dim outside
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, y1);
      ctx.fillRect(0, y2, canvas.width, canvas.height - y2);

      // Detection frame with rounded corners
      const frameX = 12;
      const frameW = canvas.width - 24;
      const frameH = y2 - y1;
      const r = 8;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(frameX, y1, frameW, frameH, r);
      ctx.stroke();

      // Corner accents (brighter, thicker)
      const accentLen = 20;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      // Top-left
      ctx.beginPath();
      ctx.moveTo(frameX, y1 + accentLen); ctx.lineTo(frameX, y1 + r); ctx.arcTo(frameX, y1, frameX + r, y1, r); ctx.lineTo(frameX + accentLen, y1);
      ctx.stroke();
      // Top-right
      ctx.beginPath();
      ctx.moveTo(frameX + frameW - accentLen, y1); ctx.lineTo(frameX + frameW - r, y1); ctx.arcTo(frameX + frameW, y1, frameX + frameW, y1 + r, r); ctx.lineTo(frameX + frameW, y1 + accentLen);
      ctx.stroke();
      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(frameX, y2 - accentLen); ctx.lineTo(frameX, y2 - r); ctx.arcTo(frameX, y2, frameX + r, y2, r); ctx.lineTo(frameX + accentLen, y2);
      ctx.stroke();
      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(frameX + frameW - accentLen, y2); ctx.lineTo(frameX + frameW - r, y2); ctx.arcTo(frameX + frameW, y2, frameX + frameW, y2 - r, r); ctx.lineTo(frameX + frameW, y2 - accentLen);
      ctx.stroke();

      // Label
      ctx.font = 'bold 11px system-ui, sans-serif';
      const label = 'Align label here';
      const tw = ctx.measureText(label).width;
      const lx = (canvas.width - tw - 10) / 2;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.85)';
      ctx.beginPath();
      ctx.roundRect(lx, y1 - 24, tw + 10, 20, [4, 4, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, lx + 5, y1 - 8);

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [stage, cameraReady]);

  // ─── Capture frame from video ─────────────────────────────────
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    // Stop camera immediately for responsiveness
    stopCamera();

    canvas.toBlob((blob) => {
      if (!blob) { setError('Failed to capture frame'); return; }
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      processImage(file, canvas.width, canvas.height);
    }, 'image/jpeg', 0.92);
  }, [stopCamera, processImage]);

  // ─── Crop + OCR ───────────────────────────────────────────────
  const cropToLabel = useCallback((img: HTMLImageElement | HTMLCanvasElement, w: number, h: number): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const cropY = Math.round(h * CROP_TOP);
      const cropHeight = Math.round(h * (CROP_BOTTOM - CROP_TOP));

      canvas.width = w;
      canvas.height = cropHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, cropY, w, cropHeight, 0, 0, w, cropHeight);

      canvas.toBlob((blob) => {
        resolve(new File([blob!], 'cropped.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.92);
    });
  }, []);

  const processImage = useCallback(async (file: File, knownW?: number, knownH?: number) => {
    setStage('processing');
    setError('');

    const url = URL.createObjectURL(file);
    setImageUrl(url);

    try {
      let imgW = knownW || 0;
      let imgH = knownH || 0;

      // If dimensions not known (e.g. from file picker fallback), load the image
      let imgEl: HTMLImageElement | null = null;
      if (!imgW || !imgH) {
        imgEl = new Image();
        await new Promise<void>((resolve, reject) => {
          imgEl!.onload = () => resolve();
          imgEl!.onerror = () => reject(new Error('Failed to load image'));
          imgEl!.src = url;
        });
        imgW = imgEl.naturalWidth;
        imgH = imgEl.naturalHeight;
      }

      // Crop to label region
      const cropHeight = Math.round(imgH * (CROP_BOTTOM - CROP_TOP));
      imgDimsRef.current = { w: imgW, h: cropHeight };

      // We need an image/canvas source for cropping
      let cropSource: HTMLImageElement | HTMLCanvasElement;
      if (imgEl) {
        cropSource = imgEl;
      } else {
        // Recreate from file for cropping
        const tmpImg = new Image();
        await new Promise<void>((resolve, reject) => {
          tmpImg.onload = () => resolve();
          tmpImg.onerror = () => reject(new Error('Failed to load image'));
          tmpImg.src = url;
        });
        cropSource = tmpImg;
      }

      const croppedFile = await cropToLabel(cropSource, imgW, imgH);
      setCroppedUrl(URL.createObjectURL(croppedFile));

      // Send cropped image to server → OCR service
      const ocrResult = await runOcr(croppedFile);

      // Classify each detected line — only keep near-horizontal text (±15°)
      const allDets: DetectedRegion[] = [];
      for (const line of ocrResult.lines) {
        const [[x1, y1], [x2, y2]] = line.bbox;
        const angle = Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
        if (angle > 15 && angle < 165) continue;

        const cls = classifyLine(line.text, vendor.partNumberPatterns);
        if (cls) {
          allDets.push({
            type: cls.type,
            text: cls.extracted,
            bbox: line.bbox,
            confidence: line.confidence,
          });
        }
      }

      // Add barcode detections (convert [left,top,w,h] → 4-point bbox)
      for (const bc of ocrResult.barcodes || []) {
        const [left, top, w, h] = bc.bbox;
        allDets.push({
          type: 'barcode',
          text: bc.data,
          bbox: [[left, top], [left + w, top], [left + w, top + h], [left, top + h]],
          confidence: 1.0,
        });
      }

      // Pick best per type
      const bestPerType = new Map<DetectionType, DetectedRegion>();
      for (const det of allDets) {
        const existing = bestPerType.get(det.type);
        if (det.type === 'name') {
          if (!existing || det.text.length > existing.text.length) bestPerType.set(det.type, det);
        } else {
          if (!existing || det.confidence > existing.confidence) bestPerType.set(det.type, det);
        }
      }

      const topDets = Array.from(bestPerType.values());
      setDetections(topDets);

      const bc = topDets.find(d => d.type === 'barcode');
      const pn = topDets.find(d => d.type === 'partNumber');
      const dt = topDets.find(d => d.type === 'date');
      const nm = topDets.filter(d => d.type === 'name').sort((a, b) => b.text.length - a.text.length)[0];

      const detectedPN = bc?.text || pn?.text || '';
      setResult({
        partNumber: detectedPN,
        date: dt?.text || '',
        mfgDate: dt?.text || '',
        name: nm?.text || '',
        subKit: detectedPN ? detectSubKit(detectedPN, vendor) : '',
        raw: ocrResult.full_text,
      });
      setStage('result');
    } catch (err: any) {
      setError(err.message || 'OCR failed');
      setStage('camera');
      startCamera();
    }
  }, [vendor, cropToLabel, startCamera]);

  // ─── Draw overlay on result image ──────────────────────────────
  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || detections.length === 0) return;

    const container = overlay.parentElement;
    const img = container?.querySelector('img');
    if (!img) return;

    const imgRect = img.getBoundingClientRect();
    const containerRect = container!.getBoundingClientRect();
    overlay.width = containerRect.width;
    overlay.height = containerRect.height;

    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Image is already cropped — map detection coords directly
    const offsetX = (containerRect.width - imgRect.width) / 2;
    const offsetY = (containerRect.height - imgRect.height) / 2;
    const sx = imgRect.width / imgDimsRef.current.w;
    const sy = imgRect.height / imgDimsRef.current.h;

    for (const det of detections) {
      const color = DETECTION_COLORS[det.type];
      const pts = det.bbox;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(offsetX + pts[0][0] * sx, offsetY + pts[0][1] * sy);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(offsetX + pts[i][0] * sx, offsetY + pts[i][1] * sy);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = color + '20';
      ctx.fill();

      const label = DETECTION_LABELS[det.type];
      ctx.font = 'bold 12px system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const lx = offsetX + pts[0][0] * sx;
      const ly = offsetY + pts[0][1] * sy;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(lx, ly - 20, tw + 10, 18, [3, 3, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, lx + 5, ly - 6);
    }
  }, [detections]);

  // ─── Retry: go back to camera ─────────────────────────────────
  const handleRetry = useCallback(() => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (croppedUrl) URL.revokeObjectURL(croppedUrl);
    setImageUrl(null);
    setCroppedUrl(null);
    setResult(null);
    setDetections([]);
    setError('');
    setStage('camera');
    startCamera();
  }, [imageUrl, croppedUrl, startCamera]);

  // Revoke blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (croppedUrl) URL.revokeObjectURL(croppedUrl);
    };
  }, [imageUrl, croppedUrl]);

  const handleAccept = () => {
    if (result) onResult(result);
    stopCamera();
    onClose();
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-2">
          <MIcon name="document_scanner" className="text-lg text-primary" />
          <span className="font-label text-sm font-bold uppercase tracking-wider text-white">Scan Label</span>
        </div>
        <button onClick={handleClose} aria-label="Close label scanner" className="p-1 rounded hover:bg-white/10"><X className="w-5 h-5 text-white" /></button>
      </div>

      {/* ─── Camera stage ─── */}
      {stage === 'camera' && (
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Video feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Detection frame overlay */}
          <canvas ref={frameCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />

          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60 p-6">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}

          {/* Capture button */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center pb-8 pt-4 bg-gradient-to-t from-black/60 to-transparent">
            <button
              onClick={captureFrame}
              disabled={!cameraReady}
              className="w-16 h-16 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm hover:bg-white/40 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center"
            >
              <div className="w-12 h-12 rounded-full bg-white" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Processing stage ─── */}
      {stage === 'processing' && (
        <div className="flex-1 flex flex-col">
          {imageUrl && (
            <div className="flex-1 relative bg-black">
              <img src={imageUrl} alt="Captured" className="w-full h-full object-contain" />
            </div>
          )}
          <div className="flex items-center justify-center gap-3 p-4 bg-card">
            <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
            <p className="text-sm font-medium">Analyzing label...</p>
          </div>
        </div>
      )}

      {/* ─── Result stage ─── */}
      {stage === 'result' && result && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {croppedUrl && (
            <div className="relative bg-black shrink-0">
              <img
                src={croppedUrl}
                alt="Captured"
                className="w-full object-contain max-h-[30vh]"
                onLoad={drawOverlay}
              />
              <canvas ref={overlayRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
            </div>
          )}

          <div className="flex-1 overflow-y-auto bg-card rounded-t-xl -mt-3 relative z-10">
            <div className="px-4 pt-5 pb-4 space-y-3">
              <div>
                <label className="font-label text-[10px] uppercase text-muted-foreground flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: detections.some(d => d.type === 'barcode') ? DETECTION_COLORS.barcode : DETECTION_COLORS.partNumber }} />
                  Part Number{detections.some(d => d.type === 'barcode') ? ' (from barcode)' : ''}
                </label>
                <input
                  value={result.partNumber}
                  onChange={e => setResult({ ...result, partNumber: e.target.value })}
                  className="w-full px-2.5 py-2 rounded bg-muted/50 border border-border text-sm font-mono mt-1"
                  placeholder="e.g. AS3-032X4X5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label text-[10px] uppercase text-muted-foreground flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: DETECTION_COLORS.date }} />
                    Date
                  </label>
                  <input
                    value={result.date}
                    onChange={e => setResult({ ...result, date: e.target.value })}
                    className="w-full px-2.5 py-2 rounded bg-muted/50 border border-border text-sm font-mono mt-1"
                    placeholder="MM/DD/YYYY"
                  />
                </div>
                <div>
                  <label className="font-label text-[10px] uppercase text-muted-foreground flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: DETECTION_COLORS.name }} />
                    Description
                  </label>
                  <input
                    value={result.name}
                    onChange={e => setResult({ ...result, name: e.target.value })}
                    className="w-full px-2.5 py-2 rounded bg-muted/50 border border-border text-sm mt-1"
                    placeholder="Part name"
                  />
                </div>
              </div>

              <details className="text-[10px]">
                <summary className="text-muted-foreground/50 cursor-pointer hover:text-muted-foreground">Raw OCR output</summary>
                <pre className="mt-1 p-2 rounded bg-muted/30 text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto font-mono">{result.raw}</pre>
              </details>

              <div className="flex gap-2 justify-end pt-1">
                <button onClick={handleRetry}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">
                  <RotateCcw className="w-4 h-4" /> Retake
                </button>
                <button onClick={handleAccept}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-label text-xs font-bold uppercase tracking-wider hover:opacity-90">
                  <Check className="w-4 h-4" /> Use Results
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
