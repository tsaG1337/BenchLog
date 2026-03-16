import { BlogPost, deleteBlogPost } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, Trash2, Clock, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

interface BlogPostViewProps {
  post: BlogPost;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

export function BlogPostView({ post, onBack, onEdit, onDeleted }: BlogPostViewProps) {
  const { labels, icons } = useSections();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isSession = post.source === 'session';
  const allImages = post.imageUrls?.length ? post.imageUrls : [];
  const firstImage = allImages[0];
  const extraImages = allImages.slice(1);

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
        {!isSession && (
          <>
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{post.title}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
          {isSession && <Wrench className="w-4 h-4" />}
          <time>{format(new Date(post.publishedAt), 'dd. MMMM yyyy')}</time>
          {post.section && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span>{icons[post.section] || '📋'}</span>
                {labels[post.section] || post.section}
              </span>
            </>
          )}
          {isSession && post.durationMinutes && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatDuration(post.durationMinutes)}
              </span>
            </>
          )}
          {post.plansReference && (
            <>
              <span>·</span>
              <span className="text-xs">Plans: {post.plansReference}</span>
            </>
          )}
        </div>
      </header>

      {/* Main content with first image alongside text (rivetcount style) */}
      {firstImage && (
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/2 shrink-0">
            <img
              src={firstImage}
              alt=""
              className="w-full rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setPreviewUrl(firstImage)}
            />
          </div>
          <div className="flex-1">
            <div
              className="prose prose-invert max-w-none blog-content"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </div>
        </div>
      )}

      {!firstImage && (
        <div
          className="prose prose-invert max-w-none blog-content"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      )}

      {/* Additional images as smaller thumbnails */}
      {extraImages.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {extraImages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                className="w-full aspect-video rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setPreviewUrl(url)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Image preview lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
          />
        </div>
      )}
    </article>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
