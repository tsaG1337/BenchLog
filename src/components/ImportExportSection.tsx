import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Upload, FileArchive } from 'lucide-react';
import { toast } from 'sonner';
import { exportDataStream, downloadExport, importData } from '@/lib/api';

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
  { key: 'inventory',    label: 'Inventory',         desc: 'Parts, locations, stock, kit checks, budgets' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

interface ExportProgress {
  label: string;
  current: number;
  total: number;
}

export function ImportExportSection({ onImportComplete }: ImportExportSectionProps) {
  const [selected, setSelected] = useState<Record<CategoryKey, boolean>>({
    settings: true, sessions: true, expenses: true, blog: true, workPackages: true, signOffs: true, inventory: true,
  });
  const [includeWpStatus, setIncludeWpStatus] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggle = (key: CategoryKey) => setSelected(s => ({ ...s, [key]: !s[key] }));
  const noneSelected = !Object.values(selected).some(Boolean);

  const handleExport = async () => {
    if (noneSelected) { toast.error('Select at least one category to export'); return; }
    setExporting(true);
    setExportProgress(null);
    try {
      let downloadToken = '';
      let downloadFilename = `benchlog-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      let exportError: string | null = null;

      await exportDataStream({
        settings:          selected.settings,
        sessions:          selected.sessions,
        expenses:          selected.expenses,
        blog:              selected.blog,
        workPackages:      selected.workPackages,
        workPackageStatus: selected.workPackages ? includeWpStatus : false,
        signOffs:          selected.signOffs,
        inventory:         selected.inventory,
      }, (ev) => {
        if (ev.type === 'progress') {
          setExportProgress({ label: ev.label ?? '', current: ev.current ?? 0, total: ev.total ?? 0 });
        } else if (ev.type === 'done') {
          downloadToken = ev.token ?? '';
          downloadFilename = ev.filename ?? downloadFilename;
        } else if (ev.type === 'error') {
          exportError = ev.message || 'Export failed';
        }
      });

      if (exportError) throw new Error(exportError);
      if (!downloadToken) throw new Error('Export did not complete');

      await downloadExport(downloadToken, downloadFilename);
      toast.success('Backup downloaded');
    } catch (err: any) {
      toast.error('Export failed: ' + err.message);
    }
    setExportProgress(null);
    setExporting(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Import will merge data into your existing records. This cannot be undone. Continue?')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setImporting(true);
    setUploadPct(0);
    try {
      const result = await importData(file, (pct) => setUploadPct(pct));
      const parts: string[] = [];
      if (result.settingsImported)      parts.push('settings');
      if (result.sessionsImported > 0)  parts.push(`${result.sessionsImported} sessions`);
      if (result.expensesImported > 0)  parts.push(`${result.expensesImported} expenses`);
      if (result.blogPostsImported > 0) parts.push(`${result.blogPostsImported} blog posts`);
      if (result.filesImported > 0)     parts.push(`${result.filesImported} files`);
      if (result.workPackagesImported)  parts.push('work packages');
      if (result.signOffsImported > 0)  parts.push(`${result.signOffsImported} sign-offs`);
      if (result.inventoryImported > 0) parts.push(`${result.inventoryImported} inventory records`);
      toast.success(`Imported: ${parts.join(', ') || 'nothing'}`);
      onImportComplete?.();
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadPct(null);
    setImporting(false);
  };

  const exportPct = exportProgress && exportProgress.total > 0
    ? Math.round((exportProgress.current / exportProgress.total) * 100)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileArchive className="w-4 h-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Backup / Restore</Label>
      </div>

      <div className="pl-6 border-l-2 border-border space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {CATEGORIES.map(({ key, label, desc }) => (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
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
              {key === 'workPackages' && selected.workPackages && (
                <div className="flex items-center gap-2 pl-5">
                  <Checkbox
                    id="ie-wp-status"
                    checked={includeWpStatus}
                    onCheckedChange={v => setIncludeWpStatus(!!v)}
                  />
                  <Label htmlFor="ie-wp-status" className="text-xs cursor-pointer leading-tight text-muted-foreground">
                    Include completion status
                    <span className="block font-normal" style={{ color: 'inherit', opacity: 0.7 }}>Uncheck to export as a blank template</span>
                  </Label>
                </div>
              )}
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

        {/* Export progress */}
        {exporting && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{exportProgress ? exportProgress.label : 'Preparing…'}</span>
              {exportPct !== null && <span>{exportPct}%</span>}
            </div>
            <div className="h-1.5 bg-accent rounded-full overflow-hidden">
              {exportPct !== null ? (
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${exportPct}%` }}
                />
              ) : (
                <div className="h-full bg-primary/50 rounded-full w-1/3 animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* Import upload progress */}
        {importing && uploadPct !== null && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{uploadPct < 100 ? 'Uploading…' : 'Processing…'}</span>
              {uploadPct < 100 && <span>{uploadPct}%</span>}
            </div>
            <div className="h-1.5 bg-accent rounded-full overflow-hidden">
              {uploadPct < 100 ? (
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${uploadPct}%` }}
                />
              ) : (
                <div className="h-full bg-primary/50 rounded-full w-1/3 animate-pulse" />
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground/60">
          Export creates a <span className="font-mono">.zip</span> with all selected data and files — no size limit.
          Import merges data; existing records are updated, new ones added.
          Legacy <span className="font-mono">.json</span> backups are also accepted.
        </p>
      </div>
    </div>
  );
}
