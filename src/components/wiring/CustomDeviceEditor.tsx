import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, X } from 'lucide-react';
import {
  DeviceTemplate,
  DeviceCategory,
  CATEGORY_LABELS,
  LibraryPin,
  LibraryConnector,
  ManualLink,
  loadUserLibrary,
  upsertUserDevice,
  removeUserDevice,
  previewPlacedDevice,
} from '@/lib/wiring/library';
import { layoutDevice, DEVICE_HEADER } from '@/lib/wiring/layout';
import { getSymbolDef } from '@/lib/wiring/symbols';
import { SymbolBlock } from './SymbolBlock';
import type { Side, PinRole, ConnectorGender, ConnectorType } from '@/lib/wiring/types';
import { CONNECTOR_TYPE_LABELS, harnessGender, harnessRoleLabel } from '@/lib/wiring/types';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-fill when editing an existing user device. New device = null. */
  editing?: DeviceTemplate | null;
}

// "Top" omitted — top-side connectors collide with the device title area.
// Layout still handles legacy data; the editor just doesn't let you create
// new top-side pins.
const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: 'left',   label: 'Left'   },
  { value: 'right',  label: 'Right'  },
  { value: 'bottom', label: 'Bottom' },
];

const CATEGORY_OPTIONS: DeviceCategory[] = [
  'nav-com', 'audio', 'transponder', 'display', 'ahrs', 'autopilot', 'engine', 'ads-b', 'generic',
];

// "Signal" is the implicit default (stored as undefined) — selecting it on a
// pin clears the role field so the lint falls back to the name heuristic.
const ROLE_OPTIONS: { value: '' | PinRole; label: string }[] = [
  { value: '',        label: 'Signal'  },
  { value: 'power',   label: 'Power'   },
  { value: 'ground',  label: 'Ground'  },
  { value: 'nc',      label: 'NC'      },
];

// "—" is the implicit default (stored as undefined) — leave gender blank for
// connectors whose datasheet doesn't specify a gender (or you haven't checked).
const GENDER_OPTIONS: { value: '' | ConnectorGender; label: string }[] = [
  { value: '',  label: '—'                 },
  { value: 'M', label: 'M (male / pins)'    },
  { value: 'F', label: 'F (female / sockets)' },
];

// Same pattern for the physical connector family. Order matches the order
// they're most commonly used in avionics installs.
const CONNECTOR_TYPE_ORDER: ('' | ConnectorType)[] = [
  '',
  'dsub',
  'molex-microfit',
  'molex-minifit',
  'matenlok',
  'circular-mil',
  'ring-lug',
  'spade-lug',
  'fast-on',
  'pigtail',
  'rj45',
  'usb',
  'bnc',
  'tnc',
  'sma',
  'phone-jack',
  'other',
];

function makeId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `user-${slug || 'device'}-${Math.random().toString(36).slice(2, 6)}`;
}

export function CustomDeviceEditor({ open, onClose, editing }: Props) {
  const [form, setForm] = useState<DeviceTemplate>(() => blankTemplate());
  const [savedList, setSavedList] = useState<DeviceTemplate[]>([]);

  useEffect(() => {
    if (open) {
      setSavedList(loadUserLibrary());
      setForm(editing ? JSON.parse(JSON.stringify(editing)) : blankTemplate());
    }
  }, [open, editing]);

  const patchForm = (patch: Partial<DeviceTemplate>) => setForm(f => ({ ...f, ...patch }));

  const addConnector = () => {
    patchForm({
      connectors: [...form.connectors, { name: `J${form.connectors.length + 1}`, pins: [] }],
    });
  };

  const removeConnector = (i: number) => {
    patchForm({ connectors: form.connectors.filter((_, idx) => idx !== i) });
  };

  const updateConnector = (i: number, patch: Partial<LibraryConnector>) => {
    patchForm({
      connectors: form.connectors.map((c, idx) => idx === i ? { ...c, ...patch } : c),
    });
  };

  const addPin = (ci: number, side: Side) => {
    const c = form.connectors[ci];
    updateConnector(ci, { pins: [...c.pins, { name: 'Pin', pinNumber: String(c.pins.length + 1), side }] });
  };

  const removePin = (ci: number, pi: number) => {
    const c = form.connectors[ci];
    updateConnector(ci, { pins: c.pins.filter((_, idx) => idx !== pi) });
  };

  const updatePin = (ci: number, pi: number, patch: Partial<LibraryPin>) => {
    const c = form.connectors[ci];
    updateConnector(ci, { pins: c.pins.map((p, idx) => idx === pi ? { ...p, ...patch } : p) });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required.'); return; }
    if (form.connectors.length === 0) { toast.error('Add at least one connector.'); return; }
    // Enforce unique connector names within the device — multiple physical J1
    // plugs on one device aren't physically meaningful.
    const connNames = form.connectors.map(c => c.name.trim());
    const dupes = connNames.filter((n, i) => n && connNames.indexOf(n) !== i);
    if (dupes.length > 0) {
      toast.error(`Duplicate connector name "${dupes[0]}". Each connector must have a unique name (J1, J2, …).`);
      return;
    }
    if (connNames.some(n => !n)) {
      toast.error('All connectors must have a name.');
      return;
    }
    const toSave: DeviceTemplate = {
      ...form,
      id: form.id || makeId(form.name),
    };
    try {
      await upsertUserDevice(toSave);
      toast.success(`Saved "${toSave.name}" to your library`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Local cache was already updated optimistically — surface the server
      // error but let the user keep working; next save retries the push.
      toast.error(`Saved locally — server save failed: ${msg}`);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm(`Delete "${editing.name}" from your library? This cannot be undone.`)) return;
    try {
      await removeUserDevice(editing.id);
      toast.success('Device removed');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Removed locally — server delete failed: ${msg}`);
    }
  };

  const previewInstance = useMemo(() => {
    if (form.connectors.length === 0) return null;
    try { return previewPlacedDevice(form, { x: 0, y: 0 }); } catch { return null; }
  }, [form]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl w-[95vw] p-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2 border-b border-border">
          <DialogTitle>{editing ? 'Edit custom device' : 'Create custom device'}</DialogTitle>
          <DialogDescription className="sr-only">
            Define a device for your user library.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_360px] gap-0 overflow-hidden" style={{ height: 'calc(90vh - 120px)' }}>
          {/* Form */}
          <div className="overflow-y-auto p-5 space-y-4">

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => patchForm({ name: e.target.value })}
                  placeholder="e.g. Dynon SkyView HDX"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Part number</label>
                <Input
                  value={form.partNumber}
                  onChange={(e) => patchForm({ partNumber: e.target.value })}
                  placeholder="e.g. SV-HDX1100"
                  className="mt-1 h-9 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Manufacturer</label>
                <Input
                  value={form.manufacturer}
                  onChange={(e) => patchForm({ manufacturer: e.target.value })}
                  placeholder="e.g. Dynon"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => patchForm({ category: e.target.value as DeviceCategory })}
                  className="mt-1 w-full h-9 text-sm bg-background border border-border rounded px-2"
                >
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Designator prefix</label>
                <Input
                  value={form.designatorPrefix ?? 'U'}
                  onChange={(e) => patchForm({ designatorPrefix: e.target.value })}
                  placeholder="U"
                  maxLength={4}
                  className="mt-1 h-9 text-sm font-mono uppercase w-24"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Used to auto-name new instances ("U" → U1, U2, U3…). Common: U (LRU), SW (switch), CB (breaker), R (resistor).
                </p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
              <textarea
                value={form.description ?? ''}
                onChange={(e) => patchForm({ description: e.target.value })}
                placeholder="One or two sentences about the device."
                className="mt-1 w-full min-h-[50px] text-sm bg-background border border-border rounded px-2 py-1"
              />
            </div>

            {/* Manuals — any number of named links. We intentionally no
                longer expose the legacy single-URL datasheet field: new
                entries go here (add a row labelled "Datasheet" for that).
                Any pre-existing `datasheetUrl` on a loaded template is
                preserved in state and still surfaces in the Inspector via
                getManualLinks, it just isn't editable from this form. */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Manuals ({(form.manuals ?? []).length})
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-7"
                  onClick={() => patchForm({
                    manuals: [...(form.manuals ?? []), { label: '', url: '' }],
                  })}
                >
                  <Plus className="w-3 h-3" /> Add manual
                </Button>
              </div>
              {(form.manuals ?? []).length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Install manual, STC, pilot guide, etc. — any number of links.
                </p>
              )}
              <div className="space-y-2">
                {(form.manuals ?? []).map((m: ManualLink, idx: number) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <Input
                      value={m.label}
                      onChange={(e) => {
                        const next = [...(form.manuals ?? [])];
                        next[idx] = { ...next[idx], label: e.target.value };
                        patchForm({ manuals: next });
                      }}
                      placeholder="Label (e.g. Install Manual)"
                      className="h-8 text-sm flex-shrink-0 w-40"
                    />
                    <Input
                      value={m.url}
                      onChange={(e) => {
                        const next = [...(form.manuals ?? [])];
                        next[idx] = { ...next[idx], url: e.target.value };
                        patchForm({ manuals: next });
                      }}
                      placeholder="https://..."
                      className="h-8 text-sm flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => patchForm({
                        manuals: (form.manuals ?? []).filter((_, i) => i !== idx),
                      })}
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Connectors */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Connectors ({form.connectors.length})
                </label>
                <Button size="sm" variant="outline" onClick={addConnector} className="gap-1 h-7">
                  <Plus className="w-3 h-3" /> Add connector
                </Button>
              </div>
              <div className="space-y-3">
                {form.connectors.map((c, ci) => {
                  const trimmed = c.name.trim();
                  const isDupe = trimmed.length > 0 && form.connectors.some((other, oi) =>
                    oi !== ci && other.name.trim() === trimmed
                  );
                  return (
                  <div key={ci} className={`border rounded p-3 space-y-2 bg-card/30 ${isDupe ? 'border-destructive' : 'border-border'}`}>
                    <div className="flex items-center gap-2">
                      <Input
                        value={c.name}
                        onChange={(e) => updateConnector(ci, { name: e.target.value })}
                        className={`h-8 text-sm ${isDupe ? 'border-destructive' : ''}`}
                        placeholder="e.g. J1001"
                      />
                      <Button size="icon" variant="ghost" onClick={() => removeConnector(ci)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {isDupe && (
                      <div className="text-[10px] text-destructive">
                        Duplicate name — each connector must be unique on this device.
                      </div>
                    )}

                    {/* Physical-connector metadata — gender + family. Both feed
                        the BOM (shell P/N, crimp pins, backshell). Harness-side
                        gender is derived and shown below as a hint. */}
                    <div className="grid grid-cols-[1fr_1fr] gap-2">
                      <div>
                        <label className="text-[9px] uppercase tracking-wide text-muted-foreground">Connector type</label>
                        <select
                          value={c.connectorType ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateConnector(ci, { connectorType: v === '' ? undefined : (v as ConnectorType) });
                          }}
                          className="mt-0.5 w-full h-7 text-xs bg-background border border-border rounded px-1"
                        >
                          {CONNECTOR_TYPE_ORDER.map(v => (
                            <option key={v || 'unset'} value={v}>
                              {v === '' ? '—' : CONNECTOR_TYPE_LABELS[v]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-wide text-muted-foreground">Unit-side gender</label>
                        <select
                          value={c.gender ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateConnector(ci, { gender: v === '' ? undefined : (v as ConnectorGender) });
                          }}
                          className="mt-0.5 w-full h-7 text-xs bg-background border border-border rounded px-1"
                        >
                          {GENDER_OPTIONS.map(opt => (
                            <option key={opt.value || 'unset'} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {c.gender && (
                      <div className="text-[10px] text-muted-foreground -mt-1">
                        Harness mates with <span className="font-mono">{c.name.trim()}{harnessGender(c.gender)}</span>
                        {harnessRoleLabel(c.gender) ? ` (${harnessRoleLabel(c.gender)})` : ''}.
                      </div>
                    )}

                    {/* Pins */}
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted-foreground">
                        {c.pins.length} pin{c.pins.length === 1 ? '' : 's'}
                      </div>
                      {/* Header row clarifies the columns once the row gets
                          this dense — easy to lose track otherwise. */}
                      {c.pins.length > 0 && (
                        <div className="grid grid-cols-[50px_1fr_80px_80px_60px_50px_60px_1.2fr_24px] gap-1 px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                          <div>Pin#</div>
                          <div>Name</div>
                          <div>Side</div>
                          <div>Role</div>
                          <div>Current</div>
                          <div>AWG</div>
                          <div>Twist</div>
                          <div>Comment</div>
                          <div></div>
                        </div>
                      )}
                      {c.pins.map((p, pi) => (
                        <div key={pi} className="grid grid-cols-[50px_1fr_80px_80px_60px_50px_60px_1.2fr_24px] gap-1 items-center">
                          <Input
                            value={p.pinNumber ?? ''}
                            onChange={(e) => updatePin(ci, pi, { pinNumber: e.target.value })}
                            placeholder="#"
                            className="h-7 text-xs font-mono"
                          />
                          <Input
                            value={p.name}
                            onChange={(e) => updatePin(ci, pi, { name: e.target.value })}
                            placeholder="Pin name"
                            className="h-7 text-xs"
                          />
                          <select
                            value={p.side}
                            onChange={(e) => updatePin(ci, pi, { side: e.target.value as Side })}
                            className="h-7 text-xs bg-background border border-border rounded px-1"
                            title="Placement side"
                          >
                            {SIDE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <select
                            value={p.role ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              updatePin(ci, pi, { role: v === '' ? undefined : (v as PinRole) });
                            }}
                            className="h-7 text-xs bg-background border border-border rounded px-1"
                            title="Electrical role (used by lint checks)"
                          >
                            {ROLE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <Input
                            value={p.current ?? ''}
                            onChange={(e) => updatePin(ci, pi, { current: e.target.value || undefined })}
                            placeholder="—"
                            className="h-7 text-xs"
                            title="Max current rating, free text (e.g. 5A)"
                          />
                          <Input
                            value={p.wireGauge ?? ''}
                            onChange={(e) => updatePin(ci, pi, { wireGauge: e.target.value || undefined })}
                            placeholder="—"
                            className="h-7 text-xs"
                            title="Wire gauge in AWG (e.g. 20)"
                          />
                          <Input
                            value={p.twistGroup ?? ''}
                            onChange={(e) => updatePin(ci, pi, { twistGroup: e.target.value || undefined })}
                            placeholder="—"
                            className="h-7 text-xs font-mono"
                            title="Twisted-pair group. Pins with the same value (e.g. NET1) are twisted together in the harness; the Excel export's Twist Group column fills from this."
                          />
                          <Input
                            value={p.comment ?? ''}
                            onChange={(e) => updatePin(ci, pi, { comment: e.target.value || undefined })}
                            placeholder="—"
                            className="h-7 text-xs"
                            title="Free-form note"
                          />
                          <button
                            onClick={() => removePin(ci, pi)}
                            className="text-muted-foreground hover:text-destructive h-7 w-6 flex items-center justify-center"
                            title="Remove pin"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-1 pt-1">
                        {SIDE_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => addPin(ci, opt.value)}
                            className="text-[10px] px-2 py-1 rounded border border-border hover:bg-accent flex items-center gap-0.5"
                            title={`Add pin on ${opt.label}`}
                          >
                            <Plus className="w-2.5 h-2.5" /> {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  );
                })}
                {form.connectors.length === 0 && (
                  <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded">
                    No connectors yet. Click "Add connector" to start.
                  </div>
                )}
              </div>
            </div>

            {/* Saved user library quick-switcher */}
            {savedList.length > 0 && !editing && (
              <div className="pt-2 border-t border-border">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Your library ({savedList.length})
                </div>
                <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                  {savedList.map(d => (
                    <li key={d.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-accent">
                      <span className="truncate text-foreground">{d.name} <span className="text-muted-foreground">· {d.manufacturer}</span></span>
                      <button
                        onClick={() => setForm(JSON.parse(JSON.stringify(d)))}
                        className="text-primary hover:brightness-125 text-[10px]"
                      >
                        Edit
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Preview pane */}
          <div className="border-l border-border p-4 bg-card/40 overflow-y-auto">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Live preview</div>
            {previewInstance ? (
              <MiniPreview device={form} />
            ) : (
              <div className="text-xs text-muted-foreground">Add a connector to see the preview.</div>
            )}
            <div className="mt-4 pt-3 border-t border-border space-y-2 text-xs">
              <div><span className="text-muted-foreground">Total pins: </span>{form.connectors.reduce((n, c) => n + c.pins.length, 0)}</div>
              <div><span className="text-muted-foreground">Connectors: </span>{form.connectors.length}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-3 border-t border-border">
          <div>
            {editing && (
              <Button variant="ghost" onClick={handleDelete} className="text-destructive hover:text-destructive gap-1">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save to user library</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function blankTemplate(): DeviceTemplate {
  return {
    id: '',
    name: '',
    manufacturer: '',
    partNumber: '',
    category: 'generic',
    designatorPrefix: 'U',
    description: '',
    width: 200,
    height: 200,
    connectors: [{ name: 'J1', pins: [] }],
  };
}

function MiniPreview({ device }: { device: DeviceTemplate }) {
  try {
    const instance = previewPlacedDevice(device, { x: 0, y: 0 });
    const symbolDef = getSymbolDef(instance.symbolType);
    if (symbolDef) {
      const pad = 30;
      return (
        <svg
          viewBox={`${-pad} ${-pad} ${symbolDef.width + pad * 2} ${symbolDef.height + pad * 2}`}
          className="w-full h-auto bg-background rounded border border-border"
          style={{ maxHeight: 320 }}
        >
          <SymbolBlock device={instance} def={symbolDef} />
        </svg>
      );
    }
    const { width, height, connectors: connLayout } = layoutDevice(instance);
    const pad = 40;
    return (
      <svg viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
           className="w-full h-auto bg-background rounded border border-border" style={{ maxHeight: 360 }}>
        <rect width={width} height={height} rx={3} fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth={1} />
        <rect width={width} height={DEVICE_HEADER} rx={3} fill="hsl(var(--accent))" opacity={0.35} />
        <text x={8} y={18} fontSize={10} fontWeight={700} fill="hsl(var(--foreground))">
          {device.name || 'Unnamed device'}
        </text>
        {instance.connectors.map(c => {
          const l = connLayout.get(c.id);
          if (!l) return null;
          const isHoriz = c.side === 'top' || c.side === 'bottom';
          return (
            <g key={c.id}>
              <rect x={l.x} y={l.y} width={l.width} height={l.height} rx={2}
                    fill="hsl(var(--muted) / 0.3)" stroke="hsl(var(--border))" strokeWidth={0.75} />
              {l.pinLabels.map(pl => {
                const rot = isHoriz ? `rotate(-90 ${pl.x} ${pl.y})` : undefined;
                const anchor = isHoriz ? 'start' : pl.anchor;
                return (
                  <text key={pl.pinId} x={pl.x} y={pl.y} fontSize={6}
                        fill="hsl(var(--foreground))" textAnchor={anchor} transform={rot}>
                    {pl.name.length > 16 ? pl.name.slice(0, 15) + '…' : pl.name}
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
  } catch {
    return <div className="text-xs text-muted-foreground">Preview unavailable.</div>;
  }
}
