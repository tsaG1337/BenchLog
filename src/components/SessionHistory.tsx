import { useState } from 'react';
import { WorkSession } from '@/lib/types';
import { useSections } from '@/contexts/SectionsContext';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { SessionImages } from '@/components/SessionImages';

interface SessionHistoryProps {
  sessions: WorkSession[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<WorkSession>) => void;
}

function parsePlansRef(ref?: string) {
  const page = ref?.match(/Page\s+(\S+)/)?.[1] || '';
  const section = ref?.match(/Section\s+(\S+)/)?.[1] || '';
  const step = ref?.match(/Step\s+(\S+)/)?.[1] || '';
  return { page, section, step };
}

function buildPlansRef(page: string, section: string, step: string) {
  return [page && `Page ${page}`, section && `Section ${section}`, step && `Step ${step}`]
    .filter(Boolean)
    .join(', ') || undefined;
}

export function SessionHistory({ sessions, onDelete, onUpdate }: SessionHistoryProps) {
  const { labels, icons, sections } = useSections();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSection, setEditSection] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPage, setEditPage] = useState('');
  const [editPlanSection, setEditPlanSection] = useState('');
  const [editStep, setEditStep] = useState('');

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const startEdit = (session: WorkSession) => {
    const parsed = parsePlansRef(session.plansReference);
    setEditingId(session.id);
    setEditSection(session.section);
    setEditNotes(session.notes || '');
    setEditPage(parsed.page);
    setEditPlanSection(parsed.section);
    setEditStep(parsed.step);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = (session: WorkSession) => {
    onUpdate(session.id, {
      section: editSection,
      notes: editNotes,
      plansReference: buildPlansRef(editPage, editPlanSection, editStep),
    });
    setEditingId(null);
  };

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg mb-1">No sessions yet</p>
        <p className="text-sm">Start the timer to log your first build session!</p>
      </div>
    );
  }

  const grouped = sessions.reduce<Record<string, WorkSession[]>>((acc, s) => {
    const date = format(new Date(s.startTime), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, daySessions]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {format(new Date(date), 'EEEE, MMMM d, yyyy')}
          </h3>
          <div className="space-y-2">
            {daySessions.map((session) => {
              const isEditing = editingId === session.id;

              return (
                <div
                  key={session.id}
                  className="bg-card border border-border rounded-lg p-4 hover:border-muted-foreground/30 transition-colors"
                >
                  {isEditing ? (
                    <div className="space-y-4">
                      {/* Section picker */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Section</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                          {sections.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => setEditSection(s.id)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${
                                editSection === s.id
                                  ? 'bg-primary/15 border-primary text-primary'
                                  : 'bg-secondary border-border text-muted-foreground hover:border-muted-foreground/50'
                              }`}
                            >
                              <span>{s.icon}</span>
                              <span>{s.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Plans reference */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Plans Reference</Label>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground/70 mb-1 block">Section</Label>
                            <Input value={editPlanSection} onChange={(e) => setEditPlanSection(e.target.value)} placeholder="e.g. 5" className="bg-secondary border-border font-mono h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground/70 mb-1 block">Page</Label>
                            <Input value={editPage} onChange={(e) => setEditPage(e.target.value)} placeholder="e.g. 8" className="bg-secondary border-border font-mono h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground/70 mb-1 block">Step</Label>
                            <Input value={editStep} onChange={(e) => setEditStep(e.target.value)} placeholder="e.g. 3" className="bg-secondary border-border font-mono h-8 text-xs" />
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Notes</Label>
                        <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="bg-secondary border-border min-h-[60px] text-sm" />
                      </div>

                      {/* Photos - only in edit mode */}
                      <SessionImages
                        sessionId={session.id}
                        imageUrls={session.imageUrls || []}
                        onImagesChange={(urls) => onUpdate(session.id, { imageUrls: urls })}
                        editable
                      />

                      {/* Save / Cancel */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" onClick={() => saveEdit(session)} className="gap-1.5 text-xs h-7">
                          <Check className="w-3.5 h-3.5" /> Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1.5 text-xs h-7">
                          <X className="w-3.5 h-3.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span>{icons[session.section] || '📋'}</span>
                          <span className="font-medium text-foreground">{labels[session.section] || session.section}</span>
                          <span className="font-mono text-sm text-primary font-semibold">{formatDuration(session.durationMinutes)}</span>
                        </div>
                        {session.plansReference && (
                          <p className="text-xs font-mono text-accent-foreground mb-1">📖 {session.plansReference}</p>
                        )}
                        {session.notes && (
                          <p className="text-sm text-muted-foreground">{session.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground/50 mt-2">
                          {format(new Date(session.startTime), 'h:mm a')} – {format(new Date(session.endTime), 'h:mm a')}
                        </p>
                        {/* Show images read-only when not editing */}
                        <SessionImages
                          sessionId={session.id}
                          imageUrls={session.imageUrls || []}
                          onImagesChange={(urls) => onUpdate(session.id, { imageUrls: urls })}
                          editable={false}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(session)} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDelete(session.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
