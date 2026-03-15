import { BlogPost } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { format } from 'date-fns';
import { Clock, Wrench } from 'lucide-react';

interface BlogPostCardProps {
  post: BlogPost;
  onClick: () => void;
}

export function BlogPostCard({ post, onClick }: BlogPostCardProps) {
  const { labels, icons } = useSections();

  const allImages = post.imageUrls?.length
    ? post.imageUrls
    : extractAllImages(post.content);

  const firstImage = allImages[0];
  const extraImages = allImages.slice(1, 4);
  const isSession = post.source === 'session';
  const textContent = stripHtml(post.content);

  return (
    <article
      onClick={onClick}
      className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/40 transition-colors group"
    >
      <div className="p-5 space-y-3">
        {/* Meta line */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isSession && <Wrench className="w-3 h-3" />}
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
                <Clock className="w-3 h-3" />
                {formatDuration(post.durationMinutes)}
              </span>
            </>
          )}
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-tight">
          {post.title}
        </h2>

        {/* Content area: image left, text right (rivetcount style) */}
        {(firstImage || textContent) && (
          <div className="flex gap-4">
            {firstImage && (
              <div className="w-40 h-40 shrink-0 rounded-lg overflow-hidden bg-secondary">
                <img
                  src={firstImage}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {textContent && (
                <p className="text-sm text-muted-foreground line-clamp-6 leading-relaxed">
                  {textContent.slice(0, 400)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Extra image thumbnails */}
        {extraImages.length > 0 && (
          <div className="flex gap-2 pt-1">
            {extraImages.map((url, i) => (
              <div key={i} className="w-16 h-16 rounded-md overflow-hidden bg-secondary shrink-0">
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            {allImages.length > 4 && (
              <div className="w-16 h-16 rounded-md bg-secondary/60 flex items-center justify-center text-xs text-muted-foreground font-medium shrink-0">
                +{allImages.length - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function extractAllImages(html: string): string[] {
  const matches = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)];
  return matches.map(m => m[1]);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
