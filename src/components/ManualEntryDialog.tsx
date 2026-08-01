import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, ImagePlus, X, Loader2 } from 'lucide-react';
import { uploadImages, deleteImage } from '@/lib/api';
import { WorkPackagePicker } from '@/components/WorkPackagePicker';
import { toast } from 'sonner';

// Local date <-> `<input type="datetime-local">` string conversion. Kept
// local rather than shared — SessionHistory.tsx's edit form (the "other
// format" this dialog now matches) and SessionBlogEditor.tsx each keep
// their own copy too; it's a 4-line pure function, not worth a shared util.
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ManualEntryDialogProps {
  onAdd: (session: {
    section: string;
    startTime: Date;
    endTime: Date;
    notes: string;
    plansPage: string;
    plansSection: string;
    plansStep: string;
    imageUrls: string[];
  }) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ManualEntryDialog({ onAdd, open: controlledOpen, onOpenChange: controlledOnOpenChange }: ManualEntryDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [section, setSection] = useState('');
  // Both default to "now" — same starting point the edit form would show
  // for a fresh session, and it gives an immediate (zero) duration readout
  // instead of blank fields with no feedback until both are filled in.
  const [startTime, setStartTime] = useState(() => toDatetimeLocal(new Date()));
  const [endTime, setEndTime] = useState(() => toDatetimeLocal(new Date()));
  const [notes, setNotes] = useState('');
  const [plansPage, setPlansPage] = useState('');
  const [plansSection, setPlansSection] = useState('');
  const [plansStep, setPlansStep] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Stable temp ID for uploads before the session is saved
  const tempId = useRef(`manual-${Date.now()}`);

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_SIZE) { toast.error(`"${f.name}" exceeds 25 MB limit`); return; }
    }
    setUploading(true);
    try {
      const newUrls = await uploadImages(tempId.current, files);
      setImageUrls(prev => [...prev, ...newUrls]);
      toast.success(`${newUrls.length} photo(s) added`);
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemoveImage = async (url: string) => {
    try { await deleteImage(url); } catch {}
    setImageUrls(prev => prev.filter(u => u !== url));
  };

  const handleSubmit = () => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!startTime || !endTime || end.getTime() <= start.getTime()) {
      toast.error('End time must be after start time');
      return;
    }

    onAdd({ section: section || 'other', startTime: start, endTime: end, notes, plansPage, plansSection, plansStep, imageUrls });
    setOpen(false);
    const now = toDatetimeLocal(new Date());
    setStartTime(now);
    setEndTime(now);
    setNotes('');
    setPlansPage('');
    setPlansSection('');
    setPlansStep('');
    setImageUrls([]);
    tempId.current = `manual-${Date.now()}`;
  };

  // null while unset; negative once end is before start (invalid, but not
  // worth flagging until the fields actually disagree — the default state
  // has start === end, i.e. 0, which is a normal "not filled in yet" value,
  // not an error).
  const durationMins = startTime && endTime
    ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
    : null;
  const durationLabel = durationMins !== null && durationMins >= 0
    ? (() => {
        const h = Math.floor(durationMins / 60);
        const m = Math.round(durationMins % 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      })()
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Add Entry
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add Manual Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <WorkPackagePicker
            section={section}
            onSectionChange={setSection}
            plansSection={plansSection}
            onPlansSectionChange={setPlansSection}
            compact
          />

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Timing</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Start</Label>
                <Input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="bg-accent border-border font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground/70 mb-1 block">End</Label>
                <Input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="bg-accent border-border font-mono"
                />
              </div>
            </div>
            {durationLabel ? (
              <p className="text-xs text-muted-foreground/60 mt-1">Duration: {durationLabel}</p>
            ) : durationMins !== null && durationMins < 0 ? (
              <p className="text-xs text-destructive mt-1">End time must be after start time</p>
            ) : null}
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Plans Reference</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Page</Label>
                <Input placeholder="e.g. 8" value={plansPage} onChange={(e) => setPlansPage(e.target.value)} className="bg-accent border-border font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Step</Label>
                <Input placeholder="e.g. 3" value={plansStep} onChange={(e) => setPlansStep(e.target.value)} className="bg-accent border-border font-mono" />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Notes</Label>
            <Textarea placeholder="What did you work on?" value={notes} maxLength={10000} onChange={(e) => setNotes(e.target.value)} className="bg-accent border-border min-h-[60px]" />
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Photos</Label>
            {imageUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {imageUrls.map((url) => (
                  <div key={url} className="relative group">
                    <img
                      src={url}
                      alt="Session photo"
                      className="w-16 h-16 rounded-md object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setPreviewUrl(url)}
                    />
                    <button
                      onClick={() => handleRemoveImage(url)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Add Photos'}
            </Button>
          </div>

          <Button onClick={handleSubmit} className="w-full">Add Session</Button>

          {previewUrl && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
              <img src={previewUrl} alt="Preview" className="max-w-full max-h-[90vh] rounded-lg object-contain" />
              <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 w-10 h-10 bg-card/80 rounded-full flex items-center justify-center text-foreground hover:bg-card transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
