import { useState } from 'react';
import { WorkSession, AssemblySection, SECTION_LABELS } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { format } from 'date-fns';

interface ExportDialogProps {
  sessions: WorkSession[];
}

export function ExportDialog({ sessions }: ExportDialogProps) {
  const [includeReferences, setIncludeReferences] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [open, setOpen] = useState(false);

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const bySection = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.section] = (acc[s.section] || 0) + s.durationMinutes;
    return acc;
  }, {});

  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const handleExport = () => {
    const lines: string[] = [];

    // Header
    lines.push('RV-10 Build Time Report');
    lines.push(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`);
    lines.push('');

    // Section summary
    lines.push('=== Time by Section ===');
    const sorted = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
    for (const [section, minutes] of sorted) {
      lines.push(`${SECTION_LABELS[section as AssemblySection]}: ${formatTime(minutes)} (${(minutes / 60).toFixed(1)} hrs)`);
    }
    lines.push('');
    lines.push(`TOTAL: ${formatTime(totalMinutes)} (${(totalMinutes / 60).toFixed(1)} hrs)`);
    lines.push(`Sessions: ${sessions.length}`);

    // Detailed sessions
    if (includeReferences || includeNotes) {
      lines.push('');
      lines.push('=== Session Details ===');
      const sortedSessions = [...sessions].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      for (const s of sortedSessions) {
        lines.push('');
        lines.push(`${format(new Date(s.startTime), 'MMM d, yyyy h:mm a')} — ${SECTION_LABELS[s.section]} — ${formatTime(s.durationMinutes)}`);
        if (includeReferences && s.plansReference) {
          lines.push(`  Plans: ${s.plansReference}`);
        }
        if (includeNotes && s.notes) {
          lines.push(`  Notes: ${s.notes}`);
        }
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rv10-build-log-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Build Log</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Preview summary */}
          <div className="bg-secondary rounded-lg p-4 space-y-1">
            <p className="text-sm font-medium text-foreground mb-2">Section Summary</p>
            {Object.entries(bySection)
              .sort((a, b) => b[1] - a[1])
              .map(([section, minutes]) => (
                <div key={section} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{SECTION_LABELS[section as AssemblySection]}</span>
                  <span className="font-mono text-foreground">{formatTime(minutes)}</span>
                </div>
              ))}
            <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold">
              <span className="text-primary">Total</span>
              <span className="font-mono text-primary">{formatTime(totalMinutes)}</span>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Include in export:</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-refs"
                checked={includeReferences}
                onCheckedChange={(v) => setIncludeReferences(v === true)}
              />
              <Label htmlFor="include-refs" className="text-sm text-muted-foreground cursor-pointer">
                Plans references (page, section, step)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-notes"
                checked={includeNotes}
                onCheckedChange={(v) => setIncludeNotes(v === true)}
              />
              <Label htmlFor="include-notes" className="text-sm text-muted-foreground cursor-pointer">
                Session notes
              </Label>
            </div>
          </div>

          <Button onClick={handleExport} className="w-full gap-2" disabled={sessions.length === 0}>
            <Download className="w-4 h-4" /> Download Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
