import { WorkSession } from '@/lib/types';
import { useSections } from '@/contexts/SectionsContext';
import { CalendarCheck, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DashboardProps {
  sessions: WorkSession[];
  targetHours?: number;
}

export function Dashboard({ sessions, targetHours = 2500 }: DashboardProps) {
  const { labels, icons } = useSections();
  const TARGET_HOURS = targetHours;

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

  // Estimate finish date based on average hours per week
  const estimateFinishDate = () => {
    if (sessions.length < 2) return null;

    const sorted = [...sessions].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const firstDate = new Date(sorted[0].startTime);
    const lastDate = new Date(sorted[sorted.length - 1].startTime);
    const spanMs = lastDate.getTime() - firstDate.getTime();
    const spanWeeks = spanMs / (7 * 24 * 60 * 60 * 1000);

    if (spanWeeks < 0.5) return null; // not enough data

    const hoursPerWeek = totalHours / spanWeeks;
    const remainingHours = TARGET_HOURS - totalHours;

    if (remainingHours <= 0) return { date: null, hoursPerWeek, done: true };

    const remainingWeeks = remainingHours / hoursPerWeek;
    const finishDate = new Date(Date.now() + remainingWeeks * 7 * 24 * 60 * 60 * 1000);

    return { date: finishDate, hoursPerWeek, done: false };
  };

  const estimate = estimateFinishDate();
  const progressPct = Math.min((totalHours / TARGET_HOURS) * 100, 100);

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6 text-center glow-amber">
        <p className="text-sm text-muted-foreground mb-1">Total Build Time</p>
        <p className="font-mono text-4xl font-bold text-primary">{totalHours.toFixed(1)}</p>
        <p className="text-sm text-muted-foreground">hours</p>
      </div>

      {/* Estimated Finish Date */}
      <div className="bg-card border border-border rounded-lg p-5 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <CalendarCheck className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Estimated Finish Date</p>
        </div>
        {estimate?.done ? (
          <p className="font-mono text-2xl font-bold text-primary">🎉 Complete!</p>
        ) : estimate?.date ? (
          <>
            <p className="font-mono text-2xl font-bold text-foreground">
              {estimate.date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {estimate.hoursPerWeek.toFixed(1)} hrs/week avg · {(TARGET_HOURS - totalHours).toFixed(0)}h remaining of {TARGET_HOURS}h
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground/60">Need more session data to estimate</p>
        )}
        <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{progressPct.toFixed(1)}% complete</p>
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
