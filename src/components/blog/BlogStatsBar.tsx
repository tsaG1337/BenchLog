import { Clock, CalendarCheck, TrendingUp } from 'lucide-react';
import { BuildStats } from '@/lib/api';

interface BlogStatsBarProps {
  stats: BuildStats | null;
}

export function BlogStatsBar({ stats }: BlogStatsBarProps) {
  if (!stats) return null;

  const finishDate = stats.estimatedFinish
    ? new Date(stats.estimatedFinish).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-6 flex-wrap text-sm">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Total:</span>
          <span className="font-mono font-bold text-foreground">{stats.totalHours}h</span>
          <span className="text-muted-foreground">/ {stats.targetHours}h</span>
        </div>
        {finishDate && (
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">Est. finish:</span>
            <span className="font-medium text-foreground">{finishDate}</span>
          </div>
        )}
        {stats.hoursPerWeek && (
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">{stats.hoursPerWeek} hrs/week avg</span>
          </div>
        )}
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${stats.progressPct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{stats.progressPct}% complete</p>
    </div>
  );
}
