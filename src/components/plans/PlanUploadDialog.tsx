/**
 * Plans Library — bulk upload dialog.
 *
 * Two states:
 *   1. File picker — drop zone + native picker. Shows a preview table with
 *      the active aircraft's filename parser's prediction per file.
 *   2. Uploading — progress count. Server upload runs in batches so a
 *      single failing file doesn't doom the whole batch.
 *
 * After upload the parent receives the canonical PlanFile rows and runs
 * its own classifier pass (see PlansPage.handleUploaded) — the server
 * just stores files; classification lives in the client where the
 * aircraft taxonomy is loaded.
 */
import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MIcon } from '@/components/AppShell';
import { toast } from 'sonner';
import { uploadPlans, type PlanFile } from '@/lib/api';
import { parsePlanFilename, getPlanSection } from '@/lib/aircraft';

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: (uploaded: PlanFile[]) => void;
  aircraftSlug: string;
  /** Plan files already on the server. Used to flag duplicate uploads
   *  by comparing the dropped File's name (case-insensitive) against
   *  each existing PlanFile's originalName. */
  existingFiles: PlanFile[];
}

interface Preview {
  file: File;
  recognized: boolean;
  sectionId: string;
  sectionTitle: string;
  /** True if a file with the same name (case-insensitive) is already in
   *  the library. Duplicates stay visible in the preview so the user sees
   *  which ones are skipped, but are excluded from the upload payload. */
  duplicate: boolean;
}

export function PlanUploadDialog({ open, onClose, onUploaded, aircraftSlug, existingFiles }: Props) {
  const [selected, setSelected] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // Set of lowercased filenames already on the server. Rebuilt only when
  // the existingFiles list reference changes — typical case is once on
  // dialog open and again after a successful upload.
  const existingNames = useMemo(
    () => new Set(existingFiles.map(f => f.originalName.toLowerCase())),
    [existingFiles],
  );

  const previews = useMemo<Preview[]>(() => {
    return selected.map(file => {
      const parsed = parsePlanFilename(aircraftSlug, file.name);
      const section = parsed ? getPlanSection(aircraftSlug, parsed.sectionId) : undefined;
      return {
        file,
        recognized: !!section,
        sectionId: section?.id || parsed?.sectionId || '?',
        sectionTitle: section?.title || '— manual assignment needed',
        duplicate: existingNames.has(file.name.toLowerCase()),
      };
    });
  }, [selected, aircraftSlug, existingNames]);

  const recognizedCount = previews.filter(p => p.recognized && !p.duplicate).length;
  const duplicateCount  = previews.filter(p => p.duplicate).length;
  const uploadCount     = previews.length - duplicateCount;

  const reset = useCallback(() => {
    setSelected([]);
    setUploading(false);
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) return;
    reset();
    onClose();
  }, [uploading, reset, onClose]);

  const onPick = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const pdfs = Array.from(fileList).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) {
      toast.error('No PDFs in selection — only .pdf files are supported.');
      return;
    }
    setSelected(prev => {
      const seen = new Set(prev.map(f => `${f.name}:${f.size}`));
      const dedup = pdfs.filter(f => !seen.has(`${f.name}:${f.size}`));
      return [...prev, ...dedup];
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    onPick(e.dataTransfer.files);
  }, [onPick]);

  const onUpload = useCallback(async () => {
    // Skip duplicates — they're already on the server. Re-uploading would
    // create a second copy under a fresh UUID (server doesn't dedupe), so
    // filter here on the client side.
    const toUpload = previews.filter(p => !p.duplicate).map(p => p.file);
    if (toUpload.length === 0) return;
    setUploading(true);
    try {
      // Batch in chunks of 10 to stay below typical reverse-proxy timeouts
      // on slower connections — 50 × 5 MB at once would push 250 MB.
      const all: PlanFile[] = [];
      for (let i = 0; i < toUpload.length; i += 10) {
        const batch = toUpload.slice(i, i + 10);
        const { uploaded } = await uploadPlans(batch);
        all.push(...uploaded);
      }
      onUploaded(all);
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
      setUploading(false);
    }
  }, [previews, onUploaded, onClose, reset]);

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload plan PDFs</DialogTitle>
        </DialogHeader>

        {selected.length === 0 ? (
          <DropZone onDrop={onDrop} onPick={onPick} />
        ) : (
          <>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                {recognizedCount} of {uploadCount} recognized automatically.
                {recognizedCount < uploadCount && (
                  <span> The rest will land in <span className="font-semibold text-amber-500">Needs assignment</span> for one-click classification after upload.</span>
                )}
              </div>
              {duplicateCount > 0 && (
                <div>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {duplicateCount} already in your library
                  </span>
                  {' '}— skipped to avoid duplicates. Remove from the list or delete the existing copy first if you meant to re-upload.
                </div>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto border border-border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Filename</th>
                    <th className="text-left px-2 py-1.5 font-medium w-24">Section</th>
                    <th className="text-left px-2 py-1.5 font-medium">Title</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {previews.map((p, idx) => (
                    <tr
                      key={`${p.file.name}-${idx}`}
                      className={`border-t border-border ${p.duplicate ? 'bg-amber-500/5 text-muted-foreground' : ''}`}
                    >
                      <td className="px-2 py-1 truncate max-w-xs" title={p.file.name}>
                        {p.duplicate && (
                          <span className="inline-block mr-1.5 px-1 py-px text-[9px] font-semibold uppercase tracking-wider rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            Already uploaded
                          </span>
                        )}
                        {p.file.name}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {p.duplicate
                          ? <span className="text-muted-foreground">—</span>
                          : p.recognized
                            ? <span className="text-emerald-600 dark:text-emerald-400">{p.sectionId}</span>
                            : <span className="text-amber-500">?</span>}
                      </td>
                      <td className="px-2 py-1 truncate text-muted-foreground" title={p.sectionTitle}>
                        {p.duplicate ? 'skipped on upload' : p.sectionTitle}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          onClick={() => setSelected(s => s.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remove"
                          disabled={uploading}
                        >
                          <MIcon name="close" className="text-sm" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <label className="text-xs text-primary cursor-pointer hover:underline">
                + Add more files
                <input type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={e => onPick(e.target.files)} />
              </label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose} disabled={uploading}>Cancel</Button>
                <Button size="sm" onClick={onUpload} disabled={uploading || uploadCount === 0}>
                  {uploading
                    ? 'Uploading…'
                    : uploadCount === 0
                      ? 'Nothing to upload'
                      : `Upload ${uploadCount} file${uploadCount === 1 ? '' : 's'}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DropZone({ onDrop, onPick }: { onDrop: (e: React.DragEvent) => void; onPick: (files: FileList | null) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onDrop={e => { setHover(false); onDrop(e); }}
      onDragOver={e => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      className={`block border-2 border-dashed rounded-md p-10 text-center cursor-pointer transition ${
        hover ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
      }`}
    >
      <MIcon name="upload_file" className="text-5xl text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">Drop PDFs here or click to pick</p>
      <p className="text-xs text-muted-foreground mt-1">
        Up to 50 files at once. Filenames like <span className="font-mono">18_10.pdf</span> or <span className="font-mono">OP-38 RV-10 Elec Ail.pdf</span> are auto-classified.
      </p>
      <input
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={e => onPick(e.target.files)}
      />
    </label>
  );
}
