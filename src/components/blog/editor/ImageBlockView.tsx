import { useCallback, useState, useRef } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { AlignLeft, AlignCenter, AlignRight, Maximize2, Minimize2, Square, Trash2, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImageWidth, ImageAlign } from './extensions/ImageBlock';

const WIDTH_OPTIONS: { value: ImageWidth; label: string; Icon: typeof Square }[] = [
  { value: 'small',  label: 'Small',  Icon: Minimize2 },
  { value: 'medium', label: 'Medium', Icon: Square },
  { value: 'full',   label: 'Full',   Icon: Maximize2 },
];

const ALIGN_OPTIONS: { value: ImageAlign; label: string; Icon: typeof AlignCenter }[] = [
  { value: 'left',   label: 'Left',   Icon: AlignLeft },
  { value: 'center', label: 'Center', Icon: AlignCenter },
  { value: 'right',  label: 'Right',  Icon: AlignRight },
];

const WIDTH_CLASSES: Record<ImageWidth, string> = {
  small:  'max-w-xs',
  medium: 'max-w-lg',
  full:   'max-w-full',
};

const ALIGN_CLASSES: Record<ImageAlign, string> = {
  left:   'mr-auto',
  center: 'mx-auto',
  right:  'ml-auto',
};

export function ImageBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { src, alt, width, align, caption } = node.attrs;
  const [showToolbar, setShowToolbar] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const captionRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);

  const setWidth = useCallback((w: ImageWidth) => updateAttributes({ width: w }), [updateAttributes]);
  const setAlign = useCallback((a: ImageAlign) => updateAttributes({ align: a }), [updateAttributes]);

  return (
    <NodeViewWrapper
      className="relative my-4"
      data-drag-handle=""
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      <figure className={cn('relative group', WIDTH_CLASSES[width as ImageWidth], ALIGN_CLASSES[align as ImageAlign])}>
        {/* Image toolbar */}
        {(showToolbar || selected) && (
          <div
            className="absolute -top-10 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 bg-card border border-border rounded-lg shadow-lg px-1.5 py-1"
            contentEditable={false}
          >
            {/* Width options */}
            {WIDTH_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                title={label}
                onMouseDown={(e) => { e.preventDefault(); setWidth(value); }}
                className={cn(
                  'p-1 rounded transition-colors',
                  width === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}

            <div className="w-px h-4 bg-border mx-0.5" />

            {/* Align options */}
            {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                title={label}
                onMouseDown={(e) => { e.preventDefault(); setAlign(value); }}
                className={cn(
                  'p-1 rounded transition-colors',
                  align === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}

            <div className="w-px h-4 bg-border mx-0.5" />

            {/* Alt text */}
            <button
              title="Alt text"
              onMouseDown={(e) => { e.preventDefault(); setEditingAlt(v => !v); setEditingCaption(false); }}
              className={cn(
                'p-1 rounded transition-colors text-xs font-medium',
                editingAlt ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>

            {/* Delete */}
            <button
              title="Remove image"
              onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}
              className="p-1 rounded hover:bg-destructive/15 text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* The image */}
        <img
          src={src}
          alt={alt || ''}
          className={cn(
            'w-full rounded-lg transition-shadow cursor-default',
            (selected || showToolbar) && 'ring-2 ring-primary/50',
          )}
          draggable={false}
        />

        {/* Alt text input */}
        {editingAlt && (
          <div className="mt-1 flex items-center gap-2" contentEditable={false}>
            <span className="text-xs text-muted-foreground shrink-0">Alt:</span>
            <input
              ref={altRef}
              type="text"
              value={alt || ''}
              onChange={(e) => updateAttributes({ alt: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingAlt(false); }}
              placeholder="Describe this image..."
              className="flex-1 text-xs bg-transparent border-b border-border focus:border-primary outline-none py-0.5 text-foreground placeholder:text-muted-foreground/50"
              autoFocus
            />
          </div>
        )}

        {/* Caption */}
        {(editingCaption || caption) ? (
          <figcaption
            className="mt-2 text-center"
            contentEditable={false}
          >
            <input
              ref={captionRef}
              type="text"
              value={caption || ''}
              onChange={(e) => updateAttributes({ caption: e.target.value })}
              onFocus={() => setEditingCaption(true)}
              onBlur={() => { if (!caption) setEditingCaption(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') captionRef.current?.blur(); }}
              placeholder="Add a caption..."
              className="w-full text-center text-sm text-muted-foreground bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
          </figcaption>
        ) : (
          <div
            contentEditable={false}
            className={cn(
              'mt-1 text-center text-xs text-muted-foreground/40 cursor-pointer hover:text-muted-foreground/60 transition-colors',
              !(showToolbar || selected) && 'invisible',
            )}
            onClick={() => { setEditingCaption(true); requestAnimationFrame(() => captionRef.current?.focus()); }}
          >
            Add caption...
          </div>
        )}
      </figure>
    </NodeViewWrapper>
  );
}
