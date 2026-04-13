import { WorkSession } from '@/lib/types';
import { useSections } from '@/contexts/SectionsContext';
import { CalendarCheck, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DashboardProps {
  sessions: WorkSession[];
  targetHours?: number;
  progressMode?: 'time' | 'packages';
  packageProgressPct?: number;
}

export function Dashboard({ sessions, targetHours = 2500, progressMode = 'time', packageProgressPct = 0 }: DashboardProps) {
  const { labels, icons, sections } = useSections();
  const TARGET_HOURS = targetHours;

  // Only count sessions from sections where countTowardsBuildHours !== false
  const excludedSectionIds = new Set(
    sections.filter(s => s.countTowardsBuildHours === false).map(s => s.id)
  );
  const countedSessions = sessions.filter(s => !excludedSectionIds.has(s.section));

  const totalMinutes = countedSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalHours = totalMinutes / 60;

  // Show all sections in the breakdown so the user can see uncounted work too
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
    if (countedSessions.length < 2) return null;

    const sorted = [...countedSessions].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
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
  const progressPct = progressMode === 'packages'
    ? packageProgressPct
    : Math.min((totalHours / TARGET_HOURS) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Compact stats row */}
      <div className="bg-card rounded-lg p-3 sm:p-4 space-y-2.5">
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-mono font-bold text-primary">{totalHours.toFixed(1)}h</span>
            <span className="text-muted-foreground/60">/ {TARGET_HOURS}h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Sessions:</span>
            <span className="font-mono font-bold text-foreground">{countedSessions.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Avg:</span>
            <span className="font-mono font-bold text-foreground">
              {countedSessions.length > 0 ? formatTime(totalMinutes / countedSessions.length) : '0m'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Est. finish:</span>
            {estimate?.done ? (
              <span className="font-mono text-sm font-bold text-primary">Complete!</span>
            ) : estimate?.date ? (
              <span className="font-mono font-bold text-foreground">
                {estimate.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            ) : (
              <span className="text-muted-foreground/60 text-xs">Need more data</span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3 h-3 text-muted-foreground/40 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                Based on your average weekly pace ({estimate?.hoursPerWeek ? `${estimate.hoursPerWeek.toFixed(1)} hrs/week` : 'calculating…'}). Needs at least 2 sessions over 3.5+ days.
              </TooltipContent>
            </Tooltip>
          </div>
          {estimate?.date && !estimate.done && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {estimate.hoursPerWeek.toFixed(1)} hrs/wk · {(TARGET_HOURS - totalHours).toFixed(0)}h left
            </span>
          )}
        </div>

        <div className="h-1.5 bg-accent rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground text-right">
          {progressPct.toFixed(1)}% complete
          {progressMode === 'packages' && <span className="text-muted-foreground/60"> (packages)</span>}
        </p>
      </div>

      <div className="bg-card rounded-lg p-5">
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
              <div className="h-2 bg-accent rounded-full overflow-hidden">
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
