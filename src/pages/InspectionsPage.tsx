import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, Pencil, ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  fetchInspectionSessions,
  deleteInspectionSession,
  fetchGeneralSettings,
  InspectionSession,
  InspectionPackage,
} from '@/lib/api';
import { InspectionSessionForm } from '@/components/inspections/InspectionSessionForm';

const OUTCOME_CONFIG: Record<string, { label: string; className: string }> = {
  ok:      { label: '✓ OK',      className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  partial: { label: '~ Partial', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  rework:  { label: '✗ Rework',  className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  na:      { label: '— N/A',     className: 'bg-muted text-muted-foreground' },
};

function PackageLine({ pkg }: { pkg: InspectionPackage }) {
  const cfg = OUTCOME_CONFIG[pkg.outcome] ?? OUTCOME_CONFIG.na;
  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${cfg.className}`}>
          {cfg.label}
        </span>
        <span className="text-foreground">{pkg.packageLabel}</span>
        {pkg.subItems.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({pkg.subItems.length} sub-item{pkg.subItems.length !== 1 ? 's' : ''})
          </span>
        )}
      </div>
      {pkg.subItems.length > 0 && (
        <div className="mt-1 pl-6 space-y-0.5">
          {pkg.subItems.map(si => {
            const siCfg = OUTCOME_CONFIG[si.outcome] ?? OUTCOME_CONFIG.na;
            return (
              <div key={si.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`px-1 py-0.5 rounded text-xs font-medium ${siCfg.className}`}>
                  {siCfg.label}
                </span>
                <span>{si.label}</span>
                {si.notes && <span className="italic opacity-70">— {si.notes}</span>}
              </div>
            );
          })}
        </div>
      )}
      {pkg.notes && (
        <p className="mt-0.5 pl-6 text-xs text-muted-foreground/70 italic">{pkg.notes}</p>
      )}
    </div>
  );
}

export default function InspectionsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editSession, setEditSession] = useState<InspectionSession | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['general-settings'],
    queryFn: fetchGeneralSettings,
    staleTime: 60_000,
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['inspection-sessions'],
    queryFn: fetchInspectionSessions,
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this inspection session? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteInspectionSession(id);
      toast.success('Session deleted');
      queryClient.invalidateQueries({ queryKey: ['inspection-sessions'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (session: InspectionSession) => {
    setEditSession(session);
    setShowForm(true);
  };

  const handleNewSession = () => {
    setEditSession(undefined);
    setShowForm(true);
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['inspection-sessions'] });
  };

  return (
    <AppShell
      activePage="inspections"
      projectName={settings?.projectName || 'My Build'}
      headerRight={
        <Button size="sm" onClick={handleNewSession} className="gap-2">
          <Plus className="w-4 h-4" /> New Session
        </Button>
      }
    >
      <div className="pt-6 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No inspection sessions recorded yet.</p>
            <p className="text-xs mt-1 opacity-60">
              Record a Technical Counselor or DAR visit using "New Session".
            </p>
          </div>
        ) : (
          sessions.map(session => {
            const expanded = expandedId === session.id;
            const hasRework = session.packages.some(p => p.outcome === 'rework');
            const allOk = session.packages.length > 0 && session.packages.every(p => p.outcome === 'ok');
            const statusClass = hasRework
              ? 'bg-red-500/15 text-red-700 dark:text-red-400'
              : allOk
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
            const statusLabel = hasRework ? 'Rework required' : allOk ? 'All OK' : 'Mixed';

            return (
              <div key={session.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Session header — clickable to expand */}
                <button
                  className="w-full flex items-start gap-4 p-4 hover:bg-secondary/40 transition-colors text-left"
                  onClick={() => setExpandedId(expanded ? null : session.id)}
                >
                  {/* Signature thumbnail */}
                  {session.signaturePng && session.signaturePng.startsWith('data:') ? (
                    <img
                      src={session.signaturePng}
                      alt="Signature"
                      className="w-20 h-10 object-contain border border-border rounded bg-white shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-10 rounded border border-border bg-secondary/40 flex items-center justify-center shrink-0">
                      <ClipboardCheck className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{session.sessionName}</span>
                      {session.packages.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{format(new Date(session.date), 'dd MMM yyyy')}</span>
                      {session.inspectorName && <span>· {session.inspectorName}</span>}
                      {session.inspectorId && <span>· {session.inspectorId}</span>}
                      <span>
                        · {session.packages.length} package{session.packages.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleEdit(session)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      disabled={deletingId === session.id}
                      onClick={() => handleDelete(session.id)}
                    >
                      {deletingId === session.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                    <span className="text-muted-foreground/50 pointer-events-none">
                      {expanded
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {expanded && (
                  <div className="border-t border-border px-4 py-4 bg-secondary/20 space-y-4">
                    {/* Packages */}
                    {session.packages.length > 0 && (
                      <div className="space-y-3">
                        {session.packages.map(pkg => (
                          <PackageLine key={pkg.id} pkg={pkg} />
                        ))}
                      </div>
                    )}

                    {/* Session notes (skip migration artifacts) */}
                    {session.notes && !session.notes.startsWith('migrated:') && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Session Notes</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{session.notes}</p>
                      </div>
                    )}

                    {/* Signature */}
                    {session.signaturePng && session.signaturePng.startsWith('data:') && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Signature</p>
                        <div className="border border-border rounded-md bg-white inline-block p-2">
                          <img
                            src={session.signaturePng}
                            alt="Inspector signature"
                            className="max-w-[280px] h-auto"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <InspectionSessionForm
        open={showForm}
        onOpenChange={open => {
          setShowForm(open);
          if (!open) setEditSession(undefined);
        }}
        onSaved={handleSaved}
        editSession={editSession}
      />
    </AppShell>
  );
}
