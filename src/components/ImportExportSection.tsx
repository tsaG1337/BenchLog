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

export function ImportExportSection({ onImportComplete }: ImportExportSectionProps) {
  const [includeSettings, setIncludeSettings] = useState(true);
  const [includeSessions, setIncludeSessions] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!includeSettings && !includeSessions) {
      toast.error('Select at least one category to export');
      return;
    }
    setExporting(true);
    try {
      const blob = await exportData(includeSettings, includeSessions);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `build-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (err: any) {
      toast.error('Export failed: ' + err.message);
    }
    setExporting(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version) {
        throw new Error('Invalid export file — missing version');
      }

      // Filter based on checkboxes
      const importPayload: any = {};
      if (includeSettings && data.settings) {
        importPayload.settings = data.settings;
      }
      if (includeSessions && data.sessions) {
        importPayload.sessions = data.sessions;
      }

      if (!importPayload.settings && !importPayload.sessions) {
        throw new Error('Nothing to import — check your selections and ensure the file contains the selected data');
      }

      const result = await importData(importPayload);

      const parts = [];
      if (result.settingsImported) parts.push('settings');
      if (result.sessionsImported > 0) parts.push(`${result.sessionsImported} sessions`);
      if (result.imagesImported > 0) parts.push(`${result.imagesImported} images`);

      toast.success(`Imported: ${parts.join(', ')}`);
      onImportComplete?.();
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
    setImporting(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileArchive className="w-4 h-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Import / Export</Label>
      </div>
      <div className="pl-6 border-l-2 border-border space-y-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="ie-settings"
              checked={includeSettings}
              onCheckedChange={(checked) => setIncludeSettings(checked === true)}
            />
            <Label htmlFor="ie-settings" className="text-sm cursor-pointer">
              Settings <span className="text-muted-foreground text-xs">(general, MQTT, sections)</span>
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ie-sessions"
              checked={includeSessions}
              onCheckedChange={(checked) => setIncludeSessions(checked === true)}
            />
            <Label htmlFor="ie-sessions" className="text-sm cursor-pointer">
              Build sessions <span className="text-muted-foreground text-xs">(including images)</span>
            </Label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || (!includeSettings && !includeSessions)}
            className="gap-1.5 flex-1"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            disabled={importing || (!includeSettings && !includeSessions)}
            className="gap-1.5 flex-1"
          >
            <Upload className="w-3.5 h-3.5" />
            {importing ? 'Importing…' : 'Import'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        <p className="text-xs text-muted-foreground/60">
          Export saves a JSON file with selected data. Images are embedded in the export. Import merges data — existing sessions are updated, new ones are added.
        </p>
      </div>
    </div>
  );
}
