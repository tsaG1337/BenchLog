import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSections } from '@/contexts/SectionsContext';
import { BlogPost, createBlogPost, updateBlogPost, uploadImages, fetchAnnotations, ImageAnnotation } from '@/lib/api';
import { ImageAnnotationEditor } from '@/components/ImageAnnotationEditor';
import { toast } from 'sonner';
import { ArrowLeft, Save, ImagePlus, Loader2, AlignLeft, AlignCenter, AlignRight, AlignJustify, Tag, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Custom Image blot that preserves the style attribute ─────────────
const BaseImage = Quill.import('formats/image') as any;
class StyledImage extends BaseImage {
  static formats(node: HTMLElement) {
    return { ...BaseImage.formats(node), style: node.getAttribute('style') || undefined };
  }
  format(name: string, value: string) {
    if (name === 'style') {
      if (value) this.domNode.setAttribute('style', value);
      else this.domNode.removeAttribute('style');
    } else {
      super.format(name, value);
    }
  }
}
StyledImage.blotName = 'image';
StyledImage.tagName  = 'IMG';
Quill.register(StyledImage, true);

// ── Style helpers ─────────────────────────────────────────────────────
function buildImageStyle(width: string, align: string): string {
  let s = `width:${width};max-width:100%`;
  if (align === 'center') s += ';display:block;margin:0 auto';
  else if (align === 'left')  s += ';float:left;margin-right:1em;margin-bottom:0.5em';
  else if (align === 'right') s += ';float:right;margin-left:1em;margin-bottom:0.5em';
  return s;
}

function parseImageStyle(style: string | null | undefined) {
  if (!style) return { width: '100%', align: 'none' };
  const width = style.match(/(?<![a-z-])width:([^;]+)/)?.[1]?.trim() || '100%';
  let align = 'none';
  if (/margin:0 auto|margin: 0 auto/.test(style)) align = 'center';
  else if (/float:left|float: left/.test(style))   align = 'left';
  else if (/float:right|float: right/.test(style)) align = 'right';
  return { width, align };
}

// ── Constants ─────────────────────────────────────────────────────────
const SIZE_OPTIONS = [
  { label: '25%',  value: '25%'  },
  { label: '50%',  value: '50%'  },
  { label: '75%',  value: '75%'  },
  { label: 'Full', value: '100%' },
];

const ALIGN_OPTIONS = [
  { label: 'Inline', value: 'none',   Icon: AlignJustify },
  { label: 'Left',   value: 'left',   Icon: AlignLeft    },
  { label: 'Center', value: 'center', Icon: AlignCenter  },
  { label: 'Right',  value: 'right',  Icon: AlignRight   },
];

// 8 handles: corners + edge midpoints
// top/left are fractions (0 = start, 0.5 = center, 1 = end)
const HANDLES = [
  { id: 'nw', top: 0,   left: 0,   cursor: 'nw-resize' },
  { id: 'n',  top: 0,   left: 0.5, cursor: 'n-resize'  },
  { id: 'ne', top: 0,   left: 1,   cursor: 'ne-resize' },
  { id: 'e',  top: 0.5, left: 1,   cursor: 'e-resize'  },
  { id: 'se', top: 1,   left: 1,   cursor: 'se-resize' },
  { id: 's',  top: 1,   left: 0.5, cursor: 's-resize'  },
  { id: 'sw', top: 1,   left: 0,   cursor: 'sw-resize' },
  { id: 'w',  top: 0.5, left: 0,   cursor: 'w-resize'  },
];

type OverlayRect = { top: number; left: number; width: number; height: number };

interface BlogEditorProps {
  post?: BlogPost;
  onSave: () => void;
  onCancel: () => void;
}

export function BlogEditor({ post, onSave, onCancel }: BlogEditorProps) {
  const { sections } = useSections();
  const [title,   setTitle]   = useState(post?.title   || '');
  const [content, setContent] = useState(post?.content || '');
  const [section, setSection] = useState(post?.section || 'other');
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);

  const quillRef         = useRef<ReactQuill>(null);
  const editorWrapRef    = useRef<HTMLDivElement>(null);
  const selectedImgIndex = useRef<number | null>(null); // stable Quill delta index

  const [selectedImgEl, setSelectedImgEl] = useState<HTMLImageElement | null>(null);
  const [imgStyle,   setImgStyle]   = useState<{ width: string; align: string }>({ width: '100%', align: 'none' });
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
  const [toolbarPos,  setToolbarPos]  = useState<{ top: number; left: number } | null>(null);
  const [annotatingUrl,  setAnnotatingUrl]  = useState<string | null>(null);
  const [annotationsMap, setAnnotationsMap] = useState<Record<string, ImageAnnotation[]>>({});
  const [dropLineTop, setDropLineTop] = useState<number | null>(null);

  // ── Toolbar tooltips ──────────────────────────────────────────────
  useEffect(() => {
    const wrap = editorWrapRef.current;
    if (!wrap) return;
    const TITLES: Record<string, string> = {
      '.ql-header .ql-picker':        'Text style (heading / normal)',
      '.ql-bold':                      'Bold',
      '.ql-italic':                    'Italic',
      '.ql-underline':                 'Underline',
      '.ql-strike':                    'Strikethrough',
      '.ql-list[value="ordered"]':     'Numbered list',
      '.ql-list[value="bullet"]':      'Bullet list',
      '.ql-blockquote':                'Block quote',
      '.ql-link':                      'Insert link',
      '.ql-clean':                     'Remove formatting',
    };
    Object.entries(TITLES).forEach(([selector, title]) => {
      wrap.querySelectorAll<HTMLElement>(selector).forEach(el => {
        el.title = title;
      });
    });
  }, []); // runs once after mount

  const modules = useMemo(() => ({
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'link'],
      ['clean'],
    ],
  }), []);

  // ── Reposition overlay + toolbar to match the image ──────────────
  const updateImageUI = useCallback((img: HTMLImageElement) => {
    const wrap = editorWrapRef.current;
    if (!wrap) return;
    const imgRect  = img.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const top  = imgRect.top  - wrapRect.top;
    const left = imgRect.left - wrapRect.left;
    setOverlayRect({ top, left, width: imgRect.width, height: imgRect.height });
    const TOOLBAR_H = 44;
    setToolbarPos({
      top:  top >= TOOLBAR_H + 4 ? top - TOOLBAR_H - 4 : top + imgRect.height + 4,
      left: Math.min(Math.max(0, left), wrapRect.width - 280),
    });
  }, []);

  // ── Re-fetch the live image element from Quill by stored index ───
  const refreshSelectedImg = useCallback(() => {
    const quill = quillRef.current?.getEditor();
    const idx   = selectedImgIndex.current;
    if (!quill || idx === null) return null;
    const [leaf] = quill.getLeaf(idx);
    const el = leaf?.domNode as HTMLImageElement | null;
    if (el?.tagName !== 'IMG') return null;
    setSelectedImgEl(el);
    setImgStyle(parseImageStyle(el.getAttribute('style')));
    updateImageUI(el);
    return el;
  }, [updateImageUI]);

  // ── Click inside editor ───────────────────────────────────────────
  const handleEditorClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'IMG') {
      setSelectedImgEl(null);
      setOverlayRect(null);
      setToolbarPos(null);
      selectedImgIndex.current = null;
      return;
    }
    const img   = target as HTMLImageElement;
    const quill = quillRef.current?.getEditor();
    const blot  = quill ? (Quill as any).find(img) : null;
    if (quill && blot) selectedImgIndex.current = quill.getIndex(blot);
    setSelectedImgEl(img);
    setImgStyle(parseImageStyle(img.getAttribute('style')));
    updateImageUI(img);
  }, [updateImageUI]);

  useEffect(() => {
    const wrap = editorWrapRef.current;
    if (!wrap) return;
    wrap.addEventListener('click', handleEditorClick);
    return () => wrap.removeEventListener('click', handleEditorClick);
  }, [handleEditorClick]);

  // Keep overlay in sync while editor or window scrolls
  useEffect(() => {
    if (!selectedImgEl) return;
    const editor = editorWrapRef.current?.querySelector('.ql-editor');
    const onScroll = () => updateImageUI(selectedImgEl);
    editor?.addEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      editor?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [selectedImgEl, updateImageUI]);

  // ── Drag-to-reposition image ──────────────────────────────────────
  // Image src+style captured at dragstart so the data is always fresh.
  const dragSrcData = useRef<{ index: number; src: string; style: string } | null>(null);

  const handleImgDragStart = useCallback((e: React.DragEvent, imgIndex: number) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;
    const [leaf] = quill.getLeaf(imgIndex);
    const el = leaf?.domNode as HTMLImageElement | null;
    if (!el || el.tagName !== 'IMG') return;
    dragSrcData.current = {
      index: imgIndex,
      src:   el.getAttribute('src')   || '',
      style: el.getAttribute('style') || '',
    };
    e.dataTransfer.setData('text/plain', 'ql-image-move');
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  useEffect(() => {
    const wrap   = editorWrapRef.current;
    const editor = wrap?.querySelector('.ql-editor') as HTMLElement | null;
    if (!wrap || !editor) return;

    // Find which block-level child of .ql-editor the cursor is nearest to,
    // and return the Quill index to insert before that block (top half)
    // or after it (bottom half). This avoids the unreliable caretRangeFromPoint.
    const getDropIndex = (clientY: number): number => {
      const quill = quillRef.current?.getEditor();
      if (!quill) return quill?.getLength() ?? 0;
      const blocks = Array.from(editor.children) as HTMLElement[];
      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (clientY <= rect.top + rect.height / 2) {
          try {
            const blot = (Quill as any).find(block, false);
            return blot ? quill.getIndex(blot) : 0;
          } catch { return 0; }
        }
      }
      return quill.getLength() - 1;
    };

    const onDragOver = (e: DragEvent) => {
      if (!dragSrcData.current) return;
      e.preventDefault();
      e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
      // Show drop line at the top edge of the target block
      const blocks = Array.from(editor.children) as HTMLElement[];
      const wrapRect = wrap.getBoundingClientRect();
      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (e.clientY <= rect.top + rect.height / 2) {
          setDropLineTop(rect.top - wrapRect.top);
          return;
        }
      }
      // Below all blocks
      const last = blocks[blocks.length - 1];
      if (last) {
        const r = last.getBoundingClientRect();
        setDropLineTop(r.bottom - wrapRect.top);
      }
    };

    // dragleave: only hide indicator, never clear dragSrcData
    // (spurious events fire when moving between child elements)
    const onDragLeave = (e: DragEvent) => {
      const related = e.relatedTarget as Node | null;
      if (!related || !wrap.contains(related)) setDropLineTop(null);
    };

    // dragend: drag was cancelled (no drop occurred)
    const onDragEnd = () => { setDropLineTop(null); dragSrcData.current = null; };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropLineTop(null);
      const data = dragSrcData.current;
      dragSrcData.current = null;
      if (!data || !data.src) return;

      const quill = quillRef.current?.getEditor();
      if (!quill) return;

      const srcIdx = data.index;
      let targetIdx = getDropIndex(e.clientY);

      // Adjust for the deletion of the source (shifts indices after it by -1)
      if (targetIdx > srcIdx) targetIdx -= 1;
      targetIdx = Math.max(0, Math.min(targetIdx, quill.getLength() - 1));

      if (targetIdx === srcIdx) return; // dropped in same place

      quill.deleteText(srcIdx, 1, 'user');
      quill.insertEmbed(targetIdx, 'image', data.src, 'user');
      if (data.style) quill.formatText(targetIdx, 1, 'style', data.style, 'user');

      selectedImgIndex.current = targetIdx;
      requestAnimationFrame(() => refreshSelectedImg());
    };

    wrap.addEventListener('dragover',  onDragOver);
    wrap.addEventListener('dragleave', onDragLeave);
    wrap.addEventListener('dragend',   onDragEnd);
    wrap.addEventListener('drop',      onDrop);
    return () => {
      wrap.removeEventListener('dragover',  onDragOver);
      wrap.removeEventListener('dragleave', onDragLeave);
      wrap.removeEventListener('dragend',   onDragEnd);
      wrap.removeEventListener('drop',      onDrop);
    };
  }, [refreshSelectedImg]);

  // ── Drag-to-resize ────────────────────────────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent, handleId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedImgEl || !quillRef.current) return;

    const startX      = e.clientX;
    const startWidth  = selectedImgEl.getBoundingClientRect().width;
    // Left-side handles (nw, w, sw): dragging left grows the image
    const isLeftSide  = handleId.includes('w');

    const onMove = (me: MouseEvent) => {
      const delta    = isLeftSide ? startX - me.clientX : me.clientX - startX;
      const newWidth = Math.max(40, startWidth + delta);
      selectedImgEl.style.width    = newWidth + 'px';
      selectedImgEl.style.maxWidth = '100%';
      updateImageUI(selectedImgEl);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      // Commit final style to Quill's delta
      const quill = quillRef.current?.getEditor();
      if (quill) {
        const idx = selectedImgIndex.current;
        if (idx !== null) {
          quill.formatText(idx, 1, 'style', selectedImgEl.getAttribute('style') || '');
        }
      }
      // Re-fetch fresh element after Quill may have recreated the DOM node
      requestAnimationFrame(() => refreshSelectedImg());
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [selectedImgEl, updateImageUI, refreshSelectedImg]);

  // ── Toolbar: apply preset size / alignment ────────────────────────
  const applyImageStyle = (newWidth: string, newAlign: string) => {
    const quill = quillRef.current?.getEditor();
    const idx   = selectedImgIndex.current;
    if (!quill || idx === null) return;
    quill.formatText(idx, 1, 'style', buildImageStyle(newWidth, newAlign));
    // Re-fetch the live element (Quill may have recreated the DOM node)
    requestAnimationFrame(() => refreshSelectedImg());
  };

  // ── Open annotation editor for selected image ────────────────────
  const handleAnnotate = async () => {
    // Use getAttribute to get the raw stored src (relative path like /files/…)
    // instead of .src which the browser resolves to an absolute URL.
    // The viewer fetches annotations using the same relative path from post.imageUrls,
    // so both sides must use the same key.
    const url = selectedImgEl?.getAttribute('src');
    if (!url) return;
    if (!annotationsMap[url]) {
      try {
        const anns = await fetchAnnotations(url);
        setAnnotationsMap(prev => ({ ...prev, [url]: anns }));
      } catch {
        setAnnotationsMap(prev => ({ ...prev, [url]: [] }));
      }
    }
    setAnnotatingUrl(url);
  };

  // ── Image upload ──────────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    try {
      const urls  = await uploadImages('blog-' + Date.now(), files);
      const quill = quillRef.current?.getEditor();
      if (quill) {
        for (const url of urls) {
          const range = quill.getSelection() || { index: quill.getLength() - 1, length: 0 };
          quill.insertEmbed(range.index, 'image', url, 'user');
          quill.formatText(range.index, 1, 'style', buildImageStyle('100%', 'none'));
          const afterIdx = range.index + 1;
          // Always ensure there is a newline after the image so the cursor
          // has an empty line to land on and the user can type after the image.
          if (afterIdx >= quill.getLength() - 1) {
            quill.insertText(afterIdx, '\n', 'user');
          }
          quill.setSelection(afterIdx, 0);
        }
      }
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      if (post) {
        await updateBlogPost(post.id, { title, content, section: section || undefined });
      } else {
        await createBlogPost({ title, content, section: section || undefined });
      }
      toast.success(post ? 'Post updated' : 'Post published');
      onSave();
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-bold text-foreground flex-1">{post ? 'Edit Post' : 'New Post'}</h2>
        <label className="cursor-pointer">
          <Button variant="outline" size="sm" asChild disabled={uploading}>
            <span className="flex items-center gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              Add Image
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </span>
          </Button>
        </label>
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {post ? 'Save' : 'Publish'}
        </Button>
      </div>

      <Input
        placeholder="Post title..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="text-lg font-semibold"
      />

      <Select value={section} onValueChange={setSection}>
        <SelectTrigger><SelectValue placeholder="Select section (optional)" /></SelectTrigger>
        <SelectContent>
          {sections.map(sec => (
            <SelectItem key={sec.id} value={sec.id}>{sec.icon} {sec.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Editor + overlays */}
      <div ref={editorWrapRef} className="relative blog-editor-quill">

        {/* ── Drag-to-reposition drop indicator ── */}
        {dropLineTop !== null && (
          <div
            className="absolute left-0 right-0 h-0.5 bg-primary z-30 pointer-events-none rounded-full"
            style={{ top: dropLineTop }}
          />
        )}

        {/* ── Size / alignment toolbar (above or below image) ── */}
        {toolbarPos && selectedImgEl && (
          <div
            className="absolute z-20 flex items-center gap-1 bg-card border border-border rounded-lg shadow-xl px-2 py-1.5"
            style={{ top: toolbarPos.top, left: toolbarPos.left }}
            onMouseDown={e => e.preventDefault()}
          >
            {/* Drag handle — dragging this moves the image in the document */}
            <div
              draggable
              onMouseDown={e => e.stopPropagation()}
              onDragStart={e => {
                if (selectedImgIndex.current !== null) handleImgDragStart(e, selectedImgIndex.current);
              }}
              className="flex items-center px-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              title="Drag to move image"
            >
              <GripVertical className="w-4 h-4" />
            </div>
            <div className="w-px h-4 bg-border mx-1" />
            <span className="text-xs text-muted-foreground px-1">Size</span>
            {SIZE_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onMouseDown={e => { e.preventDefault(); applyImageStyle(value, imgStyle.align); }}
                className={cn(
                  'px-2 py-0.5 text-xs rounded transition-colors',
                  imgStyle.width === value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground',
                )}
              >
                {label}
              </button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <span className="text-xs text-muted-foreground px-1">Align</span>
            {ALIGN_OPTIONS.map(({ label, value, Icon }) => (
              <button
                key={value}
                title={label}
                onMouseDown={e => { e.preventDefault(); applyImageStyle(imgStyle.width, value); }}
                className={cn(
                  'p-1 rounded transition-colors',
                  imgStyle.align === value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <button
              title="Annotate"
              onMouseDown={e => { e.preventDefault(); handleAnnotate(); }}
              className="flex items-center gap-1 px-2 py-0.5 text-xs rounded hover:bg-muted text-foreground transition-colors"
            >
              <Tag className="w-3.5 h-3.5" /> Annotate
            </button>
          </div>
        )}

        {/* ── Selection border + 8 drag handles ── */}
        {overlayRect && selectedImgEl && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              top:    overlayRect.top,
              left:   overlayRect.left,
              width:  overlayRect.width,
              height: overlayRect.height,
            }}
          >
            {/* Selection border */}
            <div className="absolute inset-0 border-2 border-primary/70 rounded-sm" />

            {/* Resize handles */}
            {HANDLES.map(({ id, top, left, cursor }) => (
              <div
                key={id}
                className="absolute w-3 h-3 bg-white border-2 border-primary rounded-sm shadow pointer-events-auto"
                style={{
                  cursor,
                  top:  `calc(${top  * 100}% - 6px)`,
                  left: `calc(${left * 100}% - 6px)`,
                }}
                onMouseDown={e => handleResizeStart(e, id)}
              />
            ))}
          </div>
        )}

        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={content}
          onChange={setContent}
          modules={modules}
          placeholder="Write your build log entry..."
        />
      </div>

      {annotatingUrl && (
        <ImageAnnotationEditor
          imageUrl={annotatingUrl}
          initialAnnotations={annotationsMap[annotatingUrl] ?? []}
          onSaved={anns => setAnnotationsMap(prev => ({ ...prev, [annotatingUrl]: anns }))}
          onClose={() => setAnnotatingUrl(null)}
        />
      )}
    </div>
  );
}
