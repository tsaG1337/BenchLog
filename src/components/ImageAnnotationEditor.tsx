import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Loader2 } from 'lucide-react';
import { ImageAnnotation, saveAnnotations } from '@/lib/api';
import { toast } from 'sonner';

interface ImageAnnotationEditorProps {
  imageUrl: string;
  initialAnnotations: ImageAnnotation[];
  onSaved: (annotations: ImageAnnotation[]) => void;
  onClose: () => void;
}

/**
 * Modal dialog for placing numbered annotation markers on an image.
 * Click the image to add a marker; enter a label for each one.
 */
export function ImageAnnotationEditor({
  imageUrl,
  initialAnnotations,
  onSaved,
  onClose,
}: ImageAnnotationEditorProps) {
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>(initialAnnotations);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setAnnotations(prev => [
      ...prev,
      { id: crypto.randomUUID(), x, y, title: '' },
    ]);
  }, []);

  const updateTitle = (id: string, title: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, title } : a));
  };

  const remove = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAnnotations(imageUrl, annotations);
      onSaved(annotations);
      toast.success('Annotations saved');
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit Annotations</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          Click on the image to place a numbered marker, then enter a label below.
        </p>

        {/* Image with marker overlay */}
        <div
          className="relative cursor-crosshair border border-border rounded-lg overflow-hidden select-none"
          onClick={handleImageClick}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            className="w-full h-auto block"
            draggable={false}
          />
          {annotations.map((ann, i) => (
            <div
              key={ann.id}
              className="absolute pointer-events-none"
              style={{
                left: `${ann.x * 100}%`,
                top: `${ann.y * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-lg border-2 border-white">
                {i + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Label inputs */}
        {annotations.length > 0 ? (
          <div className="space-y-2">
            {annotations.map((ann, i) => (
              <div key={ann.id} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
                <Input
                  value={ann.title}
                  onChange={e => updateTitle(ann.id, e.target.value)}
                  placeholder="Label for this marker…"
                  className="bg-secondary border-border h-8 text-sm flex-1"
                  autoFocus={i === annotations.length - 1 && ann.title === ''}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(ann.id)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-1">
            No markers yet — click on the image to add one.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
