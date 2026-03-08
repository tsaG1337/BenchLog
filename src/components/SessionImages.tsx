import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SessionImagesProps {
  sessionId: string;
  imageUrls: string[];
  onImagesChange: (urls: string[]) => void;
}

export function SessionImages({ sessionId, imageUrls, onImagesChange }: SessionImagesProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newUrls: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop();
        const path = `${sessionId}/${crypto.randomUUID()}.${ext}`;

        const { error } = await supabase.storage
          .from('session-images')
          .upload(path, file);

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('session-images')
          .getPublicUrl(path);

        newUrls.push(urlData.publicUrl);
      }

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
    // Extract path from URL
    const parts = url.split('/session-images/');
    if (parts.length > 1) {
      const path = decodeURIComponent(parts[1]);
      await supabase.storage.from('session-images').remove([path]);
    }
    onImagesChange(imageUrls.filter(u => u !== url));
  };

  return (
    <div className="mt-3">
      {/* Thumbnails */}
      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {imageUrls.map((url) => (
            <div key={url} className="relative group">
              <img
                src={url}
                alt="Session photo"
                className="w-16 h-16 rounded-md object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setPreviewUrl(url)}
              />
              <button
                onClick={() => handleRemove(url)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
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

      {/* Lightbox preview */}
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
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-card/80 rounded-full flex items-center justify-center text-foreground hover:bg-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
