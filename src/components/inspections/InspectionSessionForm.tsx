import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  createInspectionSession,
  updateInspectionSession,
  fetchFlowchartPackages,
  fetchGeneralSettings,
  updateGeneralSettings,
  InspectionSession,
  FlowItem,
  PackagesMap,
} from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { SignaturePad, SignaturePadRef } from '@/components/SignaturePad';

type Outcome = 'ok' | 'partial' | 'rework' | 'na';

const OUTCOME_CONFIG: Record<Outcome, { label: string; active: string; inactive: string }> = {
  ok:      { label: '✓ OK',      active: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40', inactive: 'border-border text-muted-foreground' },
  partial: { label: '~ Partial', active: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40',   inactive: 'border-border text-muted-foreground' },
  rework:  { label: '✗ Rework',  active: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40',           inactive: 'border-border text-muted-foreground' },
  na:      { label: '— N/A',     active: 'bg-muted text-muted-foreground border-border',                             inactive: 'border-border text-muted-foreground' },
};

function OutcomeToggle({ value, onChange }: { value: Outcome; onChange: (v: Outcome) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {(Object.keys(OUTCOME_CONFIG) as Outcome[]).map(o => {
        const cfg = OUTCOME_CONFIG[o];
        const isActive = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`px-2 py-0.5 rounded border text-xs font-medium transition-all ${
              isActive ? cfg.active : `${cfg.inactive} opacity-40 hover:opacity-70`
            }`}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}

function flattenItems(items: FlowItem[], depth = 0): { item: FlowItem; depth: number }[] {
  const result: { item: FlowItem; depth: number }[] = [];
  for (const it of items) {
    result.push({ item: it, depth });
    if (it.children?.length) result.push(...flattenItems(it.children, depth + 1));
  }
  return result;
}

interface LocalSubItem {
  tempId: string;
  label: string;
  outcome: Outcome;
  notes: string;
}

interface LocalPackage {
  tempId: string;
  packageId: string;
  packageLabel: string;
  sectionId: string;
  outcome: Outcome;
  notes: string;
  subItems: LocalSubItem[];
  expanded: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editSession?: InspectionSession;
}

export function InspectionSessionForm({ open, onOpenChange, onSaved, editSession }: Props) {
  const { sections } = useSections();
  const [pkgMap, setPkgMap] = useState<PackagesMap>({});
  const [sessionName, setSessionName] = useState('');
  const [date, setDate] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [localPackages, setLocalPackages] = useState<LocalPackage[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedPkgId, setSelectedPkgId] = useState('');
  const sigRef = useRef<SignaturePadRef>(null);
  const generalSettingsRef = useRef<Awaited<ReturnType<typeof fetchGeneralSettings>> | null>(null);

  // Build flat package option list from flowchart
  const packageOptions: { packageId: string; packageLabel: string; sectionId: string; sectionLabel: string; depth: number }[] = [];
  for (const section of sections) {
    const items = pkgMap[section.id] || [];
    for (const { item, depth } of flattenItems(items)) {
      packageOptions.push({ packageId: item.id, packageLabel: item.label, sectionId: section.id, sectionLabel: section.label, depth });
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchFlowchartPackages().then(setPkgMap).catch(() => {});
    fetchGeneralSettings().then(s => {
      generalSettingsRef.current = s;
      if (!editSession) setInspectorName(s.inspectorName || '');
    }).catch(() => {});

    if (editSession) {
      setSessionName(editSession.sessionName);
      setDate(editSession.date);
      setInspectorName(editSession.inspectorName);
      setInspectorId(editSession.inspectorId);
      setSessionNotes(editSession.notes.startsWith('migrated:') ? '' : editSession.notes);
      setLocalPackages(editSession.packages.map(p => ({
        tempId: p.id || crypto.randomUUID(),
        packageId: p.packageId,
        packageLabel: p.packageLabel,
        sectionId: p.sectionId,
        outcome: p.outcome as Outcome,
        notes: p.notes,
        subItems: p.subItems.map(si => ({
          tempId: si.id || crypto.randomUUID(),
          label: si.label,
          outcome: si.outcome as Outcome,
          notes: si.notes,
        })),
        expanded: false,
      })));
    } else {
      setSessionName('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setInspectorId('');
      setSessionNotes('');
      setLocalPackages([]);
      setTimeout(() => sigRef.current?.clear(), 50);
    }
    setSelectedPkgId('');
  }, [open, editSession]);

  const addPackage = () => {
    const opt = packageOptions.find(o => o.packageId === selectedPkgId);
    if (!opt) return;
    if (localPackages.some(p => p.packageId === opt.packageId)) {
      toast.error('Package already added');
      return;
    }
    setLocalPackages(prev => [...prev, {
      tempId: crypto.randomUUID(),
      packageId: opt.packageId,
      packageLabel: opt.packageLabel,
      sectionId: opt.sectionId,
      outcome: 'ok',
      notes: '',
      subItems: [],
      expanded: false,
    }]);
    setSelectedPkgId('');
  };

  const removePackage = (tempId: string) => {
    setLocalPackages(prev => prev.filter(p => p.tempId !== tempId));
  };

  const updatePackage = (tempId: string, changes: Partial<LocalPackage>) => {
    setLocalPackages(prev => prev.map(p => p.tempId === tempId ? { ...p, ...changes } : p));
  };

  const addSubItem = (pkgTempId: string) => {
    setLocalPackages(prev => prev.map(p => {
      if (p.tempId !== pkgTempId) return p;
      return {
        ...p,
        expanded: true,
        subItems: [...p.subItems, { tempId: crypto.randomUUID(), label: '', outcome: 'ok', notes: '' }],
      };
    }));
  };

  const updateSubItem = (pkgTempId: string, siTempId: string, changes: Partial<LocalSubItem>) => {
    setLocalPackages(prev => prev.map(p => {
      if (p.tempId !== pkgTempId) return p;
      return { ...p, subItems: p.subItems.map(si => si.tempId === siTempId ? { ...si, ...changes } : si) };
    }));
  };

  const removeSubItem = (pkgTempId: string, siTempId: string) => {
    setLocalPackages(prev => prev.map(p => {
      if (p.tempId !== pkgTempId) return p;
      return { ...p, subItems: p.subItems.filter(si => si.tempId !== siTempId) };
    }));
  };

  const handleSave = async () => {
    if (!sessionName.trim()) { toast.error('Session name is required'); return; }
    if (!date) { toast.error('Date is required'); return; }
    if (!inspectorName.trim()) { toast.error('Inspector name is required'); return; }
    if (localPackages.length === 0) { toast.error('Add at least one work package'); return; }
    const isNew = !editSession;
    if (isNew && sigRef.current?.isEmpty()) { toast.error('Please provide a signature'); return; }

    setSaving(true);
    try {
      if (generalSettingsRef.current) {
        updateGeneralSettings({ ...generalSettingsRef.current, inspectorName: inspectorName.trim() }).catch(() => {});
      }
      const signaturePng = isNew
        ? sigRef.current!.toDataURL()
        : (editSession!.signaturePng || '');

      const payload = {
        sessionName: sessionName.trim(),
        date,
        inspectorName: inspectorName.trim(),
        inspectorId: inspectorId.trim(),
        notes: sessionNotes,
        signaturePng,
        packages: localPackages.map((p, i) => ({
          packageId: p.packageId,
          packageLabel: p.packageLabel,
          sectionId: p.sectionId,
          outcome: p.outcome,
          notes: p.notes,
          sortOrder: i,
          subItems: p.subItems.map((si, j) => ({
            label: si.label,
            outcome: si.outcome,
            notes: si.notes,
            sortOrder: j,
          })),
        })),
      };

      if (editSession) {
        await updateInspectionSession(editSession.id, payload);
        toast.success('Inspection session updated');
      } else {
        await createInspectionSession(payload);
        toast.success('Inspection session saved');
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{editSession ? 'Edit Inspection Session' : 'New Inspection Session'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Session name + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Session Name *</Label>
              <Input
                value={sessionName}
                onChange={e => setSessionName(e.target.value)}
                placeholder="e.g. EAA TC Visit Apr 2026"
                className="bg-accent border-border"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date *</Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-accent border-border"
              />
            </div>
          </div>

          {/* Inspector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Inspector Name *</Label>
              <Input
                value={inspectorName}
                onChange={e => setInspectorName(e.target.value)}
                placeholder="Full name"
                className="bg-accent border-border"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">EAA # / DAR Cert #</Label>
              <Input
                value={inspectorId}
                onChange={e => setInspectorId(e.target.value)}
                placeholder="EAA #12345"
                className="bg-accent border-border"
              />
            </div>
          </div>

          <Separator />

          {/* Work packages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Work Packages *
              </Label>
              <span className="text-xs text-muted-foreground">{localPackages.length} added</span>
            </div>

            {/* Add package picker */}
            <div className="flex gap-2 mb-3">
              <select
                value={selectedPkgId}
                onChange={e => setSelectedPkgId(e.target.value)}
                className="flex-1 h-9 rounded-md border border-border bg-accent text-foreground px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select a package to add —</option>
                {sections.map(sec => {
                  const opts = packageOptions.filter(o => o.sectionId === sec.id);
                  if (!opts.length) return null;
                  return (
                    <optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>
                      {opts.map(o => (
                        <option key={o.packageId} value={o.packageId}>
                          {'  '.repeat(o.depth)}{o.packageLabel}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPackage}
                disabled={!selectedPkgId}
                className="shrink-0"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Package rows */}
            <div className="space-y-2">
              {localPackages.length === 0 && (
                <p className="text-xs text-muted-foreground/60 text-center py-4 border border-dashed border-border rounded-lg">
                  No packages added yet. Select a package above and click +.
                </p>
              )}
              {localPackages.map(pkg => (
                <div key={pkg.tempId} className="border border-border rounded-lg overflow-hidden">
                  {/* Package header row */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                      onClick={() => updatePackage(pkg.tempId, { expanded: !pkg.expanded })}
                      title={pkg.expanded ? 'Collapse' : 'Expand for sub-items and notes'}
                    >
                      {pkg.expanded
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <span className="text-sm font-medium flex-1 truncate">{pkg.packageLabel}</span>
                    <OutcomeToggle
                      value={pkg.outcome}
                      onChange={v => updatePackage(pkg.tempId, { outcome: v })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removePackage(pkg.tempId)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Expanded: sub-items + notes */}
                  {pkg.expanded && (
                    <div className="px-3 py-3 space-y-2.5 bg-background/60">
                      {/* Sub-items */}
                      {pkg.subItems.map(si => (
                        <div key={si.tempId} className="flex items-center gap-2 pl-3 border-l-2 border-border/60">
                          <Input
                            value={si.label}
                            onChange={e => updateSubItem(pkg.tempId, si.tempId, { label: e.target.value })}
                            placeholder="Sub-item label, e.g. Left flap"
                            className="h-7 text-xs flex-1 bg-accent border-border"
                          />
                          <OutcomeToggle
                            value={si.outcome}
                            onChange={v => updateSubItem(pkg.tempId, si.tempId, { outcome: v })}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeSubItem(pkg.tempId, si.tempId)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline pl-3"
                        onClick={() => addSubItem(pkg.tempId)}
                      >
                        + Add sub-item
                      </button>
                      {/* Package-level notes */}
                      <Textarea
                        value={pkg.notes}
                        onChange={e => updatePackage(pkg.tempId, { notes: e.target.value })}
                        placeholder="Package notes, e.g. measurements or plan references…"
                        className="text-xs bg-accent border-border min-h-[52px] resize-none"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Session-level notes */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">General Notes</Label>
            <Textarea
              value={sessionNotes}
              onChange={e => setSessionNotes(e.target.value)}
              placeholder="Overall session notes or observations…"
              className="bg-accent border-border min-h-[60px]"
            />
          </div>

          {/* Signature — new sessions only */}
          {!editSession && (
            <>
              <Separator />
              <SignaturePad ref={sigRef} />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editSession ? 'Update Session' : 'Save Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
