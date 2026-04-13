import { useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

export interface SignaturePadRef {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
}

interface SignaturePadProps {
  label?: string;
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  function SignaturePad({ label = 'Signature *' }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const emptyRef = useRef(true);

    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      emptyRef.current = true;
    }, []);

    useEffect(() => { clearCanvas(); }, [clearCanvas]);

    useImperativeHandle(ref, () => ({
      clear: clearCanvas,
      isEmpty: () => emptyRef.current,
      toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
    }));

    const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const scaleX = canvasRef.current!.width / rect.width;
      const scaleY = canvasRef.current!.height / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawing.current = true;
      emptyRef.current = false;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current) return;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    }, []);

    const onPointerUp = useCallback(() => { isDrawing.current = false; }, []);

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Button variant="ghost" size="sm" onClick={clearCanvas} className="h-6 px-2 text-xs gap-1 text-muted-foreground">
            <Eraser className="w-3 h-3" /> Clear
          </Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden bg-white touch-none select-none">
          <canvas
            ref={canvasRef}
            width={600}
            height={160}
            className="w-full cursor-crosshair block"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
        <p className="text-xs text-muted-foreground/60 mt-1">Sign with your finger, stylus, or mouse</p>
      </div>
    );
  }
);
