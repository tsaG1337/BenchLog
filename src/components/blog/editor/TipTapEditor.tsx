import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, ReactRenderer, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import UnderlineExt from '@tiptap/extension-underline';
import { ImageBlock } from './extensions/ImageBlock';
import { SlashCommand } from './extensions/SlashCommand';
import { BubbleToolbar } from './BubbleToolbar';
import { EditorToolbar } from './EditorToolbar';
import { SlashCommandMenu } from './SlashCommandMenu';
import { useImageUpload } from './useImageUpload';
import type { SuggestionOptions } from '@tiptap/suggestion';

// ── Slash command renderer adapter ──────────────────────────────────
function createSlashSuggestionRenderer(): Partial<SuggestionOptions['render']> & Record<string, any> {
  let component: ReactRenderer | null = null;
  let popup: HTMLDivElement | null = null;

  return {
    onStart: (props: any) => {
      component = new ReactRenderer(SlashCommandMenu, {
        props: { items: props.items, command: props.command },
        editor: props.editor,
      });
      popup = document.createElement('div');
      popup.style.position = 'absolute';
      popup.style.zIndex = '50';
      popup.appendChild(component.element);
      document.body.appendChild(popup);

      const { clientRect } = props;
      if (clientRect) {
        const rect = clientRect();
        if (rect) {
          popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
          popup.style.left = `${rect.left + window.scrollX}px`;
        }
      }
    },
    onUpdate: (props: any) => {
      component?.updateProps({ items: props.items, command: props.command });
      if (popup && props.clientRect) {
        const rect = props.clientRect();
        if (rect) {
          popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
          popup.style.left = `${rect.left + window.scrollX}px`;
        }
      }
    },
    onKeyDown: (props: any) => {
      if (props.event.key === 'Escape') {
        popup?.remove();
        popup = null;
        component?.destroy();
        component = null;
        return true;
      }
      return false;
    },
    onExit: () => {
      popup?.remove();
      popup = null;
      component?.destroy();
      component = null;
    },
  };
}

// ── Parse initial content ───────────────────────────────────────────
function parseContent(content: string | undefined): JSONContent | string {
  if (!content) return { type: 'doc', content: [{ type: 'paragraph' }] };
  try {
    const parsed = JSON.parse(content);
    if (parsed && parsed.type === 'doc') return parsed;
  } catch {
    // Not JSON — treat as legacy HTML
  }
  return content;
}

// ── Component ───────────────────────────────────────────────────────
export interface TipTapEditorProps {
  initialContent?: string;
  onUpdate?: (json: JSONContent) => void;
  placeholder?: string;
}

export function TipTapEditor({ initialContent, onUpdate, placeholder = 'Start writing, or type / for commands...' }: TipTapEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Use a ref so editorProps callbacks always see the latest upload function
  const uploadRef = useRef<ReturnType<typeof useImageUpload>>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        dropcursor: { color: 'hsl(var(--primary))', width: 2 },
      }),
      UnderlineExt,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline cursor-pointer' },
      }),
      Placeholder.configure({ placeholder }),
      ImageBlock,
      SlashCommand.configure({
        suggestion: {
          render: () => createSlashSuggestionRenderer() as any,
        },
      }),
    ],
    content: parseContent(initialContent),
    onUpdate: ({ editor: ed }) => {
      onUpdate?.(ed.getJSON());
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor outline-none min-h-[300px] px-4 py-3',
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const images = Array.from(files).filter(f => f.type.startsWith('image/'));
          if (images.length > 0) {
            event.preventDefault();
            uploadRef.current?.uploadAndInsert(images);
            return true;
          }
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageFiles = items
          .filter(item => item.type.startsWith('image/'))
          .map(item => item.getAsFile())
          .filter((f): f is File => f !== null);
        if (imageFiles.length > 0) {
          event.preventDefault();
          uploadRef.current?.uploadAndInsert(imageFiles);
          return true;
        }
        return false;
      },
    },
  });

  const imageUpload = useImageUpload(editor);
  uploadRef.current = imageUpload;

  // Listen for image insert events from slash command & external "Add Image" button
  const onInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onInsertImageUrl = useCallback((e: Event) => {
    const url = (e as CustomEvent).detail?.url;
    if (url && editor) {
      editor.chain().focus().setImageBlock({ src: url }).run();
    }
  }, [editor]);

  useEffect(() => {
    document.addEventListener('tiptap-insert-image', onInsertImage);
    document.addEventListener('tiptap-insert-image-url', onInsertImageUrl);
    return () => {
      document.removeEventListener('tiptap-insert-image', onInsertImage);
      document.removeEventListener('tiptap-insert-image-url', onInsertImageUrl);
    };
  }, [onInsertImage, onInsertImageUrl]);

  return (
    <div className="tiptap-wrapper">
      {editor && <EditorToolbar editor={editor} onImageClick={onInsertImage} uploading={imageUpload.uploading} />}
      {editor && <BubbleToolbar editor={editor} />}
      <EditorContent editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={imageUpload.handleFileInput}
      />
    </div>
  );
}

export { type JSONContent } from '@tiptap/react';
