import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { AboutDialog } from '@/components/AboutDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/contexts/SectionsContext';
import {
  fetchBlogPosts, fetchBlogArchive, fetchBlogPost, fetchGeneralSettings,
  fetchBuildStats, fetchFlowchartPackages, trackPageView,
  type BlogPost, type BlogArchiveEntry, type BuildStats, type PackagesMap, type FlowItem,
} from '@/lib/api';
import { BlogPostView } from '@/components/blog/BlogPostView';
import { BlogEditor } from '@/components/blog/BlogEditor';
import { SessionBlogEditor } from '@/components/blog/SessionBlogEditor';
import { thumbUrl } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────────
type View = 'list' | 'post' | 'editor';

interface Filters {
  section?: string;
  year?: string;
  month?: string;
  plansSection?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}.${Math.round((m / 60) * 10)}` : `0.${Math.round((m / 60) * 10)}`;
}

function formatDurationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Icon helper (Material Symbols via CSS) ─────────────────────────
function MIcon({ name, className = '', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24", ...style }}
    >
      {name}
    </span>
  );
}

// ─── Thumbnail image with fallback ──────────────────────────────────
function FeedImage({ src, className }: { src: string; className: string }) {
  const thumb = thumbUrl(src);
  const [activeSrc, setActiveSrc] = useState(thumb);
  const [failed, setFailed] = useState(false);

  if (failed) return null;
  return (
    <img
      src={activeSrc}
      onError={() => {
        if (activeSrc === thumb && thumb !== src) setActiveSrc(src);
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
export default function BenchLogPage() {
  const { isAuthenticated, demoMode, logout, role } = useAuth();
  const { sections, labels, icons } = useSections();

  // ─── State ──────────────────────────────────────────────────────
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [archive, setArchive] = useState<BlogArchiveEntry[]>([]);
  const [stats, setStats] = useState<BuildStats | null>(null);
  const [projectName, setProjectName] = useState('BenchLog');
  const [filters, setFilters] = useState<Filters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<View>('list');
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [packages, setPackages] = useState<PackagesMap>({});

  // ─── Data fetching ──────────────────────────────────────────────
  const loadPosts = useCallback(async (f: Filters, pageNum = 1, append = false) => {
    try {
      const res = await fetchBlogPosts({ ...f, page: pageNum, limit: 20 });
      setPosts(prev => append ? [...prev, ...res.posts] : res.posts);
      setHasMore(res.hasMore);
      setPage(pageNum);
    } catch {
      toast.error('Failed to load posts');
    }
  }, []);

  useEffect(() => { loadPosts(filters); }, [filters, loadPosts]);

  useEffect(() => {
    fetchBlogArchive().then(setArchive).catch(() => {});
    fetchGeneralSettings().then(s => setProjectName(s.projectName)).catch(() => {});
    fetchBuildStats().then(setStats).catch(() => {});
    fetchFlowchartPackages().then(setPackages).catch(() => {});
    trackPageView('/benchlog');
  }, []);

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setView('list');
    setActivePost(null);
  };

  const handlePostClick = async (post: BlogPost) => {
    if (post.source === 'session') {
      setActivePost(post);
      setView('post');
      return;
    }
    try {
      const full = await fetchBlogPost(post.id);
      setActivePost(full);
      setView('post');
    } catch {
      toast.error('Failed to load post');
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await loadPosts(filters, page + 1, true);
    setLoadingMore(false);
  };

  const handleSaved = () => {
    setView('list');
    setActivePost(null);
    loadPosts(filters);
  };

  // ─── Computed ───────────────────────────────────────────────────
  const archiveByYear: Record<string, BlogArchiveEntry[]> = {};
  for (const entry of archive) {
    if (!archiveByYear[entry.year]) archiveByYear[entry.year] = [];
    archiveByYear[entry.year].push(entry);
  }
  const years = Object.keys(archiveByYear).sort((a, b) => b.localeCompare(a));

  const sectionHours = stats?.sectionHours ?? {};

  // Client-side search filter
  const filteredPosts = searchQuery
    ? posts.filter(p => {
        const q = searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          (p.excerpt || '').toLowerCase().includes(q) ||
          (labels[p.section || ''] || '').toLowerCase().includes(q)
        );
      })
    : posts;


  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="benchlog-page min-h-screen" style={{ background: 'var(--bl-surface, #f8f9fb)', color: 'var(--bl-on-surface, #191c1e)' }}>
      {/* ━━━ SIDEBAR (slide-in overlay, collapsed by default) ━━━━━━━ */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      />
      {/* Drawer */}
      <div
        className={`fixed left-0 top-0 h-screen w-72 z-50 overflow-y-auto scrollbar-hide transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--bl-surface-low)' }}
      >
        <div className="flex items-center justify-between p-6">
          <div>
            <span className="font-headline font-black text-2xl tracking-tighter block leading-tight" style={{ color: 'var(--bl-on-surface)' }}>
              BenchLog
            </span>
            <span className="font-label text-xs block mt-0.5" style={{ color: 'var(--bl-on-surface-variant)' }}>
              {projectName}
            </span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:opacity-70">
            <MIcon name="close" className="text-xl" style={{ color: 'var(--bl-on-surface)' }} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <Sidebar
            isAuthenticated={isAuthenticated}
            demoMode={demoMode}
            role={role}
            onLogout={logout}
            onShowAbout={() => { setSidebarOpen(false); setShowAbout(true); }}
          />
        </div>
      </div>

      {/* ━━━ MAIN AREA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-col min-h-screen">
        {/* ─── Top Nav (fixed) ──────────────────────────────────────── */}
        <header
          className="fixed top-0 right-0 left-0 z-30 shadow-sm"
          style={{ background: 'var(--bl-surface-low)' }}
        >
          {/* Demo Mode Banner */}
          {demoMode && (
            <div className="px-4 py-2 flex items-center justify-center gap-2 text-sm" style={{ background: 'color-mix(in srgb, var(--bl-tertiary) 15%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--bl-tertiary) 30%, transparent)', color: 'var(--bl-tertiary)' }}>
              <Eye className="w-4 h-4 shrink-0" />
              <span>Demo mode — read only. No data can be created or changed.</span>
            </div>
          )}
          <div className="flex justify-between items-center h-16 px-4 sm:px-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 rounded hover:opacity-70 transition-colors"
                style={{ color: 'var(--bl-on-surface)' }}
              >
                <MIcon name="menu" />
              </button>
              <div>
                <span className="font-headline font-black text-xl tracking-tighter block leading-tight" style={{ color: 'var(--bl-on-surface)' }}>
                  BenchLog
                </span>
                <span className="font-label text-[10px] block" style={{ color: 'var(--bl-on-surface-variant)' }}>
                  {projectName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAuthenticated && (
                <button
                  onClick={() => { setActivePost(null); setView('editor'); }}
                  className="font-label text-[10px] font-bold py-2 px-4 rounded hover:opacity-90 transition-colors flex items-center gap-2 uppercase tracking-wider shadow-sm"
                  style={{ background: 'var(--bl-primary)', color: 'var(--bl-on-primary)' }}
                >
                  <MIcon name="edit_square" className="text-sm" />
                  New Post
                </button>
              )}
            </div>
          </div>
          <div className="h-[1px] w-full" style={{ background: 'var(--bl-surface-high)' }} />
        </header>

        {/* ─── Main Content ────────────────────────────────────────── */}
        <main className={`px-4 sm:px-6 pb-24 md:pb-8 w-full flex-grow mx-auto max-w-7xl ${demoMode ? 'pt-28' : 'pt-20'}`}>

          {/* ─── Post View (inline) ──────────────────────────────── */}
          {view === 'post' && activePost ? (
            <BlogPostView
              post={activePost}
              onBack={() => { setView('list'); setActivePost(null); }}
              onEdit={() => setView('editor')}
              onDeleted={handleSaved}
            />

          /* ─── Editor (inline) ──────────────────────────────────── */
          ) : view === 'editor' ? (
            activePost?.source === 'session' ? (
              <SessionBlogEditor post={activePost} onSave={handleSaved} onCancel={() => { setView(activePost ? 'post' : 'list'); }} />
            ) : (
              <BlogEditor post={activePost ?? undefined} onSave={handleSaved} onCancel={() => { setView(activePost ? 'post' : 'list'); }} />
            )

          /* ─── Feed (default list view) ─────────────────────────── */
          ) : (
            <>
              {/* Quick Stats Bento */}
              <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                <StatCard
                  label="Total Build Sessions"
                  value={String(stats?.sessionCount ?? 0)}
                  accent="primary"
                  sub={stats ? (
                    <span className="font-label text-[10px] mt-2 flex items-center gap-1" style={{ color: 'var(--bl-primary)' }}>
                      <MIcon name="trending_up" className="text-xs" /> {stats.totalHours}h logged
                    </span>
                  ) : null}
                />
                <StatCard
                  label="Hours / Week"
                  value={stats?.hoursPerWeek ? String(stats.hoursPerWeek) : '—'}
                  accent="tertiary"
                  sub={stats?.hoursPerWeek ? (
                    <span className="font-label text-[10px] mt-2 uppercase" style={{ color: 'var(--bl-tertiary)' }}>
                      Avg {(stats.totalHours / Math.max(stats.sessionCount, 1)).toFixed(1)} hrs / session
                    </span>
                  ) : null}
                />
                <div
                  className="p-6 rounded shadow-sm col-span-1 sm:col-span-2 flex flex-col justify-between"
                  style={{ background: 'var(--bl-surface-lowest)' }}
                >
                  <div>
                    <p className="font-label text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--bl-on-surface-variant)' }}>
                      Completion Velocity
                    </p>
                    <div className="h-2 w-full rounded-full mt-2" style={{ background: 'var(--bl-surface-highest)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${stats?.progressPct ?? 0}%`, background: 'var(--bl-primary)' }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-end mt-4">
                    <p className="font-mono text-[10px] uppercase" style={{ color: 'var(--bl-on-surface-variant)' }}>
                      {stats?.estimatedFinish
                        ? `Est. finish: ${new Date(stats.estimatedFinish).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}`
                        : 'Target: ' + (stats?.targetHours ?? 0) + 'h'}
                    </p>
                    <p className="font-label text-lg font-bold" style={{ color: 'var(--bl-primary)' }}>
                      {stats?.progressPct ?? 0}%
                    </p>
                  </div>
                </div>
              </section>

              {/* Search & Filters */}
              <section className="mb-8 flex flex-col lg:flex-row gap-4 items-end">
                <div className="w-full lg:w-1/3">
                  <label className="font-label text-[10px] uppercase mb-2 block ml-1" style={{ color: 'var(--bl-on-surface-variant)' }}>
                    Search Build Logs
                  </label>
                  <div className="relative">
                    <MIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--bl-outline)' }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Keywords: Riveting, Wiring, Torqued..."
                      className="w-full border-none focus:ring-1 py-3 pl-10 text-sm font-body rounded-sm"
                      style={{
                        background: 'var(--bl-surface-highest)',
                        color: 'var(--bl-on-surface)',
                        outlineColor: 'var(--bl-primary)',
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full lg:w-2/3">
                  <div>
                    <label className="font-label text-[10px] uppercase mb-2 block ml-1" style={{ color: 'var(--bl-on-surface-variant)' }}>
                      Assembly Section
                    </label>
                    <select
                      value={
                        filters.plansSection ? `pkg:${filters.plansSection}` :
                        filters.section ? `sec:${filters.section}` : ''
                      }
                      onChange={e => {
                        const val = e.target.value;
                        if (!val) {
                          handleFilterChange({ ...filters, section: undefined, plansSection: undefined });
                        } else if (val.startsWith('pkg:')) {
                          handleFilterChange({ ...filters, section: undefined, plansSection: val.slice(4) });
                        } else if (val.startsWith('sec:')) {
                          handleFilterChange({ ...filters, plansSection: undefined, section: val.slice(4) });
                        }
                      }}
                      className="w-full border-none focus:ring-1 py-3 text-sm font-body rounded-sm"
                      style={{ background: 'var(--bl-surface-highest)', color: 'var(--bl-on-surface)' }}
                    >
                      <option value="">All Sections</option>
                      {sections.map(sec => {
                        const tree = packages[sec.id] || [];
                        const renderItems = (items: FlowItem[], depth: number): React.ReactNode[] =>
                          items.flatMap(item => {
                            const prefix = '\u00A0\u00A0\u00A0\u00A0'.repeat(depth);
                            const num = /^(\d+)/.exec(item.label.trim())?.[1];
                            return [
                              <option key={item.id} value={num ? `pkg:${num}` : `sec:${sec.id}`}>
                                {prefix}{depth > 0 ? '└ ' : ''}{item.label}
                              </option>,
                              ...(item.children ? renderItems(item.children, depth + 1) : []),
                            ];
                          });
                        return [
                          <option key={sec.id} value={`sec:${sec.id}`} style={{ fontWeight: 'bold' }}>
                            {sec.icon} {sec.label}
                          </option>,
                          ...renderItems(tree, 1),
                        ];
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="font-label text-[10px] uppercase mb-2 block ml-1" style={{ color: 'var(--bl-on-surface-variant)' }}>
                      Date Range
                    </label>
                    <select
                      value={filters.year ? (filters.month ? `${filters.year}-${filters.month}` : filters.year) : ''}
                      onChange={e => {
                        const val = e.target.value;
                        if (!val) handleFilterChange({ ...filters, year: undefined, month: undefined });
                        else if (val.includes('-')) {
                          const [y, m] = val.split('-');
                          handleFilterChange({ ...filters, year: y, month: m });
                        } else {
                          handleFilterChange({ ...filters, year: val, month: undefined });
                        }
                      }}
                      className="w-full border-none focus:ring-1 py-3 text-sm font-body rounded-sm"
                      style={{ background: 'var(--bl-surface-highest)', color: 'var(--bl-on-surface)' }}
                    >
                      <option value="">All Time</option>
                      {years.map(y => {
                        const months = archiveByYear[y] || [];
                        return [
                          <option key={y} value={y} style={{ fontWeight: 'bold' }}>
                            {y} ({months.reduce((s, e) => s + e.count, 0)})
                          </option>,
                          ...months.map(entry => (
                            <option key={`${y}-${entry.month}`} value={`${y}-${entry.month}`}>
                              {'\u00A0\u00A0\u00A0\u00A0'}{MONTH_NAMES[parseInt(entry.month)]} ({entry.count})
                            </option>
                          )),
                        ];
                      })}
                    </select>
                  </div>
                  <button
                    onClick={() => { setFilters({}); setSearchQuery(''); }}
                    className="font-label text-xs font-bold py-3 px-4 rounded-sm hover:opacity-80 transition-colors flex items-center justify-center gap-2 col-span-2 md:col-span-1"
                    style={{ background: 'var(--bl-surface-high)', color: 'var(--bl-on-surface-variant)' }}
                  >
                    <MIcon name="tune" className="text-sm" />
                    CLEAR FILTERS
                  </button>
                </div>
              </section>

              {/* ─── Session Feed ──────────────────────────────────── */}
              <div className="space-y-6">
                {filteredPosts.map(post => (
                  <SessionCard
                    key={post.id}
                    post={post}
                    labels={labels}
                    icons={icons}
                    onClick={() => handlePostClick(post)}
                    isAuthenticated={isAuthenticated}
                    onEdit={() => handlePostClick(post)}
                  />
                ))}

                {filteredPosts.length === 0 && (
                  <div className="text-center py-16" style={{ color: 'var(--bl-on-surface-variant)' }}>
                    <MIcon name="receipt_long" className="text-5xl opacity-40" />
                    <p className="mt-3 font-label text-sm">No sessions found</p>
                  </div>
                )}
              </div>

              {/* Load More */}
              {hasMore && !searchQuery && (
                <div className="mt-12 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--bl-on-surface-variant)' }}>
                      {loadingMore ? 'Loading...' : 'Load More Logs'}
                    </span>
                    {!loadingMore && (
                      <MIcon name="keyboard_double_arrow_down" className="group-hover:translate-y-1 transition-transform" style={{ color: 'var(--bl-primary)' }} />
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ━━━ BOTTOM NAV (Mobile) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <nav
        className="fixed bottom-0 w-full z-50 md:hidden backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{ background: 'var(--bl-surface-low)', borderTop: '1px solid var(--bl-surface-high)', opacity: 0.95 }}
      >
        <div className="flex justify-around items-center h-16 w-full px-2">
          <Link to="/tracker" className="flex flex-col items-center pt-2" style={{ color: 'var(--bl-on-surface-variant)' }}>
            <MIcon name="timer" />
            <span className="font-mono text-[10px] uppercase font-bold">Work</span>
          </Link>
          <Link to="/blog" className="flex flex-col items-center pt-2" style={{ color: 'var(--bl-on-surface-variant)' }}>
            <MIcon name="analytics" />
            <span className="font-mono text-[10px] uppercase font-bold">Dash</span>
          </Link>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex flex-col items-center pt-2" style={{ color: 'var(--bl-primary)' }}>
            <MIcon name="receipt_long" />
            <span className="font-mono text-[10px] uppercase font-bold">Logs</span>
          </button>
          <Link to="/expenses" className="flex flex-col items-center pt-2" style={{ color: 'var(--bl-on-surface-variant)' }}>
            <MIcon name="leaderboard" />
            <span className="font-mono text-[10px] uppercase font-bold">Stats</span>
          </Link>
        </div>
      </nav>

      <AboutDialog open={showAbout} onOpenChange={setShowAbout} />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STAT CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StatCard({ label, value, accent, sub }: { label: string; value: string; accent: 'primary' | 'tertiary'; sub: React.ReactNode }) {
  const borderColor = accent === 'primary' ? 'var(--bl-primary)' : 'var(--bl-tertiary)';
  return (
    <div
      className="p-6 rounded shadow-sm"
      style={{ background: 'var(--bl-surface-lowest)', borderLeft: `4px solid ${borderColor}` }}
    >
      <p className="font-label text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--bl-on-surface-variant)' }}>{label}</p>
      <p className="text-4xl font-headline font-black" style={{ color: 'var(--bl-on-surface)' }}>{value}</p>
      {sub}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SESSION / BLOG POST CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SessionCard({
  post, labels, icons, onClick, isAuthenticated, onEdit,
}: {
  post: BlogPost;
  labels: Record<string, string>;
  icons: Record<string, string>;
  onClick: () => void;
  isAuthenticated: boolean;
  onEdit: () => void;
}) {
  const isSession = post.source === 'session';
  const isBlog = post.source === 'blog' || !post.source;
  const allImages = post.imageUrls?.length ? post.imageUrls : (post.contentImageUrls ?? []);

  return (
    <article
      className="group overflow-hidden transition-all hover:translate-x-1 shadow-sm cursor-pointer"
      style={{ background: 'var(--bl-surface-lowest)', border: '1px solid var(--bl-surface-high)' }}
      onClick={onClick}
    >
      <div className="flex flex-col md:flex-row">
        {/* Left date column */}
        <div
          className="md:w-48 p-4 md:p-6 flex md:flex-col justify-between md:justify-start gap-2 shrink-0"
          style={{ background: 'var(--bl-surface-low)' }}
        >
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-tighter" style={{ color: 'var(--bl-primary)' }}>
              {post.publishedAt ? format(new Date(post.publishedAt), 'MMM dd, yyyy') : 'Unknown date'}
            </p>
            {isSession && post.durationMinutes ? (
              <p className="text-2xl font-headline font-extrabold mt-1" style={{ color: 'var(--bl-on-surface)' }}>
                {formatDuration(post.durationMinutes)}
                <span className="text-xs font-label ml-1">HRS</span>
              </p>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <MIcon name="newspaper" className="text-3xl" style={{ color: 'var(--bl-primary)' }} />
              </div>
            )}
          </div>
          <div className="mt-2 md:mt-4">
            {isSession ? (
              <span
                className="px-2 py-1 font-label text-[9px] font-bold rounded uppercase"
                style={{ background: 'color-mix(in srgb, var(--bl-primary) 10%, transparent)', color: 'var(--bl-primary)' }}
              >
                Build Session
              </span>
            ) : (
              <span
                className="px-2 py-1 font-label text-[9px] font-bold rounded uppercase"
                style={{ background: 'color-mix(in srgb, var(--bl-primary) 10%, transparent)', color: 'var(--bl-primary)' }}
              >
                Blog Post
              </span>
            )}
          </div>
        </div>

        {/* Right content */}
        <div className="flex-grow p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-headline font-bold text-lg" style={{ color: 'var(--bl-on-surface)' }}>
                {post.title}
              </h3>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {post.section && (
                  <div className="flex items-center gap-1" style={{ color: 'var(--bl-on-surface-variant)' }}>
                    <MIcon name="precision_manufacturing" className="text-sm" />
                    <span className="font-label text-xs uppercase">
                      {labels[post.section] || post.section}
                    </span>
                  </div>
                )}
                {post.plansReference && (
                  <div
                    className="flex items-center gap-1 border-l pl-3"
                    style={{ color: 'var(--bl-on-surface-variant)', borderColor: 'var(--bl-outline-variant)' }}
                  >
                    <MIcon name="description" className="text-sm" />
                    <span className="font-label text-xs uppercase">{post.plansReference}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {post.excerpt && (
            <p className="text-sm font-body leading-relaxed mb-4 line-clamp-3" style={{ color: 'var(--bl-on-surface-variant)' }}>
              {post.excerpt}
            </p>
          )}

          {/* Images */}
          {allImages.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {allImages.slice(0, 4).map((url, i) => (
                <FeedImage
                  key={i}
                  src={url}
                  className="w-24 h-24 object-cover rounded hover:opacity-80 transition-opacity cursor-zoom-in shrink-0"
                />
              ))}
              {allImages.length > 4 && (
                <div
                  className="w-24 h-24 rounded flex items-center justify-center text-xs font-label font-medium shrink-0"
                  style={{ background: 'var(--bl-surface-high)', color: 'var(--bl-on-surface-variant)' }}
                >
                  +{allImages.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SIDEBAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Sidebar({
  isAuthenticated, demoMode, role, onLogout, onShowAbout,
}: {
  isAuthenticated: boolean;
  demoMode: boolean;
  role: string;
  onLogout: () => void;
  onShowAbout: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* NAVIGATION */}
      <div className="flex flex-col gap-1">
        <div className="font-bold text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--bl-on-surface-variant)' }}>
          Navigation
        </div>
        <Link
          to="/benchlog"
          className="flex items-center gap-3 px-3 py-2.5 rounded transition-colors text-sm font-medium"
          style={{ background: 'color-mix(in srgb, var(--bl-primary) 12%, transparent)', color: 'var(--bl-primary)' }}
        >
          <MIcon name="receipt_long" className="text-xl" />
          Blog
        </Link>
        <Link
          to="/tracker"
          className="flex items-center gap-3 px-3 py-2.5 rounded hover:opacity-80 transition-colors text-sm"
          style={{ color: 'var(--bl-on-surface)' }}
        >
          <MIcon name="timer" className="text-xl" style={{ color: 'var(--bl-on-surface-variant)' }} />
          Tracker
        </Link>
        <Link
          to="/expenses"
          className="flex items-center gap-3 px-3 py-2.5 rounded hover:opacity-80 transition-colors text-sm"
          style={{ color: 'var(--bl-on-surface)' }}
        >
          <MIcon name="account_balance_wallet" className="text-xl" style={{ color: 'var(--bl-on-surface-variant)' }} />
          Expenses
        </Link>
      </div>

      {/* ACCOUNT */}
      <div className="flex flex-col gap-1">
        <div className="font-bold text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--bl-on-surface-variant)' }}>
          Account
        </div>

        {isAuthenticated && !demoMode && (
          <Link
            to="/tracker"
            state={{ openSettings: true }}
            className="flex items-center gap-3 px-3 py-2.5 rounded hover:opacity-80 transition-colors text-sm"
            style={{ color: 'var(--bl-on-surface)' }}
          >
            <MIcon name="settings" className="text-xl" style={{ color: 'var(--bl-on-surface-variant)' }} />
            Settings
          </Link>
        )}

        <button
          onClick={onShowAbout}
          className="flex items-center gap-3 px-3 py-2.5 rounded hover:opacity-80 transition-colors text-sm text-left"
          style={{ color: 'var(--bl-on-surface)' }}
        >
          <MIcon name="info" className="text-xl" style={{ color: 'var(--bl-on-surface-variant)' }} />
          About
        </button>

        {role === 'admin' && isAuthenticated && !demoMode && (
          <Link
            to="/admin"
            className="flex items-center gap-3 px-3 py-2.5 rounded hover:opacity-80 transition-colors text-sm"
            style={{ color: 'var(--bl-on-surface)' }}
          >
            <MIcon name="admin_panel_settings" className="text-xl" style={{ color: 'var(--bl-on-surface-variant)' }} />
            Admin Panel
          </Link>
        )}

        {isAuthenticated && !demoMode && (
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded hover:opacity-80 transition-colors text-sm text-left"
            style={{ color: 'var(--bl-destructive, #c62828)' }}
          >
            <MIcon name="logout" className="text-xl" />
            Sign out
          </button>
        )}

        {!isAuthenticated && !demoMode && (
          <Link
            to="/login"
            state={{ from: '/benchlog' }}
            className="flex items-center gap-3 px-3 py-2.5 rounded hover:opacity-80 transition-colors text-sm"
            style={{ color: 'var(--bl-on-surface)' }}
          >
            <MIcon name="login" className="text-xl" style={{ color: 'var(--bl-on-surface-variant)' }} />
            Log in
          </Link>
        )}
      </div>
    </div>
  );
}
