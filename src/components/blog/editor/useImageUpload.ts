import { useCallback, useState } from 'react';
import { Editor } from '@tiptap/react';
import { uploadImages } from '@/lib/api';
import { toast } from 'sonner';

/** Compress an image file using canvas before uploading. */
async function compressImage(file: File, maxWidth = 1920, quality = 0.85): Promise<File> {
  // Skip non-image or already-small files
  if (!file.type.startsWith('image/') || file.size < 100_000) return file;
  // Skip SVGs / GIFs (no point compressing)
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxWidth) { resolve(file); return; }
      const ratio = maxWidth / width;
      width = maxWidth;
      height = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export function useImageUpload(editor: Editor | null) {
  const [uploading, setUploading] = useState(false);

  const uploadAndInsert = useCallback(async (files: File[] | FileList) => {
    if (!editor) return;
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    setUploading(true);
    try {
      // Compress all files in parallel
      const compressed = await Promise.all(fileArray.map(f => compressImage(f)));

      // Build a FileList-like object for the upload API
      const dt = new DataTransfer();
      for (const f of compressed) dt.items.add(f);

      const urls = await uploadImages('blog-' + Date.now(), dt.files);
      for (const url of urls) {
        editor.chain().focus().setImageBlock({ src: url }).run();
      }
    } catch (err: any) {
      toast.error('Image upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  }, [editor]);

  /** Handle file input change event */
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadAndInsert(e.target.files);
    e.target.value = '';
  }, [uploadAndInsert]);

  /** Handle drop event on the editor */
  const handleDrop = useCallback((e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return false;
    const images = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (images.length === 0) return false;
    e.preventDefault();
    uploadAndInsert(images);
    return true;
  }, [uploadAndInsert]);

  /** Handle paste event — intercept image pastes */
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageFiles = items
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (imageFiles.length === 0) return false;
    e.preventDefault();
    uploadAndInsert(imageFiles);
    return true;
  }, [uploadAndInsert]);

  return { uploading, uploadAndInsert, handleFileInput, handleDrop, handlePaste };
}
