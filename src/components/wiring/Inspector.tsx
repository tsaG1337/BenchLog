import { useState, useEffect } from 'react';
import { useWiring } from '@/lib/wiring/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, EyeOff, AlertTriangle, ExternalLink, GripVertical, ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import { getHiddenPins, getPinConnectorCount, getLogicalConnectorNames, formatPinRef } from '@/lib/wiring/layout';
import { colorForText } from './NetLabelView';
import { AnnotationEditor } from './AnnotationEditor';
import { getSymbolDef } from '@/lib/wiring/symbols';
import { findTemplateById, getManualLinks } from '@/lib/wiring/library';
import { logicalConnectorsOf, harnessTreeOf, bundleGeometricLengthMm, DEFAULT_MM_PER_UNIT } from '@/lib/wiring/harness';
import { useHarnessGraph } from './HarnessGraphContext';
import { wiresInNet } from '@/lib/wiring/nets';
import type { Side, Device, Pin, Placement, PlacedDevice, ConnectorGender, ConnectorType, Bundle, HarnessNode, HarnessGraph } from '@/lib/wiring/types';
import { mergePlacement, isJunctionKey, CONNECTOR_TYPE_LABELS, harnessGender, harnessRoleLabel } from '@/lib/wiring/types';

// "Top" intentionally omitted — top-side connectors collide with the device
// title area and don't look good; we keep layout support for legacy data
// but don't offer it as a picker choice. Use Bottom or Left/Right instead.
const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: 'left',   label: 'Left'   },
  { value: 'right',  label: 'Right'  },
  { value: 'bottom', label: 'Bottom' },
];

const GENDER_OPTIONS: { value: '' | ConnectorGender; label: string }[] = [
  { value: '',  label: '—'                  },
  { value: 'M', label: 'M (male / pins)'     },
  { value: 'F', label: 'F (female / sockets)' },
];

// Order matches CustomDeviceEditor for consistency. '' = "unset".
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

// ── Reusable colour-picker ──────────────────────────────────────────
const WIRE_COLOR_PRESETS = ['currentColor', '#ffffff', '#000000', '#e11d48', '#10b981', '#3b82f6'];

function WireColorPicker({
  value,
  onChange,
  allowNone,
}: {
  value: string | undefined;
  onChange: (c: string | undefined) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-6 gap-1">
        {WIRE_COLOR_PRESETS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-6 rounded border ${value === c ? 'ring-2 ring-primary' : 'border-border'}`}
            style={{ background: c === 'currentColor' ? 'hsl(var(--foreground))' : c }}
            title={c === 'currentColor' ? 'Default (no explicit colour)' : c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground flex items-center gap-1.5 cursor-pointer">
          <input
            type="color"
            value={value && value !== 'currentColor' ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-6 w-6 rounded border border-border cursor-pointer p-0"
          />
          Custom
        </label>
        {allowNone && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`text-[10px] px-2 h-6 rounded border ${value === undefined ? 'ring-2 ring-primary border-primary bg-primary/10' : 'border-border hover:bg-accent'}`}
          >
            None
          </button>
        )}
      </div>
    </div>
  );
}

export function Inspector() {
  const devices = useWiring(s => s.devices);
  const placements = useWiring(s => s.placements);
  const wires   = useWiring(s => s.wires);
  const netLabels = useWiring(s => s.netLabels);
  const selectedDeviceIds    = useWiring(s => s.selectedDeviceIds);
  const selectedWireIds      = useWiring(s => s.selectedWireIds);
  const selectedConnectorIds = useWiring(s => s.selectedConnectorIds);
  const selectedNetLabelIds  = useWiring(s => s.selectedNetLabelIds);
  const selectedShieldIds    = useWiring(s => s.selectedShieldIds);
  const selectedAnnotationIds = useWiring(s => s.selectedAnnotationIds);
  const annotations          = useWiring(s => s.annotations);
  const updateAnnotation     = useWiring(s => s.updateAnnotation);
  const removeAnnotation     = useWiring(s => s.removeAnnotation);
  const updateNetLabel       = useWiring(s => s.updateNetLabel);
  const removeNetLabel       = useWiring(s => s.removeNetLabel);
  const shields              = useWiring(s => s.shields);
  const updateShield         = useWiring(s => s.updateShield);
  const removeShield         = useWiring(s => s.removeShield);
  const shieldPickingId      = useWiring(s => s.shieldPickingId);
  const beginShieldPicking   = useWiring(s => s.beginShieldPicking);
  const endShieldPicking     = useWiring(s => s.endShieldPicking);
  const setHoveredWireId     = useWiring(s => s.setHoveredWireId);
  const updateDevice    = useWiring(s => s.updateDevice);
  const setDeviceAttribute = useWiring(s => s.setDeviceAttribute);
  const updateWire      = useWiring(s => s.updateWire);
  const updateNet       = useWiring(s => s.updateNet);
  const resetWireRouting = useWiring(s => s.resetWireRouting);
  const setWireLabelPosition = useWiring(s => s.setWireLabelPosition);
  const updateConnector = useWiring(s => s.updateConnector);
  const togglePinInConnector = useWiring(s => s.togglePinInConnector);
  const setConnectorPins = useWiring(s => s.setConnectorPins);
  const addConnector    = useWiring(s => s.addConnector);
  const removeConnector = useWiring(s => s.removeConnector);
  const movePinsToSheet = useWiring(s => s.movePinsToSheet);
  const splitConnectorsToNewPlacement = useWiring(s => s.splitConnectorsToNewPlacement);
  const moveConnectorToPlacement = useWiring(s => s.moveConnectorToPlacement);
  const sheets = useWiring(s => s.sheets);
  const activeSheetId = useWiring(s => s.activeSheetId);
  const selectedBundleId = useWiring(s => s.selectedBundleId);
  const selectedHarnessNodeIds = useWiring(s => s.selectedHarnessNodeIds);
  const selectedHarnessTree = useWiring(s => s.selectedHarnessTree);
  // The single derived harness graph for the active sheet — derived once in
  // `WiringPage` and shared via context, so the Inspector and the renderer
  // always resolve the same bundle ids / node ids.
  const harnessGraph = useHarnessGraph();
  const devIds  = Array.from(selectedDeviceIds);
  const wireIds = Array.from(selectedWireIds);
  const connIds = Array.from(selectedConnectorIds);
  const netIds  = Array.from(selectedNetLabelIds);
  const shieldIds = Array.from(selectedShieldIds);
  const annotIds = Array.from(selectedAnnotationIds);

  // Harness tree highlighted (double-click on a bundle) → HarnessTreePanel.
  // Takes priority over the single-bundle and node panels.
  if (selectedHarnessTree) {
    const tree = harnessTreeOf(selectedHarnessTree, harnessGraph);
    if (tree.bundleIds.length > 0) {
      return <HarnessTreePanel tree={tree} graph={harnessGraph} />;
    }
    // Seed bundle is gone — fall through to normal routing.
  }

  // Harness bundle selected → HarnessBundlePanel. Exclusive selection.
  if (selectedBundleId) {
    const bundle = harnessGraph.bundles.find(b => b.id === selectedBundleId);
    if (bundle) return <HarnessBundlePanel bundle={bundle} sheetId={activeSheetId} />;
  }

  // Harness node(s) selected → HarnessNodePanel. With multi-select the
  // panel shows the most-recently-resolvable node; ids that vanished from
  // the re-derived graph are skipped.
  if (selectedHarnessNodeIds.size > 0) {
    for (const id of selectedHarnessNodeIds) {
      const node = harnessGraph.nodes.find(n => n.id === id);
      if (node) return <HarnessNodePanel node={node} graph={harnessGraph} count={selectedHarnessNodeIds.size} />;
    }
  }

  // Single shield selected
  if (shieldIds.length === 1 && devIds.length === 0 && wireIds.length === 0
      && connIds.length === 0 && netIds.length === 0) {
    const shield = shields.find(sh => sh.id === shieldIds[0]);
    if (!shield) return <Empty />;
    return (
      <div className="p-4 space-y-3 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Shield
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Termination</label>
          <select
            value={shield.termination}
            onChange={(e) => updateShield(shield.id, { termination: e.target.value as 'ground' | 'float' | 'backshell' })}
            className="mt-1 w-full h-8 text-sm bg-background border border-border rounded px-2"
          >
            <option value="ground">Ground-terminated</option>
            <option value="float">Floating</option>
            <option value="backshell">Backshell (S)</option>
          </select>
        </div>
        {/* Width + Center X. Width expands the shield symmetrically around
            its current center; Center X slides the shield along the bundle
            without changing its width. Both snap to the 10-px grid. */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Width</label>
            <Input
              key={shield.id + '-width'}
              defaultValue={String(shield.xEnd - shield.xStart)}
              className="mt-1 h-8 text-sm font-mono"
              onBlur={(e) => {
                const w = Math.round(parseFloat(e.target.value) / 10) * 10;
                if (!Number.isFinite(w) || w < 10) {
                  e.target.value = String(shield.xEnd - shield.xStart);
                  return;
                }
                const center = (shield.xStart + shield.xEnd) / 2;
                const halfW = w / 2;
                updateShield(shield.id, {
                  xStart: Math.round((center - halfW) / 10) * 10,
                  xEnd:   Math.round((center + halfW) / 10) * 10,
                });
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Center X</label>
            <Input
              key={shield.id + '-center'}
              defaultValue={String(Math.round((shield.xStart + shield.xEnd) / 2))}
              className="mt-1 h-8 text-sm font-mono"
              onBlur={(e) => {
                const c = Math.round(parseFloat(e.target.value) / 10) * 10;
                if (!Number.isFinite(c)) {
                  e.target.value = String(Math.round((shield.xStart + shield.xEnd) / 2));
                  return;
                }
                const w = shield.xEnd - shield.xStart;
                updateShield(shield.id, {
                  xStart: Math.round((c - w / 2) / 10) * 10,
                  xEnd:   Math.round((c + w / 2) / 10) * 10,
                });
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Wires in this shield ({shield.wireIds.length})
          </div>
          <div className="border border-border rounded max-h-40 overflow-y-auto">
            {shield.wireIds.length === 0 && (
              <div className="p-3 text-[10px] text-muted-foreground italic">
                No wires — this shield will be removed automatically.
              </div>
            )}
            {shield.wireIds.map(wid => {
              const w = wires.find(x => x.id === wid);
              return (
                <div
                  key={wid}
                  className="flex items-center gap-2 px-2 py-1 text-[11px] border-b border-border/40 last:border-b-0 hover:bg-accent/40"
                  // Hovering a row glows the corresponding wire on the
                  // canvas — handy for matching list entries to physical
                  // wires when the bundle is dense. Cleared on leave so
                  // we don't leave a stale highlight after the cursor
                  // moves elsewhere.
                  onMouseEnter={() => setHoveredWireId(wid)}
                  onMouseLeave={() => setHoveredWireId(null)}
                >
                  <span className="flex-1 truncate font-mono">
                    {w ? formatPinRef(devices, w.fromPin, wires) + ' → ' + formatPinRef(devices, w.toPin, wires) : '(missing wire)'}
                  </span>
                  <button
                    onClick={() => updateShield(shield.id, { wireIds: shield.wireIds.filter(id => id !== wid) })}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove wire from shield"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          {/* Pick mode — arms the canvas to add the next clicked wire to
              this shield. Useful for grabbing wires that the initial drag
              didn't cover (e.g. junction halves the user wasn't aware of).
              Esc cancels; clicking the button again cancels too. */}
          {shieldPickingId === shield.id ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="flex-1 text-[10px] text-primary italic">
                Click a wire on the canvas to add it (Esc to cancel).
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={endShieldPicking}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-2 h-7 text-xs"
              onClick={() => beginShieldPicking(shield.id)}
            >
              + Add wire by clicking
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => removeShield(shield.id)}
        >
          Delete shield
        </Button>
      </div>
    );
  }

  // Single net label selected
  if (netIds.length === 1 && devIds.length === 0 && wireIds.length === 0 && connIds.length === 0) {
    const label = netLabels.find(n => n.id === netIds[0]);
    if (!label) return <Empty />;
    // All members of the implicit net (every label sharing this text).
    const netMembers = netLabels.filter(n => n.text === label.text);
    const autoSwatch = colorForText(label.text);
    const swatch = label.color ?? autoSwatch;

    // Format an attachment key for display: pin → "DeviceName.pinName",
    // junction → "junction", label → "label".
    const describeAttachment = (key: string): string => {
      if (isJunctionKey(key)) return 'junction';
      if (key.startsWith('#')) return 'label';
      const [deviceId, pinId] = key.split(':');
      const dev = devices.find(d => d.id === deviceId);
      const pinName = dev?.pinCatalog.find(p => p.id === pinId)?.name ?? pinId;
      return `${dev?.name ?? deviceId} · ${pinName}`;
    };

    // Walk the net's connectivity graph and collect every pin electrically
    // reachable from any label in this net. The graph has three edge types:
    //   1. Same-text labels are siblings (named-net equivalence).
    //   2. A wire connects its two endpoints (`fromPin`/`toPin`).
    //   3. A `junction:<id>` node connects every wire/label endpoint that
    //      references the same id — handled by the wire-edge step in (2)
    //      via plain endpoint-key equality.
    // BFS until no new nodes surface, then return every visited pin key.
    const findNetPins = (): string[] => {
      const visited = new Set<string>();
      const queue: string[] = [];
      const enqueue = (k: string) => {
        if (!visited.has(k)) { visited.add(k); queue.push(k); }
      };

      // Seed with every same-text label's anchor + its own `#labelId`.
      for (const m of netMembers) {
        enqueue(m.attachedTo);
        enqueue(`#${m.id}`);
      }

      while (queue.length) {
        const node = queue.shift()!;

        // (1) Same-text label siblings.
        if (node.startsWith('#')) {
          const lbl = netLabels.find(n => `#${n.id}` === node);
          if (lbl) {
            for (const sib of netLabels.filter(n => n.text === lbl.text)) {
              enqueue(`#${sib.id}`);
              enqueue(sib.attachedTo);
            }
          }
        }

        // (2) Wires touching this node.
        for (const w of wires) {
          if (w.fromPin === node) enqueue(w.toPin);
          else if (w.toPin === node) enqueue(w.fromPin);
        }
      }

      const pins: string[] = [];
      for (const k of visited) {
        if (isJunctionKey(k) || k.startsWith('#')) continue;
        pins.push(k);
      }
      return pins.sort();
    };
    const netPins = findNetPins();

    return (
      <div className="p-4 space-y-3 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Net label
        </div>

        {/* Net heading — clickable colour swatch (opens the native picker),
            net name, and member count. The swatch's hidden <input type="color">
            value defaults to the auto-derived hex when the user hasn't
            overridden, so the picker opens on the right starting colour. */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-muted/40">
          <label
            className="inline-block w-4 h-4 rounded-sm shrink-0 ring-1 ring-border cursor-pointer hover:ring-primary transition-shadow"
            style={{ background: swatch }}
            title="Click to pick a colour"
          >
            <input
              type="color"
              value={swatch}
              onChange={(e) => updateNetLabel(label.id, { color: e.target.value })}
              className="sr-only"
            />
          </label>
          {label.color && (
            <button
              type="button"
              onClick={() => updateNetLabel(label.id, { color: undefined })}
              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              title="Reset to auto-derived colour"
            >
              reset
            </button>
          )}
          <span className="font-semibold text-sm text-foreground truncate">{label.text || '(unnamed)'}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {netMembers.length === 1 ? '1 attachment' : `${netMembers.length} attachments`}
          </span>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Net name</label>
          <Input
            value={label.text}
            onChange={(e) => updateNetLabel(label.id, { text: e.target.value })}
            className="mt-1 h-8 text-sm"
            placeholder="e.g. 5V, GND, SkyView Power"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {netMembers.length > 1
              ? 'Pins sharing this name form an implicit net — no wire required between them.'
              : 'Add another label with the same name on any pin or wire to link them on the same net.'}
          </p>
        </div>

        {/* Orientation — rotates the flag in 90° steps. The 4-up grid lets
            the user pick a specific direction directly; the inline button
            cycles through them. */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Orientation
          </div>
          <div className="flex items-center gap-1">
            {([0, 90, 180, 270] as const).map(deg => (
              <Button
                key={deg}
                size="sm"
                variant={(label.rotation ?? 0) === deg ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                onClick={() => updateNetLabel(label.id, { rotation: deg })}
                title={`${deg}°`}
              >
                {deg === 0 ? '→' : deg === 90 ? '↓' : deg === 180 ? '←' : '↑'}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 ml-auto"
              title="Rotate 90°"
              onClick={() => {
                const cur = label.rotation ?? 0;
                const next = ((cur + 90) % 360) as 0 | 90 | 180 | 270;
                updateNetLabel(label.id, { rotation: next });
              }}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* On this net — pins reached by following wires from any label
            with this name. Pulled from the connectivity graph so it stays
            accurate even when the label is wired to a pin via a separate
            Wire object (rather than anchored directly to the pin). */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            On this net
          </div>
          <ul className="space-y-1">
            {netPins.length === 0 && (
              <li className="text-[11px] text-muted-foreground italic px-2 py-1">
                No pins wired yet — drop another label on a pin or wire one to a label flag.
              </li>
            )}
            {netPins.map(pinKey => (
              <li
                key={pinKey}
                className="flex items-center gap-2 px-2 py-1 rounded border border-border bg-card text-xs"
              >
                <span className="font-mono text-[11px] text-foreground truncate">{describeAttachment(pinKey)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Labels carrying this net name — useful when several flags are
            scattered across the diagram and you want to see all of them. */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Labels on this net
          </div>
          <ul className="space-y-1">
            {netMembers.map(m => (
              <li
                key={m.id}
                className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${
                  m.id === label.id ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <span className="font-mono text-[11px] text-foreground truncate">{describeAttachment(m.attachedTo)}</span>
                {m.id === label.id && (
                  <span className="ml-auto text-[9px] uppercase tracking-wider text-primary">selected</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => removeNetLabel(label.id)}
        >
          Remove label
        </Button>
      </div>
    );
  }

  // Single annotation selected — branches by kind (text vs note).
  if (annotIds.length === 1 && devIds.length === 0 && wireIds.length === 0
      && connIds.length === 0 && netIds.length === 0) {
    const a = annotations.find(n => n.id === annotIds[0]);
    if (!a) return <Empty />;
    return (
      <div className="p-4 space-y-3 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {a.kind === 'note' ? 'Note marker' : 'Text annotation'}
        </div>

        {a.kind === 'note' && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Number</label>
            <Input
              type="number"
              min={1}
              value={a.number}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n > 0) updateAnnotation(a.id, { number: n });
              }}
              className="mt-1 h-8 text-sm w-24"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Auto-assigned on creation. Override here to keep numbering in sync with your notes.
            </p>
          </div>
        )}

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
            {a.kind === 'note' ? 'Description' : 'Text'}
          </label>
          <AnnotationEditor
            value={a.text}
            onChange={(html) => updateAnnotation(a.id, { text: html })}
            rows={a.kind === 'text' ? 5 : 3}
            placeholder={a.kind === 'note'
              ? 'Note description (renders next to the triangle)'
              : 'Free-form comment'}
          />
        </div>

        {a.kind === 'text' && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Font size</label>
            <Input
              type="number"
              min={8} max={48}
              value={a.fontSize ?? 12}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n >= 8 && n <= 48) updateAnnotation(a.id, { fontSize: n });
              }}
              className="mt-1 h-8 text-sm w-24"
            />
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => removeAnnotation(a.id)}
        >
          Remove {a.kind === 'note' ? 'note' : 'text'}
        </Button>
      </div>
    );
  }

  // Single connector selected. Connector instances now live on Placements,
  // so we look up via placements and merge with the parent device to build
  // the PlacedDevice the inspector needs.
  if (connIds.length === 1) {
    const parentPlacement = placements.find(p => p.connectors.some(c => c.id === connIds[0]));
    const parentDevice = parentPlacement ? mergePlacement(parentPlacement, devices) : null;
    if (!parentDevice) return <Empty />;
    const conn = parentDevice.connectors.find(c => c.id === connIds[0])!;

    // Only pins matching this connector's logical name are eligible.
    const eligiblePins = parentDevice.pinCatalog.filter(
      p => p.logicalConnectorName === conn.logicalConnectorName
    );
    const logicalNames = getLogicalConnectorNames(parentDevice);

    return (
      <div className="p-4 space-y-3 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Connector on {parentDevice.name}
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Display name</label>
          <Input
            value={conn.name}
            onChange={(e) => updateConnector(parentDevice.id, conn.id, { name: e.target.value })}
            className="mt-1 h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Free text — the physical plug is controlled below.
          </p>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Physical connector</label>
          <select
            value={conn.logicalConnectorName}
            onChange={(e) => {
              const next = e.target.value;
              if (next === conn.logicalConnectorName) return;
              if (conn.pinIds.length > 0 && !confirm(
                `Switching to "${next}" will remove pins that don't belong to it. Continue?`
              )) return;
              updateConnector(parentDevice.id, conn.id, { logicalConnectorName: next });
            }}
            className="mt-1 w-full h-8 text-sm bg-background border border-border rounded px-2"
          >
            {logicalNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">
            This connector is a view of the physical plug {conn.logicalConnectorName}.
          </p>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Side</label>
          <div className="grid grid-cols-3 gap-1 mt-1">
            {SIDE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateConnector(parentDevice.id, conn.id, { side: opt.value })}
                className={`text-xs py-1 rounded border ${
                  conn.side === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-accent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Physical connector metadata. Editing either field propagates to
            every ConnectorInstance that shares this logicalConnectorName
            (split-side views AND sibling placements like U1A/U1B), enforced
            by store.updateConnector. */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Connector type</label>
            <select
              value={conn.connectorType ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                updateConnector(parentDevice.id, conn.id, { connectorType: v === '' ? undefined : (v as ConnectorType) });
              }}
              className="mt-1 w-full h-8 text-xs bg-background border border-border rounded px-2"
            >
              {CONNECTOR_TYPE_ORDER.map(v => (
                <option key={v || 'unset'} value={v}>
                  {v === '' ? '—' : CONNECTOR_TYPE_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unit-side gender</label>
            <select
              value={conn.gender ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                updateConnector(parentDevice.id, conn.id, { gender: v === '' ? undefined : (v as ConnectorGender) });
              }}
              className="mt-1 w-full h-8 text-xs bg-background border border-border rounded px-2"
            >
              {GENDER_OPTIONS.map(opt => (
                <option key={opt.value || 'unset'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        {conn.gender && (
          <p className="text-[10px] text-muted-foreground -mt-1">
            Harness mates with <span className="font-mono">{conn.logicalConnectorName}{harnessGender(conn.gender)}</span>
            {harnessRoleLabel(conn.gender) ? ` (${harnessRoleLabel(conn.gender)})` : ''}.
          </p>
        )}

        <ConnectorPinList
          placementId={parentDevice.id}
          conn={conn}
          eligiblePins={eligiblePins}
          parentDevice={parentDevice}
          onToggle={(pinId) => togglePinInConnector(parentDevice.id, conn.id, pinId)}
          onReorder={(newOrder) => setConnectorPins(parentDevice.id, conn.id, newOrder)}
        />

        {/* Split this connector-view off to a NEW sibling placement on the
            same sheet — the "big-device sectioning" action. Only shown when
            the placement has more than one connector-view (otherwise there's
            nothing left to split from). */}
        {parentDevice.connectors.length > 1 && (
          <div className="border-t border-border pt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Split to new section on this sheet
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              Moves this connector-view to a new sibling placement of {parentDevice.name} on the same sheet. Useful for breaking up large devices into sections.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs"
              onClick={() => splitConnectorsToNewPlacement(parentDevice.id, [conn.id])}
            >
              Split this view to new placement
            </Button>
          </div>
        )}

        {/* Move this connector-view to an EXISTING sibling placement of the
            same device — same-sheet (e.g. U4A → U4B) or another sheet. The
            on-canvas drag-handle (⋮⋮ on the connector header) is the
            primary way to do this; this dropdown is the keyboard-friendly
            equivalent. Only shown when at least one sibling placement exists. */}
        {(() => {
          const siblings = placements.filter(
            p => p.deviceId === parentDevice.deviceId && p.id !== parentDevice.id
          );
          if (siblings.length === 0) return null;
          return (
            <div className="border-t border-border pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Move to existing placement
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">
                Moves this connector-view to another sibling placement of {parentDevice.name} (e.g. {parentDevice.name} → another section on this or another sheet).
              </p>
              <select
                className="w-full h-8 text-xs bg-background border border-border rounded px-2"
                defaultValue=""
                onChange={(e) => {
                  const targetId = e.target.value;
                  if (!targetId) return;
                  moveConnectorToPlacement(parentDevice.id, conn.id, targetId);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>Move to placement…</option>
                {siblings.map(p => {
                  const sheet = sheets.find(s => s.id === p.sheetId);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.id}{sheet ? ` · ${sheet.name}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })()}

        {/* Move pins to another sheet — the "multi-unit" Flow-B action.
            Moves every pin currently in this connector-view to a placement
            of the same device on the chosen sheet (creating one if needed).
            Only shown when the project has at least one OTHER sheet AND
            the current view has pins to move. */}
        {conn.pinIds.length > 0 && sheets.length > 1 && (
          <div className="border-t border-border pt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Move to another sheet
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              Moves the {conn.pinIds.length} pin{conn.pinIds.length === 1 ? '' : 's'} in this view to a placement of {parentDevice.name} on the target sheet.
            </p>
            <div className="flex gap-2">
              <select
                className="flex-1 h-8 text-xs bg-background border border-border rounded px-2"
                defaultValue=""
                onChange={(e) => {
                  const targetSheetId = e.target.value;
                  if (!targetSheetId) return;
                  movePinsToSheet(parentDevice.deviceId, [...conn.pinIds], parentDevice.id, targetSheetId);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>Move pins to…</option>
                {sheets
                  .filter(sh => sh.id !== parentDevice.sheetId)
                  .map(sh => (
                    <option key={sh.id} value={sh.id}>
                      {sh.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(`Remove this view of "${conn.logicalConnectorName}"? Pins remain on the device.`)) {
              removeConnector(parentDevice.id, conn.id);
            }
          }}
        >
          Remove connector view
        </Button>
      </div>
    );
  }

  // Single placement selected. selectedDeviceIds hold placement ids; we
  // resolve to a PlacedDevice (Placement + parent Device).
  if (devIds.length === 1 && wireIds.length === 0 && connIds.length === 0) {
    const placement = placements.find(p => p.id === devIds[0]);
    const dev = placement ? mergePlacement(placement, devices) : null;
    if (!dev) return <Empty />;
    const symbolDef = getSymbolDef(dev.symbolType);
    if (symbolDef) {
      return <SymbolDeviceInspector device={dev} def={symbolDef} onUpdateDevice={updateDevice} onSetAttribute={setDeviceAttribute} />;
    }
    return <DeviceInspector device={dev} onAdd={addConnector} onUpdateDevice={updateDevice} onTogglePin={togglePinInConnector} />;
  }

  // Net selection: one or more wires, no devices/connectors, all in the same net.
  const netMembers = wireIds.length >= 1 ? wiresInNet(wireIds[0], wires, netLabels) : [];
  const isNetSelection =
    devIds.length === 0 &&
    connIds.length === 0 &&
    wireIds.length >= 1 &&
    wireIds.every(id => netMembers.includes(id));

  if (isNetSelection) {
    const seed = wireIds[0];
    const seedWire = wires.find(w => w.id === seed);
    if (!seedWire) return <Empty />;
    const isSingleSegment = wireIds.length === 1;

    // AWG hint from the seed wire's endpoints (informational only).
    const fromKey = seedWire.fromPin.split(':');
    const toKey = seedWire.toPin.split(':');
    const fromDev = devices.find(d => d.id === fromKey[0]);
    const toDev = devices.find(d => d.id === toKey[0]);
    const fromPin = fromDev?.pinCatalog.find(p => p.id === fromKey[1]);
    const toPin = toDev?.pinCatalog.find(p => p.id === toKey[1]);
    const awgHint = [fromPin?.wireGauge, toPin?.wireGauge].filter(Boolean).join(' / ');

    return (
      <div className="p-4 space-y-3 text-xs">
        {/* Net section header */}
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Net{!isSingleSegment ? ` (${wireIds.length} segments)` : ''}
        </div>

        {/* ── Net-level controls (apply to every segment in the net) ── */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Signal Name</label>
          <Input
            value={seedWire.label ?? ''}
            onChange={(e) => updateNet(seed, { label: e.target.value })}
            placeholder="optional — e.g. 5V, GND, CAN-H"
            className="mt-1 h-8 text-sm"
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Colour</label>
          <div className="mt-1">
            <WireColorPicker
              value={seedWire.color}
              onChange={(c) => updateNet(seed, { color: c ?? 'currentColor' })}
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stripe</label>
          <div className="mt-1">
            <WireColorPicker
              allowNone
              value={seedWire.stripeColor}
              onChange={(c) => updateNet(seed, { stripeColor: c })}
            />
          </div>
        </div>

        {/* Wire gauge — free-text AWG. Empty input clears the field. */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Wire gauge (AWG)
          </label>
          <Input
            // `key` ties the DOM input's identity to the seed wire so switching
            // selection remounts the input with the new defaultValue.
            key={seed}
            defaultValue={seedWire.awg ?? ''}
            placeholder={awgHint || 'e.g. 20, 22'}
            className="mt-1 h-8 text-sm"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (seedWire.awg ?? '')) return;
              updateNet(seed, { awg: v || undefined });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
          {awgHint && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Pin spec: {awgHint} AWG
            </p>
          )}
        </div>

        {/* ── Segment-level controls (single segment only) ── */}
        {isSingleSegment && (
          <div className="pt-2 border-t border-border space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Segment
            </div>

            <div>
              {/* Visibility toggle — signal name is hidden from the wire by
                  default; flip this on to draw it on the canvas (with a drag
                  handle for positioning). */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Show on wire</span>
                <Switch
                  checked={!!seedWire.showLabel}
                  onCheckedChange={(checked) => updateWire(seedWire.id, { showLabel: checked })}
                  disabled={!seedWire.label}
                />
              </div>
              {seedWire.showLabel && seedWire.label && (
                <div className="flex items-center justify-between mt-2 gap-2">
                  <span className="text-xs text-muted-foreground">Rotation</span>
                  <select
                    value={seedWire.labelRotation ?? 'auto'}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateWire(seedWire.id, {
                        labelRotation: v === 'auto' ? undefined : Number(v),
                      });
                    }}
                    className="h-7 text-xs bg-background border border-border rounded px-1"
                  >
                    <option value="auto">Auto (follow wire)</option>
                    <option value="0">Horizontal (0°)</option>
                    <option value="90">Vertical (90°)</option>
                    <option value="270">Vertical (270°)</option>
                  </select>
                </div>
              )}
              {seedWire.showLabel && seedWire.label && (seedWire.labelX !== undefined || seedWire.labelY !== undefined) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1 h-7 text-xs"
                  onClick={() => setWireLabelPosition(seedWire.id, undefined, undefined)}
                >
                  Reset label position
                </Button>
              )}
              {seedWire.showLabel && seedWire.label && seedWire.labelX === undefined && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Drag the label on the canvas to move it.
                </p>
              )}
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Routing</label>
              {(seedWire.midX !== undefined || seedWire.fromY !== undefined || seedWire.toY !== undefined) ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1 h-7 text-xs"
                  onClick={() => resetWireRouting(seedWire.id)}
                >
                  Reset auto-routing
                </Button>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Auto-routed. Drag the handles on the wire — the middle one moves left/right,
                  the two near the pins move up/down (adding a short jog so the pin stays put).
                </p>
              )}
            </div>

            <div className="pt-1 border-t border-border text-muted-foreground space-y-1">
              <div>From: <span className="font-mono text-foreground">{formatPinRef(devices, seedWire.fromPin, wires)}</span></div>
              <div>To: <span className="font-mono text-foreground">{formatPinRef(devices, seedWire.toPin, wires)}</span></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const total = devIds.length + wireIds.length + connIds.length;
  if (total > 1) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        {devIds.length} device{devIds.length === 1 ? '' : 's'} ·{' '}
        {connIds.length} connector{connIds.length === 1 ? '' : 's'} ·{' '}
        {wireIds.length} wire{wireIds.length === 1 ? '' : 's'} selected.
        <div className="mt-2">Select a single item to edit its properties.</div>
      </div>
    );
  }
  return <Empty />;
}

function Empty() {
  return (
    <div className="p-4 text-xs text-muted-foreground">
      Click a device, connector, or wire to edit its properties.
    </div>
  );
}

/**
 * Wire list with colour swatch, endpoints, and AWG. Used in the harness
 * Bundle and Node panels. Bundles/branches own their wire MEMBERSHIP
 * through derivation — that is never hand-edited — but each conductor's
 * physical attributes ARE editable here.
 *
 * When `editable` is set, each row exposes a gauge (AWG) input and a colour
 * picker; both call the `updateWire` store action, editing the underlying
 * `Wire` (shared schematic data) — these are NOT harness overrides.
 *
 * Hovering a row highlights the corresponding wire on the canvas via the
 * existing setHoveredWireId hook so the user can match list rows to physical
 * wires when the bundle is dense.
 */
function WireList({ wireIds, emptyHint, editable }: {
  wireIds: string[];
  emptyHint?: string;
  editable?: boolean;
}) {
  const devices = useWiring(s => s.devices);
  const wires = useWiring(s => s.wires);
  const setHoveredWireId = useWiring(s => s.setHoveredWireId);
  const updateWire = useWiring(s => s.updateWire);

  if (wireIds.length === 0) {
    return (
      <div className="border border-border rounded p-3 text-[10px] text-muted-foreground italic">
        {emptyHint ?? 'No wires.'}
      </div>
    );
  }

  return (
    <div className="border border-border rounded max-h-64 overflow-y-auto">
      {wireIds.map(wid => {
        const w = wires.find(x => x.id === wid);
        const endpoints = w
          ? `${formatPinRef(devices, w.fromPin, wires)} → ${formatPinRef(devices, w.toPin, wires)}`
          : '(missing wire)';
        // A wire whose color is the schematic-default 'currentColor' has no
        // user-chosen colour yet — it falls back to black, the default
        // conductor colour. A real choice renders as that colour.
        const realColor = w?.color && w.color !== 'currentColor' ? w.color : undefined;
        const swatchColor = realColor ?? '#000000';
        // The wire's signal name (what the user typed in the schematic
        // inspector). May be blank — only render the row if it's set.
        const wireName = w?.label?.trim();
        return (
          <div
            key={wid}
            className="px-2 py-1 text-[11px] border-b border-border/40 last:border-b-0 hover:bg-accent/40"
            onMouseEnter={() => setHoveredWireId(wid)}
            onMouseLeave={() => setHoveredWireId(null)}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm border border-border/60 flex-shrink-0"
                style={{ background: swatchColor }}
                title={realColor ?? 'No color set (black)'}
              />
              <div className="flex-1 min-w-0 flex flex-col leading-tight">
                {wireName && (
                  <span className="truncate font-medium text-foreground" title={wireName}>{wireName}</span>
                )}
                <span className="truncate font-mono text-muted-foreground" title={endpoints}>{endpoints}</span>
              </div>
              {!editable && (
                <span className="font-mono text-muted-foreground text-[10px] whitespace-nowrap">
                  {w?.awg ? `${w.awg} AWG` : '—'}
                </span>
              )}
            </div>
            {editable && w && (
              // Per-conductor gauge. Edits the Wire itself (shared
              // schematic data) via updateWire — not a harness override.
              <div className="flex items-center gap-2 mt-1 pl-5">
                <Input
                  // `key` ties the input identity to this wire so switching
                  // selection remounts it (defaultValue only runs on mount).
                  key={`${wid}-awg`}
                  defaultValue={w.awg ?? ''}
                  placeholder="AWG"
                  className="h-6 w-16 text-[10px] px-1.5"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (w.awg ?? '')) return;
                    updateWire(w.id, { awg: v || undefined });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Inspector panel shown when the user has double-clicked a bundle to highlight
 * its entire harness tree. Displays aggregate counts for the tree: component
 * nodes (units), splices, branch points, cables, and total conductors.
 */
function HarnessTreePanel({
  tree,
  graph,
}: {
  tree: { bundleIds: string[]; nodeIds: string[] };
  graph: HarnessGraph;
}) {
  // Count node kinds reachable in the tree.
  let units = 0;
  let splices = 0;
  let branchPoints = 0;
  for (const id of tree.nodeIds) {
    const n = graph.nodes.find(node => node.id === id);
    if (!n) continue;
    if (n.kind === 'component') units++;
    else if (n.kind === 'splice') splices++;
    else if (n.kind === 'branchPoint') branchPoints++;
  }

  // Build a lookup of bundle id → bundle for conductor union.
  const bundleMap = new Map<string, Bundle>();
  for (const b of graph.bundles) bundleMap.set(b.id, b);

  // Union of all conductor ids across every bundle in the tree.
  const conductorSet = new Set<string>();
  for (const bid of tree.bundleIds) {
    const b = bundleMap.get(bid);
    if (b) for (const cid of b.conductorIds) conductorSet.add(cid);
  }

  return (
    <div className="p-4 space-y-3 text-xs">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Harness
      </div>
      <p className="text-[10px] text-muted-foreground">
        Every cable and node electrically connected through the double-clicked bundle.
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="text-[10px] text-muted-foreground">Units</div>
        <div className="font-mono text-xs text-foreground text-right">{units}</div>

        <div className="text-[10px] text-muted-foreground">Splices</div>
        <div className="font-mono text-xs text-foreground text-right">{splices}</div>

        <div className="text-[10px] text-muted-foreground">Branch points</div>
        <div className="font-mono text-xs text-foreground text-right">{branchPoints}</div>

        <div className="text-[10px] text-muted-foreground">Cables</div>
        <div className="font-mono text-xs text-foreground text-right">{tree.bundleIds.length}</div>

        <div className="text-[10px] text-muted-foreground">Conductors</div>
        <div className="font-mono text-xs text-foreground text-right">{conductorSet.size}</div>
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Conductors in this harness ({conductorSet.size})
        </label>
        <div className="mt-1">
          <WireList
            wireIds={Array.from(conductorSet).sort()}
            emptyHint="No conductors in this harness."
            editable
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Inspector panel for a derived harness `Bundle` — one physical cable
 * segment of the `HarnessGraph`.
 *
 * Bundling itself is 100% derived — the Conductor MEMBERSHIP is never
 * hand-edited. But the override layer makes three things editable here:
 *  - the Bundle's **name** — a `HarnessOverrides.bundleNames` entry, keyed
 *    by the bundle's stable sorted-pair id, written via `setBundleName`
 *    (Phase 4);
 *  - the cable's physical **length (mm)** — a `HarnessOverrides.bundleLengths`
 *    entry, written via `setBundleLength` (Phase 3);
 *  - each Conductor's **gauge + colour** — these edit the underlying `Wire`
 *    (shared schematic data) via `updateWire`, NOT an override.
 */
function HarnessBundlePanel({ bundle, sheetId }: { bundle: Bundle; sheetId: string }) {
  const setBundleLength = useWiring(s => s.setBundleLength);
  const setBundleName = useWiring(s => s.setBundleName);
  // The derived graph (shared via context) and the active sheet's scale —
  // together they yield the geometric length estimate shown as the
  // placeholder when the user hasn't set a physical length.
  const harnessGraph = useHarnessGraph();
  const mmPerUnit = useWiring(s => {
    const sh = s.sheets.find(x => x.id === s.activeSheetId);
    return sh?.harness?.mmPerUnit ?? DEFAULT_MM_PER_UNIT;
  });
  const geom = bundleGeometricLengthMm(bundle, harnessGraph, mmPerUnit);
  return (
    <div className="p-4 space-y-3 text-xs">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Bundle
      </div>
      <div className="text-[10px] text-muted-foreground">
        {bundle.conductorIds.length} conductor{bundle.conductorIds.length === 1 ? '' : 's'} —
        a physical cable carrying the conductors of every net whose route crosses it.
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bundle name
        </label>
        <Input
          // `key` ties the input identity to this bundle so switching the
          // selected bundle remounts the field with the new defaultValue.
          key={`${bundle.id}-name`}
          type="text"
          defaultValue={bundle.name ?? ''}
          placeholder="unnamed"
          className="mt-1 h-8 text-sm"
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const next = raw === '' ? undefined : raw;
            if ((next ?? '') === (bundle.name ?? '')) return;
            setBundleName(sheetId, bundle.id, next);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          A label for this cable — shown on the harness canvas. Leave blank for none.
        </p>
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Cable length (mm)
        </label>
        <Input
          // `key` ties the input identity to this bundle so switching the
          // selected bundle remounts the field with the new defaultValue.
          key={`${bundle.id}-len`}
          type="number"
          min={0}
          defaultValue={bundle.length ?? ''}
          placeholder={`~${Math.round(geom)} mm (estimated)`}
          className="mt-1 h-8 text-sm"
          onBlur={(e) => {
            const raw = e.target.value.trim();
            // Blank clears the override (back to "auto"); a number sets it.
            const next = raw === '' ? undefined : Number(raw);
            const current = bundle.length;
            if (next === current) return;
            if (next !== undefined && !Number.isFinite(next)) return;
            setBundleLength(sheetId, bundle.id, next);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          The physical run length of this cable. Leave blank to use the estimated geometric length.
        </p>
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Conductors in this Bundle ({bundle.conductorIds.length})
        </label>
        <div className="mt-1">
          <WireList
            wireIds={bundle.conductorIds}
            emptyHint="No conductors routed through this Bundle."
            editable
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Inspector panel for a `HarnessNode` of the derived graph — a `splice`
 * (a wire-to-wire Splice), a `branchPoint` (a derived fan-out — Branch
 * Point), or a `component` (a placed Component). Shows the node kind and
 * the Conductors meeting at it; each Conductor's gauge + colour is editable
 * (edits the `Wire`, not a harness override).
 *
 * `count` is how many harness nodes are currently selected — surfaced so a
 * multi-select shows the user the rest of the selection moves together.
 */
function HarnessNodePanel({ node, graph, count = 1 }: { node: HarnessNode; graph: HarnessGraph; count?: number }) {
  const devices = useWiring(s => s.devices);
  const placements = useWiring(s => s.placements);
  const wires = useWiring(s => s.wires);

  // Bundles incident on this node.
  const incident = graph.bundles.filter(
    b => b.endpoints[0] === node.id || b.endpoints[1] === node.id,
  );

  const kindLabel = node.kind === 'splice'
    ? 'Splice'
    : node.kind === 'branchPoint'
      ? 'Branch Point'
      : node.kind === 'connector'
        ? 'Connector'
        : 'Component';

  // For a component node, resolve the device for a friendly heading.
  let heading = node.id;
  if (node.kind === 'component') {
    const placement = placements.find(p => p.id === node.refId);
    const dev = placement ? devices.find(d => d.id === placement.deviceId) : undefined;
    if (dev) heading = dev.name;
  } else if (node.kind === 'splice') {
    heading = node.refId ?? node.id;
  }

  // For a splice node, "Conductors meeting here" = only the wires that
  // electrically terminate at this junction (fromPin or toPin ===
  // "junction:<junctionId>"). The refId is "J:<junctionId>" — strip the
  // leading "J:" to get the raw junctionId.
  // For component and branchPoint nodes, keep the existing behaviour:
  // union of all incident bundles' conductorIds.
  const conductorIds: string[] = node.kind === 'splice' && node.refId
    ? (() => {
        const jid = node.refId.startsWith('J:') ? node.refId.slice(2) : node.refId;
        const junctionKey = `junction:${jid}`;
        return wires
          .filter(w => w.fromPin === junctionKey || w.toPin === junctionKey)
          .map(w => w.id);
      })()
    : Array.from(new Set(incident.flatMap(b => b.conductorIds)));

  return (
    <div className="p-4 space-y-3 text-xs">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {kindLabel}
      </div>
      {count > 1 && (
        <div className="text-[10px] text-primary">
          {count} harness nodes selected — drag any one to move them together.
        </div>
      )}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-muted/40">
        <span className="font-semibold text-sm text-foreground truncate">{heading}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {incident.length} Bundle{incident.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {node.kind === 'splice'
          ? 'An electrical wire-to-wire Splice where Bundles fan out.'
          : node.kind === 'branchPoint'
            ? 'A Branch Point — a derived fan-out where a branch peels off its parent Bundle.'
            : node.kind === 'connector'
              ? "A Connector — a device's harness termination point."
              : 'A placed Component — a vertex of this harness tree.'}
      </p>
      {node.kind === 'component' && (
        <div className="text-[10px] text-muted-foreground">
          Orientation: {node.orientation ?? 0}°
        </div>
      )}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Conductors meeting here ({conductorIds.length})
        </label>
        <div className="mt-1">
          <WireList
            wireIds={conductorIds}
            emptyHint="No conductors meet at this node."
            editable
          />
        </div>
      </div>
    </div>
  );
}

// ── Symbol-based device inspector (ground / breaker / resistor / caps) ─
// ── Connector pin list with drag-to-reorder ─────────────────────────
// Two sections: pins currently in the view (draggable — the order here
// drives the rendered order on the canvas) and other eligible pins that
// can be added. Drag-and-drop is native HTML5 — no extra dependency.
function ConnectorPinList({ placementId: _placementId, conn, eligiblePins, parentDevice, onToggle, onReorder }: {
  placementId: string;
  conn: import('@/lib/wiring/types').ConnectorInstance;
  eligiblePins: Pin[];
  parentDevice: PlacedDevice;
  onToggle: (pinId: string) => void;
  onReorder: (newOrder: string[]) => void;
}) {
  const [dragPinId, setDragPinId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Free-text filter applied to BOTH the in-view and available rows. We
  // match against the pin name, pinNumber, and any free-text metadata
  // (current/AWG/comment) so users searching for "5A" or "20 AWG" find
  // the pin even if the name doesn't include those tokens. Matching is
  // case-insensitive, substring.
  const [filter, setFilter] = useState('');
  const matchesFilter = (p: Pin) => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return [p.name, p.pinNumber, p.current, p.wireGauge, p.comment]
      .filter((s): s is string => Boolean(s))
      .some(s => s.toLowerCase().includes(q));
  };

  const inViewAll = conn.pinIds
    .map(id => eligiblePins.find(p => p.id === id))
    .filter((p): p is Pin => !!p);
  const notInViewAll = eligiblePins.filter(p => !conn.pinIds.includes(p.id));
  const inView = inViewAll.filter(matchesFilter);
  const notInView = notInViewAll.filter(matchesFilter);
  const totalShown = inView.length + notInView.length;
  const totalAll = inViewAll.length + notInViewAll.length;

  const handleDrop = (targetPinId: string) => {
    if (!dragPinId || dragPinId === targetPinId) {
      setDragPinId(null);
      setDropTargetId(null);
      return;
    }
    const current = [...conn.pinIds];
    const fromIdx = current.indexOf(dragPinId);
    const toIdx   = current.indexOf(targetPinId);
    if (fromIdx < 0 || toIdx < 0) {
      setDragPinId(null);
      setDropTargetId(null);
      return;
    }
    current.splice(fromIdx, 1);
    current.splice(toIdx, 0, dragPinId);
    onReorder(current);
    setDragPinId(null);
    setDropTargetId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pins on this view ({conn.pinIds.length} of {eligiblePins.length})
        </div>
        {filter && (
          <button
            onClick={() => setFilter('')}
            className="text-[10px] text-muted-foreground hover:text-foreground"
            title="Clear filter"
          >
            ✕ clear
          </button>
        )}
      </div>
      {/* Pin search — filters both in-view and available pins by name,
          number, and metadata. Hidden when the connector has fewer than
          ~8 pins because the list fits on screen anyway. */}
      {totalAll >= 8 && (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter pins (name, #, AWG, current…)"
          className="h-7 text-[11px] mb-1"
        />
      )}
      {filter && totalShown === 0 && (
        <div className="text-[10px] text-muted-foreground py-2 px-2 italic">
          No pins match "{filter}".
        </div>
      )}
      <div className="border border-border rounded max-h-56 overflow-y-auto">
        {eligiblePins.length === 0 && (
          <div className="p-3 text-[10px] text-muted-foreground">
            No pins belong to {conn.logicalConnectorName}. Add them via the custom device editor first.
          </div>
        )}

        {/* In-view pins — draggable. The order of this list IS the render
            order on the canvas; dropping a row onto another rearranges
            conn.pinIds via setConnectorPins. */}
        {inView.map(p => {
          const shared = getPinConnectorCount(parentDevice, p.id);
          const sharedWithOthers = shared > 1;
          const isDragging = dragPinId === p.id;
          const isDropTarget = dropTargetId === p.id && dragPinId !== p.id;
          return (
            <PinRowWithMeta
              key={p.id}
              pin={p}
              deviceId={parentDevice.deviceId}
              draggable
              isDragging={isDragging}
              isDropTarget={isDropTarget}
              sharedWithOthers={sharedWithOthers}
              onToggle={() => onToggle(p.id)}
              onDragStart={(e) => {
                setDragPinId(p.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragPinId && dragPinId !== p.id) setDropTargetId(p.id);
              }}
              onDragLeave={() => {
                if (dropTargetId === p.id) setDropTargetId(null);
              }}
              onDrop={(e) => { e.preventDefault(); handleDrop(p.id); }}
              onDragEnd={() => { setDragPinId(null); setDropTargetId(null); }}
            />
          );
        })}

        {/* Separator + "available pins" heading when both sections have rows */}
        {inView.length > 0 && notInView.length > 0 && (
          <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/30 border-t border-border">
            Available
          </div>
        )}

        {/* Eligible pins not yet in this view — tick the box to add. */}
        {notInView.map(p => {
          const shared = getPinConnectorCount(parentDevice, p.id);
          const alsoInOthers = shared > 0;
          return (
            <label
              key={p.id}
              className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent"
            >
              {/* Spacer keeps alignment with the drag-handle column above */}
              <span className="w-3 shrink-0" />
              <input
                type="checkbox"
                checked={false}
                onChange={() => onToggle(p.id)}
                className="shrink-0"
              />
              {p.pinNumber && (
                <span className="font-mono text-[10px] text-muted-foreground w-6">{p.pinNumber}</span>
              )}
              <span className="flex-1 truncate text-foreground">{p.name}</span>
              {alsoInOthers && (
                <span className="text-[10px] text-muted-foreground">on {shared} other</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Designator editor (shared) ──────────────────────────────────────
// Typing into the live device.name would trigger an atomic rename on every
// keystroke — intermediate values ("U", "U1") often collide with existing
// devices mid-typing, which would reject the whole edit. This wrapper keeps
// a local draft and commits on blur/Enter. On a collision it shows an inline
// error and leaves the draft editable so the user can fix it or press Esc.
function DesignatorInput({ device, placeholder }: { device: PlacedDevice; placeholder?: string }) {
  const renameDevice = useWiring(s => s.renameDevice);
  const [draft, setDraft] = useState(device.name);
  const [error, setError] = useState<string | null>(null);

  // When the selected device changes (or gets renamed from elsewhere), re-sync
  // the draft. Keying on deviceId AND name so rename-from-elsewhere wins over
  // a stale local draft.
  const [syncedKey, setSyncedKey] = useState(`${device.deviceId}:${device.name}`);
  const currentKey = `${device.deviceId}:${device.name}`;
  if (currentKey !== syncedKey) {
    setSyncedKey(currentKey);
    setDraft(device.name);
    setError(null);
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === device.name) {
      setDraft(device.name);
      setError(null);
      return;
    }
    const ok = renameDevice(device.deviceId, trimmed);
    if (!ok) {
      setError(`"${trimmed}" is already in use — pick another designator.`);
    } else {
      setError(null);
    }
  };

  return (
    <div>
      <Input
        value={draft}
        onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setDraft(device.name); setError(null); (e.target as HTMLInputElement).blur(); }
        }}
        placeholder={placeholder}
        className={`mt-1 h-8 text-sm ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
      />
      {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
    </div>
  );
}

// ── BOM fields (Manufacturer / Part #) — shared between inspectors ──
// Editable for every device (symbol or generic). Generic symbol templates
// (breaker, resistor, thermocouple, …) start blank; real-part templates come
// pre-filled from the template but can be overridden per-instance.
function BomFields({ device }: { device: PlacedDevice }) {
  const updateDevice = useWiring(s => s.updateDevice);
  const [mfr,   setMfr]   = useState(device.manufacturer ?? '');
  const [pn,    setPn]    = useState(device.partNumber   ?? '');

  // Re-sync when the selected device changes (otherwise the draft from the
  // previous selection would leak into the new one).
  const [syncedKey, setSyncedKey] = useState(device.deviceId);
  if (syncedKey !== device.deviceId) {
    setSyncedKey(device.deviceId);
    setMfr(device.manufacturer ?? '');
    setPn(device.partNumber ?? '');
  }

  const commitMfr = () => {
    const next = mfr.trim();
    if ((device.manufacturer ?? '') === next) return;
    updateDevice(device.deviceId, { manufacturer: next });
  };
  const commitPn = () => {
    const next = pn.trim();
    if ((device.partNumber ?? '') === next) return;
    updateDevice(device.deviceId, { partNumber: next });
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Manufacturer</label>
        <Input
          value={mfr}
          onChange={(e) => setMfr(e.target.value)}
          onBlur={commitMfr}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="e.g. Garmin"
          className="mt-1 h-8 text-sm"
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Part #</label>
        <Input
          value={pn}
          onChange={(e) => setPn(e.target.value)}
          onBlur={commitPn}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="e.g. 011-04813-00"
          className="mt-1 h-8 text-sm font-mono"
        />
      </div>
    </div>
  );
}

// ── Manuals (shared between symbol + generic device inspectors) ─────
// Looks up the template from the library by device.templateId and renders
// every manual link as a clickable external-link row. Silent no-op when
// the device has no templateId (e.g. a custom device that was deleted from
// the user library while still on the canvas).
function ManualsSection({ device }: { device: Device }) {
  const template = findTemplateById(device.templateId);
  const links = getManualLinks(template);
  if (links.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        Manuals
      </div>
      <ul className="space-y-1">
        {links.map((m, i) => (
          <li key={`${m.url}-${i}`}>
            <a
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-primary hover:underline text-xs"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{m.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SymbolDeviceInspector({ device, def, onUpdateDevice, onSetAttribute }: {
  device: PlacedDevice;
  def: ReturnType<typeof getSymbolDef> & {};
  onUpdateDevice: (id: string, patch: { name?: string }) => void;
  onSetAttribute: (id: string, key: string, value: string) => void;
}) {
  if (!def) return null;
  return (
    <div className="p-4 space-y-3 text-xs">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {device.productName ?? 'Symbol'}
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Designator</label>
        <DesignatorInput device={device} placeholder="e.g. BRK1, XPDR" />
      </div>
      {def.attributes.map(attr => (
        <div key={attr.key}>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{attr.label}</label>
          <Input
            value={device.attributes?.[attr.key] ?? attr.defaultValue}
            onChange={(e) => onSetAttribute(device.deviceId, attr.key, e.target.value)}
            placeholder={attr.placeholder}
            className="mt-1 h-8 text-sm"
          />
        </div>
      ))}
      <BomFields device={device} />
      <ManualsSection device={device} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">X</label>
          <div className="mt-1 font-mono text-foreground">{Math.round(device.position.x)}</div>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Y</label>
          <div className="mt-1 font-mono text-foreground">{Math.round(device.position.y)}</div>
        </div>
      </div>
    </div>
  );
}

/** Pins of one logical connector, ordered for a pinout: by pin number —
 *  numeric when both values parse as numbers, string compare otherwise.
 *  Pins with no number sort last, keeping their pinCatalog order (stable sort). */
function sortedConnectorPins(device: PlacedDevice, logicalName: string): Pin[] {
  const pins = device.pinCatalog.filter(p => p.logicalConnectorName === logicalName);
  return pins.sort((a, b) => {
    const an = a.pinNumber, bn = b.pinNumber;
    if (!an && !bn) return 0;
    if (!an) return 1;
    if (!bn) return -1;
    const af = Number(an), bf = Number(bn);
    if (Number.isFinite(af) && Number.isFinite(bf)) return af - bf;
    return an.localeCompare(bn);
  });
}

/**
 * Harness-view pinout for a selected Unit. Every logical connector is a
 * collapsible section (expanded by default); each shows that connector's pins
 * — number + name — read-only. Used in place of the connector summary list in
 * the harness view (in the schematic view the pins are drawn on the canvas).
 */
function DevicePinout({ device }: { device: PlacedDevice }) {
  // Names of connectors the user has collapsed. Empty = all expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const connectors = logicalConnectorsOf(device);

  function toggle(name: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  if (connectors.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground">
        This device has no pins yet.
      </div>
    );
  }

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        Connectors ({connectors.length})
      </div>
      <ul className="space-y-1">
        {connectors.map(lc => {
          const isCollapsed = collapsed.has(lc.name);
          // Type + harness role come from any instance of this connector —
          // instances sharing a logical name are kept in sync by the store.
          const inst = lc.instances[0];
          const typeLabel = inst?.connectorType ? CONNECTOR_TYPE_LABELS[inst.connectorType] : undefined;
          const role = harnessRoleLabel(inst?.gender);
          const meta = [typeLabel, role].filter(Boolean).join(', ');
          const pins = sortedConnectorPins(device, lc.name);
          return (
            <li key={lc.name} className="border border-border rounded">
              <button
                type="button"
                onClick={() => toggle(lc.name)}
                className="w-full flex items-center justify-between px-2 py-1 hover:bg-accent text-left"
              >
                <span className="font-medium text-foreground">
                  {isCollapsed ? '▸' : '▾'} {lc.name}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {lc.pinCount} pin{lc.pinCount === 1 ? '' : 's'}{meta ? ` · ${meta}` : ''}
                </span>
              </button>
              {!isCollapsed && (
                <div className="px-2 pb-1">
                  {pins.map(p => (
                    <div key={p.id} className="flex gap-2 py-0.5 text-[11px]">
                      <span className="font-mono text-muted-foreground w-8 shrink-0 text-right">
                        {p.pinNumber || '—'}
                      </span>
                      <span className="text-foreground">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Device inspector ────────────────────────────────────────────────
function DeviceInspector({ device, onAdd, onUpdateDevice, onTogglePin }: {
  device: PlacedDevice;
  onAdd: (deviceId: string, side: Side, logicalConnectorName?: string) => void;
  onUpdateDevice: (id: string, patch: { name?: string; width?: number; height?: number }) => void;
  onTogglePin: (deviceId: string, connectorId: string, pinId: string) => void;
}) {
  const hidden = getHiddenPins(device);
  const logicalNames = getLogicalConnectorNames(device);
  const placements = useWiring(s => s.placements);
  const sheets = useWiring(s => s.sheets);
  const mergePlacementInto = useWiring(s => s.mergePlacementInto);
  // Add-connector-view is a schematic-only action (splits a connector
  // into L/R/B sides for visual layout). Hidden in harness view because
  // we collapse all views into one logical connector there.
  const viewMode = useWiring(s => {
    const sh = s.sheets.find(sh2 => sh2.id === s.activeSheetId);
    return sh?.harness?.viewMode ?? 'schematic';
  });
  // Sibling placements of this device that this one could be merged INTO.
  const siblings = placements.filter(p => p.deviceId === device.deviceId && p.id !== device.id);

  // State for the "Add connector view" form.
  const [newLogical, setNewLogical] = useState<string>(logicalNames[0] ?? '');
  const [newSide, setNewSide] = useState<Side>('left');

  // Group ConnectorInstances by their logical connector name.
  const grouped = logicalNames.map(lname => ({
    lname,
    totalPins: device.pinCatalog.filter(p => p.logicalConnectorName === lname).length,
    views: device.connectors.filter(c => c.logicalConnectorName === lname),
  }));

  return (
    <div className="p-4 space-y-3 text-xs">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Designator</label>
        <DesignatorInput device={device} placeholder="e.g. U1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">X</label>
          <div className="mt-1 font-mono text-foreground">{Math.round(device.position.x)}</div>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Y</label>
          <div className="mt-1 font-mono text-foreground">{Math.round(device.position.y)}</div>
        </div>
      </div>

      <BomFields device={device} />
      <ManualsSection device={device} />

      {viewMode === 'harness' ? (
        <DevicePinout device={device} />
      ) : (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Connectors ({logicalNames.length})
          </div>
          {logicalNames.length === 0 && (
            <div className="text-[10px] text-muted-foreground">
              This device has no pins yet.
            </div>
          )}
          <ul className="space-y-0.5">
            {grouped.map(g => (
              <li key={g.lname} className="py-1 px-2 rounded hover:bg-accent">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{g.lname}</span>
                  <span className="text-muted-foreground text-[10px]">
                    {g.totalPins} pin{g.totalPins === 1 ? '' : 's'} · {g.views.length} view{g.views.length === 1 ? '' : 's'}
                  </span>
                </div>
                {g.views.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {g.views.map(v => v.side).join(' · ') || '—'}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Merge this placement back into a sibling — the inverse of "Split to
          new section". Only shown when this device has more than one
          placement. We require an explicit confirm because the source
          placement is deleted; the connector views move, but the placement
          letter (e.g. "U4B") is gone after merge. */}
      {siblings.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Merge this section
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">
            Moves every connector view from {device.name} into a sibling
            placement, then deletes {device.name}.
          </p>
          <select
            className="w-full h-8 text-xs bg-background border border-border rounded px-2"
            defaultValue=""
            onChange={(e) => {
              const targetId = e.target.value;
              if (!targetId) return;
              const target = siblings.find(p => p.id === targetId);
              if (!target) return;
              const sheetName = sheets.find(s => s.id === target.sheetId)?.name ?? '';
              const ok = window.confirm(
                `Merge ${device.name} into ${target.id}${sheetName ? ` (${sheetName})` : ''}?\n\n` +
                `${device.connectors.length} connector view${device.connectors.length === 1 ? '' : 's'} will move, ` +
                `and the section ${device.name} will be removed.`
              );
              e.target.value = '';
              if (!ok) return;
              mergePlacementInto(device.id, targetId);
            }}
          >
            <option value="" disabled>Merge into…</option>
            {siblings.map(p => {
              const sheet = sheets.find(s => s.id === p.sheetId);
              return (
                <option key={p.id} value={p.id}>
                  {p.id}{sheet ? ` · ${sheet.name}` : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {viewMode === 'schematic' && logicalNames.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Add connector view
          </div>
          <div className="space-y-1">
            <select
              value={newLogical}
              onChange={(e) => setNewLogical(e.target.value)}
              className="w-full h-8 text-sm bg-background border border-border rounded px-2"
            >
              {logicalNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-1">
              {SIDE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setNewSide(opt.value)}
                  className={`text-[10px] py-1 rounded border ${
                    newSide === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1 h-7"
              onClick={() => onAdd(device.id, newSide, newLogical || logicalNames[0])}
            >
              <Plus className="w-3 h-3" /> Add view of {newLogical}
            </Button>
          </div>
        </div>
      )}

      {hidden.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
            <EyeOff className="w-3 h-3" /> Hidden pins ({hidden.length})
          </div>
          <div className="border border-border rounded max-h-48 overflow-y-auto">
            {hidden.map(p => (
              <HiddenPinRow key={p.id} pin={p} device={device} onAssign={(cid) => onTogglePin(device.id, cid, p.id)} />
            ))}
          </div>
        </div>
      )}

      {hidden.length === 0 && logicalNames.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          All {device.pinCatalog.length} pin{device.pinCatalog.length === 1 ? '' : 's'} are on a connector.
        </div>
      )}
    </div>
  );
}

// Single in-view pin row + collapsible editor for current/AWG/comment.
// The chevron expands the row; uncontrolled <input>s keep keystroke latency
// from blowing up the wiring store on every character.
function PinRowWithMeta({
  pin, deviceId, draggable, isDragging, isDropTarget, sharedWithOthers, onToggle,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: {
  pin: Pin;
  deviceId: string;
  draggable: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  sharedWithOthers: boolean;
  onToggle: () => void;
  onDragStart: React.DragEventHandler<HTMLDivElement>;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDragLeave: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onDragEnd: React.DragEventHandler<HTMLDivElement>;
}) {
  const updatePin = useWiring(s => s.updatePin);
  const [open, setOpen] = useState(false);
  const hasMeta = !!(pin.current || pin.wireGauge || pin.comment);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`border-b border-border/40 last:border-b-0 ${
        sharedWithOthers ? 'bg-yellow-500/10' : ''
      } ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'border-t-2 border-primary' : ''}`}
    >
      <div className="flex items-center gap-2 px-2 py-1 hover:bg-accent">
        <GripVertical className="w-3 h-3 text-muted-foreground shrink-0 cursor-grab" />
        <input type="checkbox" checked={true} onChange={onToggle} className="shrink-0" />
        {pin.pinNumber && (
          <span className="font-mono text-[10px] text-muted-foreground w-6">{pin.pinNumber}</span>
        )}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex-1 min-w-0 flex items-center gap-1 text-left"
          title={open ? 'Hide pin metadata' : 'Show pin metadata'}
        >
          {open
            ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
            : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />}
          <span className="truncate text-foreground">{pin.name}</span>
          {hasMeta && !open && (
            <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-1">
              {[pin.current, pin.wireGauge && `${pin.wireGauge} AWG`].filter(Boolean).join(' · ')}
            </span>
          )}
        </button>
        {sharedWithOthers && (
          <span title="Pin appears on multiple views" className="text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="w-3 h-3" />
          </span>
        )}
      </div>
      {open && (
        <div className="px-3 pb-2 pt-1 grid grid-cols-[60px_1fr] gap-x-2 gap-y-1 text-[10px] bg-muted/20">
          <label className="text-muted-foreground self-center">Current</label>
          <Input
            defaultValue={pin.current ?? ''}
            placeholder="e.g. 5A, 75 mA"
            className="h-6 text-[11px] px-1.5"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (pin.current ?? '')) updatePin(deviceId, pin.id, { current: v });
            }}
          />
          <label className="text-muted-foreground self-center">AWG</label>
          <Input
            defaultValue={pin.wireGauge ?? ''}
            placeholder="e.g. 20, 22"
            className="h-6 text-[11px] px-1.5"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (pin.wireGauge ?? '')) updatePin(deviceId, pin.id, { wireGauge: v });
            }}
          />
          <label className="text-muted-foreground self-center">Comment</label>
          <Input
            defaultValue={pin.comment ?? ''}
            placeholder="free-form note"
            className="h-6 text-[11px] px-1.5"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (pin.comment ?? '')) updatePin(deviceId, pin.id, { comment: v });
            }}
          />
        </div>
      )}
    </div>
  );
}

function HiddenPinRow({ pin, device, onAssign }: {
  pin: Pin;
  device: PlacedDevice;
  onAssign: (connectorId: string) => void;
}) {
  // Only offer connector views that match this pin's logical connector.
  const eligibleViews = device.connectors.filter(c => c.logicalConnectorName === pin.logicalConnectorName);
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs">
      {pin.pinNumber && <span className="font-mono text-[10px] text-muted-foreground w-6">{pin.pinNumber}</span>}
      <span className="flex-1 truncate text-foreground">
        {pin.name}
        <span className="text-muted-foreground ml-1">· {pin.logicalConnectorName}</span>
      </span>
      {eligibleViews.length === 0 ? (
        <span className="text-[10px] text-muted-foreground">no {pin.logicalConnectorName} view</span>
      ) : (
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onAssign(e.target.value);
              e.target.value = '';
            }
          }}
          className="h-6 text-[10px] bg-background border border-border rounded px-1"
        >
          <option value="" disabled>Assign…</option>
          {eligibleViews.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.side})</option>
          ))}
        </select>
      )}
    </div>
  );
}
