import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, MIcon } from '@/components/AppShell';
import { Canvas, Rect, CanvasHandle } from '@/components/wiring/Canvas';
import { DeviceBlock } from '@/components/wiring/DeviceBlock';
import { Wire } from '@/components/wiring/Wire';
import { GhostWire } from '@/components/wiring/GhostWire';
import { SheetTabs } from '@/components/wiring/SheetTabs';
import { Inspector } from '@/components/wiring/Inspector';
import { IssuesPanel } from '@/components/wiring/IssuesPanel';
import { DevicePickerDialog } from '@/components/wiring/DevicePickerDialog';
import { CustomDeviceEditor } from '@/components/wiring/CustomDeviceEditor';
import { NetLabelView } from '@/components/wiring/NetLabelView';
import { ShieldBlock } from '@/components/wiring/ShieldBlock';
import { AnnotationView } from '@/components/wiring/AnnotationView';
import { NetLabelPickerDialog, askForNetLabel } from '@/components/wiring/NetLabelPickerDialog';
import { HarnessDeviceBlock } from '@/components/wiring/HarnessDeviceBlock';
import { HarnessGraphView } from '@/components/wiring/HarnessBundle';
import { HarnessGraphProvider } from '@/components/wiring/HarnessGraphContext';
import { deriveHarness } from '@/lib/wiring/deriveHarness';
import { harnessBlockLayout, harnessTreeOf, DEFAULT_MM_PER_UNIT, HARNESS_GRID } from '@/lib/wiring/harness';
import { useWiring, getPinWorldPos } from '@/lib/wiring/store';
import { instantiateDevice, nextDesignator, getDesignatorPrefix, DeviceTemplate, slugifyDesignator } from '@/lib/wiring/library';
import { runLint } from '@/lib/wiring/lint';
import { fetchGeneralSettings, fetchWiringProject, saveWiringProject } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { loadProjectLocal, saveProjectLocal } from '@/lib/wiring/persistence';
import { downloadSheetSvg, printSheetPdf } from '@/lib/wiring/export';
import { exportPinList } from '@/lib/wiring/exportPinList';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Point, PlacedDevice, Orientation } from '@/lib/wiring/types';
import { previewPlacedDevice } from '@/lib/wiring/library';
import {
  Plus, Undo2, Redo2, ChevronRight, ChevronLeft, AlertTriangle, Download, Upload, Trash2,
  FileText, FileImage, FileJson, FileSpreadsheet, Cloud, CloudOff, Save, Tag, X, Scan,
  RotateCcw, RotateCw,
} from 'lucide-react';
import { toast } from 'sonner';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export default function WiringPage() {
  const { demoMode } = useAuth();
  const devices       = useWiring(s => s.devices);
  const placements    = useWiring(s => s.placements);
  const wires         = useWiring(s => s.wires);
  const sheets        = useWiring(s => s.sheets);
  const activeSheetId = useWiring(s => s.activeSheetId);
  const selDevIds     = useWiring(s => s.selectedDeviceIds);
  const selWireIds    = useWiring(s => s.selectedWireIds);
  const selConnIds    = useWiring(s => s.selectedConnectorIds);
  const selNetLabelIds = useWiring(s => s.selectedNetLabelIds);
  const selShieldIds  = useWiring(s => s.selectedShieldIds);
  const netLabels     = useWiring(s => s.netLabels);
  const shields       = useWiring(s => s.shields);
  const annotations   = useWiring(s => s.annotations);
  const selAnnotIds   = useWiring(s => s.selectedAnnotationIds);
  const addTextAnnotation = useWiring(s => s.addTextAnnotation);
  const addNoteAnnotation = useWiring(s => s.addNoteAnnotation);
  const toggleAnnotation  = useWiring(s => s.toggleAnnotation);
  const toggleNetLabel = useWiring(s => s.toggleNetLabel);
  const toggleShield  = useWiring(s => s.toggleShield);
  const addShield     = useWiring(s => s.addShield);
  const addDevice     = useWiring(s => s.addDevice);
  const splitConnectorsToNewPlacement = useWiring(s => s.splitConnectorsToNewPlacement);
  const selectOnly    = useWiring(s => s.selectOnly);
  const toggleDevice  = useWiring(s => s.toggleDevice);
  const toggleWire    = useWiring(s => s.toggleWire);
  const toggleConnector = useWiring(s => s.toggleConnector);
  const clearSelection= useWiring(s => s.clearSelection);
  const cancelWiring  = useWiring(s => s.cancelWiring);
  const removeSelected= useWiring(s => s.removeSelected);
  const copySelection = useWiring(s => s.copySelection);
  const pasteClipboard= useWiring(s => s.pasteClipboard);
  const undo          = useWiring(s => s.undo);
  const redo          = useWiring(s => s.redo);
  const past          = useWiring(s => s.past);
  const future        = useWiring(s => s.future);
  const serialize     = useWiring(s => s.serialize);
  const loadFromJson  = useWiring(s => s.loadFromJson);
  const reset         = useWiring(s => s.reset);
  const rotateHarnessNode = useWiring(s => s.rotateHarnessNode);
  const setHarnessScale = useWiring(s => s.setHarnessScale);
  const selectedHarnessTree = useWiring(s => s.selectedHarnessTree);

  const [cursor, setCursor] = useState<Point | null>(null);
  const [projectName, setProjectName] = useState('Build Tracker');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [editingUserDevice, setEditingUserDevice] = useState<any | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [netLabelMode, setNetLabelMode] = useState(false);
  // Wire (junction) tool — when on, clicking an existing wire starts a new
  // wire from a junction on it. Mutually exclusive with the other tools.
  const [junctionMode, setJunctionMode] = useState(false);
  // Annotation modes — clicking the canvas in either mode drops the
  // corresponding annotation at the cursor, then exits the mode (one-shot,
  // same UX as the shield tool).
  const [textMode, setTextMode] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  // Harness-view "Bend" tool — when active, clicking a cable inserts a new
  // bend point (a `bundleWaypoints` override) instead of selecting it.
  const [bendMode, setBendMode] = useState(false);
  // Harness-view "Lengths" toggle — when true, cable length labels are shown
  // on bundles that have a length set.
  const [showLengths, setShowLengths] = useState(false);
  // Shield-mode is mutually exclusive with net-label mode. When on, the
  // user click-drags a rectangle on the canvas; every wire crossing the
  // rectangle is wrapped in a new shield with the chosen termination.
  const [shieldMode, setShieldMode] = useState(false);
  const [shieldTermination, setShieldTermination] = useState<'ground' | 'float' | 'backshell'>('ground');
  // Live cursor coords during shield-drag, in world space. null when no
  // drag is in progress.
  const [shieldDrag, setShieldDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Quick-ref panel visibility. Persisted to localStorage so once dismissed
  // it stays hidden across reloads. Read once during state init to avoid a
  // flash of the panel before effects run.
  const [shortcutsVisible, setShortcutsVisible] = useState<boolean>(() => {
    try { return localStorage.getItem('wiring.shortcutsHidden') !== '1'; }
    catch { return true; }
  });
  const hideShortcuts = () => {
    setShortcutsVisible(false);
    try { localStorage.setItem('wiring.shortcutsHidden', '1'); } catch {}
  };
  // Device being placed — follows the cursor until the user clicks to commit.
  // null when we're not in placement mode.
  const [pendingTpl, setPendingTpl] = useState<DeviceTemplate | null>(null);

  // Mirror the React tool-toggle state into the store so Pin / Wire /
  // canvas-background click handlers all read from one source of truth.
  // Shield mode wins over net-label mode if both happen to be set.
  const setToolMode = useWiring(s => s.setToolMode);
  useEffect(() => {
    setToolMode(
      shieldMode   ? 'shield'   :
      netLabelMode ? 'netLabel' :
      textMode     ? 'text'     :
      noteMode     ? 'note'     :
      junctionMode ? 'junction' :
      'wire',
    );
  }, [netLabelMode, shieldMode, textMode, noteMode, junctionMode, setToolMode]);

  // Toggling either tool off also exits the other so the toolbar shows a
  // single active mode. Esc cancels both.
  const enterShieldMode = () => {
    setNetLabelMode(false);
    setJunctionMode(false);
    setShieldMode(true);
    setPendingTpl(null);
  };
  const exitShieldMode = () => {
    setShieldMode(false);
    setShieldDrag(null);
  };

  // Cancel an in-flight connector-drag whenever the user releases the
  // pointer anywhere — even outside any drop target. DeviceBlock's drop
  // handler will have already moved the connector if the drop was valid;
  // this just guarantees we never get stuck in "drag" state.
  useEffect(() => {
    const onUp = () => {
      if (useWiring.getState().connectorDrag) {
        useWiring.getState().endConnectorDrag();
      }
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Keyboard shortcuts on the wiring canvas.
  //   Esc          → cancel a connector-drag in progress
  //   Arrows       → nudge selected placements by 10 px (Shift = 1 px fine)
  // We bail out when the user is typing in an input/textarea/contenteditable
  // so the inspector and dialog forms keep their normal text-editing keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const state = useWiring.getState();

      if (e.key === 'Escape') {
        if (state.connectorDrag) {
          state.endConnectorDrag();
          e.preventDefault();
          return;
        }
        if (state.shieldPickingId) {
          state.endShieldPicking();
          e.preventDefault();
          return;
        }
        // Cancel shield mode (and any in-flight drag rectangle).
        setShieldMode(prev => {
          if (prev) {
            setShieldDrag(null);
            e.preventDefault();
          }
          return false;
        });
        // Also exit annotation modes on Esc.
        setTextMode(false);
        setNoteMode(false);
        // Exit the Wire (junction) tool and drop any in-progress wire.
        setJunctionMode(false);
        state.cancelWiring();
      }

      // R rotates the selected net label(s) 90° clockwise. The Inspector
      // also exposes the four absolute orientations as buttons; this is
      // just the quick "rotate by hand" hotkey.
      if (e.key === 'r' || e.key === 'R') {
        if (state.selectedNetLabelIds.size > 0) {
          e.preventDefault();
          state.beginTransaction();
          for (const id of state.selectedNetLabelIds) {
            const lbl = state.netLabels.find(n => n.id === id);
            if (!lbl) continue;
            const cur = lbl.rotation ?? 0;
            const next = ((cur + 90) % 360) as 0 | 90 | 180 | 270;
            state.updateNetLabel(id, { rotation: next });
          }
          state.commitTransaction();
          return;
        }
      }

      // Arrow nudge — only when at least one placement is selected. Coarse
      // step matches the canvas grid (10 px); Shift drops to 1 px for fine
      // tuning. Each arrow press is one undo step thanks to the begin/commit
      // transaction wrapping movePlacement.
      const isArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (isArrow && state.selectedDeviceIds.size > 0) {
        const step = e.shiftKey ? 1 : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        e.preventDefault();
        state.beginTransaction();
        for (const placementId of state.selectedDeviceIds) {
          const p = state.placements.find(pl => pl.id === placementId);
          if (!p) continue;
          state.movePlacement(placementId, { x: p.position.x + dx, y: p.position.y + dy });
        }
        state.commitTransaction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Imperative handle to the Canvas — only used for fit-to-content / reset
  // view actions wired to the toolbar button.
  const canvasRef = useRef<CanvasHandle>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);
  // Skip the very first autosave pass that fires right after load.
  const skipNextSaveRef = useRef(false);
  // Toast the error ONCE per error streak, not on every debounced save attempt.
  const lastErrorToastedRef = useRef<string | null>(null);

  // ── Load from server on mount, falling back to localStorage if offline ────
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    (async () => {
      try {
        const remote = await fetchWiringProject();
        if (remote?.data) {
          const ok = loadFromJson(JSON.stringify(remote.data));
          if (ok) {
            skipNextSaveRef.current = true;
            setSaveStatus('saved');
            return;
          }
        }
        // Empty project on the server — try the local fallback.
        const local = loadProjectLocal();
        if (local) {
          const ok = loadFromJson(local);
          if (ok) {
            skipNextSaveRef.current = true;
            setSaveStatus('idle');
            toast.info('Loaded local backup (server project was empty)');
          }
        }
      } catch (err) {
        console.warn('Wiring server fetch failed, falling back to localStorage:', err);
        const local = loadProjectLocal();
        if (local) {
          const ok = loadFromJson(local);
          if (ok) skipNextSaveRef.current = true;
        }
        setSaveStatus('offline');
      }
    })();
  }, [loadFromJson]);

  // ── Project name from general settings ─────────────────────────────────
  useEffect(() => {
    fetchGeneralSettings()
      .then(s => { if (s?.projectName) setProjectName(s.projectName); })
      .catch(() => {});
  }, []);

  // ── Save primitive used by both autosave and the manual Save button ───
  const performSave = async (silent: boolean) => {
    // Demo mode is shared across visitors — never round-trip to the server.
    // The local backup still runs so the visitor's edits survive a refresh.
    if (demoMode) {
      const json = serialize();
      saveProjectLocal(json);
      setSaveStatus('idle');
      setSaveError(null);
      if (!silent) toast.info('Demo mode — changes are not saved.');
      return false;
    }
    const json = serialize();
    saveProjectLocal(json); // always persist local backup first
    try {
      const parsed = JSON.parse(json);
      await saveWiringProject(projectName, parsed);
      setSaveStatus('saved');
      setSaveError(null);
      lastErrorToastedRef.current = null;
      if (!silent) toast.success('Saved to server');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[wiring] Remote save failed:', err);
      setSaveStatus('offline');
      setSaveError(message);
      // Toast once per distinct error message so we don't spam on every debounce.
      if (!silent || lastErrorToastedRef.current !== message) {
        toast.error(`Save to server failed: ${message}. Working offline — your changes are in local storage only.`);
        lastErrorToastedRef.current = message;
      }
      return false;
    }
  };

  // ── Debounced autosave ────────────────────────────────────────────────
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus('saving');
    saveTimeoutRef.current = setTimeout(() => {
      performSave(true); // silent: no toast on success
    }, 1000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, wires, sheets, activeSheetId, projectName, serialize]);

  // ── Manual save (button) ──────────────────────────────────────────────
  const manualSave = async () => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    setSaveStatus('saving');
    await performSave(false);
  };

  // ── Placed devices (Device ⟵ Placement merged) ────────────────────────
  // Renderers want the combined view; actions stay on the split model.
  // Each placement is zipped with its device to produce a PlacedDevice with
  // an id = placement.id (the unit the user clicks).
  const placedDevices = useMemo<PlacedDevice[]>(() => {
    const byDeviceId = new Map(devices.map(d => [d.id, d]));
    // Count placements per device so we can render "U1A"/"U1B" when there
    // are 2+ (vs just "U1" when there's one).
    const countByDevice = new Map<string, number>();
    for (const p of placements) {
      countByDevice.set(p.deviceId, (countByDevice.get(p.deviceId) ?? 0) + 1);
    }
    const out: PlacedDevice[] = [];
    for (const p of placements) {
      const d = byDeviceId.get(p.deviceId);
      if (!d) continue;
      const multi = (countByDevice.get(p.deviceId) ?? 0) >= 2;
      const letter = p.id.slice(d.id.length) || 'A';
      out.push({
        id: p.id,
        deviceId: d.id,
        sheetId: p.sheetId,
        position: p.position,
        width: p.width,
        height: p.height,
        connectors: p.connectors,
        templateId: d.templateId,
        name: multi ? `${d.name}${letter}` : d.name,
        productName: d.productName,
        pinCatalog: d.pinCatalog,
        symbolType: d.symbolType,
        attributes: d.attributes,
      });
    }
    return out;
  }, [devices, placements]);

  const visibleDevices = useMemo(
    () => placedDevices.filter(d => d.sheetId === activeSheetId),
    [placedDevices, activeSheetId]
  );
  const visibleWires = useMemo(
    () => wires.filter(w => w.sheetId === activeSheetId),
    [wires, activeSheetId]
  );
  const visibleNetLabels = useMemo(
    () => netLabels.filter(n => n.sheetId === activeSheetId),
    [netLabels, activeSheetId]
  );
  const visibleShields = useMemo(
    () => shields.filter(sh => sh.sheetId === activeSheetId),
    [shields, activeSheetId]
  );
  const visibleAnnotations = useMemo(
    () => annotations.filter(a => a.sheetId === activeSheetId),
    [annotations, activeSheetId]
  );

  // ── Lint (active sheet only — sheets are independent) ────────────────
  const issues = useMemo(
    () => runLint(visibleDevices, visibleWires, visibleNetLabels),
    [visibleDevices, visibleWires, visibleNetLabels]
  );

  // ── Harness view state ───────────────────────────────────────────────
  const activeSheetObj = useMemo(
    () => sheets.find(s => s.id === activeSheetId),
    [sheets, activeSheetId]
  );
  const viewMode = activeSheetObj?.harness?.viewMode ?? 'schematic';
  const junctions = useWiring(s => s.junctions);
  const visibleJunctions = useMemo(
    () => junctions.filter(j => j.sheetId === activeSheetId),
    [junctions, activeSheetId]
  );
  const ensureHarnessView = useWiring(s => s.ensureHarnessView);
  const setSheetViewMode = useWiring(s => s.setSheetViewMode);
  // The active sheet's persisted Phase-3 harness override layer (node
  // positions + bundle lengths). Fed into `deriveHarness` so the user's
  // re-alignment re-applies on top of the freshly-derived topology.
  const harnessOverrides = activeSheetObj?.harness?.overrides;

  // The derived harness graph for the active sheet — computed fresh from the
  // schematic (placed devices + wires + junctions + net labels), then the
  // override layer is applied. The HarnessGraph is never stored; re-deriving
  // keeps it in sync with edits while overrides re-apply by stable id.
  const harnessGraph = useMemo(
    () => deriveHarness({
      placedDevices: visibleDevices,
      wires: visibleWires,
      junctions: visibleJunctions,
      netLabels: visibleNetLabels,
    }, harnessOverrides),
    [visibleDevices, visibleWires, visibleJunctions, visibleNetLabels, harnessOverrides]
  );

  // True when at least one placed device is selected. In the harness view a
  // device block selects into `selectedDeviceIds` (the shared device-selection
  // set) — that is the set the rotate buttons / `rotateHarnessNode` act on.
  const canRotateHarness = [...selDevIds].some(id => visibleDevices.some(d => d.id === id));

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const editable = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement | null)?.isContentEditable;

      if (e.key === 'Escape') {
        cancelWiring();
        clearSelection();
        setNetLabelMode(false);
        setBendMode(false);
        setPendingTpl(null);
        return;
      }
      if (editable) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copySelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        // Drop the clipboard at the live cursor so pastes don't pile up at
        // a fixed offset. Falls back to the legacy +40,+40 nudge when the
        // cursor isn't tracked yet (e.g. user pressed Ctrl+V before moving
        // the mouse over the canvas).
        pasteClipboard(cursor ?? undefined);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelWiring, clearSelection, copySelection, pasteClipboard, removeSelected, undo, redo]);

  // ── Harness view toggle + re-layout ─────────────────────────────────
  // Phase 2: the harness graph (`deriveHarness`) computes its own
  // deterministic auto-layout — entering harness view just needs the
  // HarnessView slice to exist and the mode flipped.
  function onToggle(mode: 'schematic' | 'harness') {
    if (!activeSheetId) return;
    ensureHarnessView(activeSheetId);
    setSheetViewMode(activeSheetId, mode);
    // The Bend tool is harness-only — leaving the harness view cancels it.
    if (mode === 'schematic') setBendMode(false);
  }

  // Compute the bounding box of everything visible on the active sheet and
  // ask the canvas to fit it. View-mode aware: the schematic and harness
  // views position the same devices independently, so the box is built from
  // whichever coordinate set the user is currently looking at. Falls back to
  // the default view when the sheet is empty so the call always does
  // SOMETHING.
  const fitToContent = useCallback(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const acc = (x: number, y: number) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };

    if (viewMode === 'harness') {
      // Harness view: every node of the derived HarnessGraph carries its own
      // auto-laid-out position. Devices size the box by their block extent;
      // splice / branch-point nodes are dimensionless points.
      //
      // A component block's footprint is its ORIENTATION-aware harness-block
      // layout, not the raw placement width/height — a 90°/270°-rotated block
      // is a wide one-column-per-connector box, so use `harnessBlockLayout`
      // (the same source of truth the renderer uses) so a rotated device is
      // not clipped on auto-fit.
      const placementById = new Map(visibleDevices.map(d => [d.id, d]));
      for (const n of harnessGraph.nodes) {
        acc(n.position.x, n.position.y);
        if (n.kind === 'component') {
          const placement = placementById.get(n.refId ?? n.id);
          if (placement) {
            const layout = harnessBlockLayout(placement, n.orientation ?? 0);
            acc(n.position.x + layout.width, n.position.y + layout.height);
          }
        }
      }
    } else {
      // Schematic view: devices, wire endpoints, shield x-ranges, net-label
      // anchors.
      for (const d of visibleDevices) {
        acc(d.position.x, d.position.y);
        acc(d.position.x + d.width, d.position.y + d.height);
      }
      for (const w of visibleWires) {
        const from = getPinWorldPos(visibleDevices, w.fromPin);
        const to   = getPinWorldPos(visibleDevices, w.toPin);
        if (from) acc(from.x, from.y);
        if (to)   acc(to.x, to.y);
      }
      for (const sh of visibleShields) {
        minX = Math.min(minX, sh.xStart);
        maxX = Math.max(maxX, sh.xEnd);
      }
      for (const n of visibleNetLabels) {
        const anchor = getPinWorldPos(visibleDevices, n.attachedTo);
        if (anchor) acc(anchor.x, anchor.y);
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      canvasRef.current?.resetView();
      return;
    }
    canvasRef.current?.fitToRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
  }, [viewMode, visibleDevices, visibleWires, visibleShields, visibleNetLabels, harnessGraph]);

  // Auto-fit the view at two moments — without this the circuitry/harness is
  // easy to lose off-screen, since the schematic and harness layouts can sit
  // far apart on the canvas.
  //
  // Both effects call through a latest-ref rather than depending on
  // `fitToContent` directly: that callback closes over the device/wire/bundle
  // data and changes identity on virtually every edit, so depending on it
  // would re-fit (yanking the view) every time the user nudges a device.
  // The rAF defers the call a frame so the canvas has measured its real size
  // and the new content has laid out (the fit zoom is derived from both).
  const fitToContentRef = useRef(fitToContent);
  fitToContentRef.current = fitToContent;

  // (1) Initial fit. The wiring project loads asynchronously, so the first
  // render has no devices — wait for content to arrive, then fit once.
  const didInitialFitRef = useRef(false);
  useEffect(() => {
    if (didInitialFitRef.current || visibleDevices.length === 0) return;
    didInitialFitRef.current = true;
    const raf = requestAnimationFrame(() => fitToContentRef.current());
    return () => cancelAnimationFrame(raf);
  }, [visibleDevices.length]);

  // (2) Re-fit whenever the user switches between schematic and harness.
  // Skips the mount run (ref starts equal to the current mode) so it doesn't
  // double-fire alongside the initial fit.
  const prevViewModeRef = useRef(viewMode);
  useEffect(() => {
    if (prevViewModeRef.current === viewMode) return;
    prevViewModeRef.current = viewMode;
    const raf = requestAnimationFrame(() => fitToContentRef.current());
    return () => cancelAnimationFrame(raf);
  }, [viewMode]);

  const handleMarquee = (rect: Rect) => {
    // Shield-capture takes priority — when the user is in shield mode the
    // marquee creates a Shield wrapping every wire whose horizontal run
    // intersects the rectangle. Width is fixed at the default (30 px)
    // centered on the rectangle's center x — the user resizes from the
    // Inspector. The drag's role is purely to pick which wires to wrap.
    if (shieldMode) {
      const SHIELD_DEFAULT_WIDTH = 30;
      const centerX = Math.round((rect.x + rect.w / 2) / 10) * 10;
      const xLo = centerX - SHIELD_DEFAULT_WIDTH / 2;
      const xHi = centerX + SHIELD_DEFAULT_WIDTH / 2;
      const yLo = rect.y;
      const yHi = rect.y + rect.h;
      const wireIds: string[] = [];
      for (const w of visibleWires) {
        // Resolve wire endpoints to world points. We use the same getPinWorldPos
        // path the renderer uses so capture matches what the user sees.
        const fromPos = getPinWorldPos(visibleDevices, w.fromPin);
        const toPos   = getPinWorldPos(visibleDevices, w.toPin);
        if (!fromPos || !toPos) continue;
        // Wire qualifies when its bounding-box overlaps the dragged
        // rectangle — a forgiving test that works for both straight and
        // bent wires. Note: we test against the DRAG rectangle, not the
        // 30-px shield width, so the user can drag a wider band and still
        // capture all the wires they swept over.
        const wxLo = Math.min(fromPos.x, toPos.x);
        const wxHi = Math.max(fromPos.x, toPos.x);
        const wyLo = Math.min(fromPos.y, toPos.y);
        const wyHi = Math.max(fromPos.y, toPos.y);
        const xOverlap = wxLo < (rect.x + rect.w) && wxHi > rect.x;
        const yOverlap = wyLo < yHi && wyHi > yLo;
        if (xOverlap && yOverlap) wireIds.push(w.id);
      }
      const newId = addShield(wireIds, xLo, xHi, shieldTermination);
      // Auto-select the new shield so the inspector immediately shows it
      // and the user can edit termination / delete in one flow.
      if (newId) selectOnly([], [], [], [], [newId]);
      // Shield tool is one-shot: revert to the normal selector after the
      // marquee resolves so the next click doesn't accidentally drop another
      // shield. Re-clicking the toolbar button re-arms it.
      exitShieldMode();
      return;
    }
    // Devices: bounding-box overlap with the marquee. Picks anything the
    // user dragged across, even if only a corner is inside.
    const pickedDevices = visibleDevices
      .filter(d =>
        d.position.x < rect.x + rect.w &&
        d.position.x + d.width > rect.x &&
        d.position.y < rect.y + rect.h &&
        d.position.y + d.height > rect.y
      )
      .map(d => d.id);
    // Net labels: test the flag tip's world position against the marquee.
    // The tip is the anchor (pin or free-point) plus the user-set offset —
    // same math `getPinWorldPos('#labelId')` uses for wire endpoints.
    const xLo = rect.x, xHi = rect.x + rect.w;
    const yLo = rect.y, yHi = rect.y + rect.h;
    const pickedNetLabels: string[] = [];
    for (const lbl of visibleNetLabels) {
      const base = getPinWorldPos(visibleDevices, lbl.attachedTo);
      if (!base) continue;
      const tipX = base.x + (lbl.offset?.dx ?? 0);
      const tipY = base.y + (lbl.offset?.dy ?? 0);
      if (tipX >= xLo && tipX <= xHi && tipY >= yLo && tipY <= yHi) {
        pickedNetLabels.push(lbl.id);
      }
    }
    // Annotations: test the anchor position. Text and note annotations both
    // anchor at `position` (the triangle vertex / first-line baseline); a
    // point-in-rect test is forgiving enough without having to estimate
    // rendered text bounds.
    const pickedAnnotations: string[] = [];
    for (const a of visibleAnnotations) {
      const ax = a.position.x, ay = a.position.y;
      if (ax >= xLo && ax <= xHi && ay >= yLo && ay <= yHi) {
        pickedAnnotations.push(a.id);
      }
    }
    selectOnly(pickedDevices, [], [], pickedNetLabels, [], pickedAnnotations);
  };

  // Picker commits to *placement mode* — the device ghosts at the cursor
  // until the user clicks on the canvas (or Esc cancels).
  const handlePick = (tpl: DeviceTemplate) => {
    setPendingTpl(tpl);
    clearSelection();
  };

  // Snap-to-grid used for both the preview position and the final commit, so
  // the visual placement matches exactly where the device lands.
  const snap = (n: number) => Math.round(n / 10) * 10;

  // Ghost placed-device drawn at the cursor while in placement mode.
  // Uses previewPlacedDevice so existing DeviceBlock rendering just works;
  // id is overridden to a stable '__pending__' so React keys stay stable.
  const pendingPreview = useMemo<PlacedDevice | null>(() => {
    if (!pendingTpl || !cursor) return null;
    const designator = nextDesignator(getDesignatorPrefix(pendingTpl), devices);
    try {
      const pd = previewPlacedDevice(pendingTpl, { x: snap(cursor.x), y: snap(cursor.y) }, designator);
      return { ...pd, id: '__pending__', sheetId: activeSheetId };
    } catch {
      return null;
    }
  }, [pendingTpl, cursor, devices, activeSheetId]);

  const commitPlacement = () => {
    if (!pendingTpl || !cursor) return;
    const designator = nextDesignator(getDesignatorPrefix(pendingTpl), devices);
    const dropX = snap(cursor.x);
    const dropY = snap(cursor.y);
    addDevice(instantiateDevice(pendingTpl, { x: dropX, y: dropY }, designator));

    // Templates can opt into a default multi-section layout via `placements`.
    // After the device lands as one placement (letter A), peel off the
    // groups described in entries [1..n] into sibling placements (B, C, …).
    // Connectors not referenced by any entry stay on placement A — that lets
    // a template just specify what to PEEL OFF without listing the rest.
    const layout = pendingTpl.placements;
    if (layout && layout.length > 1) {
      const devId = slugifyDesignator(designator);
      const firstPlacementId = `${devId}A`;
      // Skip entry 0 — it's already populated by addDevice.
      for (let i = 1; i < layout.length; i++) {
        const entry = layout[i];
        const offset = entry.offset ?? { x: 0, y: 0 };
        const position = { x: dropX + offset.x, y: dropY + offset.y };
        // Resolve names → live connectorIds against the current store state.
        // Reading on each iteration is important: after each split call the
        // anchor placement loses connectors, and a name might no longer match
        // (which is fine — we just skip it). Reading via getState handles
        // the case where instantiateDevice split a single template connector
        // across sides (suffix "(L)" / "(R)") — we match on logicalConnectorName.
        const anchor = useWiring.getState().placements.find(p => p.id === firstPlacementId);
        if (!anchor) break;
        const wanted = new Set(entry.connectorNames);
        const connectorIds = anchor.connectors
          .filter(c => wanted.has(c.logicalConnectorName))
          .map(c => c.id);
        if (connectorIds.length > 0) {
          splitConnectorsToNewPlacement(firstPlacementId, connectorIds, position);
        }
      }
    }

    setPendingTpl(null);
  };

  // ── Export handlers ──────────────────────────────────────────────────
  const activeSheet = sheets.find(s => s.id === activeSheetId) ?? sheets[0];
  const exportMeta = {
    projectName,
    sheetName: activeSheet?.name ?? 'Sheet',
    date: new Date().toISOString(),
  };

  const exportJson = () => {
    const blob = new Blob([serialize()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-wiring.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Wiring project exported');
  };

  const exportSvg = () => {
    if (!activeSheet) return;
    downloadSheetSvg(placedDevices, wires, netLabels, annotations, activeSheet, exportMeta);
    toast.success(`Sheet "${activeSheet.name}" exported as SVG`);
  };

  const exportPdf = () => {
    if (!activeSheet) return;
    printSheetPdf(placedDevices, wires, netLabels, annotations, activeSheet, exportMeta);
  };

  const exportPinListXlsx = () => {
    exportPinList(devices, placements, wires, netLabels, projectName);
    toast.success('Pin list exported');
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const ok = loadFromJson(String(reader.result));
      if (ok) toast.success('Wiring project imported');
      else    toast.error('Could not import — invalid JSON');
    };
    reader.readAsText(file);
  };

  const doReset = () => {
    if (confirm('Clear the whole wiring project? This deletes every device, wire, and sheet.')) {
      reset();
      toast.success('Wiring project cleared');
    }
  };

  const errorCount   = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  const saveLabel = (() => {
    switch (saveStatus) {
      case 'saving':  return 'Saving…';
      case 'saved':   return 'Saved';
      case 'offline': return 'Offline — local only';
      case 'error':   return 'Save failed';
      default:        return '';
    }
  })();

  return (
    <AppShell activePage="wiring" projectName={projectName} pageTitle="Wiring Diagrams" fullWidth>
      {/* Topbar is 80px tall; the demo-mode banner adds another 32px on top.
          Mirror the AppShell `pt-20` / `pt-28` switch so the canvas fills the
          remaining viewport without overflowing. */}
      <div className="flex flex-col" style={{ height: `calc(100vh - ${demoMode ? 112 : 80}px)` }}>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/30">
          {/* Schematic-editing controls. Hidden in harness view because the
              harness is a *derived* rendering — adding devices, tagging nets,
              wrapping shields, and dropping notes all belong to the
              electrical design and must happen on the schematic sheet. */}
          {viewMode === 'schematic' && (
            <>
              <Button size="sm" onClick={() => setPickerOpen(true)} className="gap-1" title="Browse the device library and add a device to the canvas">
                <Plus className="w-4 h-4" /> Device DB
              </Button>
              <Button
                size="sm"
                variant={netLabelMode ? 'default' : 'outline'}
                onClick={() => { setShieldMode(false); setShieldDrag(null); setJunctionMode(false); setNetLabelMode(v => !v); }}
                className="gap-1"
                title={netLabelMode ? 'Exit net-label mode (Esc)' : 'Tag a pin with a net name (5V, GND, …)'}
              >
                <Tag className="w-3.5 h-3.5" /> Net label
              </Button>
              {/* Wire tool — when active, clicking an existing wire splits it
                  at the click point and starts a new wire from that junction. */}
              <Button
                size="sm"
                variant={junctionMode ? 'default' : 'outline'}
                onClick={() => {
                  setShieldMode(false); setShieldDrag(null); setNetLabelMode(false);
                  setTextMode(false); setNoteMode(false); setJunctionMode(v => !v);
                }}
                className="gap-1"
                title={junctionMode ? 'Exit wire mode (Esc)' : 'Start a wire from a point on an existing wire (junction)'}
              >
                Wire
              </Button>
              {/* Shield tool — drag a rectangle on the canvas to wrap every wire
                  crossing it in a new shield. The chosen termination applies to
                  every shield drawn until the dropdown is changed. */}
              <Button
                size="sm"
                variant={shieldMode ? 'default' : 'outline'}
                onClick={() => shieldMode ? exitShieldMode() : enterShieldMode()}
                className="gap-1"
                title={shieldMode ? 'Exit shield mode (Esc)' : 'Drag across wires to add a shield'}
              >
                Shield
              </Button>
              {/* Annotation tools — text comment + numbered note marker. Both
                  are one-shot: click on the canvas to drop, then auto-exit. */}
              <Button
                size="sm"
                variant={textMode ? 'default' : 'outline'}
                onClick={() => {
                  setShieldMode(false); setShieldDrag(null); setNetLabelMode(false);
                  setJunctionMode(false); setNoteMode(false); setTextMode(v => !v);
                }}
                className="gap-1"
                title={textMode ? 'Exit text mode (Esc)' : 'Add a free-text comment to the sheet'}
              >
                Text
              </Button>
              {shieldMode && (
                <select
                  value={shieldTermination}
                  onChange={(e) => setShieldTermination(e.target.value as 'ground' | 'float' | 'backshell')}
                  className="h-8 text-xs bg-background border border-border rounded px-2"
                  title="Shield termination drawn on every new shield"
                >
                  <option value="ground">Ground-terminated</option>
                  <option value="float">Floating</option>
                  <option value="backshell">Backshell (S)</option>
                </select>
              )}

              <div className="w-px h-5 bg-border mx-1" />
            </>
          )}

          {/* The Note tool is available in BOTH schematic and harness views —
              numbered notes are useful annotations regardless of which view
              the user is in. */}
          <Button
            size="sm"
            variant={noteMode ? 'default' : 'outline'}
            onClick={() => {
              setShieldMode(false); setShieldDrag(null); setNetLabelMode(false);
              setTextMode(false); setJunctionMode(false); setNoteMode(v => !v);
            }}
            className="gap-1"
            title={noteMode ? 'Exit note mode (Esc)' : 'Drop a numbered triangle note marker'}
          >
            Note
          </Button>

          <Button size="icon" variant="ghost" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="w-4 h-4" />
          </Button>
          {/* Fit to content — frames every device, wire, shield, and
              net-label on the active sheet inside the viewport. Useful
              after zooming/panning out to "find your way back". */}
          <Button
            size="icon"
            variant="ghost"
            onClick={fitToContent}
            title="Fit all to view"
          >
            <Scan className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={removeSelected}
            disabled={selDevIds.size === 0 && selWireIds.size === 0
                   && selNetLabelIds.size === 0 && selShieldIds.size === 0}
            className="gap-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
            title="Delete selected (Del)"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1" title="Export…">
                <Download className="w-4 h-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={exportPdf} className="gap-2">
                <FileText className="w-4 h-4" /> Current sheet → PDF (via print)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportSvg} className="gap-2">
                <FileImage className="w-4 h-4" /> Current sheet → SVG
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={exportPinListXlsx} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Pin list → Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={exportJson} className="gap-2">
                <FileJson className="w-4 h-4" /> Full project → JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} className="gap-1" title="Import JSON">
            <Upload className="w-4 h-4" /> Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />

          <div className="w-px h-5 bg-border mx-1" />

          <Button size="sm" variant="ghost" onClick={doReset} className="gap-1 text-muted-foreground hover:text-destructive" title="Clear project">
            <Trash2 className="w-4 h-4" /> Clear
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* View mode toggle — Schematic / Harness */}
          <div className="inline-flex rounded border border-border overflow-hidden">
            <Button
              size="sm"
              variant={viewMode === 'schematic' ? 'default' : 'ghost'}
              className="rounded-none px-3 py-1 text-sm"
              onClick={() => onToggle('schematic')}
              title="Schematic view"
            >
              Schematic
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'harness' ? 'default' : 'ghost'}
              className="rounded-none px-3 py-1 text-sm"
              onClick={() => onToggle('harness')}
              title="Harness view"
            >
              Harness
            </Button>
          </div>
          {viewMode === 'harness' && (
            <>
              <Button
                size="sm"
                variant={bendMode ? 'default' : 'outline'}
                className="ml-1 text-xs"
                onClick={() => setBendMode(v => !v)}
                title={bendMode
                  ? 'Exit Bend tool (Esc) — click a bundle to add a cable bend point'
                  : 'Bend tool — click a bundle to add a cable bend point'}
              >
                Bend
              </Button>
              <Button
                size="sm"
                variant={showLengths ? 'default' : 'outline'}
                className="ml-1 text-xs"
                onClick={() => setShowLengths(v => !v)}
                title="Show cable length labels"
              >
                Lengths
              </Button>
              {(() => {
                const mmPerUnit = activeSheetObj?.harness?.mmPerUnit ?? DEFAULT_MM_PER_UNIT;
                const mmPerSquare = Math.round(mmPerUnit * HARNESS_GRID);
                return (
                  <label className="ml-2 text-xs flex items-center gap-1 text-muted-foreground"
                         title="Harness drawing scale — millimetres of cable per grid square">
                    Scale
                    <input
                      type="number" min={1}
                      className="w-16 h-7 rounded border border-border bg-background px-1 text-xs"
                      value={mmPerSquare}
                      onChange={(e) => {
                        const perSquare = Number(e.target.value);
                        if (Number.isFinite(perSquare) && perSquare > 0) {
                          setHarnessScale(activeSheetId, perSquare / HARNESS_GRID);
                        }
                      }}
                    />
                    <span>mm / square</span>
                  </label>
                );
              })()}
              <Button
                size="sm"
                variant="outline"
                className="ml-1 px-2"
                disabled={!canRotateHarness}
                onClick={() => rotateHarnessNode(activeSheetId, 'left')}
                title="Face the selected unit's connectors to the left edge"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="ml-1 px-2"
                disabled={!canRotateHarness}
                onClick={() => rotateHarnessNode(activeSheetId, 'right')}
                title="Face the selected unit's connectors to the right edge"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          <div className="flex-1" />

          {/* Explicit Save button — disabled in demo mode (changes never round-trip) */}
          <Button
            size="sm"
            variant={saveStatus === 'offline' ? 'destructive' : 'outline'}
            onClick={manualSave}
            disabled={saveStatus === 'saving' || demoMode}
            className="gap-1"
            title={demoMode ? 'Demo mode — changes are not saved' : (saveError ? `Last error: ${saveError}` : 'Save to server now')}
          >
            <Save className="w-3.5 h-3.5" />
            {demoMode ? 'Save' : (saveStatus === 'saving' ? 'Saving…' : saveStatus === 'offline' ? 'Retry save' : 'Save')}
          </Button>

          {/* Demo-mode status pill replaces the save status indicator entirely. */}
          {demoMode ? (
            <span
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400"
              title="Demo mode — your changes stay in this browser only and are not persisted to the server."
            >
              <CloudOff className="w-3.5 h-3.5" />
              Demo · changes not saved
            </span>
          ) : saveStatus !== 'idle' && (
            <span className={`flex items-center gap-1 text-xs px-2 py-1 ${
              saveStatus === 'saved'   ? 'text-muted-foreground' :
              saveStatus === 'saving'  ? 'text-muted-foreground' :
              saveStatus === 'offline' ? 'text-yellow-600 dark:text-yellow-400' :
                                         'text-destructive'
            }`} title={saveError ?? undefined}>
              {saveStatus === 'offline' ? <CloudOff className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
              {saveLabel}
            </span>
          )}

          {/* Issues count pill */}
          <button
            onClick={() => setIssuesOpen(v => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
              errorCount > 0 ? 'bg-destructive/15 text-destructive'
              : warningCount > 0 ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
              : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle issues panel"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {errorCount + warningCount === 0 ? 'No issues' : `${errorCount} error${errorCount === 1 ? '' : 's'} · ${warningCount} warning${warningCount === 1 ? '' : 's'}`}
          </button>

          <Button size="icon" variant="ghost" onClick={() => setInspectorOpen(v => !v)} title="Toggle inspector">
            {inspectorOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        {/* Sheet tabs */}
        <SheetTabs />

        {/* Main area — wrapped in HarnessGraphProvider so the Canvas column
            and the Inspector aside share the single derived harness graph. */}
        <HarnessGraphProvider value={harnessGraph}>
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 relative overflow-hidden">
              <Canvas
                ref={canvasRef}
                onBackgroundClick={() => {
                  // In placement mode, a background click drops the ghost at the
                  // cursor; otherwise it's the normal "clear selection" shortcut.
                  if (pendingTpl) { commitPlacement(); return; }
                  // Net-label tool — drop a label on empty canvas. The label
                  // anchors to a standalone Junction entity at the cursor; a
                  // wire can later be routed to that junction. Junction GC
                  // keeps the junction alive as long as the label references it.
                  if (netLabelMode && cursor) {
                    const x = Math.round(cursor.x);
                    const y = Math.round(cursor.y);
                    askForNetLabel().then((text) => {
                      if (!text) return;
                      const store = useWiring.getState();
                      store.beginTransaction();
                      const junctionKey = store.addJunction(x, y);
                      store.addNetLabel(junctionKey, text);
                      store.commitTransaction();
                    });
                    return;
                  }
                  // Free-text annotation — prompt for the body, drop at the
                  // grid-snapped cursor, then exit the tool (one-shot).
                  if (textMode && cursor) {
                    const text = window.prompt('Text annotation:', '');
                    if (text && text.trim()) {
                      const x = Math.round(cursor.x / 10) * 10;
                      const y = Math.round(cursor.y / 10) * 10;
                      addTextAnnotation({ x, y }, text.trim());
                    }
                    setTextMode(false);
                    return;
                  }
                  // Numbered note marker — the number is auto-assigned in the
                  // store, so the prompt is just for the description text.
                  if (noteMode && cursor) {
                    const text = window.prompt('Note description (the number is auto-assigned):', '');
                    const x = Math.round(cursor.x / 10) * 10;
                    const y = Math.round(cursor.y / 10) * 10;
                    addNoteAnnotation({ x, y }, text?.trim() ?? '');
                    setNoteMode(false);
                    return;
                  }
                  clearSelection();
                  cancelWiring();
                }}
                onMouseMoveWorld={setCursor}
                onMarqueeEnd={handleMarquee}
                rectangleDragMode={shieldMode}
              >
                {viewMode === 'schematic' ? (
                  <>
                    {visibleWires.map(w => (
                      <Wire
                        key={w.id}
                        wire={w}
                        selected={selWireIds.has(w.id)}
                        onSelect={(id, shift) => shift ? toggleWire(id) : selectOnly([], [id], [])}
                        allWiresOnSheet={visibleWires}
                        placedDevices={visibleDevices}
                      />
                    ))}
                    {visibleDevices.map(d => (
                      <DeviceBlock
                        key={d.id}
                        device={d}
                        selected={selDevIds.has(d.id)}
                        selectedConnectorIds={selConnIds}
                        onSelectDevice={(id, shift) => shift ? toggleDevice(id) : selectOnly([id], [], [])}
                        onSelectConnector={(id, shift) => shift ? toggleConnector(id) : selectOnly([], [], [id])}
                      />
                    ))}
                    <GhostWire cursor={cursor} placedDevices={visibleDevices} />
                    {visibleNetLabels.map(n => (
                      <NetLabelView
                        key={n.id}
                        label={n}
                        selected={selNetLabelIds.has(n.id)}
                        onSelect={(id, shift) => shift ? toggleNetLabel(id) : selectOnly([], [], [], [id])}
                        placedDevices={visibleDevices}
                      />
                    ))}
                    {visibleShields.map(sh => (
                      <ShieldBlock
                        key={sh.id}
                        shield={sh}
                        wires={visibleWires}
                        placedDevices={visibleDevices}
                        selected={selShieldIds.has(sh.id)}
                        onSelect={(id, shift) => shift ? toggleShield(id) : selectOnly([], [], [], [], [id])}
                      />
                    ))}
                    {visibleAnnotations.map(a => (
                      <AnnotationView
                        key={a.id}
                        annotation={a}
                        selected={selAnnotIds.has(a.id)}
                        onSelect={(id, shift) => shift
                          ? toggleAnnotation(id)
                          : selectOnly([], [], [], [], [], [id])}
                      />
                    ))}
                    {/* Placement-mode preview. Pointer events are disabled so the
                        click lands on the canvas background and triggers commit. */}
                    {pendingPreview && (
                      <g opacity={0.5} style={{ pointerEvents: 'none' }}>
                        <DeviceBlock
                          device={pendingPreview}
                          selected={false}
                          selectedConnectorIds={new Set()}
                          onSelectDevice={() => {}}
                          onSelectConnector={() => {}}
                        />
                      </g>
                    )}
                  </>
                ) : (
                  <>
                    {(() => {
                      // The derived harness graph owns the layout: each
                      // `component` node carries its auto-laid-out position.
                      // Render device blocks at those positions, then draw
                      // the whole graph (cables + splice / branch-point
                      // nodes) in one pass via HarnessGraphView.
                      // Compute the node ids belonging to the double-clicked
                      // harness tree so device blocks in the tree can be
                      // highlighted.
                      const harnessTreeIds: string[] = selectedHarnessTree
                        ? harnessTreeOf(selectedHarnessTree, harnessGraph).nodeIds
                        : [];
                      const treeNodeIds: Set<string> = new Set(harnessTreeIds);
                      // Whole-harness drag group: component nodes always move;
                      // splice / branch points only when they carry a position
                      // override (otherwise they re-derive to follow).
                      // Connector nodes ride their device — never written.
                      const harnessMoveGroupIds: string[] = harnessTreeIds.filter(id => {
                        const n = harnessGraph.nodes.find(nn => nn.id === id);
                        if (!n) return false;
                        if (n.kind === 'component') return true;
                        if (n.kind === 'splice' || n.kind === 'branchPoint') {
                          return !!harnessOverrides?.nodePositions?.[id];
                        }
                        return false; // connector
                      });
                      const componentPos = new Map<string, Point>();
                      const componentOrientation = new Map<string, Orientation>();
                      for (const n of harnessGraph.nodes) {
                        if (n.kind === 'component') {
                          componentPos.set(n.refId ?? n.id, n.position);
                          componentOrientation.set(n.refId ?? n.id, n.orientation ?? 0);
                        }
                      }
                      const harnessPlacedDevices = visibleDevices.map(d => {
                        const np = componentPos.get(d.id);
                        return np ? { ...d, position: np } : d;
                      });
                      // Harness-node refs for the drag hook — alignment
                      // guides + multi-select group moves read this.
                      const harnessNodeRefs = harnessGraph.nodes.map(n => ({
                        id: n.id,
                        position: n.position,
                      }));
                      return (
                        <>
                          <HarnessGraphView
                            graph={harnessGraph}
                            bendMode={bendMode}
                            showLengths={showLengths}
                            mmPerUnit={activeSheetObj?.harness?.mmPerUnit ?? DEFAULT_MM_PER_UNIT}
                            moveGroupIds={harnessMoveGroupIds}
                          />
                          {harnessPlacedDevices.map(d => {
                            const dev = devices.find(dev => dev.id === d.deviceId);
                            if (!dev) return null;
                            return (
                              <HarnessDeviceBlock
                                key={d.id}
                                placement={d}
                                device={dev}
                                selected={selDevIds.has(d.id)}
                                inSelectedHarness={treeNodeIds.has(d.id)}
                                allNodes={harnessNodeRefs}
                                moveGroupIds={harnessMoveGroupIds}
                                onSelect={(id, shift) => shift ? toggleDevice(id) : selectOnly([id], [], [])}
                                orientation={componentOrientation.get(d.id) ?? 0}
                                connectorOrder={harnessOverrides?.connectorOrder?.[d.id]}
                              />
                            );
                          })}
                          {/* Sheet-level annotations (Notes / Text) are
                              shown in BOTH schematic and harness views so
                              the user can mark up either. They use the same
                              world coordinates across views — drag them
                              into place per view as needed. */}
                          {visibleAnnotations.map(a => (
                            <AnnotationView
                              key={a.id}
                              annotation={a}
                              selected={selAnnotIds.has(a.id)}
                              onSelect={(id, shift) => shift
                                ? toggleAnnotation(id)
                                : selectOnly([], [], [], [], [], [id])}
                            />
                          ))}
                        </>
                      );
                    })()}
                  </>
                )}
              </Canvas>

              {/* Floating quick-ref. Dismissible via the X — the hidden
                  state persists per-browser so returning users don't have
                  to close it every time. */}
              {shortcutsVisible && (
                <div className="absolute top-3 right-3 bg-card/80 backdrop-blur border border-border rounded pl-3 pr-2 py-2 text-xs text-muted-foreground max-w-xs">
                  <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                    <MIcon name="info" className="text-sm" /> Shortcuts
                    <button
                      type="button"
                      onClick={hideShortcuts}
                      aria-label="Hide shortcuts"
                      title="Hide shortcuts"
                      className="ml-auto -mr-1 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <ul className="space-y-0.5">
                    <li>Scroll — zoom · Drag bg — pan · Shift+drag — marquee</li>
                    {viewMode === 'harness' ? (
                      <>
                        <li>Drag a Component / Branch Point — re-place (snaps to grid)</li>
                        <li>Shift+click harness nodes — multi-select, drag together</li>
                        <li>Bend tool — click a Bundle to add a bend point</li>
                        <li>Drag a bend handle — reshape · Double-click — remove</li>
                      </>
                    ) : (
                      <li>Click pin → click pin — wire</li>
                    )}
                    <li>Esc — cancel · Del — remove</li>
                    <li>Ctrl+Z/Y — undo/redo · Ctrl+C/V — copy/paste</li>
                  </ul>
                </div>
              )}
            </div>

            {issuesOpen && (
              <div className="border-t border-border max-h-48 overflow-y-auto bg-card/30">
                <IssuesPanel issues={issues} />
              </div>
            )}
          </div>

          {inspectorOpen && (
            <aside className="w-72 border-l border-border bg-card/30 overflow-y-auto">
              <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Inspector
              </div>
              <Inspector />
            </aside>
          )}
        </div>
        </HarnessGraphProvider>
      </div>

      <DevicePickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
        onEditUserDevice={(tpl) => {
          setEditingUserDevice(tpl);
          setCustomEditorOpen(true);
        }}
        onNewCustomDevice={() => {
          setEditingUserDevice(null);
          setCustomEditorOpen(true);
        }}
      />
      <CustomDeviceEditor
        open={customEditorOpen}
        editing={editingUserDevice}
        onClose={() => { setCustomEditorOpen(false); setEditingUserDevice(null); }}
      />
      <NetLabelPickerDialog />
    </AppShell>
  );
}
