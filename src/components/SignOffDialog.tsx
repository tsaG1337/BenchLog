import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createSignOff, fetchFlowchartPackages, fetchGeneralSettings, updateGeneralSettings, FlowItem, PackagesMap } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';


interface SignOffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Pre-select a package (from Build Progress chip) */
  preselect?: { packageId: string; packageLabel: string; sectionId: string };
}

/** Flatten a FlowItem tree into a flat list preserving order */
function flattenItems(items: FlowItem[], depth = 0): { item: FlowItem; depth: number }[] {
  const result: { item: FlowItem; depth: number }[] = [];
  for (const it of items) {
    result.push({ item: it, depth });
    if (it.children?.length) result.push(...flattenItems(it.children, depth + 1));
  }
  return result;
}

export function SignOffDialog({ open, onOpenChange, onSaved, preselect }: SignOffDialogProps) {
  const { sections } = useSections();
  const [packages, setPackages] = useState<PackagesMap>({});
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [inspectorName, setInspectorName] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedPackageLabel, setSelectedPackageLabel] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [inspectionCompleted, setInspectionCompleted] = useState(false);
  const [outcome, setOutcome] = useState<'satisfactory' | 'rework' | null>(null);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const generalSettingsRef = useRef<Awaited<ReturnType<typeof fetchGeneralSettings>> | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(format(new Date(), 'yyyy-MM-dd'));
    fetchGeneralSettings().then(s => {
      generalSettingsRef.current = s;
      setInspectorName(s.inspectorName || '');
    }).catch(() => {});
    setInspectionCompleted(false);
    setOutcome(null);
    setComments('');
    setIsEmpty(true);
    fetchFlowchartPackages().then(setPackages).catch(() => {});

    if (preselect) {
      setSelectedPackageId(preselect.packageId);
      setSelectedPackageLabel(preselect.packageLabel);
      setSelectedSectionId(preselect.sectionId);
    } else {
      setSelectedPackageId('');
      setSelectedPackageLabel('');
      setSelectedSectionId('');
    }
  }, [open, preselect]);

  // Clear canvas when dialog opens
  useEffect(() => {
    if (open) setTimeout(() => clearCanvas(), 50);
  }, [open]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsEmpty(false);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const onPointerUp = useCallback(() => { isDrawing.current = false; }, []);

  const handleSave = async () => {
    if (!selectedPackageId) { toast.error('Please select a work package'); return; }
    if (!outcome) { toast.error('Please select Execution satisfactory or Rework needed'); return; }
    if (!inspectorName.trim()) { toast.error('Inspector name is required'); return; }
    if (isEmpty) { toast.error('Please provide a signature'); return; }

    setSaving(true);
    try {
      const signaturePng = canvasRef.current!.toDataURL('image/png');
      if (generalSettingsRef.current) {
        updateGeneralSettings({ ...generalSettingsRef.current, inspectorName: inspectorName.trim() })
          .catch(() => {});
      }
      await createSignOff({
        id: crypto.randomUUID(),
        packageId: selectedPackageId,
        packageLabel: selectedPackageLabel,
        sectionId: selectedSectionId,
        date,
        inspectorName: inspectorName.trim(),
        inspectionCompleted,
        noCriticalIssues: false,
        executionSatisfactory: outcome === 'satisfactory',
        reworkNeeded: outcome === 'rework',
        comments,
        signaturePng,
      });
      toast.success('Sign-off saved');
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Build flat package list grouped by section
  const packageOptions: { packageId: string; packageLabel: string; sectionId: string; sectionLabel: string; depth: number }[] = [];
  for (const section of sections) {
    const items = packages[section.id] || [];
    for (const { item, depth } of flattenItems(items)) {
      packageOptions.push({
        packageId: item.id,
        packageLabel: item.label,
        sectionId: section.id,
        sectionLabel: section.label,
        depth,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Inspection Sign-Off</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Date + Inspector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Inspector Name *</Label>
              <Input value={inspectorName} onChange={e => setInspectorName(e.target.value)}
                placeholder="Full name" className="bg-secondary border-border" />
            </div>
          </div>

          {/* Package picker */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Work Package *</Label>
            <select
              value={selectedPackageId}
              onChange={e => {
                const opt = packageOptions.find(o => o.packageId === e.target.value);
                if (opt) { setSelectedPackageId(opt.packageId); setSelectedPackageLabel(opt.packageLabel); setSelectedSectionId(opt.sectionId); }
                else { setSelectedPackageId(''); setSelectedPackageLabel(''); setSelectedSectionId(''); }
              }}
              className="w-full h-9 rounded-md border border-border bg-secondary px-3 text-sm"
            >
              <option value="">— Select a package —</option>
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
          </div>

          <Separator />

          {/* Checkboxes */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Inspection Result <span className="text-destructive">*</span></p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={inspectionCompleted} onChange={e => setInspectionCompleted(e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm">Inspection completed</span>
            </label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="outcome" checked={outcome === 'satisfactory'} onChange={() => setOutcome('satisfactory')} className="w-4 h-4" />
                <span className="text-sm">Execution satisfactory</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="outcome" checked={outcome === 'rework'} onChange={() => setOutcome('rework')} className="w-4 h-4" />
                <span className="text-sm text-amber-600 dark:text-amber-400">Rework needed</span>
              </label>
            </div>
          </div>

          {/* Comments */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Comments</Label>
            <Textarea value={comments} onChange={e => setComments(e.target.value)}
              placeholder="Additional notes or observations…" className="bg-secondary border-border min-h-[70px]" />
          </div>

          <Separator />

          {/* Signature pad */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground">Signature *</Label>
              <Button variant="ghost" size="sm" onClick={clearCanvas} className="h-6 px-2 text-xs gap-1 text-muted-foreground">
                <Eraser className="w-3 h-3" /> Clear
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden bg-white touch-none select-none">
              <canvas
                ref={canvasRef}
                width={600}
                height={180}
                className="w-full cursor-crosshair block"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1">Sign with your finger, stylus, or mouse</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Sign-Off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
