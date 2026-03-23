import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Wrench, PenSquare, Menu, X, Timer, LogIn, Eye, LogOut, Settings, Wallet, Info, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AboutDialog } from '@/components/AboutDialog';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { BlogPostView } from '@/components/blog/BlogPostView';
import { BlogEditor } from '@/components/blog/BlogEditor';
import { SessionBlogEditor } from '@/components/blog/SessionBlogEditor';
import { BlogStatsBar } from '@/components/blog/BlogStatsBar';
import { BlogSearchBar } from '@/components/blog/BlogSearchBar';
import { fetchBlogPosts, fetchBlogArchive, fetchBlogPost, fetchGeneralSettings, fetchBuildStats, trackPageView, BlogPost, BlogArchiveEntry, BuildStats } from '@/lib/api';
import { isElectron } from '@/lib/env';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/contexts/SectionsContext';
import { toast } from 'sonner';

type View = 'list' | 'post' | 'editor';

export default function BlogPage() {
  const { postId } = useParams<{ postId?: string }>();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [archive, setArchive] = useState<BlogArchiveEntry[]>([]);
  const [view, setView] = useState<View>('list');
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [filters, setFilters] = useState<{ section?: string; year?: string; month?: string; plansSection?: string }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectName, setProjectName] = useState('Build Tracker');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [stats, setStats] = useState<BuildStats | null>(null);
  const [blogShowActivity, setBlogShowActivity] = useState(true);
  const [blogShowStats, setBlogShowStats] = useState(true);
  const [blogShowProgress, setBlogShowProgress] = useState(true);
  const { isAuthenticated, demoMode, logout } = useAuth();
  const { labels: sectionLabels } = useSections();

  const loadPosts = useCallback(async () => {
    try {
      const [postsData, archiveData] = await Promise.all([
        fetchBlogPosts(filters),
        fetchBlogArchive(),
      ]);
      setPosts(postsData);
      setArchive(archiveData);
    } catch (err: any) {
      toast.error('Failed to load posts');
    }
  }, [filters]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    fetchGeneralSettings().then(s => {
      setProjectName(s.projectName);
      setBlogShowActivity(s.blogShowActivity ?? true);
      setBlogShowStats(s.blogShowStats ?? true);
      setBlogShowProgress(s.blogShowProgress ?? true);
    }).catch(() => {});
    fetchBuildStats().then(setStats).catch(() => {});
  }, []);

  // Open post from URL param on initial load
  useEffect(() => {
    if (!postId) return;
    if (postId.startsWith('session-')) {
      // Session posts are in the list — wait for posts to load then find it
      return;
    }
    fetchBlogPost(postId)
      .then(full => { setActivePost({ ...full, source: 'blog' }); setView('post'); })
      .catch(() => { toast.error('Post not found'); navigate('/blog', { replace: true }); });
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  // For session posts: once posts are loaded, find and open the session post from URL
  useEffect(() => {
    if (!postId?.startsWith('session-') || posts.length === 0 || activePost) return;
    const found = posts.find((p: BlogPost) => p.id === postId);
    if (found) { setActivePost(found); setView('post'); }
    else { toast.error('Post not found'); navigate('/blog', { replace: true }); }
  }, [postId, posts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activePost) document.title = `${activePost.title} — ${projectName}`;
    else if (projectName) document.title = `${projectName} — Blog`;
  }, [activePost, projectName]);

  // Close search panel on Escape
  useEffect(() => {
    if (searchOpen) {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [searchOpen]);

  // Track blog list view once on initial mount (web only — Cloudflare header not present in Electron)
  useEffect(() => { if (!isElectron) trackPageView('/blog', undefined, document.referrer); }, []);

  // Track individual post views
  useEffect(() => {
    if (!isElectron && view === 'post' && activePost) {
      trackPageView(`/blog/${activePost.id}`, activePost.id);
    }
  }, [view, activePost?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPost = (post: BlogPost) => {
    setActivePost(post);
    setView('post');
    navigate(`/blog/${post.id}`, { replace: false });
  };

  const handlePostClick = async (post: BlogPost) => {
    if (post.source === 'session') {
      openPost(post);
      return;
    }
    try {
      const full = await fetchBlogPost(post.id);
      openPost({ ...full, source: 'blog' });
    } catch {
      toast.error('Failed to load post');
    }
  };

  const handleBack = () => {
    setView('list');
    setActivePost(null);
    navigate('/blog', { replace: false });
  };

  const handleFilterChange = (newFilters: { section?: string; year?: string; month?: string; plansSection?: string }) => {
    setFilters(newFilters);
    setView('list');
    setActivePost(null);
    navigate('/blog', { replace: false });
    setSidebarOpen(false);
  };

  const handleSaved = () => {
    setView('list');
    setActivePost(null);
    navigate('/blog', { replace: false });
    loadPosts();
  };

  const hasActiveFilters = !!(searchQuery.trim() || filters.section || filters.plansSection || filters.year);

  // Client-side text filter applied on top of server-fetched posts
  const filteredPosts = posts.filter(post => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    // Include resolved section label so e.g. "Empennage" matches empennage posts
    const sectionLabel = post.section ? (sectionLabels[post.section] ?? post.section) : '';
    const text = [
      post.title,
      post.content?.replace(/<[^>]+>/g, ' ') ?? '',
      post.plansReference ?? '',
      sectionLabel,
    ].join(' ').toLowerCase();
    return text.includes(q);
  });

  return (
    <div className="min-h-screen bg-background">
      {demoMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <Eye className="w-4 h-4 shrink-0" />
          <span>Demo mode — read only. No data can be created or changed.</span>
        </div>
      )}
      <header className="border-b border-border bg-card/50 sticky top-0 z-30 backdrop-blur-sm">
        {/* Main header row */}
        <div className="container max-w-7xl py-3 flex items-center gap-3">
          <Link to="/" className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center glow-amber shrink-0">
            <Wrench className="w-4 h-4 text-primary" />
          </Link>

          <h1 className="flex-1 min-w-0 text-base font-bold text-foreground tracking-tight truncate">
            {projectName} — Blog
          </h1>

          {/* Search toggle button */}
          <button
            onClick={() => setSearchOpen(o => !o)}
            className={`relative inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors shrink-0 ${
              searchOpen
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            aria-label="Search"
          >
            {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            {/* Active filter dot */}
            {!searchOpen && hasActiveFilters && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
            )}
          </button>

          {/* Hamburger menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
                <Menu className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {/* Sidebar toggle — mobile only */}
              <DropdownMenuItem className="lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
                {sidebarOpen ? <><X className="w-4 h-4 mr-2" /> Close sidebar</> : <><Menu className="w-4 h-4 mr-2" /> Sections & Archive</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="lg:hidden" />
              {/* Page-specific actions */}
              {isAuthenticated && (
                <DropdownMenuItem onClick={() => { setActivePost(null); setView('editor'); }}>
                  <PenSquare className="w-4 h-4 mr-2" /> New Post
                </DropdownMenuItem>
              )}
              {isAuthenticated && <DropdownMenuSeparator />}
              {/* Navigation */}
              <DropdownMenuItem asChild>
                <Link to={isAuthenticated ? '/' : '/login'} state={{ from: '/blog' }} className="flex items-center w-full">
                  {isAuthenticated
                    ? <><Timer className="w-4 h-4 mr-2" /> Build Tracker</>
                    : <><LogIn className="w-4 h-4 mr-2" /> Login</>}
                </Link>
              </DropdownMenuItem>
              {isAuthenticated && (
                <DropdownMenuItem asChild>
                  <Link to="/expenses" className="flex items-center w-full">
                    <Wallet className="w-4 h-4 mr-2" /> Expenses
                  </Link>
                </DropdownMenuItem>
              )}
              {/* Settings */}
              {isAuthenticated && !demoMode && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/tracker" state={{ openSettings: true }} className="flex items-center w-full">
                      <Settings className="w-4 h-4 mr-2" /> Settings
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              {/* About */}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowAbout(true)}>
                <Info className="w-4 h-4 mr-2" /> About
              </DropdownMenuItem>
              {/* Sign out */}
              {isAuthenticated && !demoMode && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Slide-down filter panel */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${searchOpen ? 'max-h-64' : 'max-h-0'}`}>
          <div className="border-t border-border/60 bg-card/80 backdrop-blur-sm">
            <div className="container max-w-7xl px-4 py-4">
              <BlogSearchBar
                query={searchQuery}
                onQueryChange={q => { setSearchQuery(q); handleFilterChange({ ...filters, plansSection: undefined }); }}
                onPlansSectionChange={plansSection => handleFilterChange({ ...filters, plansSection })}
                onSearch={() => setSearchOpen(false)}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="container max-w-7xl py-6">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className={`
            ${sidebarOpen ? 'fixed inset-0 z-20 bg-background/95 p-6 pt-20 overflow-auto lg:relative lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0 lg:pt-0' : 'hidden'}
            lg:block lg:w-56 lg:shrink-0
          `}>
            <BlogSidebar
              archive={archive}
              activeSection={filters.section}
              activeYear={filters.year}
              activeMonth={filters.month}
              onFilterChange={handleFilterChange}
              projectName={projectName}
              sectionHours={stats?.sectionHours ?? {}}
              showActivity={blogShowActivity}
            />
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            {/* Build stats bar */}
            {blogShowStats && <BlogStatsBar stats={stats} showProgress={blogShowProgress} />}

            {view === 'list' && (
              <div className="space-y-4">
                {/* Active filter chips */}
                {hasActiveFilters && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Filtered:</span>
                    {searchQuery && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-medium">
                        "{searchQuery}"
                        <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {filters.section && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-xs text-primary font-medium">
                        {filters.section}
                        <button onClick={() => handleFilterChange({ ...filters, section: undefined })} className="hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {filters.plansSection && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-xs text-primary font-medium">
                        Plans §{filters.plansSection}
                        <button onClick={() => setFilters(f => { const { plansSection, ...rest } = f; return rest; })} className="hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {filters.year && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-medium">
                        {filters.month ? `${filters.month}/${filters.year}` : filters.year}
                        <button onClick={() => setFilters(f => { const { year, month, ...rest } = f; return rest; })} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                  </div>
                )}

                {filteredPosts.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    {posts.length === 0 ? (
                      <>
                        <p className="text-lg">No blog posts yet</p>
                        <p className="text-sm mt-1">Create your first build log entry!</p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg">No posts match</p>
                        <p className="text-sm mt-1">Try a different search term or clear the filters.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {filteredPosts.map(post => (
                      <BlogPostCard key={post.id} post={post} onClick={() => handlePostClick(post)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'post' && activePost && (
              <div className="bg-card border border-border rounded-xl p-6 md:p-8">
                <BlogPostView
                  post={activePost}
                  onBack={handleBack}
                  onEdit={() => setView('editor')}
                  onDeleted={handleSaved}
                />
              </div>
            )}

            {view === 'editor' && activePost?.source === 'session' && (
              <div className="bg-card border border-border rounded-xl p-6 md:p-8">
                <SessionBlogEditor
                  post={activePost}
                  onSave={handleSaved}
                  onCancel={() => setView('post')}
                />
              </div>
            )}

            {view === 'editor' && activePost?.source !== 'session' && (
              <div className="bg-card border border-border rounded-xl p-6 md:p-8">
                <BlogEditor
                  post={activePost || undefined}
                  onSave={handleSaved}
                  onCancel={() => { setView(activePost ? 'post' : 'list'); }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <AboutDialog open={showAbout} onOpenChange={setShowAbout} />
    </div>
  );
}
