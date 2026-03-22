import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Wrench, PenSquare, Menu, X, Timer, LogIn, Eye, LogOut, Settings, Wallet, Info } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AboutDialog } from '@/components/AboutDialog';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { BlogPostView } from '@/components/blog/BlogPostView';
import { BlogEditor } from '@/components/blog/BlogEditor';
import { SessionBlogEditor } from '@/components/blog/SessionBlogEditor';
import { BlogStatsBar } from '@/components/blog/BlogStatsBar';
import { fetchBlogPosts, fetchBlogArchive, fetchBlogPost, fetchGeneralSettings, fetchBuildStats, BlogPost, BlogArchiveEntry, BuildStats } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
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
  const [projectName, setProjectName] = useState('Build Tracker');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [stats, setStats] = useState<BuildStats | null>(null);
  const [blogShowActivity, setBlogShowActivity] = useState(true);
  const [blogShowStats, setBlogShowStats] = useState(true);
  const [blogShowProgress, setBlogShowProgress] = useState(true);
  const { isAuthenticated, demoMode, logout } = useAuth();

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

  return (
    <div className="min-h-screen bg-background">
      {demoMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <Eye className="w-4 h-4 shrink-0" />
          <span>Demo mode — read only. No data can be created or changed.</span>
        </div>
      )}
      <header className="border-b border-border bg-card/50 sticky top-0 z-30">
        <div className="container max-w-7xl py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center glow-amber shrink-0">
            <Wrench className="w-5 h-5 text-primary" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground tracking-tight truncate">{projectName} — Blog</h1>
          </div>
          {/* Action dropdown */}
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
              {isAuthenticated && !demoMode && (
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
                {filters.plansSection && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Filtering by:</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-xs text-primary font-medium">
                      Plans Section {filters.plansSection}
                      <button onClick={() => setFilters(f => { const { plansSection, ...rest } = f; return rest; })} className="hover:text-foreground transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                )}
                {posts.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p className="text-lg">No blog posts yet</p>
                    <p className="text-sm mt-1">Create your first build log entry!</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {posts.map(post => (
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
