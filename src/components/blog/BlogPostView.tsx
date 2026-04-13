import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { BlogPost, deleteBlogPost, deleteSessionApi } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, Trash2, Clock, Wrench, X, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { BlockRenderer, parseTipTapContent, extractImagesFromJson } from './editor/BlockRenderer';

interface BlogPostViewProps {
  post: BlogPost;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

// ── Split HTML content at <img> tags so each image can be rendered separately.
type Segment = { type: 'html'; content: string } | { type: 'image'; src: string; style: string };

function parseSegments(html: string | undefined): Segment[] {
  if (!html) return [];
  const segments: Segment[] = [];
  const imgRe = /<img([^>]*)>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    if (m.index > last) segments.push({ type: 'html', content: html.slice(last, m.index) });
    const attrs = m[1];
    const src   = attrs.match(/src="([^"]+)"/)?.[1]   ?? '';
    const style = attrs.match(/style="([^"]+)"/)?.[1] ?? '';
    if (src && /^(https?:\/\/|\/)/i.test(src)) segments.push({ type: 'image', src, style });
    last = m.index + m[0].length;
  }
  if (last < html.length) segments.push({ type: 'html', content: html.slice(last) });
  return segments;
}

export function BlogPostView({ post, onBack, onEdit, onDeleted }: BlogPostViewProps) {
  const { labels, icons } = useSections();
  const { isAuthenticated } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isSession = post.source === 'session';

  // Detect content format: TipTap JSON or legacy HTML
  const tipTapContent = useMemo(() => parseTipTapContent(post.content), [post.content]);
  const isJsonContent = tipTapContent !== null;

  // For work sessions, images come from post.imageUrls (separate from content).
  // For blog posts, images are embedded in the content — imageUrls is only for server tracking.
  const isSafeImageUrl = (url: string) => /^(https?:\/\/|\/)/i.test(url);
  const sessionImages  = isSession && post.imageUrls?.length ? post.imageUrls.filter(isSafeImageUrl) : [];
  const contentSegments = useMemo(() => isJsonContent ? [] : parseSegments(post.content), [post.content, isJsonContent]);

  const handleShare = () => {
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

  const handleDelete = async () => {
    if (isSession) {
      const confirmed = confirm(
        '\u26a0\ufe0f This is a work session, not just a blog post.\n\n' +
        'Deleting it will permanently remove the session and subtract its hours from your build progress.\n\n' +
        'Are you sure you want to delete this session?'
      );
      if (!confirmed) return;
      try {
        const sessionId = post.id.replace(/^session-/, '');
        await deleteSessionApi(sessionId);
        toast.success('Work session deleted');
        onDeleted();
      } catch (err: any) {
        toast.error('Failed to delete: ' + err.message);
      }
    } else {
      if (!confirm('Delete this post?')) return;
      try {
        await deleteBlogPost(post.id);
        toast.success('Post deleted');
        onDeleted();
      } catch (err: any) {
        toast.error('Failed to delete: ' + err.message);
      }
    }
  };

  // ── Render blog post content ──────────────────────────────────────
  const renderContent = () => {
    // TipTap JSON content → use BlockRenderer
    if (isJsonContent && tipTapContent) {
      return (
        <BlockRenderer
          content={tipTapContent}
          onImageClick={(src) => setPreviewUrl(src)}
        />
      );
    }

    // Legacy HTML content → segment-based rendering
    return (
      <div className="prose prose-invert max-w-none blog-content">
        {contentSegments.map((seg, i) =>
          seg.type === 'html' ? (
            <div key={i} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(seg.content.replace(/&nbsp;/g, ' '), { FORBID_TAGS: ['style', 'form'], FORBID_ATTR: ['style'] }) }} />
          ) : (
            <div key={i} className="my-4 clear-both">
              <div className="inline-block max-w-full" ref={el => {
                if (el && seg.style) {
                  // Only allow safe CSS properties — block url(), position, etc.
                  const safe = seg.style.split(';').filter(s => {
                    const prop = s.split(':')[0]?.trim().toLowerCase() || '';
                    return /^(width|max-width|height|float|margin|margin-left|margin-right|display|text-align)$/.test(prop)
                      && !/url\s*\(/i.test(s);
                  }).join(';');
                  if (safe) el.style.cssText = safe;
                }
              }}>
                <img
                  src={seg.src}
                  alt=""
                  className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity w-full h-auto"
                  onClick={() => setPreviewUrl(seg.src)}
                />
              </div>
            </div>
          )
        )}
      </div>
    );
  };

  // ── Work-session layout: first image alongside content, grid for rest ──
  const firstImage  = sessionImages[0];
  const extraImages = sessionImages.slice(1);

  return (
    <article className="space-y-5 min-w-0">
      <header>
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2 shrink-0 mt-0.5">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="flex-1 text-2xl md:text-3xl font-bold text-foreground leading-tight">{post.title}</h1>
          <div className="flex items-center gap-1 shrink-0">
            {isAuthenticated && (
              <>
                <Button variant="ghost" size="icon" onClick={onEdit}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={handleShare} title="Share">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap mt-1 ml-8">
          {isSession && <Wrench className="w-4 h-4" />}
          <time>{format(new Date(post.publishedAt), 'dd. MMMM yyyy')}</time>
          {post.section && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span>{icons[post.section] || '\ud83d\udccb'}</span>
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

      {/* Work session: first image alongside text */}
      {firstImage ? (
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/2 shrink-0">
            <img
              src={firstImage}
              alt=""
              className="w-full rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setPreviewUrl(firstImage)}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="prose prose-invert max-w-none blog-content"
                 dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content, { FORBID_TAGS: ['style', 'form'], FORBID_ATTR: ['style'] }) }} />
          </div>
        </div>
      ) : (
        renderContent()
      )}

      {/* Work session: extra images grid */}
      {extraImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {extraImages.map((url, i) => (
            <div key={i}>
              <img
                src={url}
                alt=""
                className="w-full aspect-video rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setPreviewUrl(url)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt=""
            className="max-w-full max-h-[90vh] rounded-lg object-contain block"
          />
          <div className="absolute top-4 right-4">
            <button
              onClick={() => setPreviewUrl(null)}
              className="w-10 h-10 bg-card/80 rounded-full flex items-center justify-center text-foreground hover:bg-card transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
