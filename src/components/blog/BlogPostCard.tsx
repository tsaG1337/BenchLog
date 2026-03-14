import { BlogPost } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { format } from 'date-fns';

interface BlogPostCardProps {
  post: BlogPost;
  onClick: () => void;
}

export function BlogPostCard({ post, onClick }: BlogPostCardProps) {
  const { labels, icons } = useSections();

  // Extract first image from content or imageUrls for thumbnail
  const thumbnail = post.imageUrls?.[0] || extractFirstImage(post.content);

  return (
    <article
      onClick={onClick}
      className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/40 transition-colors group"
    >
      {thumbnail && (
        <div className="aspect-video overflow-hidden bg-secondary">
          <img src={thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      )}
      <div className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
        <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-tight">
          {post.title}
        </h2>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {stripHtml(post.content).slice(0, 200)}
        </p>
      </div>
    </article>
  );
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function extractFirstImage(html: string): string | undefined {
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  return match?.[1];
}
