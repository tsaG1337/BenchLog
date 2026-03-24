import { useEffect, useMemo, useState } from 'react';
import { BlogPost, deleteBlogPost, deleteSessionApi, fetchAnnotations, ImageAnnotation } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, Trash2, Clock, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { ImageAnnotationViewer } from '@/components/ImageAnnotationViewer';

interface BlogPostViewProps {
  post: BlogPost;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

// ── Split HTML content at <img> tags so each image can be wrapped with
//    ImageAnnotationViewer while text segments keep dangerouslySetInnerHTML.
type Segment = { type: 'html'; content: string } | { type: 'image'; src: string; style: string };

function parseSegments(html: string): Segment[] {
  const segments: Segment[] = [];
  const imgRe = /<img([^>]*)>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    if (m.index > last) segments.push({ type: 'html', content: html.slice(last, m.index) });
    const attrs = m[1];
    const src   = attrs.match(/src="([^"]+)"/)?.[1]   ?? '';
    const style = attrs.match(/style="([^"]+)"/)?.[1] ?? '';
    if (src) segments.push({ type: 'image', src, style });
    last = m.index + m[0].length;
  }
  if (last < html.length) segments.push({ type: 'html', content: html.slice(last) });
  return segments;
}

export function BlogPostView({ post, onBack, onEdit, onDeleted }: BlogPostViewProps) {
  const { labels, icons } = useSections();
  const { isAuthenticated } = useAuth();
  const [previewUrl,    setPreviewUrl]    = useState<string | null>(null);
  const [annotationsMap, setAnnotationsMap] = useState<Record<string, ImageAnnotation[]>>({});

  const isSession = post.source === 'session';

  // For work sessions, images come from post.imageUrls.
  // For blog posts, images are embedded in the Quill HTML content.
  const sessionImages  = post.imageUrls?.length ? post.imageUrls : [];
  const contentSegments = useMemo(() => parseSegments(post.content), [post.content]);
  const contentImages   = useMemo(
    () => contentSegments.filter(s => s.type === 'image').map(s => (s as { type: 'image'; src: string; style: string }).src),
    [contentSegments],
  );

  // All unique image URLs we need annotations for
  const allImageUrls = useMemo(
    () => [...new Set([...sessionImages, ...contentImages])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [post.id],
  );

  useEffect(() => {
    allImageUrls.forEach(url => {
      fetchAnnotations(url).then(anns => {
        setAnnotationsMap(prev => ({ ...prev, [url]: anns }));
      }).catch(() => {});
    });
  }, [post.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (isSession) {
      const confirmed = confirm(
        '⚠️ This is a work session, not just a blog post.\n\n' +
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

  const previewAnnotations = previewUrl ? (annotationsMap[previewUrl] ?? []) : [];

  // ── Render blog post content, replacing <img> with annotated viewers ──
  const renderContent = () => (
    <div className="prose prose-invert max-w-none blog-content">
      {contentSegments.map((seg, i) =>
        seg.type === 'html' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: seg.content.replace(/&nbsp;/g, ' ') }} />
        ) : (
          <div key={i} className="my-4 clear-both">
            <ImageAnnotationViewer
              src={seg.src}
              annotations={annotationsMap[seg.src] ?? []}
              imgClassName="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              containerClassName="inline-block max-w-full"
              style={seg.style}
              onClick={() => setPreviewUrl(seg.src)}
            />
          </div>
        )
      )}
    </div>
  );

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
          {isAuthenticated && (
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap mt-1 ml-8">
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

      {/* Work session: first image alongside text */}
      {firstImage ? (
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/2 shrink-0">
            <ImageAnnotationViewer
              src={firstImage}
              annotations={annotationsMap[firstImage] ?? []}
              imgClassName="w-full rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
              containerClassName="w-full"
              onClick={() => setPreviewUrl(firstImage)}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="prose prose-invert max-w-none blog-content"
                 dangerouslySetInnerHTML={{ __html: post.content }} />
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
              <ImageAnnotationViewer
                src={url}
                annotations={annotationsMap[url] ?? []}
                imgClassName="w-full aspect-video rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                containerClassName="w-full"
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
          <ImageAnnotationViewer
            src={previewUrl}
            annotations={previewAnnotations}
            imgClassName="max-w-full max-h-[90vh] rounded-lg object-contain block"
            containerClassName="max-w-full"
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
