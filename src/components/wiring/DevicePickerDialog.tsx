import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Download, Upload, Wrench } from 'lucide-react';
import { MAIN_LIBRARY, loadUserLibrary, subscribeUserLibrary, syncUserLibrary, upsertUserDevice, CATEGORY_LABELS, DeviceTemplate, DeviceCategory, previewPlacedDevice, getManualLinks } from '@/lib/wiring/library';
import { layoutDevice, DEVICE_HEADER } from '@/lib/wiring/layout';
import { getSymbolDef } from '@/lib/wiring/symbols';
import { SymbolBlock } from './SymbolBlock';
import { toast } from 'sonner';

const ALL_GROUPS = '__ALL_GROUPS__';
const ALL_FAMILIES = '__ALL_FAMILIES__';

type DbKey = 'main' | 'user';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (tpl: DeviceTemplate) => void;
  /** When set, clicking "Edit" on a user-library row opens the editor. */
  onEditUserDevice?: (tpl: DeviceTemplate) => void;
  /** When set, the User database tab shows a "New custom" button that
   *  opens the Custom Device Editor with a blank form. */
  onNewCustomDevice?: () => void;
}

// JSON file shape used for export/import. We bump the version when the
// shape changes so future imports can upgrade old files cleanly.
interface ExportEnvelope {
  kind: 'benchlog.wiring.deviceTemplate';
  version: 1;
  exportedAt: string;
  templates: DeviceTemplate[];
}

function downloadJson(filename: string, body: unknown) {
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'device';
}

/**
 * Multisim-style device picker: Database → Group (category) → Family (manufacturer) → Device.
 * Preview pane on the right shows the selected device's schematic footprint and metadata.
 */
export function DevicePickerDialog({ open, onClose, onPick, onEditUserDevice, onNewCustomDevice }: Props) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [db, setDb] = useState<DbKey>('main');
  const [group, setGroup] = useState<string>(ALL_GROUPS);
  const [family, setFamily] = useState<string>(ALL_FAMILIES);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bump this whenever the user-library cache changes so we re-read it.
  // We subscribe to the library module's notify() on mount and also pull
  // from the server when the dialog opens so remote edits show up.
  const [userLibraryVersion, setUserLibraryVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeUserLibrary(() => setUserLibraryVersion(v => v + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (open) {
      setUserLibraryVersion(v => v + 1);
      // Pull the server's authoritative copy on open. No-op if offline.
      void syncUserLibrary();
    }
  }, [open]);

  const library: DeviceTemplate[] = useMemo(
    () => (db === 'main' ? MAIN_LIBRARY : loadUserLibrary()),
    [db, userLibraryVersion]
  );

  // Groups = distinct categories present in this library, with "All"
  const groups = useMemo(() => {
    const cats = Array.from(new Set(library.map(d => d.category))).sort();
    return cats;
  }, [library]);

  // Families = distinct manufacturers (within selected group)
  const families = useMemo(() => {
    const scope = group === ALL_GROUPS ? library : library.filter(d => d.category === group);
    return Array.from(new Set(scope.map(d => d.manufacturer))).sort();
  }, [library, group]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter(d => {
      if (group !== ALL_GROUPS && d.category !== group) return false;
      if (family !== ALL_FAMILIES && d.manufacturer !== family) return false;
      if (q && !(d.name.toLowerCase().includes(q)
             || d.manufacturer.toLowerCase().includes(q)
             || d.partNumber.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [library, group, family, query]);

  const selected = filtered.find(d => d.id === selectedId) ?? filtered[0] ?? null;

  const handleOk = () => {
    if (selected) {
      onPick(selected);
      onClose();
    }
  };

  // Export a single user-library template as a JSON file. Wrapped in an
  // envelope so importers can sanity-check the file before merging.
  const handleExportOne = (tpl: DeviceTemplate) => {
    const envelope: ExportEnvelope = {
      kind: 'benchlog.wiring.deviceTemplate',
      version: 1,
      exportedAt: new Date().toISOString(),
      templates: [tpl],
    };
    downloadJson(`${safeFilename(tpl.id || tpl.name)}.json`, envelope);
  };

  // Validate a single candidate template against the DeviceTemplate shape.
  // Returns null on success; otherwise a human-readable error string that
  // points at the FIRST problem found. We return on the first failure rather
  // than collect all of them — once one field is wrong the rest tend to
  // cascade in misleading ways.
  const validateTemplate = (raw: unknown, label: string): string | null => {
    if (!raw || typeof raw !== 'object') return `${label}: not an object.`;
    const t = raw as Record<string, unknown>;
    if (typeof t.id !== 'string' || !t.id.trim()) return `${label}: "id" must be a non-empty string.`;
    if (typeof t.name !== 'string' || !t.name.trim()) return `${label}: "name" must be a non-empty string.`;
    if (typeof t.manufacturer !== 'string') return `${label}: "manufacturer" must be a string.`;
    if (typeof t.partNumber !== 'string') return `${label}: "partNumber" must be a string.`;
    if (typeof t.category !== 'string') return `${label}: "category" must be a string.`;
    if (typeof t.width !== 'number' || !Number.isFinite(t.width) || t.width <= 0)
      return `${label}: "width" must be a positive number.`;
    if (typeof t.height !== 'number' || !Number.isFinite(t.height) || t.height <= 0)
      return `${label}: "height" must be a positive number.`;
    if (!Array.isArray(t.connectors)) return `${label}: "connectors" must be an array.`;
    for (let ci = 0; ci < t.connectors.length; ci++) {
      const c = t.connectors[ci] as Record<string, unknown>;
      if (!c || typeof c !== 'object') return `${label}: connectors[${ci}] is not an object.`;
      if (typeof c.name !== 'string' || !c.name.trim())
        return `${label}: connectors[${ci}].name must be a non-empty string.`;
      if (!Array.isArray(c.pins)) return `${label}: connectors[${ci}].pins must be an array.`;
      for (let pi = 0; pi < c.pins.length; pi++) {
        const p = (c.pins as unknown[])[pi] as Record<string, unknown>;
        if (!p || typeof p !== 'object') return `${label}: connectors[${ci}].pins[${pi}] is not an object.`;
        if (typeof p.name !== 'string' || !p.name.trim())
          return `${label}: connectors[${ci}].pins[${pi}].name must be a non-empty string.`;
        if (!['left', 'right', 'top', 'bottom'].includes(p.side as string))
          return `${label}: connectors[${ci}].pins[${pi}].side must be left/right/top/bottom.`;
        if (p.role !== undefined && !['power', 'ground', 'signal', 'nc'].includes(p.role as string))
          return `${label}: connectors[${ci}].pins[${pi}].role must be power/ground/signal/nc.`;
      }
    }
    return null;
  };

  // Import a JSON file. Accepts either an ExportEnvelope (preferred) or a
  // bare DeviceTemplate / array thereof (so users can hand-author imports).
  // Each template is upserted to the user's server library; duplicate ids
  // overwrite the existing entry. Files that fail validation are rejected
  // up front with a specific error rather than crashing later in the layout.
  const handleImportFile = async (file: File) => {
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); }
    catch { toast.error('That file is not valid JSON.'); return; }

    // Handle envelope wrapper, raw array, or single template — pull the
    // candidate list out without yet trusting the shape of any element.
    const list: unknown[] = (() => {
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as ExportEnvelope).templates)) {
        return (parsed as ExportEnvelope).templates as unknown[];
      }
      if (Array.isArray(parsed)) return parsed as unknown[];
      if (parsed && typeof parsed === 'object') return [parsed];
      return [];
    })();

    if (list.length === 0) {
      toast.error('No device templates found in that file.');
      return;
    }

    const valid: DeviceTemplate[] = [];
    const errors: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const candidate = list[i];
      const label = (candidate && typeof candidate === 'object' && typeof (candidate as { id?: unknown }).id === 'string')
        ? `Template "${(candidate as { id: string }).id}"`
        : `Template #${i + 1}`;
      const err = validateTemplate(candidate, label);
      if (err) {
        errors.push(err);
        continue;
      }
      valid.push(candidate as DeviceTemplate);
    }

    if (valid.length === 0) {
      // Show the first concrete error so the user knows what to fix in the file.
      toast.error(errors[0] ?? 'No valid device templates found in that file.');
      return;
    }

    let ok = 0, failed = 0;
    for (const tpl of valid) {
      try { await upsertUserDevice(tpl); ok++; }
      catch (err) {
        failed++;
        console.error('Import failed for', tpl.id, err);
      }
    }
    setUserLibraryVersion(v => v + 1);
    if (failed === 0 && errors.length === 0) {
      toast.success(`Imported ${ok} device${ok === 1 ? '' : 's'}.`);
    } else if (errors.length > 0 && failed === 0) {
      toast.warning(
        `Imported ${ok} of ${list.length} — ${errors.length} skipped (first error: ${errors[0]}).`
      );
    } else {
      toast.warning(
        `Imported ${ok} of ${list.length} — ${errors.length} skipped, ${failed} server-rejected (check console).`
      );
    }
  };

  const onImportClick = () => importInputRef.current?.click();
  const onImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (file) await handleImportFile(file);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* Fixed-size dialog so the layout doesn't jump when the preview image
          changes size or when extra toolbar buttons appear on the User tab. */}
      <DialogContent className="max-w-5xl w-[95vw] h-[80vh] max-h-[720px] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-4 shrink-0">
          <DialogTitle>Select a device</DialogTitle>
          <DialogDescription className="sr-only">
            Browse devices from the BenchLog library or your user library.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[170px_170px_1fr_300px] gap-3 px-5 pb-3 border-b border-border shrink-0">
          {/* Database */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Database</label>
            <select
              value={db}
              onChange={(e) => { setDb(e.target.value as DbKey); setGroup(ALL_GROUPS); setFamily(ALL_FAMILIES); setSelectedId(null); }}
              className="mt-1 w-full text-sm bg-background border border-border rounded px-2 py-1.5"
            >
              <option value="main">Main database</option>
              <option value="user">User database</option>
            </select>
          </div>

          {/* Group (Category) */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Group</label>
            <select
              value={group}
              onChange={(e) => { setGroup(e.target.value); setFamily(ALL_FAMILIES); setSelectedId(null); }}
              className="mt-1 w-full text-sm bg-background border border-border rounded px-2 py-1.5"
            >
              <option value={ALL_GROUPS}>All groups</option>
              {groups.map(g => (
                <option key={g} value={g}>{CATEGORY_LABELS[g as DeviceCategory] ?? g}</option>
              ))}
            </select>
          </div>

          {/* Manufacturer (Multisim calls this "Family"; renamed for clarity) */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Manufacturer</label>
            <select
              value={family}
              onChange={(e) => { setFamily(e.target.value); setSelectedId(null); }}
              className="mt-1 w-full text-sm bg-background border border-border rounded px-2 py-1.5"
            >
              <option value={ALL_FAMILIES}>All manufacturers</option>
              {families.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Search</label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="name, part number…"
              className="mt-1 h-9 text-sm"
            />
          </div>
        </div>

        {/* User-library toolbar — only visible on the User tab. New / Import
            actions live here so they don't clutter the main toolbar but stay
            one click from the rest of the user-library workflow. */}
        {/* Fixed-height slot so toggling between Main/User database (which
            shows/hides this toolbar) doesn't shift the panes below. */}
        <div className="h-10 px-5 flex items-center gap-2 border-b border-border bg-card/30 shrink-0">
        {db === 'user' && (onNewCustomDevice || true) && (
          <>
            {onNewCustomDevice && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { onNewCustomDevice(); onClose(); }}
                className="gap-1 h-7"
                title="Create a new custom device template"
              >
                <Wrench className="w-3.5 h-3.5" /> New custom…
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onImportClick}
              className="gap-1 h-7"
              title="Import device templates from a JSON file"
            >
              <Upload className="w-3.5 h-3.5" /> Import…
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportChange}
            />
            <span className="text-[11px] text-muted-foreground ml-1">
              Tip: hover a row and click the download icon to export it.
            </span>
          </>
        )}
        </div>

        {/* Main panes — flex-1 fills remaining height inside the fixed dialog. */}
        <div className="grid grid-cols-[1fr_300px] gap-0 flex-1 min-h-0">
          {/* Device list */}
          <div className="border-r border-border overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                {db === 'user' ? 'Your user library is empty.' : 'No devices match.'}
              </div>
            ) : (
              <ul>
                {filtered.map(d => (
                  <li key={d.id} className={`group flex items-center border-b border-border/40 hover:bg-accent ${selected?.id === d.id ? 'bg-accent' : ''}`}>
                    <button
                      onClick={() => setSelectedId(d.id)}
                      onDoubleClick={() => { onPick(d); onClose(); }}
                      className="flex-1 text-left px-4 py-2 text-sm flex items-center justify-between"
                    >
                      <span>
                        <span className="font-medium text-foreground">{d.name}</span>
                        <span className="text-muted-foreground ml-2">{d.manufacturer}</span>
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{d.partNumber}</span>
                    </button>
                    {db === 'user' && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExportOne(d); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-2 text-muted-foreground hover:text-foreground"
                          title="Export this device as JSON"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {onEditUserDevice && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditUserDevice(d); onClose(); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-2 text-muted-foreground hover:text-foreground"
                            title="Edit in custom device editor"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Preview pane — scrollable so a tall preview doesn't expand the dialog. */}
          <div className="p-4 bg-card/40 overflow-y-auto">
            {selected ? (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview</div>
                <DevicePreview device={selected} />
                <div className="pt-2 border-t border-border space-y-2 text-xs">
                  <div><span className="text-muted-foreground">Manufacturer: </span><span className="text-foreground">{selected.manufacturer}</span></div>
                  <div><span className="text-muted-foreground">Part number: </span><span className="text-foreground font-mono">{selected.partNumber}</span></div>
                  <div><span className="text-muted-foreground">Category: </span><span className="text-foreground">{CATEGORY_LABELS[selected.category]}</span></div>
                  <div><span className="text-muted-foreground">Pins: </span><span className="text-foreground">{selected.connectors.reduce((sum, c) => sum + c.pins.length, 0)}</span></div>
                  {selected.description && (
                    <div className="text-muted-foreground leading-relaxed pt-1">{selected.description}</div>
                  )}
                  {(() => {
                    const links = getManualLinks(selected);
                    if (links.length === 0) return null;
                    return (
                      <div className="pt-1 space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Manuals</div>
                        {links.map((m, i) => (
                          <a
                            key={`${m.url}-${i}`}
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-primary hover:underline text-xs truncate"
                            title={m.url}
                          >
                            {m.label} →
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No device selected.</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={handleOk} disabled={!selected}>Add to canvas</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DevicePreview({ device }: { device: DeviceTemplate }) {
  // Build a transient Device using the real instantiator. Symbol-typed
  // templates render via SymbolBlock (same as the canvas); everything else
  // runs through the connector layout engine.
  const instance = previewPlacedDevice(device, { x: 0, y: 0 });
  const symbolDef = getSymbolDef(instance.symbolType);

  if (symbolDef) {
    const pad = 30;
    const viewW = symbolDef.width + pad * 2;
    const viewH = symbolDef.height + pad * 2;
    return (
      <svg
        viewBox={`${-pad} ${-pad} ${viewW} ${viewH}`}
        className="w-full h-auto bg-background rounded border border-border"
        style={{ maxHeight: 320 }}
      >
        <SymbolBlock device={instance} def={symbolDef} />
      </svg>
    );
  }

  const { width, height, connectors: connLayout } = layoutDevice(instance);
  // Frame with padding so stubs + labels aren't clipped
  const pad = 40;
  const viewW = width + pad * 2;
  const viewH = height + pad * 2;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${viewW} ${viewH}`}
      className="w-full h-auto bg-background rounded border border-border"
      style={{ maxHeight: 320 }}
    >
      {/* Device body */}
      <rect width={width} height={height} rx={3} fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth={1} />
      <rect width={width} height={DEVICE_HEADER} rx={3} fill="hsl(var(--accent))" opacity={0.35} />
      <text x={8} y={18} fontSize={10} fontWeight={700} fill="hsl(var(--foreground))">{device.name}</text>

      {/* Connectors */}
      {instance.connectors.map(c => {
        const l = connLayout.get(c.id);
        if (!l) return null;
        const isHoriz = c.side === 'top' || c.side === 'bottom';
        const headerRect = isHoriz
          ? (c.side === 'top'
              ? { x: l.x, y: l.y + l.height - 12, w: l.width, h: 12 }
              : { x: l.x, y: l.y, w: l.width, h: 12 })
          : { x: l.x, y: l.y, w: l.width, h: 12 };
        return (
          <g key={c.id}>
            <rect x={l.x} y={l.y} width={l.width} height={l.height} rx={2}
                  fill="hsl(var(--muted) / 0.3)" stroke="hsl(var(--border))" strokeWidth={0.75} />
            <rect x={headerRect.x} y={headerRect.y} width={headerRect.w} height={headerRect.h}
                  fill="hsl(var(--accent))" opacity={0.4} />
            <text
              x={headerRect.x + headerRect.w / 2}
              y={headerRect.y + headerRect.h / 2 + 3}
              fontSize={7} fontWeight={600} textAnchor="middle" fill="hsl(var(--foreground))">
              {c.name}
            </text>
            {l.pinLabels.map(pl => {
              const rot = isHoriz ? `rotate(-90 ${pl.x} ${pl.y})` : undefined;
              const anchor = isHoriz ? 'start' : pl.anchor;
              return (
                <text key={pl.pinId} x={pl.x} y={pl.y} fontSize={6}
                      fill="hsl(var(--foreground))" textAnchor={anchor}
                      transform={rot}>
                  {pl.name.length > 18 ? pl.name.slice(0, 17) + '…' : pl.name}
                </text>
              );
            })}
            {l.pinPositions.map(pp => {
              let rx = pp.x, ry = pp.y;
              switch (l.outwardDir) {
                case 'left':  rx = pp.x + 14; break;
                case 'right': rx = pp.x - 14; break;
                case 'up':    ry = pp.y + 14; break;
                case 'down':  ry = pp.y - 14; break;
              }
              return (
                <g key={pp.pinId}>
                  <line x1={rx} y1={ry} x2={pp.x} y2={pp.y} stroke="hsl(var(--foreground))" strokeWidth={0.75} />
                  <circle cx={pp.x} cy={pp.y} r={2} fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth={0.75} />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
