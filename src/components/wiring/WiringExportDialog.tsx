import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText } from 'lucide-react';
import type { PdfPageSize } from '@/lib/wiring/export';

/**
 * PDF export dialog for the wiring tool (2026-07). Lets the user compose
 * the document: which sheets, schematic and/or harness pages, the harness
 * label options (names / conductor counts / lengths incl. estimates), an
 * optional cable-summary table page, and the paper size. The heavy lifting
 * (rendering + printing) stays in WiringPage's handler — this component is
 * pure options UI.
 */

export interface WiringPdfExportOptions {
  scope: 'current' | 'all';
  includeSchematic: boolean;
  includeHarness: boolean;
  showCableNames: boolean;
  showConductorCounts: boolean;
  lengthsMode: 'none' | 'defined' | 'all';
  includeCableSummary: boolean;
  includeWireSummary: boolean;
  pageSize: PdfPageSize;
}

const DEFAULT_OPTIONS: WiringPdfExportOptions = {
  scope: 'current',
  includeSchematic: true,
  includeHarness: true,
  showCableNames: true,
  showConductorCounts: true,
  lengthsMode: 'all',
  includeCableSummary: true,
  includeWireSummary: true,
  pageSize: 'A4',
};

const STORAGE_KEY = 'wiring.pdfExportOptions';

function loadSavedOptions(): WiringPdfExportOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    // Merge over defaults so options added in later versions get their
    // default instead of undefined.
    return { ...DEFAULT_OPTIONS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name of the active sheet — labels the "Current sheet" radio. */
  currentSheetName: string;
  /** Total sheet count — the "All sheets" option only shows when > 1. */
  sheetCount: number;
  onExport: (options: WiringPdfExportOptions) => void;
}

export function WiringExportDialog({ open, onOpenChange, currentSheetName, sheetCount, onExport }: Props) {
  const [opts, setOpts] = useState<WiringPdfExportOptions>(DEFAULT_OPTIONS);

  // Re-load the remembered options each time the dialog opens (not just on
  // mount) so a second export in the same session starts from the last run.
  useEffect(() => {
    if (open) setOpts(loadSavedOptions());
  }, [open]);

  const patch = (p: Partial<WiringPdfExportOptions>) => setOpts(o => ({ ...o, ...p }));

  const handleExport = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(opts)); } catch { /* private mode etc. */ }
    onExport(opts);
    onOpenChange(false);
  };

  const nothingSelected = !opts.includeSchematic && !opts.includeHarness;
  const harnessDisabled = !opts.includeHarness;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Export PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* ── Sheets ── */}
          {sheetCount > 1 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Sheets</div>
              <div className="flex gap-1.5">
                {([['current', `Current (${currentSheetName})`], ['all', `All ${sheetCount} sheets`]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patch({ scope: value })}
                    className={`flex-1 px-2 py-1.5 rounded border text-xs transition-colors ${
                      opts.scope === value
                        ? 'bg-primary/15 border-primary text-primary font-medium'
                        : 'bg-muted/40 border-border text-muted-foreground hover:border-muted-foreground/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Content ── */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Content</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={opts.includeSchematic}
                  onCheckedChange={(v) => patch({ includeSchematic: v === true })}
                />
                <span>Schematic</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={opts.includeHarness}
                  onCheckedChange={(v) => patch({ includeHarness: v === true })}
                />
                <span>Harness</span>
              </label>
            </div>
            {nothingSelected && (
              <p className="text-xs text-destructive mt-1.5">Select at least one of Schematic / Harness.</p>
            )}
          </div>

          {/* ── Harness options ── */}
          <div className={harnessDisabled ? 'opacity-40 pointer-events-none select-none' : ''}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Harness labels</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={opts.showCableNames}
                  onCheckedChange={(v) => patch({ showCableNames: v === true })}
                />
                <span>Cable names (where set)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={opts.showConductorCounts}
                  onCheckedChange={(v) => patch({ showConductorCounts: v === true })}
                />
                <span>Conductor counts</span>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Cable lengths</span>
                <select
                  value={opts.lengthsMode}
                  onChange={(e) => patch({ lengthsMode: e.target.value as WiringPdfExportOptions['lengthsMode'] })}
                  className="h-8 text-xs bg-background border border-border rounded px-2"
                >
                  <option value="none">Hidden</option>
                  <option value="defined">Measured only</option>
                  <option value="all">Measured + estimated (~)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={opts.includeCableSummary}
                  onCheckedChange={(v) => patch({ includeCableSummary: v === true })}
                />
                <span>Cable summary page (per cable segment, with totals)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={opts.includeWireSummary}
                  onCheckedChange={(v) => patch({ includeWireSummary: v === true })}
                />
                <span>Wire summary page (per wire, connector-to-connector)</span>
              </label>
            </div>
          </div>

          {/* ── Paper ── */}
          <div>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Paper size</span>
              <select
                value={opts.pageSize}
                onChange={(e) => patch({ pageSize: e.target.value as PdfPageSize })}
                className="h-8 text-xs bg-background border border-border rounded px-2"
              >
                <option value="A4">A4 landscape</option>
                <option value="A3">A3 landscape</option>
              </select>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleExport} disabled={nothingSelected} className="gap-1.5">
            <FileText className="w-4 h-4" /> Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
