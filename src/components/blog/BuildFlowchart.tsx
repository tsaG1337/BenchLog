import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/contexts/SectionsContext';
import { cn } from '@/lib/utils';
import { X, Pencil, Check, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '';

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = 'none' | 'in-progress' | 'done';
type StatusMap = Record<string, ItemStatus>;

interface FlowItem {
  id: string;
  label: string;
  children?: FlowItem[];
}

type PackagesMap = Record<string, FlowItem[]>; // sectionId → tree of packages
type AddTarget = { kind: 'section'; id: string } | { kind: 'package'; id: string } | null;

// ─── Internal React context (avoids deep prop drilling through recursive nodes) ─

interface TreeCtxValue {
  statuses: StatusMap;
  editMode: boolean;
  isAuthenticated: boolean;
  addTarget: AddTarget;
  addLabel: string;
  setAddTarget: (t: AddTarget) => void;
  setAddLabel: (s: string) => void;
  onSubmitAdd: () => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

const TreeCtx = createContext<TreeCtxValue | null>(null);
const useTreeCtx = () => useContext(TreeCtx)!;

// ─── Status helpers ───────────────────────────────────────────────────────────

function nextStatus(s: ItemStatus): ItemStatus {
  return s === 'none' ? 'in-progress' : s === 'in-progress' ? 'done' : 'none';
}

// ─── Tree utilities ───────────────────────────────────────────────────────────

/** Recursively flatten all items in a tree */
function getAllItems(items: FlowItem[]): FlowItem[] {
  return items.flatMap(item => [item, ...getAllItems(item.children || [])]);
}

/** Collect every id in a subtree (used for status cleanup on remove) */
function getAllIds(items: FlowItem[]): string[] {
  return items.flatMap(item => [item.id, ...getAllIds(item.children || [])]);
}

/** Add newItem as a child of the node with parentId, anywhere in the tree */
function addChild(items: FlowItem[], parentId: string, newItem: FlowItem): FlowItem[] {
  return items.map(item => {
    if (item.id === parentId) return { ...item, children: [...(item.children || []), newItem] };
    if (item.children?.length) return { ...item, children: addChild(item.children, parentId, newItem) };
    return item;
  });
}

/** Remove the node with the given id and all its descendants */
function removeItem(items: FlowItem[], id: string): FlowItem[] {
  return items
    .filter(item => item.id !== id)
    .map(item =>
      item.children?.length ? { ...item, children: removeItem(item.children, id) } : item
    );
}


// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchFlowchartStatus(): Promise<StatusMap> {
  const res = await fetch(`${API_URL}/api/flowchart-status`);
  return res.ok ? res.json() : {};
}

async function saveFlowchartStatus(statuses: StatusMap): Promise<void> {
  const token = localStorage.getItem('auth_token');
  await fetch(`${API_URL}/api/flowchart-status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(statuses),
  });
}

async function fetchFlowchartPackages(): Promise<PackagesMap> {
  const res = await fetch(`${API_URL}/api/flowchart-packages`);
  return res.ok ? res.json() : {};
}

async function saveFlowchartPackages(packages: PackagesMap): Promise<void> {
  const token = localStorage.getItem('auth_token');
  await fetch(`${API_URL}/api/flowchart-packages`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(packages),
  });
}

// ─── Circular progress indicator ─────────────────────────────────────────────

function CircularProgress({ pct, hasItems }: { pct: number; hasItems: boolean }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = !hasItems
    ? 'rgba(255,255,255,0.08)'
    : pct === 100 ? '#10b981'
    : pct > 0   ? '#f59e0b'
    : 'rgba(255,255,255,0.15)';

  return (
    <div className="relative flex items-center justify-center w-10 h-10 shrink-0">
      <svg width="40" height="40" className="-rotate-90 absolute inset-0">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.4s ease' }} />
      </svg>
      <span className="text-[9px] font-bold text-foreground z-10 leading-none">
        {hasItems ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

// ─── Inline "add package" form ────────────────────────────────────────────────

function AddForm() {
  const { addLabel, setAddLabel, onSubmitAdd, setAddTarget } = useTreeCtx();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="flex items-center gap-1">
      <input
        ref={ref}
        type="text"
        value={addLabel}
        onChange={e => setAddLabel(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSubmitAdd();
          if (e.key === 'Escape') setAddTarget(null);
        }}
        placeholder="Package name…"
        className="h-7 flex-1 min-w-0 rounded border border-dashed border-primary/50 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
      />
      <button
        onClick={onSubmitAdd}
        disabled={!addLabel.trim()}
        className="h-7 px-2.5 rounded border border-border bg-secondary text-xs hover:bg-primary/10 disabled:opacity-30 shrink-0 transition-colors"
      >
        Add
      </button>
      <button
        onClick={() => setAddTarget(null)}
        className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Single work package chip ─────────────────────────────────────────────────

function Chip({ item }: { item: FlowItem }) {
  const { statuses, editMode, isAuthenticated, onToggle, onRemove, setAddTarget, setAddLabel } = useTreeCtx();
  const status = statuses[item.id] || 'none';

  return (
    <div className="relative group">
      <button
        onClick={() => !editMode && isAuthenticated && onToggle(item.id)}
        title={!editMode && isAuthenticated ? 'Click to cycle: not started → in progress → done' : item.label}
        className={cn(
          'px-2.5 py-1 rounded-md text-xs font-medium border transition-all select-none leading-none',
          !editMode && isAuthenticated ? 'cursor-pointer hover:opacity-85' : 'cursor-default',
          status === 'done'
            ? 'bg-emerald-600 border-emerald-500 text-white'
            : status === 'in-progress'
            ? 'bg-amber-500 border-amber-400 text-white'
            : 'bg-secondary/60 border-border/60 text-muted-foreground',
        )}
      >
        {item.label}
      </button>

      {/* Edit mode: action buttons shown on hover */}
      {editMode && isAuthenticated && (
        <div className="absolute bottom-full left-0 mb-0.5 hidden group-hover:flex gap-px bg-card border border-border rounded px-0.5 py-0.5 shadow-md z-20">
          <button
            onClick={() => { setAddTarget({ kind: 'package', id: item.id }); setAddLabel(''); }}
            title="Add child package"
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => onRemove(item.id)}
            title="Remove package (and its children)"
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Recursive tree node: chip on top, children in a flex row below ──────────

function PackageNode({ item }: { item: FlowItem }) {
  return (
    <div className="flex flex-col gap-1 items-start">
      <Chip item={item} />
      {item.children?.length ? (
        <div className="flex flex-wrap gap-1.5 pl-3 pt-0.5">
          {item.children.map(child => (
            <PackageNode key={child.id} item={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Section row (full-width, collapsible) ─────────────────────────────────────

function SectionRow({
  section,
  items,
}: {
  section: { id: string; label: string; icon: string };
  items: FlowItem[];
}) {
  const { statuses, editMode, isAuthenticated, addTarget, setAddTarget, setAddLabel } = useTreeCtx();
  const [collapsed, setCollapsed] = useState(false);

  const allInSection = getAllItems(items);
  const doneCount = allInSection.filter(i => statuses[i.id] === 'done').length;
  const pct = allInSection.length > 0 ? Math.round((doneCount / allInSection.length) * 100) : 0;

  const isAddingToSection = addTarget?.kind === 'section' && addTarget.id === section.id;
  const isAddingChild =
    addTarget?.kind === 'package' && allInSection.some(i => i.id === addTarget.id);
  const addParentLabel =
    isAddingChild && addTarget?.kind === 'package'
      ? (allInSection.find(i => i.id === addTarget.id)?.label ?? '')
      : '';


  return (
    <div className="border border-border/60 rounded-lg bg-secondary/20 overflow-hidden">
      {/* Header — click anywhere to collapse/expand */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 bg-secondary/40 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className="text-muted-foreground/50 shrink-0">
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />}
        </span>
        <span className="text-base shrink-0">{section.icon}</span>
        <p className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">{section.label}</p>
        {allInSection.length > 0 && (
          <p className="text-[10px] text-muted-foreground/60 shrink-0 hidden sm:block">
            {doneCount}/{allInSection.length} done
          </p>
        )}
        {editMode && isAuthenticated && (
          <button
            onClick={e => {
              e.stopPropagation();
              setAddTarget({ kind: 'section', id: section.id });
              setAddLabel('');
              setCollapsed(false);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
        <CircularProgress pct={pct} hasItems={allInSection.length > 0} />
      </div>

      {/* Content: one row of chips per depth level */}
      {!collapsed && (
        <div className="px-4 py-3 space-y-2">
          {items.length === 0 && !isAddingToSection ? (
            <p className="text-[11px] text-muted-foreground/40 italic">
              {editMode
                ? 'Click "Add" in the header to create the first work package'
                : 'No packages defined'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 items-start">
              {items.map(item => (
                <PackageNode key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Add form, shown at the bottom of the section when active */}
          {(isAddingToSection || isAddingChild) && (
            <div className="pt-2 border-t border-dashed border-border/40 space-y-1">
              {isAddingChild && (
                <p className="text-[10px] text-muted-foreground/60">
                  Adding child to{' '}
                  <span className="text-foreground/80">"{addParentLabel}"</span>
                </p>
              )}
              <AddForm />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Full expanded flowchart ──────────────────────────────────────────────────

function FlowchartContent({
  sections, packages, statuses,
  onToggle, onAddTopLevel, onAddChild, onRemove,
  isAuthenticated, editMode,
}: {
  sections: { id: string; label: string; icon: string }[];
  packages: PackagesMap;
  statuses: StatusMap;
  onToggle: (id: string) => void;
  onAddTopLevel: (sectionId: string, label: string) => void;
  onAddChild: (parentId: string, label: string) => void;
  onRemove: (id: string) => void;
  isAuthenticated: boolean;
  editMode: boolean;
}) {
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [addLabel, setAddLabel] = useState('');

  // Close add form when edit mode turns off
  useEffect(() => { if (!editMode) setAddTarget(null); }, [editMode]);

  const onSubmitAdd = useCallback(() => {
    const label = addLabel.trim();
    if (!label || !addTarget) return;
    if (addTarget.kind === 'section') onAddTopLevel(addTarget.id, label);
    else onAddChild(addTarget.id, label);
    setAddLabel('');
    setAddTarget(null);
  }, [addLabel, addTarget, onAddTopLevel, onAddChild]);

  const allItems = sections.flatMap(s => getAllItems(packages[s.id] || []));
  const totalDone = allItems.filter(i => statuses[i.id] === 'done').length;
  const totalWip  = allItems.filter(i => statuses[i.id] === 'in-progress').length;
  const totalNone = allItems.length - totalDone - totalWip;

  return (
    <TreeCtx.Provider value={{
      statuses, editMode, isAuthenticated,
      addTarget, addLabel, setAddTarget, setAddLabel, onSubmitAdd,
      onToggle, onRemove,
    }}>
      <div className="space-y-2">
        {sections.map(section => (
          <SectionRow key={section.id} section={section} items={packages[section.id] || []} />
        ))}

        {/* Legend */}
        <div className="flex items-center gap-5 pt-2 border-t border-border text-[11px] text-muted-foreground flex-wrap">
          <span className="font-semibold text-foreground/60 uppercase tracking-wider text-[10px]">Legend</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-600 border border-emerald-500 inline-block" />
            Completed — {totalDone}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500 border border-amber-400 inline-block" />
            In Progress — {totalWip}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-muted/40 border border-border inline-block" />
            Not Started — {totalNone}
          </span>
        </div>
      </div>
    </TreeCtx.Provider>
  );
}

// ─── Sidebar thumbnail ────────────────────────────────────────────────────────

function FlowchartThumbnail({
  sections, packages, statuses,
}: {
  sections: { id: string; label: string; icon: string }[];
  packages: PackagesMap;
  statuses: StatusMap;
}) {
  const allItems = sections.flatMap(s => getAllItems(packages[s.id] || []));
  const totalDone = allItems.filter(i => statuses[i.id] === 'done').length;
  const total = allItems.length;
  const overallPct = total > 0 ? Math.round((totalDone / total) * 100) : 0;

  return (
    <div className="space-y-1.5 text-left">
      {sections.map(section => {
        const items = getAllItems(packages[section.id] || []);
        const done = items.filter(i => statuses[i.id] === 'done').length;
        const pct  = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

        return (
          <div key={section.id}>
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[9px] text-muted-foreground truncate flex-1 pr-1 leading-none">
                {section.icon} {section.label}
              </p>
              <p className="text-[9px] font-bold text-foreground shrink-0 leading-none">
                {items.length > 0 ? `${pct}%` : '—'}
              </p>
            </div>
            {items.length > 0 ? (
              <div className="flex gap-px h-1.5 rounded overflow-hidden bg-muted/20">
                {items.map(item => {
                  const s = statuses[item.id] || 'none';
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex-1',
                        s === 'done'          ? 'bg-emerald-600'
                        : s === 'in-progress' ? 'bg-amber-500'
                        : 'bg-muted/40'
                      )}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="h-1.5 rounded bg-muted/10 border border-dashed border-border/40" />
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground text-center pt-1">
        {total > 0
          ? `${overallPct}% complete · ${totalDone}/${total} done`
          : 'No packages defined yet'}
      </p>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function BuildFlowchart({ projectName }: { projectName?: string }) {
  const { isAuthenticated } = useAuth();
  const { sections } = useSections();
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [packages, setPackages] = useState<PackagesMap>({});
  const [expanded, setExpanded]   = useState(false);
  const [editMode, setEditMode]   = useState(false);

  useEffect(() => {
    fetchFlowchartStatus().then(setStatuses).catch(() => {});
    fetchFlowchartPackages().then(setPackages).catch(() => {});
  }, []);

  const handleToggle = useCallback((id: string) => {
    setStatuses(prev => {
      const next = { ...prev, [id]: nextStatus(prev[id] || 'none') };
      saveFlowchartStatus(next).catch(() => toast.error('Failed to save status'));
      return next;
    });
  }, []);

  const handleAddTopLevel = useCallback((sectionId: string, label: string) => {
    const id = `pkg-${sectionId}-${Date.now()}`;
    setPackages(prev => {
      const next = { ...prev, [sectionId]: [...(prev[sectionId] || []), { id, label }] };
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));
      return next;
    });
  }, []);

  const handleAddChild = useCallback((parentId: string, label: string) => {
    const id = `pkg-${parentId}-${Date.now()}`;
    setPackages(prev => {
      const next = Object.fromEntries(
        Object.entries(prev).map(([sId, items]) => [sId, addChild(items, parentId, { id, label })])
      );
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));
      return next;
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    // Collect the removed item's ID + all descendant IDs to clean up statuses
    setPackages(prev => {
      const allFlat = Object.values(prev).flatMap(items => getAllItems(items));
      const removed = allFlat.find(i => i.id === id);
      const idsToClean = removed ? getAllIds([removed]) : [id];

      const next = Object.fromEntries(
        Object.entries(prev).map(([sId, items]) => [sId, removeItem(items, id)])
      );
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));

      // Clean statuses after updating packages
      setStatuses(prevS => {
        const nextS = { ...prevS };
        for (const rid of idsToClean) delete nextS[rid];
        saveFlowchartStatus(nextS).catch(() => {});
        return nextS;
      });

      return next;
    });
  }, []);

  const handleClose = () => { setExpanded(false); setEditMode(false); };

  return (
    <>
      {/* Sidebar thumbnail */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Build Progress
        </h3>
        <button
          onClick={() => setExpanded(true)}
          className="w-full p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors cursor-pointer text-left"
        >
          <FlowchartThumbnail sections={sections} packages={packages} statuses={statuses} />
        </button>
      </div>

      {/* Expanded overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-start justify-center p-4 pt-8 overflow-y-auto"
          onClick={handleClose}
        >
          <div
            className="bg-card border border-border rounded-xl p-6 max-w-5xl w-full"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-foreground">{projectName || 'Build Progress'}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editMode
                    ? <span className="text-amber-400">Edit mode — hover a chip to add children or remove it</span>
                    : 'Click a chip to cycle status: not started → in progress → done'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAuthenticated && (
                  <button
                    onClick={() => setEditMode(m => !m)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                      editMode
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {editMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                    {editMode ? 'Done' : 'Edit packages'}
                  </button>
                )}
                <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <FlowchartContent
              sections={sections}
              packages={packages}
              statuses={statuses}
              onToggle={handleToggle}
              onAddTopLevel={handleAddTopLevel}
              onAddChild={handleAddChild}
              onRemove={handleRemove}
              isAuthenticated={isAuthenticated}
              editMode={editMode}
            />
          </div>
        </div>
      )}
    </>
  );
}
