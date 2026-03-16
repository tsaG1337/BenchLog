import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, PenSquare, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { BlogPostView } from '@/components/blog/BlogPostView';
import { BlogEditor } from '@/components/blog/BlogEditor';
import { BlogStatsBar } from '@/components/blog/BlogStatsBar';
import { fetchBlogPosts, fetchBlogArchive, fetchBlogPost, fetchGeneralSettings, fetchBuildStats, BlogPost, BlogArchiveEntry, BuildStats } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type View = 'list' | 'post' | 'editor';

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [archive, setArchive] = useState<BlogArchiveEntry[]>([]);
  const [view, setView] = useState<View>('list');
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [filters, setFilters] = useState<{ section?: string; year?: string; month?: string }>({});
  const [projectName, setProjectName] = useState('RV-10 Build Tracker');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    fetchGeneralSettings().then(s => setProjectName(s.projectName)).catch(() => {});
  }, []);

  const handlePostClick = async (post: BlogPost) => {
    if (post.source === 'session') {
      // Session posts are already fully loaded
      setActivePost(post);
      setView('post');
      return;
    }
    try {
      const full = await fetchBlogPost(post.id);
      setActivePost({ ...full, source: 'blog' });
      setView('post');
    } catch {
      toast.error('Failed to load post');
    }
  };

  const handleFilterChange = (newFilters: { section?: string; year?: string; month?: string }) => {
    setFilters(newFilters);
    setView('list');
    setSidebarOpen(false);
  };

  const handleSaved = () => {
    setView('list');
    setActivePost(null);
    loadPosts();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 sticky top-0 z-30">
        <div className="container max-w-6xl py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center glow-amber shrink-0">
            <Wrench className="w-5 h-5 text-primary" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground tracking-tight truncate">{projectName} — Blog</h1>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setActivePost(null); setView('editor'); }}>
            <PenSquare className="w-4 h-4" /> New Post
          </Button>
          <Link to="/">
            <Button variant="ghost" size="sm">Tracker</Button>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      <div className="container max-w-6xl py-6">
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
            />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {view === 'list' && (
              <div className="space-y-4">
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
                  onBack={() => { setView('list'); setActivePost(null); }}
                  onEdit={() => setView('editor')}
                  onDeleted={handleSaved}
                />
              </div>
            )}

            {view === 'editor' && (
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
    </div>
  );
}
