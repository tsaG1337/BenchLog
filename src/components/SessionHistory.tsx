import { WorkSession, SECTION_LABELS, SECTION_ICONS } from '@/lib/types';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { SessionImages } from '@/components/SessionImages';

interface SessionHistoryProps {
  sessions: WorkSession[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<WorkSession>) => void;
}

export function SessionHistory({ sessions, onDelete, onUpdate }: SessionHistoryProps) {
  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
            {daySessions.map((session) => (
              <div
                key={session.id}
                className="bg-card border border-border rounded-lg p-4 hover:border-muted-foreground/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{SECTION_ICONS[session.section]}</span>
                      <span className="font-medium text-foreground">{SECTION_LABELS[session.section]}</span>
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
                    <SessionImages
                      sessionId={session.id}
                      imageUrls={session.imageUrls || []}
                      onImagesChange={(urls) => onUpdate(session.id, { imageUrls: urls })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(session.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
