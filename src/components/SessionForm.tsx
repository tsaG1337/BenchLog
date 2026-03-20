import { useRef, useState } from 'react';
import { useSections } from '@/contexts/SectionsContext';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { uploadImages } from '@/lib/api';
import { toast } from 'sonner';

interface SessionFormProps {
  section: string;
  onSectionChange: (s: string) => void;
  plansPage: string;
  onPlansPageChange: (v: string) => void;
  plansSection: string;
  onPlansSectionChange: (v: string) => void;
  plansStep: string;
  onPlansStepChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  pendingImageUrls: string[];
  onPendingImageUrlsChange: (urls: string[]) => void;
  activeSessionId?: string;
  demoMode?: boolean;
}

export function SessionForm({
  section, onSectionChange,
  plansPage, onPlansPageChange,
  plansSection, onPlansSectionChange,
  plansStep, onPlansStepChange,
  notes, onNotesChange,
  pendingImageUrls, onPendingImageUrlsChange,
  activeSessionId,
  demoMode,
}: SessionFormProps) {
  const { sections } = useSections();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const sid = activeSessionId || 'pending';
      const newUrls = await uploadImages(sid, files);
      onPendingImageUrlsChange([...pendingImageUrls, ...newUrls]);
      toast.success(`${newUrls.length} photo(s) added`);
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = (url: string) => {
    onPendingImageUrlsChange(pendingImageUrls.filter(u => u !== url));
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm text-muted-foreground mb-3 block">Assembly Section</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => onSectionChange(s.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-all border ${
                section === s.id
                  ? 'bg-primary/15 border-primary text-primary'
                  : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/50'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm text-muted-foreground mb-3 block">Plans Reference</Label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Section</Label>
            <Input
              placeholder="e.g. 5"
              value={plansSection}
              onChange={(e) => onPlansSectionChange(e.target.value)}
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Page</Label>
            <Input
              placeholder="e.g. 8"
              value={plansPage}
              onChange={(e) => onPlansPageChange(e.target.value)}
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Step</Label>
            <Input
              placeholder="e.g. 3"
              value={plansStep}
              onChange={(e) => onPlansStepChange(e.target.value)}
              className="bg-secondary border-border font-mono"
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-sm text-muted-foreground mb-2 block">Session Notes</Label>
        <Textarea
          placeholder="What did you work on? Any issues, rivets drilled, parts clecoed..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="bg-secondary border-border min-h-[80px]"
        />
      </div>

      {!demoMode && <div>
        <Label className="text-sm text-muted-foreground mb-2 block">Photos</Label>
        {pendingImageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {pendingImageUrls.map((url) => (
              <div key={url} className="relative group">
                <img
                  src={url}
                  alt="Session photo"
                  className="w-16 h-16 rounded-md object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setPreviewUrl(url)}
                />
                <button
                  onClick={() => handleRemove(url)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          {uploading ? 'Uploading…' : 'Add Photos'}
        </Button>

        {previewUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setPreviewUrl(null)}
          >
            <img
              src={previewUrl}
              alt="Preview"
              className="max-w-full max-h-[90vh] rounded-lg object-contain"
            />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-card/80 rounded-full flex items-center justify-center text-foreground hover:bg-card transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>}
    </div>
  );
}
