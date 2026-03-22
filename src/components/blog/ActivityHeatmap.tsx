import { useState, useEffect, useMemo } from 'react';
import { fetchBlogPosts, BlogPost } from '@/lib/api';

function getCellClass(count: number, isFuture: boolean): string {
  if (isFuture) return 'bg-secondary/30';
  if (count === 0) return 'bg-secondary';
  if (count === 1) return 'bg-amber-300 dark:bg-amber-800';
  if (count === 2) return 'bg-amber-500 dark:bg-amber-600';
  return 'bg-amber-700 dark:bg-amber-400';
}

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;
const DAY_LABELS = ['', 'M', '', 'W', '', 'F', ''];

interface ActivityHeatmapProps {
  compact?: boolean;
}

export function ActivityHeatmap({ compact = false }: ActivityHeatmapProps) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchBlogPosts()
      .then(p => { setPosts(p); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const weeksToShow = compact ? 16 : 53;

  const { weeks, monthLabels, totalThisYear } = useMemo(() => {
    const countMap: Record<string, number> = {};
    const thisYear = new Date().getFullYear().toString();
    let totalThisYear = 0;

    for (const post of posts) {
      const day = post.publishedAt.slice(0, 10);
      countMap[day] = (countMap[day] || 0) + 1;
      if (day.startsWith(thisYear)) totalThisYear++;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Align start to Sunday, 52 weeks back
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (weeksToShow - 1) * 7);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const weeks: { date: Date; count: number; isFuture: boolean }[][] = [];
    const monthLabels: { month: string; col: number }[] = [];
    let current = new Date(startDate);
    let lastMonth = -1;

    while (current <= today && weeks.length <= weeksToShow) {
      const week: { date: Date; count: number; isFuture: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = current.toISOString().slice(0, 10);
        week.push({ date: new Date(current), count: countMap[dateStr] || 0, isFuture: current > today });
        current.setDate(current.getDate() + 1);
      }

      const firstDay = week[0].date;
      if (firstDay.getMonth() !== lastMonth) {
        monthLabels.push({ month: firstDay.toLocaleString('default', { month: 'short' }), col: weeks.length });
        lastMonth = firstDay.getMonth();
      }

      weeks.push(week);
    }

    return { weeks, monthLabels, totalThisYear };
  }, [posts, weeksToShow]);

  return (
    <div className={compact ? '' : 'bg-card border border-border rounded-xl p-4'}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-medium text-foreground ${compact ? 'text-sm font-semibold text-muted-foreground uppercase tracking-wider' : 'text-sm'}`}>Build Activity</h3>
        {loaded && (
          <span className="text-xs text-muted-foreground">
            {totalThisYear} session{totalThisYear !== 1 ? 's' : ''} in {new Date().getFullYear()}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex">
          {/* Day labels */}
          <div className="flex flex-col mr-1.5 pt-5" style={{ gap: `${GAP}px` }}>
            {DAY_LABELS.map((label, i) => (
              <div
                key={i}
                style={{ height: `${CELL}px`, fontSize: '9px' }}
                className="text-muted-foreground/50 leading-none flex items-center"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div>
            {/* Month labels */}
            <div className="relative mb-1" style={{ height: '16px', width: `${weeks.length * STEP}px` }}>
              {monthLabels.map(({ month, col }) => (
                <span
                  key={`${month}-${col}`}
                  className="absolute text-[9px] text-muted-foreground/60"
                  style={{ left: `${col * STEP}px` }}
                >
                  {month}
                </span>
              ))}
            </div>

            {/* Cells */}
            <div className="flex" style={{ gap: `${GAP}px` }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: `${GAP}px` }}>
                  {week.map(({ date, count, isFuture }, di) => (
                    <div
                      key={di}
                      style={{ width: `${CELL}px`, height: `${CELL}px` }}
                      className={`rounded-sm ${getCellClass(count, isFuture)} cursor-default hover:opacity-70 transition-opacity`}
                      title={
                        isFuture
                          ? ''
                          : `${date.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}: ${count} session${count !== 1 ? 's' : ''}`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      {!compact && (
        <div className="flex items-center gap-1.5 mt-3 justify-end">
          <span className="text-[9px] text-muted-foreground/50">Less</span>
          {[0, 1, 2, 3].map(level => (
            <div
              key={level}
              style={{ width: '10px', height: '10px' }}
              className={`rounded-sm ${
                level === 0 ? 'bg-secondary' :
                level === 1 ? 'bg-amber-300 dark:bg-amber-800' :
                level === 2 ? 'bg-amber-500 dark:bg-amber-600' :
                'bg-amber-700 dark:bg-amber-400'
              }`}
            />
          ))}
          <span className="text-[9px] text-muted-foreground/50">More</span>
        </div>
      )}
    </div>
  );
}
