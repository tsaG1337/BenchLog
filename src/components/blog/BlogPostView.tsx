import { BlogPost, deleteBlogPost } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface BlogPostViewProps {
  post: BlogPost;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

export function BlogPostView({ post, onBack, onEdit, onDeleted }: BlogPostViewProps) {
  const { labels, icons } = useSections();

  const handleDelete = async () => {
    if (!confirm('Delete this post?')) return;
    try {
      await deleteBlogPost(post.id);
      toast.success('Post deleted');
      onDeleted();
    } catch (err: any) {
      toast.error('Failed to delete: ' + err.message);
    }
  };

  return (
    <article className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{post.title}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <time>{format(new Date(post.publishedAt), 'MMMM d, yyyy')}</time>
          {post.section && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span>{icons[post.section] || '📋'}</span>
                {labels[post.section] || post.section}
              </span>
            </>
          )}
        </div>
      </header>

      <div
        className="prose prose-invert max-w-none blog-content"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
    </article>
  );
}
