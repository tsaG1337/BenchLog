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
  isRunning: boolean;
}

export function SessionForm({
  section, onSectionChange,
  plansPage, onPlansPageChange,
  plansSection, onPlansSectionChange,
  plansStep, onPlansStepChange,
  notes, onNotesChange,
  pendingImageUrls, onPendingImageUrlsChange,
  isRunning,
}: SessionFormProps) {
  const { sections } = useSections();

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
                  ? 'bg-primary/15 border-primary text-primary glow-amber'
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
    </div>
  );
}
