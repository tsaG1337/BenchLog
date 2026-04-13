import { useState, useRef } from 'react';
import { uploadImages, deleteImage } from '@/lib/api';
import { X, Loader2 } from 'lucide-react';
import { MIcon } from '@/components/AppShell';
import { toast } from 'sonner';
import { thumbUrl, imageUrl } from '@/lib/utils';

interface SessionImagesProps {
  sessionId: string;
  imageUrls: string[];
  onImagesChange: (urls: string[]) => void;
  editable?: boolean;
  demoMode?: boolean;
}

export function SessionImages({ sessionId, imageUrls, onImagesChange, editable = true, demoMode = false }: SessionImagesProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Track latest imageUrls to avoid stale closure in async upload handler
  const imageUrlsRef = useRef(imageUrls);
  imageUrlsRef.current = imageUrls;

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_SIZE) { toast.error(`"${f.name}" exceeds 25 MB limit`); return; }
    }
    if (demoMode) {
      const localUrls = Array.from(files).map(f => URL.createObjectURL(f));
      onImagesChange([...imageUrls, ...localUrls]);
      toast.success(`${localUrls.length} image(s) attached`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const newUrls = await uploadImages(sessionId, files);
      onImagesChange([...imageUrlsRef.current, ...newUrls]);
      toast.success(`${newUrls.length} image(s) attached`);
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async (url: string) => {
    if (!demoMode) { try { await deleteImage(url); } catch {} }
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    onImagesChange(imageUrls.filter(u => u !== url));
  };

  if (!editable && imageUrls.length === 0) return null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {imageUrls.map((url) => (
          <div key={url} className="aspect-square rounded-lg overflow-hidden relative group bg-muted">
            <img
              src={thumbUrl(url)}
              onError={(e) => { e.currentTarget.src = imageUrl(url); }}
              alt="Session photo"
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => setPreviewUrl(imageUrl(url))}
            />
            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <MIcon name="zoom_in" className="text-white text-2xl" />
            </div>
            {editable && (
              <button
                onClick={() => handleRemove(url)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {editable && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-all"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <MIcon name="add_a_photo" className="text-3xl" />
                <span className="font-label text-[10px] font-bold uppercase">Add Photo</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {/* Lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="" className="max-w-full max-h-[90vh] rounded-lg object-contain block" />
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
    </div>
  );
}
