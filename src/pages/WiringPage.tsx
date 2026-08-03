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
import { harnessBlockLayout, harnessTreeOf, DEFAULT_MM_PER_UNIT, HARNESS_GRID, computeNewBranchPointLabelAssignments } from '@/lib/wiring/harness';
import { useWiring, getPinWorldPos } from '@/lib/wiring/store';
import { instantiateDevice, nextDesignator, getDesignatorPrefix, DeviceTemplate, slugifyDesignator } from '@/lib/wiring/library';
import { runLint } from '@/lib/wiring/lint';
import { fetchGeneralSettings, fetchWiringProject, saveWiringProject } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { loadProjectLocal, saveProjectLocal } from '@/lib/wiring/persistence';
import { computeSheetRoutes } from '@/lib/wiring/sheetRoutes';
import {
  downloadSheetSvg, renderSheetSvg, printPdfDocument, computeExportRoutes,
  sheetHasSchematicContent, type SheetExportData, type PdfPage,
} from '@/lib/wiring/export';
import { renderHarnessSvg, buildCableSummaryHtml, buildWireSummaryHtml, type CableSummarySheetInput } from '@/lib/wiring/exportHarness';
import { WiringExportDialog, type WiringPdfExportOptions } from '@/components/wiring/WiringExportDialog';
import { exportPinList } from '@/lib/wiring/exportPinList';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Point, PlacedDevice, Orientation, Sheet } from '@/lib/wiring/types';
import { previewPlacedDevice } from '@/lib/wiring/library';
import {
  Plus, Undo2, Redo2, ChevronRight, ChevronLeft, AlertTriangle, Download, Upload, Trash2,
  FileText, FileImage, FileJson, FileSpreadsheet, CloudOff, Save, Tag, X, Scan,
  // Toolbar redesign: icon labels for each action button so they collapse
  // gracefully on narrow viewports. Save-status badge uses Check / Loader2.
  // Harness orientation collapses to a single mirror toggle (>|<).
  Spline, ShieldHalf, Type, StickyNote, Ruler, Workflow, Cable, CornerDownRight,
  Check, Loader2, FolderOpen, FlipHorizontal2, Lock, Unlock, RotateCcw, ChevronDown, Eye,
} from 'lucide-react';
import { toast } from 'sonner';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict';

const SHIELD_TERMINATION_LABELS: Record<'ground' | 'float' | 'backshell', string> = {
  ground: 'Ground-terminated',
  float: 'Floating',
  backshell: 'Backshell (S)',
};

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
  const mirrorHarnessNode = useWiring(s => s.mirrorHarnessNode);
  const setHarnessScale = useWiring(s => s.setHarnessScale);
  const selectedHarnessTree = useWiring(s => s.selectedHarnessTree);
  const selectedBundleId = useWiring(s => s.selectedBundleId);
  const selectedHarnessNodeIds = useWiring(s => s.selectedHarnessNodeIds);
  const assignBranchPointLabels = useWiring(s => s.assignBranchPointLabels);
  const lockHarnessEdges = useWiring(s => s.lockHarnessEdges);
  const unlockHarnessEdges = useWiring(s => s.unlockHarnessEdges);
  const resetHarnessLayout = useWiring(s => s.resetHarnessLayout);

  const [cursor, setCursor] = useState<Point | null>(null);
  const [projectName, setProjectName] = useState('Build Tracker');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
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

  // Auto-expand the collapsed Inspector rail whenever a new selection has
  // something to show details for. Keyed on the selection sets/ids
  // themselves (not a boolean), so this only fires on an actual selection
  // CHANGE — collapsing the inspector by hand while a selection sits idle
  // doesn't get immediately fought back open.
  useEffect(() => {
    const hasSelection =
      selDevIds.size > 0 || selWireIds.size > 0 || selConnIds.size > 0 ||
      selNetLabelIds.size > 0 || selShieldIds.size > 0 || selAnnotIds.size > 0 ||
      selectedHarnessTree !== null || selectedBundleId !== null || selectedHarnessNodeIds.size > 0;
    if (hasSelection) setInspectorOpen(true);
  }, [selDevIds, selWireIds, selConnIds, selNetLabelIds, selShieldIds, selAnnotIds,
      selectedHarnessTree, selectedBundleId, selectedHarnessNodeIds]);

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
  // The server project's `updatedAt` as of our last load/save — the token
  // the conflict check compares against. undefined = unknown (offline load;
  // the server then skips the check), null = server project was empty.
  const remoteUpdatedAtRef = useRef<string | null | undefined>(undefined);
  // Once a 409 conflict is seen, autosaving stops until the page reloads —
  // saving again would clobber whatever the other tab wrote.
  const conflictRef = useRef(false);

  // Harness hysteresis (2026-07) — the previous derivation's raw MST edges,
  // kept per-sheet (a Map, not a single value) so switching sheets never
  // lets one sheet's topology bias another's. A plain mutable ref, not
  // state — the write must never itself trigger a re-render; it's purely
  // "what deriveHarness produced last time," read back on the NEXT
  // derivation. Declared up here (not in the harness section) because the
  // undo/redo wrappers below need it in scope.
  const previousMstEdgesRef = useRef<Map<string, ReadonlySet<string>>>(new Map());

  // Undo/redo, wrapped: restoring an older state must not leave the
  // hysteresis bias pointing at the NEWER topology — in a near-tie the tree
  // would then refuse to visually revert with the undone positions. Clearing
  // the ref makes the first post-undo derivation cold (exact), after which
  // the bias warms back up on the next interaction.
  const doUndo = useCallback(() => { previousMstEdgesRef.current.clear(); undo(); }, [undo]);
  const doRedo = useCallback(() => { previousMstEdgesRef.current.clear(); redo(); }, [redo]);

  // Drop hysteresis entries for sheets that no longer exist — without this
  // the map grows monotonically across sheet deletions (a slow leak, and a
  // stale-bias hazard if a sheet id were ever reused).
  useEffect(() => {
    const live = new Set(sheets.map(sh => sh.id));
    for (const id of previousMstEdgesRef.current.keys()) {
      if (!live.has(id)) previousMstEdgesRef.current.delete(id);
    }
  }, [sheets]);

  // ── Load from server on mount, falling back to localStorage if offline ────
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    (async () => {
      try {
        const remote = await fetchWiringProject();
        remoteUpdatedAtRef.current = remote?.updatedAt ?? null;
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
    // A detected conflict freezes remote saves — pushing again would clobber
    // the other tab's work. Local backup keeps running so nothing is lost.
    if (conflictRef.current) {
      saveProjectLocal(serialize());
      if (!silent) {
        toast.error('Saving is paused — the project changed in another tab. Reload to pick up the latest version.');
      }
      return false;
    }
    const json = serialize();
    saveProjectLocal(json); // always persist local backup first
    try {
      const parsed = JSON.parse(json);
      const result = await saveWiringProject(projectName, parsed, remoteUpdatedAtRef.current);
      remoteUpdatedAtRef.current = result.updatedAt;
      setSaveStatus('saved');
      setSaveError(null);
      lastErrorToastedRef.current = null;
      if (!silent) toast.success('Saved to server');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      // 409 — another tab/device saved since we loaded. Stop autosaving and
      // tell the user to reload; their edits here stay in local storage.
      if (status === 409) {
        conflictRef.current = true;
        setSaveStatus('conflict');
        setSaveError(message);
        toast.error(
          'This wiring project was changed in another tab or on another device. '
          + 'Saving is paused so nothing gets overwritten — reload to pick up the latest version.',
          {
            duration: Infinity,
            action: { label: 'Reload', onClick: () => window.location.reload() },
          },
        );
        return false;
      }
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
    // Conflict → remote saving is frozen; keep the local backup fresh but
    // don't flash "saving…" in the badge.
    if (conflictRef.current) {
      saveProjectLocal(serialize());
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

  // ── Sheet-wide routing cache ─────────────────────────────────────────
  // Every wire routed once per state change, crossings (hop arcs) computed
  // in one pass. <Wire>, <ShieldBlock>, and the exporters all read from
  // this single result, so the canvas and every export stay pixel-identical
  // — and dragging no longer triggers O(n²) re-routing per frame.
  const junctionsAll = useWiring(s => s.junctions);
  const sheetRoutes = useMemo(
    () => computeSheetRoutes({ placedDevices, wires, netLabels, junctions: junctionsAll, shields }),
    [placedDevices, wires, netLabels, junctionsAll, shields]
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
  // `previousMstEdges` feeds hysteresis so a small move doesn't reshuffle
  // branch points / bundle routing elsewhere in the tree (2026-07 — see
  // `deriveHarness`'s module doc for the full rationale).
  const harnessGraph = useMemo(() => {
    const previousMstEdges = previousMstEdgesRef.current.get(activeSheetId);
    const graph = deriveHarness({
      placedDevices: visibleDevices,
      wires: visibleWires,
      junctions: visibleJunctions,
      netLabels: visibleNetLabels,
    }, harnessOverrides, previousMstEdges);
    if (graph._mstEdgeKeys) previousMstEdgesRef.current.set(activeSheetId, graph._mstEdgeKeys);
    return graph;
  }, [visibleDevices, visibleWires, visibleJunctions, visibleNetLabels, harnessOverrides, activeSheetId]);

  // Stable branch-point numbering (2026-07) — assigns a persisted `BP<n>` to
  // any branch point seen for the first time this derivation.
  // `deriveHarness` only ever READS `branchPointLabels`; this effect is the
  // one place that WRITES it, so the derivation itself stays pure. Safe
  // against loops: once assigned, those ids are no longer "unassigned" on
  // the next pass (which this same override change triggers), so the body
  // becomes a no-op and the effect settles after exactly one extra tick.
  useEffect(() => {
    const existing = activeSheetObj?.harness?.overrides?.branchPointLabels ?? {};
    const branchPointIds = harnessGraph.nodes.filter(n => n.kind === 'branchPoint').map(n => n.id);
    const assignments = computeNewBranchPointLabelAssignments(existing, branchPointIds);
    if (Object.keys(assignments).length === 0) return;
    assignBranchPointLabels(activeSheetId, assignments);
  }, [harnessGraph, activeSheetObj, activeSheetId, assignBranchPointLabels]);

  // True when at least one placed device is selected. In the harness view a
  // device block selects into `selectedDeviceIds` (the shared device-selection
  // set) — that is the set the Mirror button / `mirrorHarnessNode` act on.
  const canMirrorHarness = [...selDevIds].some(id => visibleDevices.some(d => d.id === id));

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
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        doRedo();
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
  }, [cancelWiring, clearSelection, copySelection, pasteClipboard, removeSelected, doUndo, doRedo]);

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

  // Everything the exporters need, passed explicitly — no hidden registry
  // state. Junctions ride along so `junction:` / `#labelId` / `#shield:`
  // endpoints all resolve inside the export's own routing pass.
  const exportData: SheetExportData = {
    placedDevices, wires, netLabels, annotations, shields, junctions: junctionsAll,
  };

  const exportSvg = () => {
    if (!activeSheet) return;
    downloadSheetSvg(exportData, activeSheet, exportMeta);
    toast.success(`Sheet "${activeSheet.name}" exported as SVG`);
  };

  /** Derive one sheet's harness graph for export. The ACTIVE sheet reuses
   *  the live `harnessGraph` (identical to what's on screen, including its
   *  hysteresis state); other sheets derive fresh from their own data +
   *  overrides — deterministic, and exact for anything locked or hand-laid. */
  const harnessGraphForSheet = (sheet: Sheet) => {
    if (sheet.id === activeSheetId) return harnessGraph;
    return deriveHarness({
      placedDevices: placedDevices.filter(d => d.sheetId === sheet.id),
      wires: wires.filter(w => w.sheetId === sheet.id),
      junctions: junctionsAll.filter(j => j.sheetId === sheet.id),
      netLabels: netLabels.filter(n => n.sheetId === sheet.id),
    }, sheet.harness?.overrides, previousMstEdgesRef.current.get(sheet.id));
  };

  /** Assemble + print the PDF the export dialog described: schematic and/or
   *  harness pages per selected sheet, plus the optional cable summary. */
  const handlePdfExport = (opts: WiringPdfExportOptions) => {
    const targetSheets = opts.scope === 'current'
      ? (activeSheet ? [activeSheet] : [])
      : [...sheets].sort((a, b) => a.order - b.order);
    const metaBase = { projectName, date: new Date().toISOString() };

    const pages: PdfPage[] = [];
    const summaryInputs: CableSummarySheetInput[] = [];
    // One routing pass shared by every schematic page.
    const routed = opts.includeSchematic ? computeExportRoutes(exportData) : null;

    for (const sheet of targetSheets) {
      if (opts.includeSchematic && routed && sheetHasSchematicContent(exportData, sheet.id)) {
        pages.push({ html: renderSheetSvg(exportData, sheet, { ...metaBase, sheetName: sheet.name }, routed) });
      }
      if (opts.includeHarness) {
        const graph = harnessGraphForSheet(sheet);
        const sheetDevices = placedDevices.filter(d => d.sheetId === sheet.id);
        const mmPerUnit = sheet.harness?.mmPerUnit ?? DEFAULT_MM_PER_UNIT;
        const svg = renderHarnessSvg({
          graph,
          placedDevices: sheetDevices,
          options: {
            showCableNames: opts.showCableNames,
            showConductorCounts: opts.showConductorCounts,
            lengthsMode: opts.lengthsMode,
            mmPerUnit,
            connectorOrder: sheet.harness?.overrides?.connectorOrder,
            branchPointLabels: sheet.harness?.overrides?.branchPointLabels,
          },
          meta: { ...metaBase, sheetName: `${sheet.name} — Harness` },
        });
        if (svg) {
          pages.push({ html: svg });
          summaryInputs.push({
            sheetName: sheet.name,
            graph,
            placedDevices: sheetDevices,
            wires: wires.filter(w => w.sheetId === sheet.id),
            mmPerUnit,
            branchPointLabels: sheet.harness?.overrides?.branchPointLabels,
          });
        }
      }
    }

    if (opts.includeHarness && opts.includeCableSummary) {
      const summary = buildCableSummaryHtml(summaryInputs, metaBase);
      if (summary) pages.push({ html: summary, kind: 'flow' });
    }
    if (opts.includeHarness && opts.includeWireSummary) {
      const wireSummary = buildWireSummaryHtml(summaryInputs, metaBase);
      if (wireSummary) pages.push({ html: wireSummary, kind: 'flow' });
    }

    if (pages.length === 0) {
      toast.error('Nothing to export — the selected sheets have no content.');
      return;
    }
    printPdfDocument(`${projectName} — wiring`, pages, { pageSize: opts.pageSize });
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

  return (
    <AppShell activePage="wiring" projectName={projectName} pageTitle="Wiring Diagrams" fullWidth>
      {/* Topbar is 80px tall; the demo-mode banner adds another 32px on top.
          Mirror the AppShell `pt-20` / `pt-28` switch so the canvas fills the
          remaining viewport without overflowing. */}
      <div className="flex flex-col" style={{ height: `calc(100vh - ${demoMode ? 112 : 80}px)` }}>

        {/* Toolbar — single non-wrapping row.  Action buttons collapse to
            icon-only below `lg:` so the View toggle + right cluster
            (Save / issues / inspector) stay visible at every breakpoint.
            `overflow-x-auto` is the safety net for very narrow viewports
            (mobile rotation, split-view) so nothing falls off the page
            unrecoverably. */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/30 overflow-x-auto">
          {/* View mode toggle — Schematic / Harness.  Anchored at the
              leftmost slot in both modes so the primary "where am I?"
              control is always in the same place.  Icon-only below `lg:`;
              tooltip carries the full label. shrink-0 because this must
              stay visible at every breakpoint. */}
          <div className="inline-flex rounded border border-border overflow-hidden shrink-0">
            <Button
              size="sm"
              variant={viewMode === 'schematic' ? 'default' : 'ghost'}
              className="rounded-none px-2 lg:px-3 py-1 text-sm gap-1"
              onClick={() => onToggle('schematic')}
              title="Schematic view"
              aria-label="Schematic view"
              aria-pressed={viewMode === 'schematic'}
            >
              <Workflow className="w-4 h-4" />
              <span className="hidden lg:inline">Schematic</span>
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'harness' ? 'default' : 'ghost'}
              className="rounded-none px-2 lg:px-3 py-1 text-sm gap-1"
              onClick={() => onToggle('harness')}
              title="Harness view"
              aria-label="Harness view"
              aria-pressed={viewMode === 'harness'}
            >
              <Cable className="w-4 h-4" />
              <span className="hidden lg:inline">Harness</span>
            </Button>
          </div>

          {/* Unified File menu — Export variants + Import + Clear all sit
              under one button so the toolbar doesn't fight for width.
              Destructive items live below a separator and carry red text. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1" title="Export, import, or clear the project">
                <FolderOpen className="w-4 h-4" />
                <span className="hidden lg:inline">File</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setExportDialogOpen(true)} className="gap-2">
                <FileText className="w-4 h-4" /> Export PDF… (schematic / harness)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportSvg} className="gap-2">
                <FileImage className="w-4 h-4" /> Export current sheet → SVG
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={exportPinListXlsx} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Export pin list → Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportJson} className="gap-2">
                <FileJson className="w-4 h-4" /> Export full project → JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="w-4 h-4" /> Import project from JSON…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={doReset}
                className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" /> Clear entire project…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

          {/* View menu (2026-07) — harness-only presentation settings that
              don't belong as always-visible inline controls: Reset layout
              (a rare, confirm-guarded action) and the auto-length scale
              (only affects the ~estimate shown for unmeasured cables, never
              a cable's stored length — the menu spells that out so it isn't
              mistaken for a global unit setting). */}
          {viewMode === 'harness' && (() => {
            const mmPerUnit = activeSheetObj?.harness?.mmPerUnit ?? DEFAULT_MM_PER_UNIT;
            const mmPerSquare = Math.round(mmPerUnit * HARNESS_GRID);
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="gap-1" title="Harness view settings">
                    <Eye className="w-4 h-4" />
                    <span className="hidden lg:inline">View</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuItem
                    onClick={() => {
                      if (confirm('Reset the harness layout? Every device, splice, branch point and cable bend goes back to its automatic position. Cable lengths, names and the topology lock are kept. (Undoable with Ctrl+Z.)')) {
                        resetHarnessLayout(activeSheetId);
                      }
                    }}
                    className="gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Reset layout
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={showLengths}
                    onCheckedChange={(v) => setShowLengths(v === true)}
                    className="gap-2"
                  >
                    <Ruler className="w-4 h-4" /> Show cable lengths
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Auto-length scale
                  </DropdownMenuLabel>
                  <div className="px-2 pb-2 pt-0.5" onKeyDown={(e) => e.stopPropagation()}>
                    <p className="text-xs text-muted-foreground mb-1.5 leading-snug">
                      Only sets the <strong className="text-foreground">~estimated</strong> length shown for
                      cables you haven't measured yet. Cables with a length you've typed in are never affected.
                    </p>
                    <div className="flex items-center gap-1.5">
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
                      <span className="text-xs text-muted-foreground">mm / grid square</span>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}

          {/* Editing actions — Undo / Redo / Fit-to-view — grouped together
              because they're reached for in quick succession when recovering
              from a mistaken click or re-orienting after a pan/zoom. */}
          <Button size="icon" variant="ghost" onClick={doUndo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={doRedo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="w-4 h-4" />
          </Button>
          {/* Fit to content — frames every device, wire, shield, and
              net-label on the active sheet inside the viewport. */}
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
            <Trash2 className="w-4 h-4" />
            <span className="hidden lg:inline">Delete</span>
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Schematic-mode content tools — hidden in harness view because
              the harness is a *derived* rendering.  Adding devices, tagging
              nets, and wrapping shields all happen on the schematic sheet. */}
          {viewMode === 'schematic' && (
            <>
              <Button size="sm" onClick={() => setPickerOpen(true)} className="gap-1" title="Browse the device library and add a device to the canvas">
                <Plus className="w-4 h-4" />
                <span className="hidden lg:inline">Devices</span>
              </Button>
              <Button
                size="sm"
                variant={netLabelMode ? 'default' : 'outline'}
                onClick={() => { setShieldMode(false); setShieldDrag(null); setJunctionMode(false); setNetLabelMode(v => !v); }}
                className="gap-1"
                title={netLabelMode ? 'Exit net-label mode (Esc)' : 'Tag a pin with a net name (5V, GND, …)'}
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Net label</span>
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
                <Spline className="w-4 h-4" />
                <span className="hidden lg:inline">Wire</span>
              </Button>
              {/* Shield tool — drag a rectangle on the canvas to wrap every wire
                  crossing it in a new shield. Picking a termination below both
                  sets it AND arms the tool (matches the old click-to-arm
                  button); the chosen termination applies to every shield
                  drawn until changed again. Esc still exits shield mode. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant={shieldMode ? 'default' : 'outline'}
                    className="gap-1"
                    title={shieldMode ? `Shield mode — ${SHIELD_TERMINATION_LABELS[shieldTermination]} (Esc to exit)` : 'Drag across wires to add a shield'}
                  >
                    <ShieldHalf className="w-4 h-4" />
                    <span className="hidden lg:inline">Shield</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Termination (selecting one arms the tool)
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={shieldTermination}
                    onValueChange={(v) => {
                      setShieldTermination(v as 'ground' | 'float' | 'backshell');
                      enterShieldMode();
                    }}
                  >
                    <DropdownMenuRadioItem value="ground">Ground-terminated</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="float">Floating</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="backshell">Backshell (S)</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  {shieldMode && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={exitShieldMode} className="gap-2">
                        <X className="w-4 h-4" /> Exit shield mode
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
                <Type className="w-4 h-4" />
                <span className="hidden lg:inline">Text</span>
              </Button>
            </>
          )}

          {/* Harness-mode content tools — only relevant when looking at the
              derived harness drawing. */}
          {viewMode === 'harness' && (
            <>
              <Button
                size="sm"
                variant={bendMode ? 'default' : 'outline'}
                className="gap-1"
                onClick={() => setBendMode(v => !v)}
                title={bendMode
                  ? 'Exit Bend tool (Esc) — click a bundle to add a cable bend point'
                  : 'Bend tool — click a bundle to add a cable bend point'}
              >
                <CornerDownRight className="w-4 h-4" />
                <span className="hidden lg:inline">Bend</span>
              </Button>
              {/* Mirror — flips each selected unit between 0° and 180° so its
                  connectors face the opposite edge.  Mixed selections flip
                  per-device, not en-bloc. */}
              <Button
                size="sm"
                variant="outline"
                className="ml-1 gap-1"
                disabled={!canMirrorHarness}
                onClick={() => mirrorHarnessNode(activeSheetId)}
                title="Mirror selected unit(s) — flip connectors to the opposite edge"
                aria-label="Mirror selected unit(s)"
              >
                <FlipHorizontal2 className="w-4 h-4" />
                <span className="hidden lg:inline">Mirror</span>
              </Button>
              {/* Lock / Unlock harness layout (2026-07) — pins the current
                  branch-point / bundle topology for the whole sheet so it
                  stops reshuffling on every move (see deriveHarness's module
                  doc). Locking captures the live graph's raw MST edges;
                  unlocking clears them and the sheet reverts to
                  fresh-MST-with-hysteresis. */}
              {(() => {
                const isLocked = Object.keys(activeSheetObj?.harness?.overrides?.lockedEdges ?? {}).length > 0;
                return (
                  <Button
                    size="sm"
                    variant={isLocked ? 'default' : 'outline'}
                    className="gap-1"
                    onClick={() => {
                      if (isLocked) {
                        unlockHarnessEdges(activeSheetId);
                      } else {
                        lockHarnessEdges(activeSheetId, Array.from(harnessGraph._mstEdgeKeys ?? []));
                      }
                    }}
                    title={isLocked
                      ? 'Unlock harness layout — topology goes back to auto-routing'
                      : 'Lock harness layout — pin the current branch points & cable routing so moving devices never reshuffles them'}
                  >
                    {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    <span className="hidden lg:inline">{isLocked ? 'Locked' : 'Lock'}</span>
                  </Button>
                );
              })()}
            </>
          )}

          {/* Note tool — view-agnostic, lives at the end of the content
              tools because it's the universal "leave a marker" action
              regardless of which view the user is in. */}
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
            <StickyNote className="w-4 h-4" />
            <span className="hidden lg:inline">Note</span>
          </Button>

          <div className="flex-1" />

          {/* Save button — floppy icon carries the persistence status via a
              small badge in its bottom-right corner.  No separate status
              text pill: the badge + tooltip do the same work in a fraction
              of the width.
                • idle    → bare floppy (nothing to report)
                • saving  → blue dot with a spinning loader
                • saved   → green dot with a checkmark
                • offline → amber dot with a struck-through cloud
                • error   → red dot with an X
              In demo mode the button is disabled and tinted amber to signal
              "this would normally save but won't right now". */}
          <Button
            size="icon"
            variant={saveStatus === 'offline' || saveStatus === 'error' ? 'destructive' : 'outline'}
            onClick={manualSave}
            disabled={saveStatus === 'saving' || demoMode}
            className={`relative shrink-0 ${
              demoMode ? 'border-amber-500/40 text-amber-600 dark:text-amber-400' : ''
            }`}
            aria-label="Save to server"
            title={
              demoMode ? 'Demo mode — changes are not saved'
              : saveStatus === 'conflict' ? 'Changed in another tab — reload the page to continue saving'
              : saveError ? `Last error: ${saveError}`
              : saveStatus === 'saved'   ? 'All changes saved'
              : saveStatus === 'saving'  ? 'Saving…'
              : saveStatus === 'offline' ? 'Offline — local backup only.  Click to retry.'
              : saveStatus === 'error'   ? 'Save failed — click to retry'
              : 'Save to server now'
            }
          >
            <Save className="w-4 h-4" />
            {!demoMode && saveStatus !== 'idle' && (
              <span
                className={`absolute -bottom-0.5 -right-0.5 rounded-full p-0.5 ring-1 ring-background flex items-center justify-center ${
                  saveStatus === 'saved'   ? 'bg-green-500' :
                  saveStatus === 'saving'  ? 'bg-blue-500' :
                  saveStatus === 'offline' ? 'bg-amber-500' :
                                             'bg-destructive'
                }`}
                aria-hidden
              >
                {saveStatus === 'saved'   ? <Check    className="w-2.5 h-2.5 text-white" /> :
                 saveStatus === 'saving'  ? <Loader2  className="w-2.5 h-2.5 text-white animate-spin" /> :
                 saveStatus === 'offline' ? <CloudOff className="w-2.5 h-2.5 text-white" /> :
                                            <X        className="w-2.5 h-2.5 text-white" />}
              </span>
            )}
          </Button>

          {/* Conflict pill — persistent, impossible to miss. Saving is
              frozen until the user reloads to pick up the other tab's
              version (their local edits stay in localStorage). */}
          {saveStatus === 'conflict' && (
            <button
              onClick={() => window.location.reload()}
              className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
              title="This project was changed in another tab or on another device. Click to reload and pick up the latest version."
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Changed elsewhere — reload</span>
              <span className="lg:hidden">Reload</span>
            </button>
          )}

          {/* Demo-mode pill stays — it's a distinct conceptual mode users
              need to see at a glance, not just a transient save status. */}
          {demoMode && (
            <span
              className="hidden md:flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400"
              title="Demo mode — your changes stay in this browser only and are not persisted to the server."
            >
              <CloudOff className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Demo · changes not saved</span>
              <span className="lg:hidden">Demo</span>
            </span>
          )}

          {/* Issues count pill — long form on lg+, compact "Nerr · Nwarn"
              on smaller viewports so it doesn't crowd the right cluster. */}
          <button
            onClick={() => setIssuesOpen(v => !v)}
            className={`shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded ${
              errorCount > 0 ? 'bg-destructive/15 text-destructive'
              : warningCount > 0 ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
              : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
            title={errorCount + warningCount === 0
              ? 'No issues — toggle issues panel'
              : `${errorCount} error${errorCount === 1 ? '' : 's'} · ${warningCount} warning${warningCount === 1 ? '' : 's'} — toggle issues panel`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {errorCount + warningCount === 0 ? (
              <span className="hidden lg:inline">No issues</span>
            ) : (
              <>
                <span className="hidden lg:inline">
                  {errorCount} error{errorCount === 1 ? '' : 's'} · {warningCount} warning{warningCount === 1 ? '' : 's'}
                </span>
                <span className="lg:hidden tabular-nums">
                  {errorCount}·{warningCount}
                </span>
              </>
            )}
          </button>
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
                    {visibleWires.map(w => {
                      const route = sheetRoutes.routes.get(w.id);
                      if (!route) return null;
                      return (
                        <Wire
                          key={w.id}
                          wire={w}
                          selected={selWireIds.has(w.id)}
                          onSelect={(id, shift) => shift ? toggleWire(id) : selectOnly([], [id], [])}
                          allWiresOnSheet={visibleWires}
                          route={route}
                        />
                      );
                    })}
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
                        routes={sheetRoutes.routes}
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
                        <li>Lock — pin branch points & routing so moves can't reshuffle them</li>
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

          {/* Inspector aside — collapses to a thin rail on the far right
              rather than disappearing outright, so there's always something
              there to click to bring it back (2026-07: the old toggle lived
              in the top toolbar, easy to lose track of). */}
          {inspectorOpen ? (
            <aside className="w-72 shrink-0 border-l border-border bg-card/30 overflow-y-auto">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inspector</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 -mr-1.5"
                  onClick={() => setInspectorOpen(false)}
                  title="Collapse inspector"
                  aria-label="Collapse inspector"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <Inspector />
            </aside>
          ) : (
            <button
              onClick={() => setInspectorOpen(true)}
              className="w-6 shrink-0 border-l border-border bg-card/30 hover:bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Open inspector"
              aria-label="Open inspector"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
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
      <WiringExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        currentSheetName={activeSheet?.name ?? 'Sheet'}
        sheetCount={sheets.length}
        onExport={handlePdfExport}
      />
    </AppShell>
  );
}
