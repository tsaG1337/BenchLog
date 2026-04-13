import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, CalendarIcon, ImagePlus, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { uploadImages, deleteImage } from '@/lib/api';
import { WorkPackagePicker } from '@/components/WorkPackagePicker';
import { toast } from 'sonner';

interface ManualEntryDialogProps {
  onAdd: (session: {
    section: string;
    date: Date;
    hours: number;
    minutes: number;
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
  const [date, setDate] = useState<Date>(new Date());
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
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
    const h = Math.max(0, parseInt(hours) || 0);
    const m = Math.max(0, parseInt(minutes) || 0);
    if (h === 0 && m === 0) return;

    onAdd({ section: section || 'other', date, hours: h, minutes: m, notes, plansPage, plansSection, plansStep, imageUrls });
    setOpen(false);
    setHours('');
    setMinutes('');
    setNotes('');
    setPlansPage('');
    setPlansSection('');
    setPlansStep('');
    setImageUrls([]);
    tempId.current = `manual-${Date.now()}`;
  };

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
            <Label className="text-sm text-muted-foreground mb-2 block">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Duration</Label>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Hours</Label>
                <Input type="number" min="0" max="999" placeholder="0" value={hours} onChange={(e) => setHours(e.target.value)} className="bg-accent border-border font-mono" />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Minutes</Label>
                <Input type="number" min="0" max="59" placeholder="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="bg-accent border-border font-mono" />
              </div>
            </div>
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
