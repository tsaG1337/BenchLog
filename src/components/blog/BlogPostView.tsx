import { useEffect, useState } from 'react';
import { BlogPost, deleteBlogPost, fetchAnnotations, ImageAnnotation } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, Trash2, Clock, Wrench, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { thumbUrl } from '@/lib/utils';
import { ImageAnnotationViewer } from '@/components/ImageAnnotationViewer';
import { ImageAnnotationEditor } from '@/components/ImageAnnotationEditor';

interface BlogPostViewProps {
  post: BlogPost;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

export function BlogPostView({ post, onBack, onEdit, onDeleted }: BlogPostViewProps) {
  const { labels, icons } = useSections();
  const { isAuthenticated } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [annotationsMap, setAnnotationsMap] = useState<Record<string, ImageAnnotation[]>>({});
  const [annotatingUrl, setAnnotatingUrl] = useState<string | null>(null);

  const isSession = post.source === 'session';
  const allImages = post.imageUrls?.length ? post.imageUrls : [];
  const firstImage = allImages[0];
  const extraImages = allImages.slice(1);

  // Load annotations for all images in this post
  useEffect(() => {
    allImages.forEach(url => {
      fetchAnnotations(url).then(anns => {
        setAnnotationsMap(prev => ({ ...prev, [url]: anns }));
      }).catch(() => {});
    });
  }, [post.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const previewAnnotations = previewUrl ? (annotationsMap[previewUrl] ?? []) : [];

  return (
    <article className="space-y-5">
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
              {!isSession && (
                <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
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

      {/* Main content with first image alongside text */}
      {firstImage && (
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/2 shrink-0 group relative">
            <ImageAnnotationViewer
              src={thumbUrl(firstImage)}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = firstImage; }}
              annotations={annotationsMap[firstImage] ?? []}
              imgClassName="w-full rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
              containerClassName="w-full"
              onClick={() => setPreviewUrl(firstImage)}
            />
            {isAuthenticated && (
              <button
                onClick={() => setAnnotatingUrl(firstImage)}
                className="absolute top-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Annotate
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
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

      {/* Additional images */}
      {extraImages.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {extraImages.map((url, i) => (
              <div key={i} className="group relative">
                <ImageAnnotationViewer
                  src={thumbUrl(url)}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = url; }}
                  annotations={annotationsMap[url] ?? []}
                  imgClassName="w-full aspect-video rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                  containerClassName="w-full"
                  onClick={() => setPreviewUrl(url)}
                />
                {isAuthenticated && (
                  <button
                    onClick={() => setAnnotatingUrl(url)}
                    className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Annotate
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox with annotation overlay */}
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
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={(e) => { e.stopPropagation(); setAnnotatingUrl(previewUrl); setPreviewUrl(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/90 text-primary-foreground text-sm rounded-full hover:bg-primary transition-colors"
              >
                <Tag className="w-3.5 h-3.5" /> Annotate
              </button>
            )}
            <button
              onClick={() => setPreviewUrl(null)}
              className="w-10 h-10 bg-card/80 rounded-full flex items-center justify-center text-foreground hover:bg-card transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Annotation editor (authenticated only) */}
      {annotatingUrl && isAuthenticated && (
        <ImageAnnotationEditor
          imageUrl={annotatingUrl}
          initialAnnotations={annotationsMap[annotatingUrl] ?? []}
          onSaved={(anns) => setAnnotationsMap(prev => ({ ...prev, [annotatingUrl]: anns }))}
          onClose={() => setAnnotatingUrl(null)}
        />
      )}
    </article>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
