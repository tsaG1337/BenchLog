import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/contexts/SectionsContext';
import { fetchFlowchartPackages, fetchFlowchartStatus as apiFetchFlowchartStatus, updateFlowchartStatus as apiSaveFlowchartStatus, updateFlowchartPackages as apiSaveFlowchartPackages, updateSections as apiSaveSections, fetchSectionUsage, reassignSection } from '@/lib/api';
import { SectionConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { X, Pencil, Check, Plus, ChevronDown, ChevronRight, BookOpen, Trash2, Clock, Undo2 } from 'lucide-react';
import { EmojiPicker } from '@/components/EmojiPicker';
import { toast } from 'sonner';

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
type DropPos = 'before' | 'after' | 'into';

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
  onRename: (id: string, newLabel: string) => void;
  onPlansSectionFilter?: (plansSection: string) => void;
  // Drag and drop
  dragId: string | null;
  dropTarget: { id: string; pos: DropPos } | null;
  sectionDropTarget: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverChip: (e: React.DragEvent, id: string) => void;
  onDropOnChip: (e: React.DragEvent, id: string) => void;
  onDragOverSection: (e: React.DragEvent, sectionId: string) => void;
  onDropOnSection: (e: React.DragEvent, sectionId: string) => void;
  // Section editing
  onSectionUpdate: (id: string, field: keyof SectionConfig, value: string | boolean) => void;
  onSectionDelete: (id: string) => void;
  onSectionMove: (id: string, direction: -1 | 1) => void;
  sectionCount: number;
  sectionIndex: (id: string) => number;
}

/** Extract the leading integer from a label like "10 Tailcone" → "10", or null if none */
function extractSectionNumber(label: string): string | null {
  const m = /^(\d+)/.exec(label.trim());
  return m ? m[1] : null;
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

/** Rename the node with the given id */
function renameItem(items: FlowItem[], id: string, newLabel: string): FlowItem[] {
  return items.map(item => {
    if (item.id === id) return { ...item, label: newLabel };
    if (item.children?.length) return { ...item, children: renameItem(item.children, id, newLabel) };
    return item;
  });
}

/** Extract an item by id, returning [extracted | null, treeWithoutIt] */
function extractItem(items: FlowItem[], id: string): [FlowItem | null, FlowItem[]] {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) {
      return [items[i], [...items.slice(0, i), ...items.slice(i + 1)]];
    }
    if (items[i].children?.length) {
      const [found, newChildren] = extractItem(items[i].children!, id);
      if (found) {
        return [found, items.map((item, idx) => idx === i ? { ...item, children: newChildren } : item)];
      }
    }
  }
  return [null, items];
}

/** Insert newItem before/after/into targetId anywhere in the tree */
function insertRelative(items: FlowItem[], targetId: string, newItem: FlowItem, pos: DropPos): FlowItem[] {
  if (pos === 'into') {
    return items.map(item => {
      if (item.id === targetId) return { ...item, children: [...(item.children || []), newItem] };
      if (item.children?.length) return { ...item, children: insertRelative(item.children, targetId, newItem, pos) };
      return item;
    });
  }
  const result: FlowItem[] = [];
  for (const item of items) {
    if (item.id === targetId) {
      if (pos === 'before') result.push(newItem);
      result.push(item);
      if (pos === 'after') result.push(newItem);
    } else if (item.children?.length) {
      result.push({ ...item, children: insertRelative(item.children, targetId, newItem, pos) });
    } else {
      result.push(item);
    }
  }
  return result;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchFlowchartStatus(): Promise<StatusMap> {
  try { return await apiFetchFlowchartStatus() as StatusMap; } catch { return {}; }
}

async function saveFlowchartStatus(statuses: StatusMap): Promise<void> {
  await apiSaveFlowchartStatus(statuses as Record<string, string>);
}

async function saveFlowchartPackages(packages: PackagesMap): Promise<void> {
  await apiSaveFlowchartPackages(packages);
}

// ─── Circular progress indicator ─────────────────────────────────────────────

function CircularProgress({ pct, hasItems }: { pct: number; hasItems: boolean }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const color = !hasItems
    ? track
    : pct === 100 ? (isDark ? '#6ee7b7' : '#059669')
    : pct > 0   ? (isDark ? '#fcd34d' : '#d97706')
    : track;

  return (
    <div className="relative flex items-center justify-center w-10 h-10 shrink-0">
      <svg width="40" height="40" className="-rotate-90 absolute inset-0">
        <circle cx="20" cy="20" r={r} fill="none" stroke={track} strokeWidth="3" />
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

  const noLeadingNumber = addLabel.trim() && !extractSectionNumber(addLabel);

  return (
    <div className="flex flex-col gap-1">
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
          placeholder="e.g. 10 Tailcone"
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
      {noLeadingNumber && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400/80">
          Tip: start with a section number (e.g. "10 Tailcone") to enable blog filtering
        </p>
      )}
    </div>
  );
}

// ─── Single work package chip ─────────────────────────────────────────────────

function Chip({ item }: { item: FlowItem }) {
  const {
    statuses, editMode, isAuthenticated,
    onToggle, onRemove, onRename, onPlansSectionFilter,
    setAddTarget, setAddLabel,
    dragId, dropTarget,
    onDragStart, onDragEnd, onDragOverChip, onDropOnChip,
  } = useTreeCtx();
  const sectionNum = extractSectionNumber(item.label);
  const status = statuses[item.id] || 'none';
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasChildren = (item.children?.length ?? 0) > 0;

  const isDragging = dragId === item.id;
  const isDropBefore = dropTarget?.id === item.id && dropTarget.pos === 'before';
  const isDropAfter  = dropTarget?.id === item.id && dropTarget.pos === 'after';
  const isDropInto   = dropTarget?.id === item.id && dropTarget.pos === 'into';

  const startRename = () => {
    setRenameValue(item.label);
    setRenaming(true);
    setTimeout(() => renameRef.current?.select(), 0);
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== item.label) onRename(item.id, trimmed);
    setRenaming(false);
  };

  if (renaming) {
    const noNum = renameValue.trim() && !extractSectionNumber(renameValue);
    return (
      <div className="relative flex flex-col gap-0.5">
        <input
          ref={renameRef}
          autoFocus
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setRenaming(false);
          }}
          onBlur={commitRename}
          className="h-7 px-2.5 rounded-md text-xs font-medium border border-primary bg-background text-foreground focus:outline-none min-w-[80px]"
          style={{ width: `${Math.max(renameValue.length * 7 + 24, 80)}px` }}
        />
        {noNum && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400/80 whitespace-nowrap">
            Start with a number for blog filtering
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative group',
        isDragging && 'opacity-40',
      )}
      draggable={editMode && isAuthenticated}
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; onDragStart(item.id); }}
      onDragEnd={onDragEnd}
      onDragOver={e => onDragOverChip(e, item.id)}
      onDrop={e => onDropOnChip(e, item.id)}
    >
      {/* Before drop indicator */}
      {isDropBefore && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-full -translate-x-1.5 z-10" />
      )}
      {/* After drop indicator */}
      {isDropAfter && (
        <span className="absolute right-0 top-0 bottom-0 w-0.5 bg-primary rounded-full translate-x-1.5 z-10" />
      )}

      <button
        onClick={() => !editMode && isAuthenticated && onToggle(item.id)}
        title={!editMode && isAuthenticated ? 'Click to cycle: not started → in progress → done' : item.label}
        className={cn(
          'px-2.5 py-1 rounded-md text-xs font-medium border transition-all select-none leading-none',
          editMode && isAuthenticated ? 'cursor-grab active:cursor-grabbing' : (!editMode && isAuthenticated ? 'cursor-pointer hover:opacity-85' : 'cursor-default'),
          status === 'done'
            ? 'bg-emerald-600 border-emerald-500 text-white dark:bg-emerald-500/80 dark:border-emerald-400/60'
            : status === 'in-progress'
            ? 'bg-amber-500 border-amber-400 text-white dark:bg-amber-400/80 dark:border-amber-300/60'
            : 'bg-muted border-border text-muted-foreground',
          isDropInto && 'ring-2 ring-primary ring-offset-1',
        )}
      >
        {item.label}
      </button>

      {/* Non-edit mode: blog filter link shown on hover for numbered packages */}
      {!editMode && sectionNum && onPlansSectionFilter && (
        <button
          onClick={e => { e.stopPropagation(); onPlansSectionFilter(sectionNum); }}
          title={`Show blog posts for Section ${sectionNum}`}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:border-primary hover:text-primary text-muted-foreground"
        >
          <BookOpen className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Edit mode: action buttons shown on hover */}
      {editMode && isAuthenticated && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1 hidden group-hover:flex gap-px bg-card border border-border rounded px-0.5 py-0.5 shadow-md z-20">
          {confirmDelete ? (
            <>
              <span className="text-[10px] text-destructive px-1 self-center whitespace-nowrap">Delete{hasChildren ? ' + children' : ''}?</span>
              <button
                onClick={() => { onRemove(item.id); setConfirmDelete(false); }}
                title="Confirm delete"
                className="h-5 px-1.5 flex items-center justify-center text-[10px] font-medium text-destructive hover:bg-destructive/10 rounded transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                title="Cancel"
                className="h-5 px-1.5 flex items-center justify-center text-[10px] font-medium text-muted-foreground hover:bg-secondary rounded transition-colors"
              >
                No
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startRename}
                title="Rename package"
                className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => { setAddTarget({ kind: 'package', id: item.id }); setAddLabel(''); }}
                title="Add child package"
                className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={() => hasChildren ? setConfirmDelete(true) : onRemove(item.id)}
                title="Remove package"
                className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
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
        <div className="flex flex-wrap gap-1.5 pl-3 pt-1 ml-2 border-l-2 border-border/40">
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
  section: SectionConfig;
  items: FlowItem[];
}) {
  const { statuses, editMode, isAuthenticated, addTarget, setAddTarget, setAddLabel, sectionDropTarget, onDragOverSection, onDropOnSection, onSectionUpdate, onSectionDelete, onSectionMove, sectionCount, sectionIndex } = useTreeCtx();
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

  const isSectionDrop = sectionDropTarget === section.id;
  const idx = sectionIndex(section.id);
  const countsTowardHours = section.countTowardsBuildHours ?? true;

  return (
    <div className="rounded-lg bg-muted/40 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 bg-muted cursor-pointer select-none"
        onClick={() => !editMode && setCollapsed(c => !c)}
      >
        {editMode && isAuthenticated ? (
          <>
            {/* Reorder buttons */}
            <div className="flex flex-col gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => onSectionMove(section.id, -1)} disabled={idx === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs leading-none">▲</button>
              <button onClick={() => onSectionMove(section.id, 1)} disabled={idx === sectionCount - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs leading-none">▼</button>
            </div>
            {/* Editable icon with emoji picker */}
            <div onClick={e => e.stopPropagation()}>
              <EmojiPicker
                value={section.icon}
                onChange={emoji => onSectionUpdate(section.id, 'icon', emoji)}
              />
            </div>
            {/* Editable label */}
            <input
              value={section.label}
              onChange={e => onSectionUpdate(section.id, 'label', e.target.value)}
              onClick={e => e.stopPropagation()}
              placeholder="Section name"
              className="flex-1 min-w-0 text-sm font-semibold bg-background/50 border border-border rounded px-2 py-1"
            />
            {/* Count toward build hours toggle */}
            <button
              onClick={e => { e.stopPropagation(); onSectionUpdate(section.id, 'countTowardsBuildHours', !countsTowardHours); }}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors shrink-0',
                countsTowardHours
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-muted text-muted-foreground/40'
              )}
              title={countsTowardHours ? 'Counts toward build hours — click to exclude' : 'Excluded from build hours — click to include'}
            >
              <Clock className="w-3 h-3" />
            </button>
            {/* Add package button */}
            <button
              onClick={e => {
                e.stopPropagation();
                setAddTarget({ kind: 'section', id: section.id });
                setAddLabel('');
                setCollapsed(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors shrink-0"
            >
              <Plus className="w-3 h-3" />
            </button>
            {/* Delete section button */}
            <button
              onClick={e => { e.stopPropagation(); onSectionDelete(section.id); }}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
              title="Delete section"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground/50 shrink-0">
              {collapsed
                ? <ChevronRight className="w-4 h-4" />
                : <ChevronDown className="w-4 h-4" />}
            </span>
            <span className="text-base shrink-0">{section.icon}</span>
            <p className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">
              {section.label}
              {!countsTowardHours && (
                <span className="ml-2 text-[10px] text-muted-foreground/40 font-normal" title="Excluded from build hours">
                  <Clock className="w-3 h-3 inline -mt-0.5" /> excluded
                </span>
              )}
            </p>
            {allInSection.length > 0 && (
              <p className="text-[10px] text-muted-foreground/60 shrink-0 hidden sm:block">
                {doneCount}/{allInSection.length} done
              </p>
            )}
            <CircularProgress pct={pct} hasItems={allInSection.length > 0} />
          </>
        )}
      </div>

      {/* Content: one row of chips per depth level */}
      {!collapsed && (
        <div
          className={cn(
            'px-4 py-3 space-y-2 transition-colors',
            isSectionDrop && 'bg-primary/5 outline outline-2 outline-primary/30 outline-offset-[-2px] rounded-b-lg',
          )}
          onDragOver={e => { if (editMode) { e.preventDefault(); onDragOverSection(e, section.id); } }}
          onDrop={e => { if (editMode) onDropOnSection(e, section.id); }}
        >
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
  onToggle, onAddTopLevel, onAddChild, onRemove, onRename, onMove, onMoveToSection,
  onSectionUpdate, onSectionDelete, onSectionMove, onSectionAdd,
  isAuthenticated, editMode, onPlansSectionFilter,
}: {
  sections: SectionConfig[];
  packages: PackagesMap;
  statuses: StatusMap;
  onToggle: (id: string) => void;
  onAddTopLevel: (sectionId: string, label: string) => void;
  onAddChild: (parentId: string, label: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, newLabel: string) => void;
  onMove: (draggedId: string, targetId: string, pos: DropPos) => void;
  onMoveToSection: (draggedId: string, sectionId: string) => void;
  onSectionUpdate: (id: string, field: keyof SectionConfig, value: string | boolean) => void;
  onSectionDelete: (id: string) => void;
  onSectionMove: (id: string, direction: -1 | 1) => void;
  onSectionAdd: () => void;
  isAuthenticated: boolean;
  editMode: boolean;
  onPlansSectionFilter?: (plansSection: string) => void;
}) {
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [addLabel, setAddLabel] = useState('');

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPos } | null>(null);
  const [sectionDropTarget, setSectionDropTarget] = useState<string | null>(null);

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

  const handleDragStart = useCallback((id: string) => {
    setDragId(id);
    setDropTarget(null);
    setSectionDropTarget(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
    setSectionDropTarget(null);
  }, []);

  const handleDragOverChip = useCallback((e: React.DragEvent, id: string) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const pos: DropPos = pct < 0.3 ? 'before' : pct > 0.7 ? 'after' : 'into';
    setDropTarget(prev => prev?.id === id && prev.pos === pos ? prev : { id, pos });
    setSectionDropTarget(null);
  }, [dragId]);

  const handleDropOnChip = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || !dropTarget || dragId === id) return;
    onMove(dragId, id, dropTarget.pos);
    setDragId(null);
    setDropTarget(null);
  }, [dragId, dropTarget, onMove]);

  const handleDragOverSection = useCallback((e: React.DragEvent, sectionId: string) => {
    if (!dragId) return;
    setSectionDropTarget(sectionId);
    setDropTarget(null);
  }, [dragId]);

  const handleDropOnSection = useCallback((e: React.DragEvent, sectionId: string) => {
    if (!dragId) return;
    onMoveToSection(dragId, sectionId);
    setDragId(null);
    setSectionDropTarget(null);
  }, [dragId, onMoveToSection]);

  const allItems = sections.flatMap(s => getAllItems(packages[s.id] || []));
  const totalDone = allItems.filter(i => statuses[i.id] === 'done').length;
  const totalWip  = allItems.filter(i => statuses[i.id] === 'in-progress').length;
  const totalNone = allItems.length - totalDone - totalWip;

  return (
    <TreeCtx.Provider value={{
      statuses, editMode, isAuthenticated,
      addTarget, addLabel, setAddTarget, setAddLabel, onSubmitAdd,
      onToggle, onRemove, onRename, onPlansSectionFilter,
      dragId, dropTarget, sectionDropTarget,
      onDragStart: handleDragStart, onDragEnd: handleDragEnd,
      onDragOverChip: handleDragOverChip, onDropOnChip: handleDropOnChip,
      onDragOverSection: handleDragOverSection, onDropOnSection: handleDropOnSection,
      onSectionUpdate, onSectionDelete, onSectionMove,
      sectionCount: sections.length,
      sectionIndex: (id: string) => sections.findIndex(s => s.id === id),
    }}>
      <div className="space-y-2">
        {sections.map(section => (
          <SectionRow key={section.id} section={section} items={packages[section.id] || []} />
        ))}

        {/* Add Section button (edit mode only) */}
        {editMode && isAuthenticated && (
          <button
            onClick={onSectionAdd}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Assembly Section
          </button>
        )}

        {/* Legend */}
        <div className="flex items-center gap-5 pt-2 border-t border-border text-[11px] text-muted-foreground flex-wrap">
          <span className="font-semibold text-foreground/60 uppercase tracking-wider text-[10px]">Legend</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-600 dark:bg-emerald-500/80 border border-emerald-500 dark:border-emerald-400/60 inline-block" />
            Completed — {totalDone}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500 dark:bg-amber-400/80 border border-amber-400 dark:border-amber-300/60 inline-block" />
            In Progress — {totalWip}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-muted border border-border inline-block" />
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
  sections: SectionConfig[];
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
                        s === 'done'          ? 'bg-emerald-600 dark:bg-emerald-400/70'
                        : s === 'in-progress' ? 'bg-amber-500 dark:bg-amber-400/70'
                        : 'bg-muted'
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

export function BuildFlowchart({ projectName, onPlansSectionFilter }: { projectName?: string; onPlansSectionFilter?: (plansSection: string) => void }) {
  const { isAuthenticated } = useAuth();
  const { sections: contextSections, reload: reloadSections } = useSections();
  const [localSections, setLocalSections] = useState<SectionConfig[] | null>(null);
  const sections = localSections ?? contextSections;
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [packages, setPackages] = useState<PackagesMap>({});
  const [expanded, setExpanded]   = useState(false);
  const [editMode, setEditMode]   = useState(false);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    section: SectionConfig;
    sessions: number;
    blogPosts: number;
    expenses: number;
  } | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  // Sync local sections when context changes (and we're not in edit mode)
  useEffect(() => {
    if (!editMode) setLocalSections(null);
  }, [contextSections, editMode]);

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
    const id = `pkg-${sectionId}-${crypto.randomUUID()}`;
    setPackages(prev => {
      const next = { ...prev, [sectionId]: [...(prev[sectionId] || []), { id, label }] };
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));
      return next;
    });
  }, []);

  const handleAddChild = useCallback((parentId: string, label: string) => {
    const id = `pkg-${parentId}-${crypto.randomUUID()}`;
    setPackages(prev => {
      const next = Object.fromEntries(
        Object.entries(prev).map(([sId, items]) => [sId, addChild(items, parentId, { id, label })])
      );
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));
      return next;
    });
  }, []);

  const handleRename = useCallback((id: string, newLabel: string) => {
    setPackages(prev => {
      const next = Object.fromEntries(
        Object.entries(prev).map(([sId, items]) => [sId, renameItem(items, id, newLabel)])
      );
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));
      return next;
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    setPackages(prev => {
      const allFlat = Object.values(prev).flatMap(items => getAllItems(items));
      const removed = allFlat.find(i => i.id === id);
      const idsToClean = removed ? getAllIds([removed]) : [id];

      const next = Object.fromEntries(
        Object.entries(prev).map(([sId, items]) => [sId, removeItem(items, id)])
      );
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));

      setStatuses(prevS => {
        const nextS = { ...prevS };
        for (const rid of idsToClean) delete nextS[rid];
        saveFlowchartStatus(nextS).catch(() => {});
        return nextS;
      });

      return next;
    });
  }, []);

  const handleMove = useCallback((draggedId: string, targetId: string, pos: DropPos) => {
    setPackages(prev => {
      let dragged: FlowItem | null = null;
      const extracted: PackagesMap = Object.fromEntries(
        Object.entries(prev).map(([sId, items]) => {
          const [found, newItems] = extractItem(items, draggedId);
          if (found) dragged = found;
          return [sId, newItems];
        })
      );
      if (!dragged) return prev;
      const next: PackagesMap = Object.fromEntries(
        Object.entries(extracted).map(([sId, items]) => [sId, insertRelative(items, targetId, dragged!, pos)])
      );
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));
      return next;
    });
  }, []);

  const handleMoveToSection = useCallback((draggedId: string, sectionId: string) => {
    setPackages(prev => {
      let dragged: FlowItem | null = null;
      const extracted: PackagesMap = Object.fromEntries(
        Object.entries(prev).map(([sId, items]) => {
          const [found, newItems] = extractItem(items, draggedId);
          if (found) dragged = found;
          return [sId, newItems];
        })
      );
      if (!dragged) return prev;
      const next: PackagesMap = Object.fromEntries(
        Object.entries(extracted).map(([sId, items]) =>
          sId === sectionId ? [sId, [...items, dragged!]] : [sId, items]
        )
      );
      saveFlowchartPackages(next).catch(() => toast.error('Failed to save packages'));
      return next;
    });
  }, []);

  // ─── Section editing handlers ─────────────────────────────────────
  const saveSections = useCallback(async (updated: SectionConfig[]) => {
    setLocalSections(updated);
    try {
      await apiSaveSections(updated);
      await reloadSections();
    } catch {
      toast.error('Failed to save sections');
    }
  }, [reloadSections]);

  const handleSectionUpdate = useCallback((id: string, field: keyof SectionConfig, value: string | boolean) => {
    const updated = sections.map(s => {
      if (s.id !== id) return s;
      const next = { ...s, [field]: value };
      // Auto-generate id from label for new sections
      if (field === 'label' && s.id.startsWith('section-')) {
        next.id = (value as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || s.id;
      }
      return next;
    });
    saveSections(updated);
  }, [sections, saveSections]);

  const handleSectionDelete = useCallback(async (id: string) => {
    const sec = sections.find(s => s.id === id);
    if (!sec) return;
    // New unsaved sections — delete immediately
    if (sec.id.startsWith('section-')) {
      saveSections(sections.filter(s => s.id !== id));
      return;
    }
    try {
      const usage = await fetchSectionUsage(sec.id);
      if (usage.sessions === 0 && usage.blogPosts === 0 && (usage.expenses ?? 0) === 0) {
        saveSections(sections.filter(s => s.id !== id));
      } else {
        const others = sections.filter(s => s.id !== id);
        setReassignTo(others[0]?.id || '');
        setDeleteConfirm({ section: sec, sessions: usage.sessions, blogPosts: usage.blogPosts, expenses: usage.expenses ?? 0 });
      }
    } catch {
      saveSections(sections.filter(s => s.id !== id));
    }
  }, [sections, saveSections]);

  const handleSectionMove = useCallback((id: string, direction: -1 | 1) => {
    const idx = sections.findIndex(s => s.id === id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const updated = [...sections];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    saveSections(updated);
  }, [sections, saveSections]);

  const handleSectionAdd = useCallback(() => {
    const updated = [...sections, { id: `section-${Date.now()}`, label: '', icon: '📋' }];
    setLocalSections(updated);
    // Don't save to server yet — wait for user to fill in the label
  }, [sections]);

  const handleClose = () => { setExpanded(false); setEditMode(false); setDeleteConfirm(null); };

  const handlePlansSectionFilter = onPlansSectionFilter
    ? (plansSection: string) => { handleClose(); onPlansSectionFilter(plansSection); }
    : undefined;

  return (
    <>
      {/* Sidebar thumbnail */}
      <div>
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
            className="bg-card rounded-lg p-6 max-w-5xl w-full"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-foreground">{projectName || 'Build Progress'}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editMode
                    ? <span className="text-amber-600 dark:text-amber-400">Edit mode — drag to reorder · hover a chip for actions</span>
                    : 'Click a chip to cycle status: not started → in progress → done'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAuthenticated && editMode && (
                  <button
                    onClick={() => { setEditMode(false); setLocalSections(null); reloadSections(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                )}
                {isAuthenticated && (
                  <button
                    onClick={() => setEditMode(m => !m)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                      editMode
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
                        : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {editMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                    {editMode ? 'Done' : 'Edit'}
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
              onRename={handleRename}
              onMove={handleMove}
              onMoveToSection={handleMoveToSection}
              onSectionUpdate={handleSectionUpdate}
              onSectionDelete={handleSectionDelete}
              onSectionMove={handleSectionMove}
              onSectionAdd={handleSectionAdd}
              isAuthenticated={isAuthenticated}
              editMode={editMode}
              onPlansSectionFilter={handlePlansSectionFilter}
            />
          </div>

          {/* Delete section confirmation dialog */}
          {deleteConfirm && (
            <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
              <div className="bg-card rounded-lg p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-destructive" />
                  Delete section "{deleteConfirm.section.label || deleteConfirm.section.id}"?
                </h3>
                <p className="text-xs text-muted-foreground">
                  This section has{' '}
                  {[
                    deleteConfirm.sessions > 0 && `${deleteConfirm.sessions} session${deleteConfirm.sessions !== 1 ? 's' : ''}`,
                    deleteConfirm.blogPosts > 0 && `${deleteConfirm.blogPosts} blog post${deleteConfirm.blogPosts !== 1 ? 's' : ''}`,
                    deleteConfirm.expenses > 0 && `${deleteConfirm.expenses} expense${deleteConfirm.expenses !== 1 ? 's' : ''}`,
                  ].filter(Boolean).join(', ')}.
                  {' '}Reassign existing entries to another section, or delete and leave them as-is.
                </p>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Reassign entries to</label>
                  <select
                    value={reassignTo}
                    onChange={e => setReassignTo(e.target.value)}
                    className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
                  >
                    <option value="">Select a section...</option>
                    {sections
                      .filter(s => s.id !== deleteConfirm.section.id)
                      .map(s => <option key={s.id} value={s.id}>{s.icon} {s.label || s.id}</option>)
                    }
                  </select>
                </div>

                <div className="flex gap-2 justify-end flex-wrap">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-3 py-1.5 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      saveSections(sections.filter(s => s.id !== deleteConfirm.section.id));
                      setDeleteConfirm(null);
                    }}
                    className="px-3 py-1.5 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Leave items &amp; delete
                  </button>
                  <button
                    disabled={!reassignTo}
                    onClick={async () => {
                      if (!reassignTo) return;
                      try {
                        const result = await reassignSection(deleteConfirm.section.id, reassignTo);
                        await saveSections(sections.filter(s => s.id !== deleteConfirm.section.id));
                        const parts = [
                          result.sessionsUpdated > 0 && `${result.sessionsUpdated} sessions`,
                          result.blogPostsUpdated > 0 && `${result.blogPostsUpdated} blog posts`,
                          (result.expensesUpdated ?? 0) > 0 && `${result.expensesUpdated} expenses`,
                        ].filter(Boolean).join(', ');
                        toast.success(`Reassigned ${parts || 'entries'}`);
                      } catch {
                        toast.error('Failed to reassign entries');
                      }
                      setDeleteConfirm(null);
                    }}
                    className="px-3 py-1.5 rounded-md text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                  >
                    Reassign &amp; Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
