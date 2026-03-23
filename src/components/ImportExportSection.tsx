import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Upload, FileArchive } from 'lucide-react';
import { toast } from 'sonner';
import { exportData, importData } from '@/lib/api';

interface ImportExportSectionProps {
  onImportComplete?: () => void;
}

const CATEGORIES = [
  { key: 'settings',     label: 'Settings',        desc: 'General, MQTT, sections' },
  { key: 'sessions',     label: 'Build sessions',   desc: 'All sessions + photos' },
  { key: 'expenses',     label: 'Expenses',         desc: 'All expenses + receipts' },
  { key: 'blog',         label: 'Blog posts',       desc: 'All posts + images' },
  { key: 'workPackages', label: 'Work packages',    desc: 'Build progress package tree' },
  { key: 'signOffs',     label: 'Sign-offs',        desc: 'Inspector sign-off records' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

export function ImportExportSection({ onImportComplete }: ImportExportSectionProps) {
  const [selected, setSelected] = useState<Record<CategoryKey, boolean>>({
    settings: true, sessions: true, expenses: true, blog: true, workPackages: true, signOffs: true,
  });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggle = (key: CategoryKey) => setSelected(s => ({ ...s, [key]: !s[key] }));
  const noneSelected = !Object.values(selected).some(Boolean);

  const handleExport = async () => {
    if (noneSelected) { toast.error('Select at least one category to export'); return; }
    setExporting(true);
    try {
      const blob = await exportData({
        settings:     selected.settings,
        sessions:     selected.sessions,
        expenses:     selected.expenses,
        blog:         selected.blog,
        workPackages: selected.workPackages,
        signOffs:     selected.signOffs,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `benchlog-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch (err: any) {
      toast.error('Export failed: ' + err.message);
    }
    setExporting(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importData(file);
      const parts: string[] = [];
      if (result.settingsImported)      parts.push('settings');
      if (result.sessionsImported > 0)  parts.push(`${result.sessionsImported} sessions`);
      if (result.expensesImported > 0)  parts.push(`${result.expensesImported} expenses`);
      if (result.blogPostsImported > 0) parts.push(`${result.blogPostsImported} blog posts`);
      if (result.filesImported > 0)     parts.push(`${result.filesImported} files`);
      if (result.workPackagesImported)  parts.push('work packages');
      if (result.signOffsImported > 0)  parts.push(`${result.signOffsImported} sign-offs`);
      toast.success(`Imported: ${parts.join(', ') || 'nothing'}`);
      onImportComplete?.();
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setImporting(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileArchive className="w-4 h-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Backup / Restore</Label>
      </div>

      <div className="pl-6 border-l-2 border-border space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {CATEGORIES.map(({ key, label, desc }) => (
            <div key={key} className="flex items-start gap-2">
              <Checkbox
                id={`ie-${key}`}
                checked={selected[key]}
                onCheckedChange={() => toggle(key)}
                className="mt-0.5"
              />
              <Label htmlFor={`ie-${key}`} className="text-sm cursor-pointer leading-tight">
                {label}
                <span className="block text-xs text-muted-foreground font-normal">{desc}</span>
              </Label>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={handleExport}
            disabled={exporting || noneSelected}
            className="gap-1.5 flex-1"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting…' : 'Export .zip'}
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="gap-1.5 flex-1"
          >
            <Upload className="w-3.5 h-3.5" />
            {importing ? 'Importing…' : 'Import .zip'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <p className="text-xs text-muted-foreground/60">
          Export creates a <span className="font-mono">.zip</span> with all selected data and files — no size limit.
          Import merges data; existing records are updated, new ones added.
          Legacy <span className="font-mono">.json</span> backups are also accepted.
        </p>
      </div>
    </div>
  );
}
