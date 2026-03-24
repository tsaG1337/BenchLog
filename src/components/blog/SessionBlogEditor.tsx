import { useState } from 'react';
import { BlogPost, updateSessionApi } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SessionImages } from '@/components/SessionImages';

interface SessionBlogEditorProps {
  post: BlogPost; // source === 'session'
  onSave: () => void;
  onCancel: () => void;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parsePlansRef(ref?: string) {
  return {
    page: ref?.match(/Page\s+(\S+)/)?.[1] || '',
    section: ref?.match(/Section\s+(\S+)/)?.[1] || '',
    step: ref?.match(/Step\s+(\S+)/)?.[1] || '',
  };
}

function buildPlansRef(page: string, section: string, step: string): string | undefined {
  const p = page.trim().replace(/,+$/, '');
  const s = section.trim().replace(/,+$/, '');
  const st = step.trim().replace(/,+$/, '');
  return [p && `Page ${p}`, s && `Section ${s}`, st && `Step ${st}`].filter(Boolean).join(', ') || undefined;
}

export function SessionBlogEditor({ post, onSave, onCancel }: SessionBlogEditorProps) {
  const { sections } = useSections();

  // Real session ID: strip the 'session-' prefix added by the server
  const sessionId = post.id.replace(/^session-/, '');

  const parsedPlans = parsePlansRef(post.plansReference);
  const [editSection, setEditSection] = useState(post.section || '');
  const [notes, setNotes] = useState(post.content || '');
  const [editPage, setEditPage] = useState(parsedPlans.page);
  const [editPlanSection, setEditPlanSection] = useState(parsedPlans.section);
  const [editStep, setEditStep] = useState(parsedPlans.step);
  const [startTime, setStartTime] = useState(toDatetimeLocal(post.publishedAt));
  const [endTime, setEndTime] = useState(() => {
    if (post.durationMinutes) {
      const end = new Date(new Date(post.publishedAt).getTime() + post.durationMinutes * 60000);
      return toDatetimeLocal(end.toISOString());
    }
    return toDatetimeLocal(post.publishedAt);
  });
  const [saving, setSaving] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>(post.imageUrls || []);

  const durationMins = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000;
  const durationValid = durationMins >= 0;

  const handleSave = async () => {
    if (!durationValid) {
      toast.error('End time must be after start time');
      return;
    }
    setSaving(true);
    try {
      const newStart = new Date(startTime);
      const newEnd = new Date(endTime);
      await updateSessionApi(sessionId, {
        section: editSection || undefined,
        notes,
        plansReference: buildPlansRef(editPage, editPlanSection, editStep),
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        durationMinutes: durationMins,
        imageUrls,
      });
      toast.success('Session updated');
      onSave();
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const formatDuration = () => {
    const h = Math.floor(durationMins / 60);
    const m = Math.round(durationMins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-bold text-foreground flex-1">Edit Work Session</h2>
        <Button onClick={handleSave} disabled={saving || !durationValid} size="sm" className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </div>

      {/* Section */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Section</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setEditSection(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${
                editSection === s.id
                  ? 'bg-primary/15 border-primary text-primary'
                  : 'bg-secondary border-border text-muted-foreground hover:border-muted-foreground/50'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Timing */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Timing</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Start</Label>
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="bg-secondary border-border font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">End</Label>
            <Input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="bg-secondary border-border font-mono text-xs"
            />
          </div>
        </div>
        {durationValid
          ? <p className="text-xs text-muted-foreground/60 mt-1">Duration: {formatDuration()}</p>
          : <p className="text-xs text-destructive mt-1">End time is before start time</p>
        }
      </div>

      {/* Plans reference */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Plans Reference</Label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Section</Label>
            <Input value={editPlanSection} onChange={(e) => setEditPlanSection(e.target.value)} placeholder="e.g. 5" className="bg-secondary border-border font-mono h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Page</Label>
            <Input value={editPage} onChange={(e) => setEditPage(e.target.value)} placeholder="e.g. 8" className="bg-secondary border-border font-mono h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Step</Label>
            <Input value={editStep} onChange={(e) => setEditStep(e.target.value)} placeholder="e.g. 3" className="bg-secondary border-border font-mono h-8 text-xs" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-secondary border-border min-h-[80px] text-sm"
          placeholder="Session notes..."
        />
      </div>

      {/* Images */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Photos</Label>
        <SessionImages
          sessionId={sessionId}
          imageUrls={imageUrls}
          onImagesChange={setImageUrls}
          editable={true}
        />
      </div>
    </div>
  );
}
