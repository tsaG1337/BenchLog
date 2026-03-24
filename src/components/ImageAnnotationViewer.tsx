import { useState } from 'react';
import { ImageAnnotation } from '@/lib/api';

interface ImageAnnotationViewerProps {
  src: string;
  annotations: ImageAnnotation[];
  imgClassName?: string;
  containerClassName?: string;
  style?: string;
  onClick?: () => void;
  onError?: React.ImgHTMLAttributes<HTMLImageElement>['onError'];
  alt?: string;
}

/**
 * Renders an image with absolutely-positioned numbered annotation markers.
 * Hover or tap a marker to see its tooltip.
 */
export function ImageAnnotationViewer({
  src,
  annotations,
  imgClassName,
  containerClassName,
  style,
  onClick,
  onError,
  alt = '',
}: ImageAnnotationViewerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div
      className={`relative ${containerClassName ?? ''}`}
      onClick={onClick}
      ref={el => { if (el && style) el.style.cssText = style; }}
    >
      {/* When a style is applied to the container, the image fills it at 100%
          so annotation marker percentages align correctly with the image. */}
      <img src={src} alt={alt} className={style ? `w-full h-auto ${imgClassName ?? ''}` : imgClassName} onError={onError} />
      {annotations.map((ann, i) => (
        <div
          key={ann.id}
          className="absolute"
          style={{
            left: `${ann.x * 100}%`,
            top: `${ann.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
          }}
          onMouseEnter={() => setActiveId(ann.id)}
          onMouseLeave={() => setActiveId(null)}
          onTouchStart={(e) => {
            e.stopPropagation();
            setActiveId(activeId === ann.id ? null : ann.id);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center cursor-default select-none shadow-lg border-2 border-white">
            {i + 1}
          </div>
          {activeId === ann.id && ann.title && (
            <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-popover text-popover-foreground text-xs rounded-md shadow-lg whitespace-nowrap border border-border pointer-events-none max-w-[200px] text-wrap">
              {ann.title}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
