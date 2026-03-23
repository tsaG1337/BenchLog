import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, CheckSquare, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { SignOff, deleteSignOff } from '@/lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SignOffsListProps {
  signOffs: SignOff[];
  onDeleted: () => void;
  readOnly?: boolean;
}

function StatusChip({ label, active, variant = 'default' }: { label: string; active: boolean; variant?: 'default' | 'warning' }) {
  if (!active) return null;
  const color = variant === 'warning'
    ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
    : 'bg-primary/15 border-primary/40 text-primary';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${color}`}>
      {variant === 'warning' ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {label}
    </span>
  );
}

export function SignOffsList({ signOffs, onDeleted, readOnly }: SignOffsListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this sign-off? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteSignOff(id);
      toast.success('Sign-off deleted');
      onDeleted();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (signOffs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No sign-offs recorded yet.</p>
        <p className="text-xs mt-1 opacity-60">Use the "Sign Off" button to record an inspection.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {signOffs.map(s => {
        const expanded = expandedId === s.id;
        return (
          <div key={s.id} className="border border-border rounded-lg bg-card overflow-hidden">
            {/* Header row */}
            <button
              className="w-full flex items-start gap-3 p-4 hover:bg-secondary/50 transition-colors text-left"
              onClick={() => setExpandedId(expanded ? null : s.id)}
            >
              {/* Signature thumbnail */}
              <img src={s.signaturePng} alt="Signature" className="w-20 h-10 object-contain border border-border rounded bg-white shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">{s.packageLabel}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">{format(new Date(s.date), 'dd MMM yyyy')}</span>
                  {s.inspectorName && <span className="text-xs text-muted-foreground">· {s.inspectorName}</span>}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <StatusChip label="Completed" active={s.inspectionCompleted} />
                  <StatusChip label="No critical issues" active={s.noCriticalIssues} />
                  <StatusChip label="Satisfactory" active={s.executionSatisfactory} />
                  <StatusChip label="Rework needed" active={s.reworkNeeded} variant="warning" />
                </div>
              </div>

              {!readOnly && (
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  disabled={deletingId === s.id}
                  onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </button>

            {/* Expanded detail */}
            {expanded && (
              <div className="border-t border-border px-4 py-3 space-y-3">
                {s.comments && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Comments</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{s.comments}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Checklist</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {[
                      { label: 'Inspection completed', value: s.inspectionCompleted },
                      { label: 'No critical issues', value: s.noCriticalIssues },
                      { label: 'Execution satisfactory', value: s.executionSatisfactory },
                      { label: 'Rework needed', value: s.reworkNeeded },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-1.5 text-muted-foreground">
                        {item.value
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                          : <XCircle className="w-3.5 h-3.5 opacity-30 shrink-0" />}
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Signature</p>
                  <div className="border border-border rounded-md bg-white inline-block p-2">
                    <img src={s.signaturePng} alt="Signature" className="max-w-[300px] h-auto" />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
