import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List } from 'lucide-react';

interface Props {
  value: string;          // HTML
  onChange: (html: string) => void;
  rows?: number;
  placeholder?: string;
}

/**
 * Minimal rich-text editor for the wiring tool's annotation Inspector.
 * A compact toolbar (Bold / Italic / Underline / Strike / Bulleted list)
 * sits above a TipTap editor — feels like a normal word-processor field
 * rather than a plain textarea. Stored as HTML; canvas/SVG renderers
 * strip the tags when displaying the text on the schematic (formatting is
 * preserved in storage but the on-canvas glyph stays plain).
 */
export function AnnotationEditor({ value, onChange, rows = 4, placeholder }: Props) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false }), Underline],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none p-2 text-foreground',
        style: `min-height: ${rows * 1.4}rem;`,
        'data-placeholder': placeholder ?? '',
      },
    },
  });
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`p-1 rounded transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="border border-border rounded bg-background">
      <div className="flex items-center gap-0.5 px-1 py-1 border-b border-border bg-muted/40">
        {btn(editor.isActive('bold'),      () => editor.chain().focus().toggleBold().run(),      'Bold (Ctrl+B)',      <Bold className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('italic'),    () => editor.chain().focus().toggleItalic().run(),    'Italic (Ctrl+I)',    <Italic className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline (Ctrl+U)', <UnderlineIcon className="w-3.5 h-3.5" />)}
        {btn(editor.isActive('strike'),    () => editor.chain().focus().toggleStrike().run(),    'Strike',             <Strikethrough className="w-3.5 h-3.5" />)}
        <div className="w-px h-4 bg-border mx-1" />
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bullet list', <List className="w-3.5 h-3.5" />)}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Strip the HTML markup out of a TipTap-stored annotation text down to plain
 *  text + line breaks. Used by AnnotationView and the SVG export so the canvas
 *  shows readable text without needing inline rich-text rendering. */
export function annotationPlainText(html: string): string {
  if (!html) return '';
  // Quick guard: when the text is plain (no HTML) we return it as-is to
  // preserve existing newlines and avoid round-tripping through a DOM
  // parser unnecessarily.
  if (!/<[a-z][^>]*>/i.test(html)) return html;
  // Convert block-level breaks to newlines, then strip remaining tags.
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
