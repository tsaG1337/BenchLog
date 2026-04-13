import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/contexts/SectionsContext';
import {
  fetchBlogPosts, fetchBlogArchive, fetchBlogPost, fetchGeneralSettings,
  fetchBuildStats, fetchFlowchartPackages, trackPageView,
  deleteBlogPost, deleteSessionApi,
  type BlogPost, type BlogArchiveEntry, type BuildStats, type PackagesMap, type FlowItem,
} from '@/lib/api';
import { BlogPostView } from '@/components/blog/BlogPostView';
import { BlogEditor } from '@/components/blog/BlogEditor';
import { SessionBlogEditor } from '@/components/blog/SessionBlogEditor';
import { AppShell, MIcon } from '@/components/AppShell';
import { thumbUrl, imageUrl } from '@/lib/utils';
import { Pencil, Trash2, Share2 } from 'lucide-react';
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
export default function BlogPage() {
  const { isAuthenticated } = useAuth();
  const { sections, labels, icons } = useSections();
  const [searchParams] = useSearchParams();
  const { postId } = useParams<{ postId?: string }>();
  const navigate = useNavigate();

  // ─── State ──────────────────────────────────────────────────────
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [archive, setArchive] = useState<BlogArchiveEntry[]>([]);
  const [stats, setStats] = useState<BuildStats | null>(null);
  const [projectName, setProjectName] = useState('BenchLog');
  const [showSessionStats, setShowSessionStats] = useState(true);
  const [filters, setFilters] = useState<Filters>(() => {
    const sec = searchParams.get('section');
    return sec ? { plansSection: sec } : {};
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<View>('list');
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [packages, setPackages] = useState<PackagesMap>({});
  const [blogPrivate, setBlogPrivate] = useState(false);

  // ─── Data fetching ──────────────────────────────────────────────
  const loadPosts = useCallback(async (f: Filters, pageNum = 1, append = false) => {
    try {
      const res = await fetchBlogPosts({ ...f, page: pageNum, limit: 20 });
      setPosts(prev => append ? [...prev, ...res.posts] : res.posts);
      setHasMore(res.hasMore);
      setPage(pageNum);
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes('private')) {
        setBlogPrivate(true);
      } else {
        toast.error('Failed to load posts');
      }
    }
  }, []);

  useEffect(() => { loadPosts(filters); }, [filters, loadPosts]);

  // Deep-link: if the URL contains a postId, open that post on mount.
  useEffect(() => {
    if (!postId) return;
    fetchBlogPost(postId)
      .then(post => { setActivePost(post); setView('post'); })
      .catch(() => toast.error('Post not found'));
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBlogArchive().then(setArchive).catch(() => {});
    fetchGeneralSettings().then(s => { setProjectName(s.projectName); setShowSessionStats(s.blogShowSessionStats ?? true); }).catch(() => {});
    fetchBuildStats().then(setStats).catch(() => {});
    fetchFlowchartPackages().then(setPackages).catch(() => {});
    trackPageView('/blog');
  }, []);

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setView('list');
    setActivePost(null);
  };

  const handlePostClick = async (post: BlogPost) => {
    navigate(`/blog/${post.id}`);
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

  const handleBack = () => {
    navigate('/blog');
    setView('list');
    setActivePost(null);
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await loadPosts(filters, page + 1, true);
    setLoadingMore(false);
  };

  const handleSaved = () => {
    navigate('/blog');
    setView('list');
    setActivePost(null);
    loadPosts(filters);
  };

  const handleShare = (post: BlogPost) => {
    const url = `${window.location.origin}/blog/${post.id}`;
    if (navigator.share) {
      navigator.share({ title: post.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(
        () => toast.success('Link copied to clipboard'),
        () => toast.info(`Copy: ${url}`),
      );
    }
  };

  const handleDeleteFromCard = async (post: BlogPost) => {
    const label = post.source === 'session' ? 'work session' : 'blog post';
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
    try {
      if (post.source === 'session') {
        await deleteSessionApi(post.id.replace(/^session-/, ''));
      } else {
        await deleteBlogPost(post.id);
      }
      setPosts(prev => prev.filter(p => p.id !== post.id));
      toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} deleted`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEditFromCard = async (post: BlogPost) => {
    navigate(`/blog/${post.id}`);
    if (post.source !== 'session') {
      const full = await fetchBlogPost(post.id).catch(() => post);
      setActivePost(full);
    } else {
      setActivePost(post);
    }
    setView('editor');
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


  // ─── Header actions ─────────────────────────────────────────────
  const headerActions = isAuthenticated ? (
    <button
      onClick={() => { setActivePost(null); setView('editor'); }}
      className="font-label text-[10px] font-bold py-2 px-4 rounded hover:opacity-90 transition-colors flex items-center gap-2 uppercase tracking-wider shadow-sm bg-primary text-primary-foreground"
    >
      <MIcon name="edit_square" className="text-sm" />
      New Post
    </button>
  ) : null;

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <AppShell activePage="blog" projectName={projectName} headerRight={headerActions}>

          {blogPrivate && !isAuthenticated ? (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center max-w-lg mx-auto">
              <span className="text-6xl mb-6" role="img" aria-label="lock">🔒</span>
              <h2 className="text-2xl font-bold text-foreground mb-3">Hangar Doors Are Closed</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-2">
                This builder has set their build log to private — no peeking through the hangar windows!
                The rivets, the wiring, the countless hours of sanding… it's all behind closed doors for now.
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed mb-8">
                If this is <em>your</em> build log and you're wondering why it looks empty,
                you'll need to log in first. And if you're just a curious visitor itching to
                start documenting your own build, we've got a spot on the ramp for you.
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
              >
                Create Your Own Build Log
              </a>
            </div>

          ) : view === 'post' && activePost ? (
            <BlogPostView
              post={activePost}
              onBack={handleBack}
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
              {showSessionStats && <section className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-10">
                <StatCard
                  label="Total Sessions"
                  value={String(stats?.sessionCount ?? 0)}
                  accent="primary"
                  sub={stats ? (
                    <span className="font-label text-[10px] mt-1 sm:mt-2 flex items-center gap-1 text-primary">
                      <MIcon name="trending_up" className="text-xs" /> {stats.totalHours}h logged
                    </span>
                  ) : null}
                />
                <StatCard
                  label="Hours / Week"
                  value={stats?.hoursPerWeek ? String(stats.hoursPerWeek) : '—'}
                  accent="tertiary"
                  sub={stats?.hoursPerWeek ? (
                    <span className="font-label text-[10px] mt-1 sm:mt-2 uppercase text-amber-600 dark:text-amber-400">
                      Avg {(stats.totalHours / Math.max(stats.sessionCount, 1)).toFixed(1)}h / session
                    </span>
                  ) : null}
                />
                <div
                  className="p-3 sm:p-6 rounded shadow-sm col-span-2 flex flex-col justify-between bg-card"
                >
                  <div>
                    <p className="font-label text-[10px] sm:text-xs uppercase tracking-wider mb-1 text-muted-foreground">
                      Completion Velocity
                    </p>
                    <div className="h-1.5 sm:h-2 w-full rounded-full mt-1.5 sm:mt-2 bg-accent">
                      <div
                        className="h-full rounded-full transition-all bg-primary"
                        style={{ width: `${stats?.progressPct ?? 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-end mt-2 sm:mt-4">
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">
                      {stats?.estimatedFinish
                        ? `Est. finish: ${new Date(stats.estimatedFinish).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}`
                        : 'Target: ' + (stats?.targetHours ?? 0) + 'h'}
                    </p>
                    <p className="font-label text-sm sm:text-lg font-bold text-primary">
                      {stats?.progressPct ?? 0}%
                    </p>
                  </div>
                </div>
              </section>}

              {/* Search & Filters */}
              <section className="mb-8 flex flex-col lg:flex-row gap-4 items-end">
                <div className="w-full lg:w-1/3">
                  <label className="font-label text-[10px] uppercase mb-2 block ml-1 text-muted-foreground">
                    Search Build Logs
                  </label>
                  <div className="relative">
                    <MIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Keywords: Riveting, Wiring, Torqued..."
                      className="w-full border-none focus:ring-1 focus:ring-primary py-3 pl-10 text-sm font-body rounded-sm bg-accent text-foreground"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full lg:w-2/3">
                  <div>
                    <label className="font-label text-[10px] uppercase mb-2 block ml-1 text-muted-foreground">
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
                      className="w-full border-none focus:ring-1 py-3 text-sm font-body rounded-sm bg-accent text-foreground"
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
                    <label className="font-label text-[10px] uppercase mb-2 block ml-1 text-muted-foreground">
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
                      className="w-full border-none focus:ring-1 py-3 text-sm font-body rounded-sm bg-accent text-foreground"
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
                    className="font-label text-xs font-bold py-3 px-4 rounded-sm hover:opacity-80 transition-colors flex items-center justify-center gap-2 col-span-2 md:col-span-1 bg-accent text-muted-foreground"
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
                    onEdit={() => handleEditFromCard(post)}
                    onDelete={() => handleDeleteFromCard(post)}
                    onShare={() => handleShare(post)}
                  />
                ))}

                {filteredPosts.length === 0 && (
                  <div className="text-center py-16 text-muted-foreground">
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
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {loadingMore ? 'Loading...' : 'Load More Logs'}
                    </span>
                    {!loadingMore && (
                      <MIcon name="keyboard_double_arrow_down" className="group-hover:translate-y-1 transition-transform text-primary" />
                    )}
                  </button>
                </div>
              )}
            </>
          )}
    </AppShell>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STAT CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StatCard({ label, value, accent, sub }: { label: string; value: string; accent: 'primary' | 'tertiary'; sub: React.ReactNode }) {
  return (
    <div
      className={`p-3 sm:p-6 rounded shadow-sm bg-card border-l-4 ${accent === 'primary' ? 'border-primary' : 'border-amber-500'}`}
    >
      <p className="font-label text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1 text-muted-foreground">{label}</p>
      <p className="text-2xl sm:text-4xl font-headline font-black text-foreground">{value}</p>
      {sub}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SESSION / BLOG POST CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SessionCard({
  post, labels, icons, onClick, isAuthenticated, onEdit, onDelete, onShare,
}: {
  post: BlogPost;
  labels: Record<string, string>;
  icons: Record<string, string>;
  onClick: () => void;
  isAuthenticated: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const isSession = post.source === 'session';
  const isBlog = post.source === 'blog' || !post.source;
  const allImages = post.imageUrls?.length ? post.imageUrls : (post.contentImageUrls ?? []);

  return (
    <article
      className="group overflow-hidden transition-all hover:translate-x-1 shadow-sm cursor-pointer bg-card rounded-lg"
      onClick={onClick}
    >
      <div className="flex flex-col md:flex-row">
        {/* Left date column */}
        <div
          className="md:w-48 p-4 md:p-6 flex md:flex-col justify-between md:justify-start gap-2 shrink-0 bg-muted"
        >
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-tighter text-primary">
              {post.publishedAt ? format(new Date(post.publishedAt), 'MMM dd, yyyy') : 'Unknown date'}
            </p>
            {isSession && post.durationMinutes ? (
              <p className="text-2xl font-headline font-extrabold mt-1 text-foreground">
                {formatDuration(post.durationMinutes)}
                <span className="text-xs font-label ml-1">HRS</span>
              </p>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <MIcon name="newspaper" className="text-3xl text-primary" />
              </div>
            )}
          </div>
          <div className="mt-2 md:mt-4">
            {isSession ? (
              <span
                className="px-2 py-1 font-label text-[9px] font-bold rounded uppercase bg-primary/10 text-primary"
              >
                Build Session
              </span>
            ) : (
              <span
                className="px-2 py-1 font-label text-[9px] font-bold rounded uppercase bg-primary/10 text-primary"
              >
                Blog Post
              </span>
            )}
          </div>
        </div>

        {/* Right content */}
        <div className="flex-grow p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="font-headline font-bold text-lg text-foreground">
                {post.title}
              </h3>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {post.section && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MIcon name="precision_manufacturing" className="text-sm" />
                    <span className="font-label text-xs uppercase">
                      {labels[post.section] || post.section}
                    </span>
                  </div>
                )}
                {post.plansReference && (
                  <div className="flex items-center gap-1 border-l pl-3 text-muted-foreground border-border">
                    <MIcon name="description" className="text-sm" />
                    <span className="font-label text-xs uppercase">{post.plansReference}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Action buttons */}
            <div
              className="flex items-center gap-1 shrink-0 self-start"
              onClick={e => e.stopPropagation()}
            >
              {isAuthenticated && (
                <>
                  <button
                    onClick={onEdit}
                    title="Edit"
                    className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onDelete}
                    title="Delete"
                    className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={onShare}
                title="Share"
                className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {post.excerpt && (
            <p className="text-sm font-body leading-relaxed mb-4 line-clamp-3 text-muted-foreground">
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
                  className="w-24 h-24 rounded flex items-center justify-center text-xs font-label font-medium shrink-0 bg-accent text-muted-foreground"
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

