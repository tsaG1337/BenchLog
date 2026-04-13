import { useCallback, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, Code, Link2,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, ImagePlus, Undo2, Redo2, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorToolbarProps {
  editor: Editor;
  onImageClick: () => void;
  uploading?: boolean;
}

function ToolbarButton({ icon: Icon, active, disabled, onClick, title }: {
  icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={cn(
        'p-1.5 rounded transition-colors disabled:opacity-30',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;
}

export function EditorToolbar({ editor, onImageClick, uploading }: EditorToolbarProps) {
  const [linkInput, setLinkInput] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);

  const toggleLink = useCallback(() => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      setShowLinkForm(false);
      return;
    }
    const existing = editor.getAttributes('link').href || '';
    setLinkInput(existing);
    setShowLinkForm(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (linkInput.trim()) {
      const url = linkInput.match(/^https?:\/\//) ? linkInput : `https://${linkInput}`;
      editor.chain().focus().setLink({ href: url }).run();
    }
    setShowLinkForm(false);
    setLinkInput('');
  }, [editor, linkInput]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-secondary/30">
      {/* Undo / Redo */}
      <ToolbarButton icon={Undo2} onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} />
      <ToolbarButton icon={Redo2} onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)" disabled={!editor.can().redo()} />

      <Divider />

      {/* Text formatting */}
      <ToolbarButton icon={Bold} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)" />
      <ToolbarButton icon={Italic} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)" />
      <ToolbarButton icon={Underline} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)" />
      <ToolbarButton icon={Strikethrough} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough" />
      <ToolbarButton icon={Code} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code" />

      <Divider />

      {/* Headings */}
      <ToolbarButton icon={Heading1} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1" />
      <ToolbarButton icon={Heading2} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2" />
      <ToolbarButton icon={Heading3} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3" />

      <Divider />

      {/* Lists & blocks */}
      <ToolbarButton icon={List} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list" />
      <ToolbarButton icon={ListOrdered} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list" />
      <ToolbarButton icon={Quote} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote" />
      <ToolbarButton icon={Minus} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule" />

      <Divider />

      {/* Link */}
      <ToolbarButton icon={Link2} active={editor.isActive('link')} onClick={toggleLink} title="Link" />

      {/* Image */}
      <ToolbarButton icon={uploading ? Loader2 : ImagePlus} onClick={onImageClick} title="Insert image" disabled={uploading} />

      {/* Inline link form */}
      {showLinkForm && (
        <div className="flex items-center gap-1 ml-1 px-2 py-0.5 bg-card border border-border rounded-md">
          <input
            type="url"
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') setShowLinkForm(false); }}
            placeholder="https://..."
            className="w-40 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50 px-1"
            autoFocus
          />
          <button
            onMouseDown={e => { e.preventDefault(); applyLink(); }}
            className="text-xs font-medium text-primary hover:text-primary/80 px-1"
          >
            Apply
          </button>
          <button
            onMouseDown={e => { e.preventDefault(); setShowLinkForm(false); }}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
