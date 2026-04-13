import { useCallback, useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { Bold, Italic, Underline, Strikethrough, Link2, Heading2, Code, RemoveFormatting } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BubbleToolbarProps {
  editor: Editor;
}

export function BubbleToolbar({ editor }: BubbleToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [linkInput, setLinkInput] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePosition = () => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;
      const isImageSelected = editor.isActive('imageBlock');

      if (!hasSelection || isImageSelected) {
        setVisible(false);
        setShowLinkForm(false);
        return;
      }

      // Get the DOM range to position the toolbar
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        setVisible(false);
        return;
      }

      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setVisible(false);
        return;
      }

      const toolbarWidth = toolbarRef.current?.offsetWidth ?? 320;
      setPosition({
        top: rect.top + window.scrollY - 44,
        left: Math.max(8, rect.left + window.scrollX + rect.width / 2 - toolbarWidth / 2),
      });
      setVisible(true);
    };

    const handleBlur = () => { setTimeout(() => setVisible(false), 200); };
    editor.on('selectionUpdate', updatePosition);
    editor.on('blur', handleBlur);
    return () => {
      editor.off('selectionUpdate', updatePosition);
      editor.off('blur', handleBlur);
    };
  }, [editor]);

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

  const buttons = [
    { icon: Bold, active: 'bold', action: () => editor.chain().focus().toggleBold().run(), title: 'Bold (Ctrl+B)' },
    { icon: Italic, active: 'italic', action: () => editor.chain().focus().toggleItalic().run(), title: 'Italic (Ctrl+I)' },
    { icon: Underline, active: 'underline', action: () => editor.chain().focus().toggleUnderline().run(), title: 'Underline (Ctrl+U)' },
    { icon: Strikethrough, active: 'strike', action: () => editor.chain().focus().toggleStrike().run(), title: 'Strikethrough' },
    { icon: Code, active: 'code', action: () => editor.chain().focus().toggleCode().run(), title: 'Code' },
    { icon: Heading2, active: 'heading', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), title: 'Heading' },
    { icon: Link2, active: 'link', action: toggleLink, title: 'Link' },
    { icon: RemoveFormatting, active: '__none__', action: () => editor.chain().focus().unsetAllMarks().run(), title: 'Clear formatting' },
  ];

  if (!visible) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center bg-card border border-border rounded-lg shadow-xl overflow-hidden">
        {showLinkForm ? (
          <div className="flex items-center px-2 py-1 gap-1">
            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') setShowLinkForm(false); }}
              placeholder="https://..."
              className="w-48 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50 px-1"
              autoFocus
            />
            <button
              onMouseDown={(e) => { e.preventDefault(); applyLink(); }}
              className="text-xs font-medium text-primary hover:text-primary/80 px-1"
            >
              Apply
            </button>
          </div>
        ) : (
          buttons.map(({ icon: Icon, active, action, title }) => (
            <button
              key={title}
              title={title}
              onMouseDown={(e) => { e.preventDefault(); action(); }}
              className={cn(
                'p-2 transition-colors',
                editor.isActive(active)
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
