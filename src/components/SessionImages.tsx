import { useState, useRef, useEffect } from 'react';
import { uploadImages, deleteImage, fetchAnnotations, ImageAnnotation } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ImagePlus, X, Loader2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { thumbUrl } from '@/lib/utils';
import { ImageAnnotationViewer } from '@/components/ImageAnnotationViewer';
import { ImageAnnotationEditor } from '@/components/ImageAnnotationEditor';

interface SessionImagesProps {
  sessionId: string;
  imageUrls: string[];
  onImagesChange: (urls: string[]) => void;
  editable?: boolean;
}

export function SessionImages({ sessionId, imageUrls, onImagesChange, editable = true }: SessionImagesProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [annotatingUrl, setAnnotatingUrl] = useState<string | null>(null);
  const [annotationsMap, setAnnotationsMap] = useState<Record<string, ImageAnnotation[]>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // Load annotations for all images whenever the list changes
  useEffect(() => {
    imageUrls.forEach(url => {
      if (annotationsMap[url] !== undefined) return; // already loaded
      fetchAnnotations(url).then(anns => {
        setAnnotationsMap(prev => ({ ...prev, [url]: anns }));
      }).catch(() => {});
    });
  }, [imageUrls]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newUrls = await uploadImages(sessionId, files);
      onImagesChange([...imageUrls, ...newUrls]);
      toast.success(`${newUrls.length} image(s) attached`);
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async (url: string) => {
    try {
      await deleteImage(url);
    } catch {
      // Still remove from UI even if server delete fails
    }
    onImagesChange(imageUrls.filter(u => u !== url));
  };

  if (!editable && imageUrls.length === 0) return null;

  const previewAnnotations = previewUrl ? (annotationsMap[previewUrl] ?? []) : [];

  return (
    <div className="mt-3">
      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {imageUrls.map((url) => {
            const anns = annotationsMap[url] ?? [];
            return (
              <div key={url} className="relative group">
                <img
                  src={thumbUrl(url)}
                  onError={(e) => { e.currentTarget.src = url; }}
                  alt="Session photo"
                  className="w-16 h-16 rounded-md object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setPreviewUrl(url)}
                />
                {/* Annotation count badge */}
                {anns.length > 0 && (
                  <div
                    className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 bg-black/70 text-white text-[10px] rounded px-1 py-0.5 pointer-events-none"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {anns.length}
                  </div>
                )}
                {editable && (
                  <>
                    <button
                      onClick={() => handleRemove(url)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {/* Annotate button — appears on hover */}
                    <button
                      onClick={() => setAnnotatingUrl(url)}
                      className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-primary/80 text-primary-foreground rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit annotations"
                    >
                      <Tag className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editable && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading…' : 'Add Photos'}
          </Button>
        </>
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
          {/* Top-right controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {editable && (
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

      {/* Annotation editor */}
      {annotatingUrl && (
        <ImageAnnotationEditor
          imageUrl={annotatingUrl}
          initialAnnotations={annotationsMap[annotatingUrl] ?? []}
          onSaved={(anns) => setAnnotationsMap(prev => ({ ...prev, [annotatingUrl]: anns }))}
          onClose={() => setAnnotatingUrl(null)}
        />
      )}
    </div>
  );
}
