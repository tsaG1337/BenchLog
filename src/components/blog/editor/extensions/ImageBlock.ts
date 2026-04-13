import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageBlockView } from '../ImageBlockView';

export type ImageWidth = 'small' | 'medium' | 'full';
export type ImageAlign = 'left' | 'center' | 'right';

export interface ImageBlockAttrs {
  src: string;
  alt: string;
  title: string;
  width: ImageWidth;
  align: ImageAlign;
  caption: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageBlock: {
      setImageBlock: (attrs: Partial<ImageBlockAttrs> & { src: string }) => ReturnType;
    };
  }
}

export const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src:     { default: '' },
      alt:     { default: '' },
      title:   { default: '' },
      width:   { default: 'full' as ImageWidth },
      align:   { default: 'center' as ImageAlign },
      caption: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="image-block"]',
        getAttrs: (el) => {
          const img = (el as HTMLElement).querySelector('img');
          const caption = (el as HTMLElement).querySelector('figcaption');
          return {
            src: img?.getAttribute('src') || '',
            alt: img?.getAttribute('alt') || '',
            title: img?.getAttribute('title') || '',
            width: (el as HTMLElement).getAttribute('data-width') || 'full',
            align: (el as HTMLElement).getAttribute('data-align') || 'center',
            caption: caption?.textContent || '',
          };
        },
      },
      // Parse plain <img> tags (legacy Quill content)
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          const img = el as HTMLImageElement;
          const style = img.getAttribute('style') || '';
          let width: ImageWidth = 'full';
          if (style.includes('25%') || style.includes('small')) width = 'small';
          else if (style.includes('50%') || style.includes('75%')) width = 'medium';
          let align: ImageAlign = 'center';
          if (style.includes('float:left') || style.includes('float: left')) align = 'left';
          else if (style.includes('float:right') || style.includes('float: right')) align = 'right';
          return {
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
            title: img.getAttribute('title') || '',
            width,
            align,
            caption: '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, title, width, align, caption } = HTMLAttributes;
    return [
      'figure',
      mergeAttributes({ 'data-type': 'image-block', 'data-width': width, 'data-align': align }),
      ['img', { src, alt, title }],
      ...(caption ? [['figcaption', {}, caption]] : []),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },

  addCommands() {
    return {
      setImageBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
