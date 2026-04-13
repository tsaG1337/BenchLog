import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSections } from '@/contexts/SectionsContext';
import {
  fetchBlogPosts, fetchBuildStats, fetchGeneralSettings, trackPageView,
  type BlogPost, type BuildStats,
} from '@/lib/api';
import { BuildFlowchart } from '@/components/blog/BuildFlowchart';
import { AppShell, MIcon } from '@/components/AppShell';
import { thumbUrl, imageUrl } from '@/lib/utils';
import { format } from 'date-fns';

// ─── Thumbnail image with fallback ──────────────────────────────────
function FeedImage({ src, className }: { src: string; className: string }) {
  const thumb = thumbUrl(src);
  const full = imageUrl(src);
  const [activeSrc, setActiveSrc] = useState(thumb);
  const [failed, setFailed] = useState(false);

  if (failed) return null;
  return (
    <img
      src={activeSrc}
      onError={() => {
        if (activeSrc === thumb && thumb !== full) setActiveSrc(full);
        else setFailed(true);
      }}
      alt=""
      className={className}
    />
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PAGE COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function DashboardPage() {
  const { sections, labels } = useSections();
  const navigate = useNavigate();

  // ─── State ──────────────────────────────────────────────────────
  const [stats, setStats] = useState<BuildStats | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [projectName, setProjectName] = useState('BenchLog');
  // ─── Data fetching ──────────────────────────────────────────────
  useEffect(() => {
    fetchBuildStats().then(setStats).catch(() => {});
    fetchGeneralSettings().then(s => setProjectName(s.projectName)).catch(() => {});
    fetchBlogPosts({ limit: 200 }).then(r => setPosts(r.posts)).catch(() => {});
    trackPageView('/dashboard');
  }, []);

  // ─── Computed: heatmap ─────────────────────────────────────────
  const { heatmapWeeks, heatmapMonths, sessionsThisYear } = useMemo(() => {
    const countMap: Record<string, number> = {};
    const thisYear = new Date().getFullYear();
    let sessionsThisYear = 0;

    for (const post of posts) {
      if (post.source !== 'session') continue;
      const d = new Date(post.publishedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      countMap[key] = (countMap[key] || 0) + 1;
      if (d.getFullYear() === thisYear) sessionsThisYear++;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weeksToShow = 52;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (weeksToShow - 1) * 7 - startDate.getDay());

    const weeks: { date: Date; count: number; isFuture: boolean }[][] = [];
    const months: { month: string; col: number }[] = [];
    const current = new Date(startDate);
    let lastMonth = -1;

    while (current <= today || weeks.length < weeksToShow) {
      const week: { date: Date; count: number; isFuture: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        week.push({ date: new Date(current), count: countMap[key] || 0, isFuture: current > today });
        current.setDate(current.getDate() + 1);
      }
      const firstDay = week[0].date;
      if (firstDay.getMonth() !== lastMonth) {
        months.push({ month: firstDay.toLocaleString('en-US', { month: 'short' }), col: weeks.length });
        lastMonth = firstDay.getMonth();
      }
      weeks.push(week);
      if (weeks.length >= weeksToShow) break;
    }

    return { heatmapWeeks: weeks, heatmapMonths: months, sessionsThisYear };
  }, [posts]);

  // ─── Computed: derived stats ───────────────────────────────────
  const hoursThisWeek = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return posts
      .filter(p => p.source === 'session' && new Date(p.publishedAt) >= startOfWeek)
      .reduce((sum, p) => sum + (p.durationMinutes || 0) / 60, 0);
  }, [posts]);

  const avgSessionHours = stats && stats.sessionCount > 0
    ? (stats.totalHours / stats.sessionCount).toFixed(1)
    : '—';

  const sessionsPerWeek = stats && stats.hoursPerWeek && stats.sessionCount > 0
    ? (stats.hoursPerWeek / (stats.totalHours / stats.sessionCount)).toFixed(1)
    : '—';

  const heatmapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (heatmapRef.current) {
      heatmapRef.current.scrollLeft = heatmapRef.current.scrollWidth;
    }
  }, [heatmapWeeks]);

  const recentSessions = posts.slice(0, 6);

  const sectionHours = stats?.sectionHours ?? {};
  const maxSectionHours = Math.max(...Object.values(sectionHours), 1);

  // Sort sections by hours descending
  const sortedSections = sections
    .filter(sec => (sectionHours[sec.id] || 0) > 0)
    .sort((a, b) => (sectionHours[b.id] || 0) - (sectionHours[a.id] || 0));

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <AppShell activePage="dashboard" projectName={projectName}>

          {/* ─── Hero Metrics ──────────────────────────────────────── */}
          <section className="mb-10 space-y-3 md:space-y-4">
            {/* Top row: two compact stat cards on mobile, three on md+ */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {/* Total Sessions */}
              <div className="p-3 md:p-6 bg-card rounded shadow-sm border-l-4 border-primary">
                <h5 className="font-label text-[10px] uppercase font-bold text-muted-foreground">
                  Total Sessions
                </h5>
                <p className="font-headline font-bold text-xl md:text-3xl mt-1 md:mt-2 text-foreground">
                  {stats?.sessionCount ?? 0}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <MIcon name="trending_up" className="text-xs text-muted-foreground" />
                  <span className="font-label text-[10px] uppercase text-muted-foreground">
                    {stats?.totalHours ?? 0}h logged
                  </span>
                </div>
              </div>

              {/* Hours / Week */}
              <div className="p-3 md:p-6 bg-card rounded shadow-sm border-l-4 border-amber-500">
                <h5 className="font-label text-[10px] uppercase font-bold text-muted-foreground">
                  Hours / Week
                </h5>
                <p className="font-headline font-bold text-xl md:text-3xl mt-1 md:mt-2 text-foreground">
                  {stats?.hoursPerWeek ?? '—'}
                </p>
                <span className="font-label text-[10px] uppercase text-muted-foreground">
                  Avg {avgSessionHours}h / session
                </span>
              </div>

              {/* Completion Velocity — spans full width on mobile, third column on md+ */}
              <div className="col-span-2 md:col-span-1 p-3 md:p-6 bg-card rounded shadow-sm border-l-4 border-primary">
                <h5 className="font-label text-[10px] uppercase font-bold text-muted-foreground">
                  Completion Velocity
                </h5>
                <div className="w-full h-1.5 mt-2 bg-accent">
                  <div className="h-full transition-all bg-primary" style={{ width: `${stats?.progressPct ?? 0}%` }} />
                </div>
                <div className="flex justify-between items-baseline mt-1.5">
                  <span className="font-label text-[10px] uppercase text-muted-foreground">
                    Est. finish: {stats?.estimatedFinish
                      ? format(new Date(stats.estimatedFinish), 'MMM. yyyy')
                      : '—'}
                  </span>
                  <span className="font-headline font-bold text-sm text-primary">
                    {stats?.progressPct ?? 0}%
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ─── Activity Heatmap + Sectional Breakdown ────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
            {/* Heatmap (large) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex justify-between items-end mb-4">
                <h4 className="font-headline font-bold text-lg text-foreground">
                  Annual Activity Log
                </h4>
                <div className="flex gap-2 items-center">
                  <span className="font-label text-[10px] uppercase text-muted-foreground">Less</span>
                  <div className="flex gap-1">
                    <div className="w-3 h-3 bg-accent" />
                    <div className="w-3 h-3 bg-primary/30" />
                    <div className="w-3 h-3 bg-primary/60" />
                    <div className="w-3 h-3 bg-primary" />
                  </div>
                  <span className="font-label text-[10px] uppercase text-muted-foreground">More</span>
                </div>
              </div>
              <div ref={heatmapRef} className="p-6 overflow-x-auto scrollbar-hide bg-card">
                {/* Month labels */}
                <div className="flex gap-[2px] mb-1 ml-6">
                  {heatmapMonths.map(({ month, col }, idx) => {
                    const nextCol = idx < heatmapMonths.length - 1 ? heatmapMonths[idx + 1].col : heatmapWeeks.length;
                    const spanCols = nextCol - col;
                    return (
                      <span
                        key={`${month}-${col}`}
                        className="font-label text-[9px] uppercase text-muted-foreground"
                        style={{ width: `${spanCols * 14}px`, flexShrink: 0 }}
                      >
                        {month}
                      </span>
                    );
                  })}
                </div>
                {/* Grid */}
                <div className="flex gap-[2px]">
                  {/* Day labels */}
                  <div className="flex flex-col gap-[2px] mr-1 text-[8px] text-muted-foreground">
                    <span className="h-3 flex items-center">&nbsp;</span>
                    <span className="h-3 flex items-center">M</span>
                    <span className="h-3 flex items-center">&nbsp;</span>
                    <span className="h-3 flex items-center">W</span>
                    <span className="h-3 flex items-center">&nbsp;</span>
                    <span className="h-3 flex items-center">F</span>
                    <span className="h-3 flex items-center">&nbsp;</span>
                  </div>
                  {heatmapWeeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[2px]">
                      {week.map(({ count, isFuture, date }, di) => (
                        <div
                          key={di}
                          className={`w-3 h-3 transition-opacity hover:opacity-70 cursor-default ${
                            isFuture || count === 0
                              ? 'bg-accent'
                              : count === 1
                                ? 'bg-primary/30'
                                : count === 2
                                  ? 'bg-primary/60'
                                  : 'bg-primary'
                          }`}
                          title={isFuture ? '' : `${date.toLocaleDateString()}: ${count} session${count !== 1 ? 's' : ''}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Efficiency Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-card rounded shadow-sm border-l-4 border-primary">
                  <h5 className="font-label text-[10px] uppercase font-bold text-muted-foreground">
                    Avg Session Length
                  </h5>
                  <p className="font-headline font-bold text-3xl mt-2 text-foreground">
                    {avgSessionHours} <span className="text-sm font-label uppercase text-muted-foreground">HRS</span>
                  </p>
                </div>
                <div className="p-6 bg-card rounded shadow-sm border-l-4 border-amber-500">
                  <h5 className="font-label text-[10px] uppercase font-bold text-muted-foreground">
                    Sessions Per Week
                  </h5>
                  <p className="font-headline font-bold text-3xl mt-2 text-foreground">
                    {sessionsPerWeek} <span className="text-sm font-label uppercase text-muted-foreground">ACTV</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Build Progress */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <h4 className="font-headline font-bold text-lg text-foreground">
                Build Progress
              </h4>
              <div className="p-4 bg-card flex-1 flex flex-col justify-center">
                <BuildFlowchart
                  projectName={projectName}
                  onPlansSectionFilter={plansSection => navigate(`/blog?section=${plansSection}`)}
                />
              </div>
            </div>
          </section>

          {/* ─── Recent Logs + Sectional Breakdown ─────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Recent Logs */}
            <div className="lg:col-span-8 space-y-6">
              <div className="flex justify-between items-center">
                <h4 className="font-headline font-bold text-lg text-foreground">
                  Recent Logs
                </h4>
                <Link to="/blog" className="font-label text-[11px] font-bold uppercase hover:underline text-primary">
                  View All Logs
                </Link>
              </div>
              <div className="space-y-4">
                {recentSessions.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <MIcon name="receipt_long" className="text-4xl opacity-40" />
                    <p className="mt-2 font-label text-sm">No sessions logged yet</p>
                  </div>
                )}
                {recentSessions.map(post => {
                  const isSession = post.source === 'session';
                  const allImages = post.imageUrls?.length ? post.imageUrls : (post.contentImageUrls ?? []);
                  const date = new Date(post.publishedAt);
                  return (
                    <div
                      key={post.id}
                      className="group flex items-center gap-6 p-5 cursor-pointer transition-all bg-card border-l-4 border-transparent hover:border-primary"
                      onClick={() => navigate('/blog')}
                    >
                      <div className="flex flex-col items-center shrink-0">
                        <span className="font-label text-xs font-bold text-muted-foreground">
                          {format(date, 'MMM').toUpperCase()}
                        </span>
                        <span className="font-headline font-black text-2xl text-foreground">
                          {format(date, 'dd')}
                        </span>
                      </div>
                      <div className="flex-grow min-w-0">
                        {post.section && (
                          <p className="font-label text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                            {labels[post.section] || post.section}
                            {post.plansReference ? ` / ${post.plansReference}` : ''}
                          </p>
                        )}
                        <h5 className="font-headline font-bold text-sm truncate text-foreground">
                          {post.title}
                        </h5>
                        {post.excerpt && (
                          <p className="text-xs mt-1 line-clamp-1 text-muted-foreground">
                            {post.excerpt}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {isSession && post.durationMinutes ? (
                          <span className="font-label text-sm font-bold text-foreground">
                            {(post.durationMinutes / 60).toFixed(1)} HRS
                          </span>
                        ) : (
                          <MIcon name="newspaper" className="text-xl text-primary" />
                        )}
                        {allImages.length > 0 && (
                          <div className="flex gap-1 mt-1 justify-end">
                            <MIcon name="photo_camera" className="text-[14px] text-muted-foreground" />
                            {allImages.length > 1 && (
                              <span className="font-label text-[10px] text-muted-foreground">
                                {allImages.length}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sectional Breakdown */}
            <div className="lg:col-span-4 space-y-6">
              <h4 className="font-headline font-bold text-lg text-foreground">
                Sectional Breakdown
              </h4>
              <div className="p-6 space-y-6 bg-card">
                {sortedSections.length === 0 && (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
                {sortedSections.map(sec => {
                  const hours = sectionHours[sec.id] || 0;
                  const pct = (hours / maxSectionHours) * 100;
                  return (
                    <div key={sec.id} className="space-y-2">
                      <div className="flex justify-between font-label text-[10px] font-bold uppercase">
                        <span className="text-foreground">{labels[sec.id] || sec.id}</span>
                        <span className="text-foreground">{hours.toFixed(1)} HRS</span>
                      </div>
                      <div className="w-full h-4 bg-accent">
                        <div className="h-full transition-all bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
    </AppShell>
  );
}
