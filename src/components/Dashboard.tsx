import { WorkSession } from '@/lib/types';
import { useSections } from '@/contexts/SectionsContext';

interface DashboardProps {
  sessions: WorkSession[];
}

export function Dashboard({ sessions }: DashboardProps) {
  const { labels, icons } = useSections();

  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalHours = totalMinutes / 60;

  const bySection = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.section] = (acc[s.section] || 0) + s.durationMinutes;
    return acc;
  }, {});

  const sectionEntries = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
  const maxMinutes = Math.max(...Object.values(bySection), 1);

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6 text-center glow-amber">
        <p className="text-sm text-muted-foreground mb-1">Total Build Time</p>
        <p className="font-mono text-4xl font-bold text-primary">{totalHours.toFixed(1)}</p>
        <p className="text-sm text-muted-foreground">hours</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-foreground font-mono">{sessions.length}</p>
          <p className="text-xs text-muted-foreground">Sessions</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-foreground font-mono">
            {sessions.length > 0 ? formatTime(totalMinutes / sessions.length) : '0m'}
          </p>
          <p className="text-xs text-muted-foreground">Avg Session</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Hours by Section</h3>
        <div className="space-y-3">
          {sectionEntries.length === 0 && (
            <p className="text-sm text-muted-foreground/50 text-center py-4">No sessions logged yet</p>
          )}
          {sectionEntries.map(([section, minutes]) => (
            <div key={section}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-foreground">
                  {icons[section] || '📋'} {labels[section] || section}
                </span>
                <span className="font-mono text-muted-foreground">{formatTime(minutes)}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(minutes / maxMinutes) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
