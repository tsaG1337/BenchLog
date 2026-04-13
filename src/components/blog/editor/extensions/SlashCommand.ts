import { Extension } from '@tiptap/core';
import { Suggestion, SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  command: (props: { editor: any; range: any }) => void;
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    title: 'Paragraph',
    description: 'Plain text block',
    icon: 'pilcrow',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'heading-1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'heading-2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'heading-3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: 'Heading 4',
    description: 'Subsection heading',
    icon: 'heading-4',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 4 }).run();
    },
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: 'list',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: 'list-ordered',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Quote',
    description: 'Block quote',
    icon: 'quote',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setBlockquote().run();
    },
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    icon: 'minus',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: 'Image',
    description: 'Upload an image',
    icon: 'image',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // Trigger file input — the TipTapEditor listens for this custom event
      const event = new CustomEvent('tiptap-insert-image');
      document.dispatchEvent(event);
    },
  },
];

const slashPluginKey = new PluginKey('slashCommand');

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: slashPluginKey,
        command: ({ editor, range, props }: { editor: any; range: any; props: SlashCommandItem }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => {
          return SLASH_COMMAND_ITEMS.filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase()),
          );
        },
      } as Partial<SuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
