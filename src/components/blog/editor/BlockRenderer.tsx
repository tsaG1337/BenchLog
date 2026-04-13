import { useMemo, Fragment } from 'react';
import type { JSONContent } from '@tiptap/react';

/**
 * Renders TipTap JSON content into semantic React elements.
 * Used for read-only post display (BlogPostView).
 */

interface BlockRendererProps {
  content: JSONContent;
  /** Optional callback when an image is clicked (for lightbox) */
  onImageClick?: (src: string) => void;
}

// ── Mark rendering ──────────────────────────────────────────────────
function renderMarks(text: string, marks?: JSONContent['marks']): React.ReactNode {
  if (!marks || marks.length === 0) return text;
  let node: React.ReactNode = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        node = <strong>{node}</strong>;
        break;
      case 'italic':
        node = <em>{node}</em>;
        break;
      case 'underline':
        node = <u>{node}</u>;
        break;
      case 'strike':
        node = <s>{node}</s>;
        break;
      case 'code':
        node = <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{node}</code>;
        break;
      case 'link': {
        const href = mark.attrs?.href || '';
        // Only allow http(s) and mailto links — block javascript: and other dangerous protocols
        const isSafe = /^https?:\/\//i.test(href) || /^mailto:/i.test(href) || href.startsWith('/') || href.startsWith('#');
        node = isSafe ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            {node}
          </a>
        ) : <span className="text-primary underline">{node}</span>;
        break;
      }
    }
  }
  return node;
}

// ── Inline content rendering ────────────────────────────────────────
function renderInline(content?: JSONContent[]): React.ReactNode {
  if (!content) return null;
  return content.map((node, i) => {
    if (node.type === 'text') {
      return <Fragment key={i}>{renderMarks(node.text || '', node.marks)}</Fragment>;
    }
    if (node.type === 'hardBreak') {
      return <br key={i} />;
    }
    return null;
  });
}

// ── Block rendering ─────────────────────────────────────────────────
interface BlockNodeProps {
  node: JSONContent;
  onImageClick?: (src: string) => void;
}

const MAX_DEPTH = 50;

function BlockNode({ node, onImageClick, depth = 0 }: BlockNodeProps & { depth?: number }) {
  if (depth > MAX_DEPTH) return null;
  switch (node.type) {
    case 'paragraph':
      return <p className="mb-3 leading-relaxed">{renderInline(node.content)}</p>;

    case 'heading': {
      const level = Math.max(1, Math.min(4, parseInt(node.attrs?.level) || 2));
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      const sizes: Record<number, string> = {
        1: 'text-3xl font-bold mt-8 mb-4',
        2: 'text-2xl font-bold mt-6 mb-3',
        3: 'text-xl font-semibold mt-5 mb-2',
        4: 'text-lg font-semibold mt-4 mb-2',
      };
      return <Tag className={sizes[level] || sizes[2]}>{renderInline(node.content)}</Tag>;
    }

    case 'bulletList':
      return (
        <ul className="list-disc pl-6 mb-3 space-y-1">
          {node.content?.map((item, i) => (
            <BlockNode key={i} node={item} onImageClick={onImageClick} />
          ))}
        </ul>
      );

    case 'orderedList':
      return (
        <ol className="list-decimal pl-6 mb-3 space-y-1">
          {node.content?.map((item, i) => (
            <BlockNode key={i} node={item} onImageClick={onImageClick} />
          ))}
        </ol>
      );

    case 'listItem':
      return (
        <li>
          {node.content?.map((child, i) => (
            <BlockNode key={i} node={child} onImageClick={onImageClick} depth={depth + 1} />
          ))}
        </li>
      );

    case 'blockquote':
      return (
        <blockquote className="border-l-3 border-primary pl-4 my-4 text-muted-foreground italic">
          {node.content?.map((child, i) => (
            <BlockNode key={i} node={child} onImageClick={onImageClick} depth={depth + 1} />
          ))}
        </blockquote>
      );

    case 'horizontalRule':
      return <hr className="my-6 border-border" />;

    case 'imageBlock': {
      const { src: rawSrc, alt, caption, width, align } = node.attrs || {};
      const safeSrc = /^(https?:\/\/|\/)/i.test(rawSrc || '') ? rawSrc : '';
      const widthClass = width === 'small' ? 'max-w-xs' : width === 'medium' ? 'max-w-lg' : 'max-w-full';
      const alignClass = align === 'left' ? 'mr-auto' : align === 'right' ? 'ml-auto' : 'mx-auto';
      if (!safeSrc) return null;
      return (
        <figure className={`my-4 ${widthClass} ${alignClass}`}>
          <img
            src={safeSrc}
            alt={alt || ''}
            className="w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onImageClick?.(safeSrc)}
            loading="lazy"
          />
          {caption && (
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">
              {caption}
            </figcaption>
          )}
        </figure>
      );
    }

    case 'codeBlock': {
      const text = node.content?.map(n => n.text || '').join('\n') || '';
      return (
        <pre className="bg-muted rounded-lg p-4 my-4 overflow-x-auto">
          <code className="text-sm font-mono">{text}</code>
        </pre>
      );
    }

    case 'doc':
      return (
        <>
          {node.content?.map((child, i) => (
            <BlockNode key={i} node={child} onImageClick={onImageClick} depth={depth + 1} />
          ))}
        </>
      );

    default:
      // Unknown node type — skip entirely for security (only render known types)
      return null;
  }
}

export function BlockRenderer({ content, onImageClick }: BlockRendererProps) {
  return (
    <div className="blog-content">
      <BlockNode node={content} onImageClick={onImageClick} />
    </div>
  );
}

/** Try to parse content as TipTap JSON. Returns null if it's HTML. */
export function parseTipTapContent(content: string | undefined): JSONContent | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (parsed && parsed.type === 'doc') return parsed;
  } catch {
    // Not JSON
  }
  return null;
}

/** Extract all image URLs from TipTap JSON content */
export function extractImagesFromJson(doc: JSONContent): string[] {
  const urls: string[] = [];
  function walk(node: JSONContent, depth = 0) {
    if (depth > MAX_DEPTH) return;
    if (node.type === 'imageBlock' && node.attrs?.src) {
      urls.push(node.attrs.src);
    }
    if (node.content) node.content.forEach(c => walk(c, depth + 1));
  }
  walk(doc);
  return urls;
}
