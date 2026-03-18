import { useState } from 'react';
import { WorkSession } from '@/lib/types';
import { useSections } from '@/contexts/SectionsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

interface ExportDialogProps {
  sessions: WorkSession[];
}

export function ExportDialog({ sessions }: ExportDialogProps) {
  const { labels } = useSections();
  const [includeReferences, setIncludeReferences] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [groupBy, setGroupBy] = useState<'chronological' | 'section'>('chronological');
  const [exportFormat, setExportFormat] = useState<'txt' | 'pdf'>('txt');
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(false);

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getLabel = (section: string) => labels[section] || section;

  const bySection = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.section] = (acc[s.section] || 0) + s.durationMinutes;
    return acc;
  }, {});

  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const handleExportTxt = () => {
    const lines: string[] = [];
    lines.push('Build Time Report');
    lines.push(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`);
    lines.push('');
    lines.push('=== Time by Section ===');
    const sorted = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
    for (const [section, minutes] of sorted) {
      lines.push(`${getLabel(section)}: ${formatTime(minutes)} (${(minutes / 60).toFixed(1)} hrs)`);
    }
    lines.push('');
    lines.push(`TOTAL: ${formatTime(totalMinutes)} (${(totalMinutes / 60).toFixed(1)} hrs)`);
    lines.push(`Sessions: ${sessions.length}`);

    if (includeReferences || includeNotes) {
      const sortedSessions = [...sessions].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      if (groupBy === 'section') {
        // Group by section
        const sectionGroups: Record<string, WorkSession[]> = {};
        for (const s of sortedSessions) {
          if (!sectionGroups[s.section]) sectionGroups[s.section] = [];
          sectionGroups[s.section].push(s);
        }
        for (const [sec, group] of Object.entries(sectionGroups).sort((a, b) => getLabel(a[0]).localeCompare(getLabel(b[0])))) {
          lines.push('');
          const sectionMinutes = group.reduce((sum, s) => sum + s.durationMinutes, 0);
          lines.push(`=== ${getLabel(sec)} (${formatTime(sectionMinutes)}) ===`);
          for (const s of group) {
            lines.push('');
            lines.push(`${format(new Date(s.startTime), 'MMM d, yyyy h:mm a')} — ${formatTime(s.durationMinutes)}`);
            if (includeReferences && s.plansReference) lines.push(`  Plans: ${s.plansReference}`);
            if (includeNotes && s.notes) lines.push(`  Notes: ${s.notes}`);
          }
        }
      } else {
        lines.push('');
        lines.push('=== Session Details ===');
        for (const s of sortedSessions) {
          lines.push('');
          lines.push(`${format(new Date(s.startTime), 'MMM d, yyyy h:mm a')} — ${getLabel(s.section)} — ${formatTime(s.durationMinutes)}`);
          if (includeReferences && s.plansReference) lines.push(`  Plans: ${s.plansReference}`);
          if (includeNotes && s.notes) lines.push(`  Notes: ${s.notes}`);
        }
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `build-log-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const loadImageAsDataUrl = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  const handleExportPdf = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const checkPage = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Build Time Report', margin, y + 7);
      y += 12;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, margin, y);
      y += 10;
      doc.setTextColor(0);

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Time by Section', margin, y);
      y += 7;

      const sorted = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
      doc.setFontSize(10);
      for (const [section, minutes] of sorted) {
        checkPage(6);
        doc.setFont('helvetica', 'normal');
        doc.text(getLabel(section), margin + 2, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`${formatTime(minutes)} (${(minutes / 60).toFixed(1)} hrs)`, pageWidth - margin, y, { align: 'right' });
        y += 6;
      }

      checkPage(10);
      y += 2;
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL', margin + 2, y);
      doc.text(`${formatTime(totalMinutes)} (${(totalMinutes / 60).toFixed(1)} hrs)`, pageWidth - margin, y, { align: 'right' });
      y += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text(`${sessions.length} sessions`, margin + 2, y);
      doc.setTextColor(0);
      y += 12;

      if (includeReferences || includeNotes || includeImages) {
        const sortedSessions = [...sessions].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        const renderSession = async (s: WorkSession, showSection: boolean) => {
          checkPage(14);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          const label = showSection
            ? `${format(new Date(s.startTime), 'MMM d, yyyy h:mm a')} — ${getLabel(s.section)} — ${formatTime(s.durationMinutes)}`
            : `${format(new Date(s.startTime), 'MMM d, yyyy h:mm a')} — ${formatTime(s.durationMinutes)}`;
          doc.text(label, margin + 2, y);
          y += 5;

          if (includeReferences && s.plansReference) {
            checkPage(5);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80);
            doc.text(`Plans: ${s.plansReference}`, margin + 4, y);
            doc.setTextColor(0);
            y += 5;
          }

          if (includeNotes && s.notes) {
            checkPage(5);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80);
            const noteLines = doc.splitTextToSize(`Notes: ${s.notes}`, contentWidth - 6);
            for (const line of noteLines) {
              checkPage(4);
              doc.text(line, margin + 4, y);
              y += 4;
            }
            doc.setTextColor(0);
            y += 1;
          }

          if (includeImages && s.imageUrls && s.imageUrls.length > 0) {
            const imgSize = 40;
            let imgX = margin + 2;
            for (const imgUrl of s.imageUrls) {
              const dataUrl = await loadImageAsDataUrl(imgUrl);
              if (!dataUrl) continue;
              if (imgX + imgSize > pageWidth - margin) {
                imgX = margin + 2;
                y += imgSize + 3;
              }
              checkPage(imgSize + 5);
              try { doc.addImage(dataUrl, 'JPEG', imgX, y, imgSize, imgSize); } catch {}
              imgX += imgSize + 3;
            }
            y += imgSize + 3;
          }

          checkPage(4);
          doc.setDrawColor(230);
          doc.line(margin + 2, y, pageWidth - margin - 2, y);
          y += 5;
        };

        if (groupBy === 'section') {
          const sectionGroups: Record<string, WorkSession[]> = {};
          for (const s of sortedSessions) {
            if (!sectionGroups[s.section]) sectionGroups[s.section] = [];
            sectionGroups[s.section].push(s);
          }
          for (const [sec, group] of Object.entries(sectionGroups).sort((a, b) => getLabel(a[0]).localeCompare(getLabel(b[0])))) {
            const sectionMinutes = group.reduce((sum, s) => sum + s.durationMinutes, 0);
            checkPage(14);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text(`${getLabel(sec)} (${formatTime(sectionMinutes)})`, margin, y);
            y += 8;
            for (const s of group) {
              await renderSession(s, false);
            }
            y += 4;
          }
        } else {
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          checkPage(10);
          doc.text('Session Details', margin, y);
          y += 8;
          for (const s of sortedSessions) {
            await renderSession(s, true);
          }
        }
      }

      doc.save(`build-log-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      setOpen(false);
    } catch (err: any) {
      toast.error('PDF generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = () => {
    if (exportFormat === 'pdf') {
      handleExportPdf();
    } else {
      handleExportTxt();
    }
  };

  const hasImages = sessions.some(s => s.imageUrls && s.imageUrls.length > 0);

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
          <div className="bg-secondary rounded-lg p-4 space-y-1">
            <p className="text-sm font-medium text-foreground mb-2">Section Summary</p>
            {Object.entries(bySection)
              .sort((a, b) => b[1] - a[1])
              .map(([section, minutes]) => (
                <div key={section} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{getLabel(section)}</span>
                  <span className="font-mono text-foreground">{formatTime(minutes)}</span>
                </div>
              ))}
            <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold">
              <span className="text-primary">Total</span>
              <span className="font-mono text-primary">{formatTime(totalMinutes)}</span>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Export format:</p>
            <div className="flex gap-2">
              <Button variant={exportFormat === 'txt' ? 'default' : 'outline'} size="sm" onClick={() => setExportFormat('txt')}>
                Text (.txt)
              </Button>
              <Button variant={exportFormat === 'pdf' ? 'default' : 'outline'} size="sm" onClick={() => setExportFormat('pdf')}>
                PDF (.pdf)
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Report order:</p>
            <RadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as 'chronological' | 'section')} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="chronological" id="group-chrono" />
                <Label htmlFor="group-chrono" className="text-sm text-muted-foreground cursor-pointer">Chronological</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="section" id="group-section" />
                <Label htmlFor="group-section" className="text-sm text-muted-foreground cursor-pointer">Grouped by section</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Include in export:</p>
            <div className="flex items-center gap-2">
              <Checkbox id="include-refs" checked={includeReferences} onCheckedChange={(v) => setIncludeReferences(v === true)} />
              <Label htmlFor="include-refs" className="text-sm text-muted-foreground cursor-pointer">Plans references</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="include-notes" checked={includeNotes} onCheckedChange={(v) => setIncludeNotes(v === true)} />
              <Label htmlFor="include-notes" className="text-sm text-muted-foreground cursor-pointer">Session notes</Label>
            </div>
            {exportFormat === 'pdf' && hasImages && (
              <div className="flex items-center gap-2">
                <Checkbox id="include-images" checked={includeImages} onCheckedChange={(v) => setIncludeImages(v === true)} />
                <Label htmlFor="include-images" className="text-sm text-muted-foreground cursor-pointer">Session photos</Label>
              </div>
            )}
          </div>

          <Button onClick={handleExport} className="w-full gap-2" disabled={sessions.length === 0 || generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {generating ? 'Generating PDF…' : 'Download Report'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
