import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSections } from '@/contexts/SectionsContext';
import {
  fetchBlogPosts, fetchBuildStats, fetchGeneralSettings, trackPageView,
  fetchFlowchartPackages, fetchFlowchartStatus,
  type BlogPost, type BuildStats, type PackagesMap, type StatusMap, type FlowItem,
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
  const [inspectorName, setInspectorName] = useState<string>('');
  const [packages, setPackages] = useState<PackagesMap>({});
  const [flowStatuses, setFlowStatuses] = useState<StatusMap>({});

  // ─── Data fetching ──────────────────────────────────────────────
  useEffect(() => {
    fetchBuildStats().then(setStats).catch(() => {});
    fetchGeneralSettings().then(s => {
      setProjectName(s.projectName);
      setInspectorName(s.inspectorName?.trim() ?? '');
    }).catch(() => {});
    fetchBlogPosts({ limit: 200 }).then(r => setPosts(r.posts)).catch(() => {});
    fetchFlowchartPackages().then(setPackages).catch(() => {});
    fetchFlowchartStatus().then(setFlowStatuses).catch(() => {});
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

  // ─── Cobalt hero data ──────────────────────────────────────────
  // Subtitle = "{section} is X% complete." for the *most recently tracked*
  // section, where the percent is computed from the section's flowchart
  // packages (count of 'done' nodes / total nodes — same logic as
  // BuildFlowchart). Omitted entirely when there's no tracked section yet,
  // or the section has no work packages defined.
  const lastSession = posts.find(p => p.source === 'session');
  const lastSectionId = lastSession?.section ?? sortedSections[0]?.id;
  const lastSectionLabel = lastSectionId ? (labels[lastSectionId] || lastSectionId) : null;

  const lastSectionPct = useMemo(() => {
    if (!lastSectionId) return null;
    const flatten = (items: FlowItem[]): FlowItem[] =>
      items.flatMap(i => [i, ...(i.children ? flatten(i.children) : [])]);
    const items = flatten(packages[lastSectionId] ?? []);
    if (items.length === 0) return null;
    const done = items.filter(i => flowStatuses[i.id] === 'done').length;
    return Math.round((done / items.length) * 100);
  }, [lastSectionId, packages, flowStatuses]);

  const overallPct = stats?.progressPct ?? 0;

  // Time-of-day greeting from the user's local clock. Late-night (22–04)
  // gets a slightly cheekier line that fits the builder voice — the typical
  // hour someone fires up the dashboard at 1am after a garage session.
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12)  return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    if (h >= 17 && h < 22) return 'Good evening';
    return 'Working late';
  }, []);

  // Hours-this-week / -month toggle for the KPI tile.
  const [hoursMode, setHoursMode] = useState<'week' | 'month'>('week');
  const hoursThisMonth = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return posts
      .filter(p => p.source === 'session' && new Date(p.publishedAt) >= start)
      .reduce((sum, p) => sum + (p.durationMinutes || 0) / 60, 0);
  }, [posts]);
  const hoursValue = hoursMode === 'week' ? hoursThisWeek : hoursThisMonth;
  const hoursGoal  = hoursMode === 'week' ? 20 : 80;

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <AppShell activePage="dashboard" projectName={projectName}>

          {/* ─── Cobalt Hero ────────────────────────────────────────── */}
          <section className="mb-6 md:mb-8">
            <div className="relative overflow-hidden rounded-lg border border-border bg-card p-6 md:p-7">
              {/* Soft cobalt radial glow in the top-right corner */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-32 -right-32 h-[360px] w-[360px] rounded-full"
                style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 60%)' }}
              />
              <div className="relative">
                <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
                  {format(new Date(), 'EEEE · MMMM d')}
                </div>
                <div className="mt-1.5 font-headline font-bold text-2xl md:text-4xl tracking-tight leading-[1.1] text-foreground">
                  {greeting}{inspectorName ? `, ${inspectorName}` : ''}.
                  {lastSectionLabel && lastSectionPct !== null && (
                    <>
                      <br />
                      <span className="text-muted-foreground font-semibold">
                        {lastSectionLabel} is {lastSectionPct}% complete.
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap items-stretch gap-x-6 gap-y-3">
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">Total hours</div>
                    <div className="font-headline font-bold text-2xl md:text-3xl tracking-tight text-foreground">
                      {(stats?.totalHours ?? 0).toLocaleString()}<span className="text-primary">h</span>
                    </div>
                  </div>
                  <div className="w-px bg-border" />
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">Est. first flight</div>
                    <div className="font-headline font-bold text-2xl md:text-3xl tracking-tight text-foreground">
                      {stats?.estimatedFinish ? format(new Date(stats.estimatedFinish), 'MMM yyyy') : '—'}
                    </div>
                  </div>
                  <div className="w-px bg-border" />
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">Sessions this year</div>
                    <div className="font-headline font-bold text-2xl md:text-3xl tracking-tight text-foreground">
                      {sessionsThisYear}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ─── KPI Row ────────────────────────────────────────────── */}
          <section className="mb-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {/* Total Sessions */}
              <div className="p-3 md:p-5 bg-card rounded border border-border">
                <h5 className="font-mono text-[10px] tracking-[0.16em] uppercase font-semibold text-muted-foreground">
                  Total sessions
                </h5>
                <p className="font-headline font-bold text-2xl md:text-3xl mt-1 md:mt-2 text-foreground">
                  {stats?.sessionCount ?? 0}
                </p>
                <div className="font-mono text-[10px] tracking-wider text-muted-foreground mt-1">
                  {stats?.totalHours ?? 0}h logged
                </div>
              </div>

              {/* Hours · clickable week/month toggle */}
              <button
                onClick={() => setHoursMode(m => m === 'week' ? 'month' : 'week')}
                title="Click to toggle week / month"
                className="text-left p-3 md:p-5 bg-card rounded border border-border hover:border-primary/40 transition-colors"
              >
                <h5 className="font-mono text-[10px] tracking-[0.16em] uppercase font-semibold text-muted-foreground">
                  {hoursMode === 'week' ? 'Hours this week' : 'Hours this month'}
                </h5>
                <p className="font-headline font-bold text-2xl md:text-3xl mt-1 md:mt-2 text-foreground">
                  {hoursValue.toFixed(1)}
                </p>
                <div className="font-mono text-[10px] tracking-wider text-muted-foreground mt-1">
                  of {hoursGoal} {hoursMode} goal · click to swap
                </div>
              </button>

              {/* Avg session length */}
              <div className="p-3 md:p-5 bg-card rounded border border-border">
                <h5 className="font-mono text-[10px] tracking-[0.16em] uppercase font-semibold text-muted-foreground">
                  Avg. session
                </h5>
                <p className="font-headline font-bold text-2xl md:text-3xl mt-1 md:mt-2 text-foreground">
                  {avgSessionHours}<span className="text-primary text-base">h</span>
                </p>
                <div className="font-mono text-[10px] tracking-wider text-muted-foreground mt-1">
                  per session
                </div>
              </div>

              {/* Overall completion */}
              <div className="col-span-2 md:col-span-1 p-3 md:p-5 bg-card rounded border border-border">
                <h5 className="font-mono text-[10px] tracking-[0.16em] uppercase font-semibold text-muted-foreground">
                  Overall completion
                </h5>
                <p className="font-headline font-bold text-2xl md:text-3xl mt-1 md:mt-2 text-foreground">
                  {overallPct}%
                </p>
                <div className="w-full h-1 mt-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${overallPct}%` }} />
                </div>
                <div className="font-mono text-[10px] tracking-wider text-muted-foreground mt-1.5">
                  est. {stats?.estimatedFinish ? format(new Date(stats.estimatedFinish), 'MMM yyyy') : '—'}
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
