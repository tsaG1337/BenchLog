import { useState } from 'react';
import { useSections } from '@/contexts/SectionsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  }) => void;
}

export function ManualEntryDialog({ onAdd }: ManualEntryDialogProps) {
  const { sections: sectionConfigs } = useSections();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [plansPage, setPlansPage] = useState('');
  const [plansSection, setPlansSection] = useState('');
  const [plansStep, setPlansStep] = useState('');

  // Default to first section
  const effectiveSection = section || (sectionConfigs[0]?.id ?? '');

  const handleSubmit = () => {
    const h = parseInt(hours) || 0;
    const m = parseInt(minutes) || 0;
    if (h === 0 && m === 0) return;

    onAdd({ section: effectiveSection, date, hours: h, minutes: m, notes, plansPage, plansSection, plansStep });
    setOpen(false);
    setHours('');
    setMinutes('');
    setNotes('');
    setPlansPage('');
    setPlansSection('');
    setPlansStep('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Add Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Manual Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Section</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {sectionConfigs.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium transition-all border ${
                    effectiveSection === s.id
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
                <Input type="number" min="0" placeholder="0" value={hours} onChange={(e) => setHours(e.target.value)} className="bg-secondary border-border font-mono" />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Minutes</Label>
                <Input type="number" min="0" max="59" placeholder="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="bg-secondary border-border font-mono" />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Plans Reference</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Section</Label>
                <Input placeholder="e.g. 5" value={plansSection} onChange={(e) => setPlansSection(e.target.value)} className="bg-secondary border-border font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Page</Label>
                <Input placeholder="e.g. 8" value={plansPage} onChange={(e) => setPlansPage(e.target.value)} className="bg-secondary border-border font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground/70 mb-1 block">Step</Label>
                <Input placeholder="e.g. 3" value={plansStep} onChange={(e) => setPlansStep(e.target.value)} className="bg-secondary border-border font-mono" />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Notes</Label>
            <Textarea placeholder="What did you work on?" value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-secondary border-border min-h-[60px]" />
          </div>

          <Button onClick={handleSubmit} className="w-full">Add Session</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
