import { useState, useRef } from 'react';
import { WorkSession } from '@/lib/types';
import { useSections } from '@/contexts/SectionsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, Loader2, ImagePlus, X } from 'lucide-react';
import { format } from 'date-fns';
import { getCategoryIds } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import { fetchExpenses, fetchExpenseStats, fetchSignOffs, CURRENCIES } from '@/lib/api';

interface ExportDialogProps {
  sessions: WorkSession[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  timeFormat?: '24h' | '12h';
}

export function ExportDialog({ sessions, open: controlledOpen, onOpenChange: controlledOnOpenChange, timeFormat = '24h' }: ExportDialogProps) {
  const timeFmt = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';
  const dateTimeFmt = timeFormat === '24h' ? 'MMM d, yyyy HH:mm' : 'MMM d, yyyy h:mm a';
  const fullDateTimeFmt = timeFormat === '24h' ? 'MMMM d, yyyy HH:mm' : 'MMMM d, yyyy h:mm a';
  const { labels, sections: sectionConfigs } = useSections();

  const loadPref = <T,>(key: string, fallback: T): T => {
    try { const v = localStorage.getItem(`export_pref_${key}`); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
  };
  const savePref = (key: string, value: unknown) => {
    try { localStorage.setItem(`export_pref_${key}`, JSON.stringify(value)); } catch {}
  };

  const [includeReferences, setIncludeReferences] = useState(() => loadPref('references', false));
  const [includeNotes, setIncludeNotes] = useState(() => loadPref('notes', false));
  const [includeImages, setIncludeImages] = useState(() => loadPref('images', false));
  const [includeNonBillable, setIncludeNonBillable] = useState(() => loadPref('nonBillable', false));
  const [includeExpenses, setIncludeExpenses] = useState(() => loadPref('expenses', false));
  const [includeSignOffs, setIncludeSignOffs] = useState(() => loadPref('signOffs', false));
  const [includeLogo, setIncludeLogo] = useState(() => loadPref('logo', true));
  const [customLogoDataUrl, setCustomLogoDataUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [groupBy, setGroupBy] = useState<'chronological' | 'section'>(() => loadPref('groupBy', 'chronological'));
  const [exportFormat, setExportFormat] = useState<'txt' | 'pdf'>(() => loadPref('format', 'pdf'));
  const setAndSave = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, key: string) =>
    (v: T) => { setter(v); savePref(key, v); };

  const toggleReferences  = setAndSave(setIncludeReferences, 'references');
  const toggleNotes       = setAndSave(setIncludeNotes,       'notes');
  const toggleImages      = setAndSave(setIncludeImages,      'images');
  const toggleNonBillable = setAndSave(setIncludeNonBillable, 'nonBillable');
  const toggleExpenses    = setAndSave(setIncludeExpenses,    'expenses');
  const toggleSignOffs    = setAndSave(setIncludeSignOffs,    'signOffs');
  const toggleLogo        = setAndSave(setIncludeLogo,        'logo');
  const changeGroupBy     = setAndSave(setGroupBy,            'groupBy');
  const changeFormat      = setAndSave(setExportFormat,       'format');

  const [generating, setGenerating] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const nonBillableIds = new Set(
    sectionConfigs.filter(s => s.countTowardsBuildHours === false).map(s => s.id)
  );

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getLabel = (section: string) => labels[section] || section;

  const filteredSessions = includeNonBillable
    ? sessions
    : sessions.filter(s => !nonBillableIds.has(s.section));

  const bySection = filteredSessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.section] = (acc[s.section] || 0) + s.durationMinutes;
    return acc;
  }, {});

  const billableMinutes = sessions
    .filter(s => !nonBillableIds.has(s.section))
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  const nonBillableMinutes = sessions
    .filter(s => nonBillableIds.has(s.section))
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  const totalMinutes = includeNonBillable ? billableMinutes + nonBillableMinutes : billableMinutes;

  const handleExportTxt = () => {
    const lines: string[] = [];
    lines.push('Build Report');
    lines.push(`Generated: ${format(new Date(), fullDateTimeFmt)}`);
    lines.push('');
    lines.push('=== Time by Section ===');
    const sorted = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
    for (const [section, minutes] of sorted) {
      const tag = nonBillableIds.has(section) ? ' (not counted)' : '';
      lines.push(`${getLabel(section)}${tag}: ${formatTime(minutes)} (${(minutes / 60).toFixed(1)} hrs)`);
    }
    lines.push('');
    lines.push(`TOTAL (build hours): ${formatTime(billableMinutes)} (${(billableMinutes / 60).toFixed(1)} hrs)`);
    if (includeNonBillable && nonBillableMinutes > 0) {
      lines.push(`Other (not counted): ${formatTime(nonBillableMinutes)} (${(nonBillableMinutes / 60).toFixed(1)} hrs)`);
    }
    lines.push(`Sessions: ${filteredSessions.length}`);

    if (includeReferences || includeNotes) {
      const sortedSessions = [...filteredSessions].sort(
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
            lines.push(`${format(new Date(s.startTime), dateTimeFmt)} — ${formatTime(s.durationMinutes)}`);
            if (includeReferences && s.plansReference) lines.push(`  Plans: ${s.plansReference}`);
            if (includeNotes && s.notes) lines.push(`  Notes: ${s.notes}`);
          }
        }
      } else {
        lines.push('');
        lines.push('=== Session Details ===');
        for (const s of sortedSessions) {
          lines.push('');
          lines.push(`${format(new Date(s.startTime), dateTimeFmt)} — ${getLabel(s.section)} — ${formatTime(s.durationMinutes)}`);
          if (includeReferences && s.plansReference) lines.push(`  Plans: ${s.plansReference}`);
          if (includeNotes && s.notes) lines.push(`  Notes: ${s.notes}`);
        }
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `build-report-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Logo must be under 5 MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setCustomLogoDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const loadImageAsDataUrl = async (url: string): Promise<string | null> => {
    try {
      // Route external (R2) URLs through the server-side proxy to avoid CORS canvas taint
      const fetchUrl = url.startsWith('http') ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url;
      const res = await fetch(fetchUrl);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const loadLogoDataUrl = (): Promise<string | null> => {
    if (customLogoDataUrl) return Promise.resolve(customLogoDataUrl);
    return loadImageAsDataUrl('/report-logo.png');
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

      // Logo top-right
      const logoHeight = 18;
      const logoMaxWidth = 60;
      if (includeLogo) {
        const logoData = await loadLogoDataUrl();
        if (logoData) {
          // Detect dimensions to preserve aspect ratio
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const aspect = img.naturalWidth / img.naturalHeight;
              const w = Math.min(logoMaxWidth, logoHeight * aspect);
              const h = w / aspect;
              try { doc.addImage(logoData, 'PNG', pageWidth - margin - w, margin, w, h); } catch {}
              resolve();
            };
            img.onerror = () => resolve();
            img.src = logoData;
          });
        }
      }

      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Build Report', margin, y + 7);
      y += 12;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text(`Generated: ${format(new Date(), fullDateTimeFmt)}`, margin, y);
      // Push y past logo height if logo is taller than the title block
      y = Math.max(y, margin + logoHeight + 4);
      y += 6;
      doc.setTextColor(0);

      // Expense section (inserted before "Time by Section")
      if (includeExpenses) {
        try {
          const [allExpenses, expStats] = await Promise.all([fetchExpenses({}), fetchExpenseStats()]);
          const fmtEur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

          checkPage(14);
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0);
          doc.text('Expense Summary', margin, y);
          y += 7;

          // Summary rows
          const lbaTotal = allExpenses.filter(e => e.isCertificationRelevant).reduce((s, e) => s + e.amountHome, 0);
          doc.setFontSize(10);
          for (const [label, value] of [
            ['Total Spent', fmtEur(expStats.totalHome)],
            ['Number of Entries', String(expStats.count)],
            ['LBA/EASA Relevant', fmtEur(lbaTotal)],
          ] as [string, string][]) {
            checkPage(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80);
            doc.text(label, margin + 2, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text(value, pageWidth - margin, y, { align: 'right' });
            y += 6;
          }
          y += 4;

          // By category
          checkPage(10);
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0);
          doc.text('By Category', margin, y);
          y += 6;
          doc.setFontSize(10);
          for (const sec of sectionConfigs) {
            const spent = expStats.byCategory[sec.id] ?? 0;
            if (spent === 0) continue;
            checkPage(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(60);
            doc.text(sec.label, margin + 2, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text(fmtEur(spent), pageWidth - margin, y, { align: 'right' });
            y += 6;
          }

          // Itemized list
          checkPage(14);
          y += 4;
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0);
          doc.text('All Expenses', margin, y);
          y += 6;
          const sortedExp = [...allExpenses].sort((a, b) => a.date.localeCompare(b.date));
          doc.setFontSize(9);
          for (const exp of sortedExp) {
            checkPage(12);
            const cur = CURRENCIES.find(c => c.code === exp.currency);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text(exp.description, margin + 2, y);
            doc.text(fmtEur(exp.amountHome), pageWidth - margin, y, { align: 'right' });
            y += 4.5;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            const catLabel = getCategoryIds(exp.category).map(c => labels[c] || c.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())).join(' + ');
            const meta = [
              format(new Date(exp.date), 'dd.MM.yyyy'),
              catLabel,
              exp.vendor || null,
              exp.currency !== 'EUR' ? `${cur?.symbol}${exp.amount.toFixed(2)} ${exp.currency}` : null,
              exp.isCertificationRelevant ? 'LBA/EASA' : null,
            ].filter(Boolean).join(' · ');
            doc.text(meta, margin + 2, y);
            y += 4;
            doc.setDrawColor(230);
            doc.line(margin + 2, y, pageWidth - margin - 2, y);
            y += 4;
          }

          // Separator before build log
          checkPage(16);
          y += 4;
          doc.setDrawColor(180);
          doc.line(margin, y, pageWidth - margin, y);
          y += 10;
          doc.setTextColor(0);
        } catch {
          // skip expense section silently if fetch fails
        }
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Time by Section', margin, y);
      y += 7;

      const sorted = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
      doc.setFontSize(10);
      for (const [section, minutes] of sorted) {
        checkPage(6);
        const isNonBillable = nonBillableIds.has(section);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(isNonBillable ? 120 : 0);
        doc.text(getLabel(section) + (isNonBillable ? ' (not counted)' : ''), margin + 2, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`${formatTime(minutes)} (${(minutes / 60).toFixed(1)} hrs)`, pageWidth - margin, y, { align: 'right' });
        doc.setTextColor(0);
        y += 6;
      }

      checkPage(10);
      y += 2;
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL (build hours)', margin + 2, y);
      doc.text(`${formatTime(billableMinutes)} (${(billableMinutes / 60).toFixed(1)} hrs)`, pageWidth - margin, y, { align: 'right' });
      y += 6;
      if (includeNonBillable && nonBillableMinutes > 0) {
        checkPage(6);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text('Other (not counted)', margin + 2, y);
        doc.text(`${formatTime(nonBillableMinutes)} (${(nonBillableMinutes / 60).toFixed(1)} hrs)`, pageWidth - margin, y, { align: 'right' });
        doc.setTextColor(0);
        y += 6;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text(`${filteredSessions.length} sessions`, margin + 2, y);
      doc.setTextColor(0);
      y += 12;

      // ── Sign-offs ──────────────────────────────────────────────────
      if (includeSignOffs) {
        try {
          const signOffs = await fetchSignOffs();
          if (signOffs.length > 0) {
            checkPage(16);
            doc.setDrawColor(180);
            doc.line(margin, y, pageWidth - margin, y);
            y += 8;
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text('Inspection Sign-Offs', margin, y);
            y += 8;

            for (const s of signOffs) {
              checkPage(30);
              // Package label + date
              doc.setFontSize(10);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(0);
              doc.text(s.packageLabel, margin + 2, y);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(100);
              doc.text(format(new Date(s.date), 'dd MMM yyyy'), pageWidth - margin, y, { align: 'right' });
              y += 5;

              // Inspector
              if (s.inspectorName) {
                doc.setFontSize(9);
                doc.setTextColor(80);
                doc.text(`Inspector: ${s.inspectorName}`, margin + 2, y);
                y += 4.5;
              }

              // Checklist items
              const checks = [
                s.inspectionCompleted ? '☑ Inspection completed' : '☐ Inspection completed',
                s.executionSatisfactory ? '☑ Execution satisfactory' : s.reworkNeeded ? '☑ Rework needed' : '☐ Outcome',
              ];
              doc.setFontSize(9);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(60);
              doc.text(checks.join('    '), margin + 2, y);
              y += 4.5;

              // Comments
              if (s.comments) {
                const commentLines = doc.splitTextToSize(`Comments: ${s.comments}`, contentWidth - 6);
                for (const line of commentLines) {
                  checkPage(4);
                  doc.text(line, margin + 2, y);
                  y += 4;
                }
              }

              // Signature
              checkPage(22);
              try {
                const sigWidth = 60;
                const sigHeight = 18;
                doc.addImage(s.signaturePng, 'PNG', margin + 2, y, sigWidth, sigHeight);
                y += sigHeight + 3;
              } catch {}

              doc.setDrawColor(230);
              doc.setTextColor(0);
              doc.line(margin + 2, y, pageWidth - margin - 2, y);
              y += 6;
            }
          }
        } catch {
          // skip silently if fetch fails
        }
      }

      if (includeReferences || includeNotes || includeImages) {
        const sortedSessions = [...filteredSessions].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        const renderSession = async (s: WorkSession, showSection: boolean) => {
          checkPage(14);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          const label = showSection
            ? `${format(new Date(s.startTime), dateTimeFmt)} — ${getLabel(s.section)} — ${formatTime(s.durationMinutes)}`
            : `${format(new Date(s.startTime), dateTimeFmt)} — ${formatTime(s.durationMinutes)}`;
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
            let renderedCount = 0;
            for (const imgUrl of s.imageUrls) {
              const dataUrl = await loadImageAsDataUrl(imgUrl);
              if (!dataUrl) continue;
              if (imgX + imgSize > pageWidth - margin) {
                imgX = margin + 2;
                y += imgSize + 3;
              }
              checkPage(imgSize + 5);
              try { doc.addImage(dataUrl, 'JPEG', imgX, y, imgSize, imgSize); renderedCount++; } catch {}
              imgX += imgSize + 3;
            }
            if (renderedCount > 0) y += imgSize + 3;
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

      doc.save(`build-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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

  const hasImages = filteredSessions.some(s => s.imageUrls && s.imageUrls.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" /> Export
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Create Build Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-secondary rounded-lg p-4 space-y-1">
            <p className="text-sm font-medium text-foreground mb-2">Section Summary</p>
            {Object.entries(bySection)
              .sort((a, b) => b[1] - a[1])
              .map(([section, minutes]) => (
                <div key={section} className="flex justify-between text-sm">
                  <span className={nonBillableIds.has(section) ? 'text-muted-foreground/50 italic' : 'text-muted-foreground'}>
                    {getLabel(section)}{nonBillableIds.has(section) && ' (not counted)'}
                  </span>
                  <span className={`font-mono ${nonBillableIds.has(section) ? 'text-muted-foreground/50' : 'text-foreground'}`}>{formatTime(minutes)}</span>
                </div>
              ))}
            <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold">
              <span className="text-primary">Total (build hours)</span>
              <span className="font-mono text-primary">{formatTime(billableMinutes)}</span>
            </div>
            {includeNonBillable && nonBillableMinutes > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground/60">
                <span className="italic">Other (not counted)</span>
                <span className="font-mono">{formatTime(nonBillableMinutes)}</span>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Export format:</p>
            <div className="flex gap-2">
              <Button variant={exportFormat === 'txt' ? 'default' : 'outline'} size="sm" onClick={() => changeFormat('txt')}>
                Text (.txt)
              </Button>
              <Button variant={exportFormat === 'pdf' ? 'default' : 'outline'} size="sm" onClick={() => changeFormat('pdf')}>
                PDF (.pdf)
              </Button>
            </div>
          </div>

          {exportFormat === 'pdf' && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Logo (top-right of PDF):</p>
              <div className="flex items-center gap-3">
                <div className="w-24 h-12 rounded border border-border bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {customLogoDataUrl ? (
                    <img src={customLogoDataUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <img src="/report-logo.png" alt="Default logo" className="max-w-full max-h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox id="include-logo" checked={includeLogo} onCheckedChange={(v) => toggleLogo(v === true)} />
                    <Label htmlFor="include-logo" className="text-sm text-muted-foreground cursor-pointer">Include logo</Label>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => logoInputRef.current?.click()}>
                      <ImagePlus className="w-3.5 h-3.5" /> Custom
                    </Button>
                    {customLogoDataUrl && (
                      <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-muted-foreground" onClick={() => { setCustomLogoDataUrl(null); if (logoInputRef.current) logoInputRef.current.value = ''; }}>
                        <X className="w-3.5 h-3.5" /> Reset
                      </Button>
                    )}
                  </div>
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFileChange} />
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Report order:</p>
            <RadioGroup value={groupBy} onValueChange={(v) => changeGroupBy(v as 'chronological' | 'section')} className="flex gap-4">
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

          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground">Include in export:</p>

            {/* Work Sessions */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground/60 uppercase tracking-wide font-medium">Work Sessions</p>
              <div className="pl-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="include-refs" checked={includeReferences} onCheckedChange={(v) => toggleReferences(v === true)} />
                  <Label htmlFor="include-refs" className="text-sm text-muted-foreground cursor-pointer">Plans references</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="include-notes" checked={includeNotes} onCheckedChange={(v) => toggleNotes(v === true)} />
                  <Label htmlFor="include-notes" className="text-sm text-muted-foreground cursor-pointer">Session notes</Label>
                </div>
                {exportFormat === 'pdf' && hasImages && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="include-images" checked={includeImages} onCheckedChange={(v) => toggleImages(v === true)} />
                    <Label htmlFor="include-images" className="text-sm text-muted-foreground cursor-pointer">Session photos</Label>
                  </div>
                )}
                {nonBillableIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="include-nonbillable" checked={includeNonBillable} onCheckedChange={(v) => toggleNonBillable(v === true)} />
                    <Label htmlFor="include-nonbillable" className="text-sm text-muted-foreground cursor-pointer">Non-billable sections (e.g. Other)</Label>
                  </div>
                )}
              </div>
            </div>

            {/* Inspections */}
            {exportFormat === 'pdf' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground/60 uppercase tracking-wide font-medium">Inspections</p>
                <div className="pl-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox id="include-signoffs" checked={includeSignOffs} onCheckedChange={(v) => toggleSignOffs(v === true)} />
                    <Label htmlFor="include-signoffs" className="text-sm text-muted-foreground cursor-pointer">Inspection sign-offs</Label>
                  </div>
                </div>
              </div>
            )}

            {/* Finances */}
            {exportFormat === 'pdf' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground/60 uppercase tracking-wide font-medium">Finances</p>
                <div className="pl-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox id="include-expenses" checked={includeExpenses} onCheckedChange={(v) => toggleExpenses(v === true)} />
                    <Label htmlFor="include-expenses" className="text-sm text-muted-foreground cursor-pointer">Expense report</Label>
                  </div>
                </div>
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
