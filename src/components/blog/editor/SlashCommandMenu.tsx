import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Pilcrow, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, Quote, Minus, ImageIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SlashCommandItem } from './extensions/SlashCommand';

const ICON_MAP: Record<string, LucideIcon> = {
  'pilcrow':   Pilcrow,
  'heading-1': Heading1,
  'heading-2': Heading2,
  'heading-3': Heading3,
  'heading-4': Heading4,
  'list':      List,
  'list-ordered': ListOrdered,
  'quote':     Quote,
  'minus':     Minus,
  'image':     ImageIcon,
};

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export function SlashCommandMenu({ items, command }: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Scroll selected item into view
  useLayoutEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) command(items[selectedIndex]);
        return true;
      }
      return false;
    },
    [items, selectedIndex, command],
  );

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-xl p-3 text-sm text-muted-foreground">
        No results
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="bg-card border border-border rounded-lg shadow-xl overflow-hidden max-h-72 overflow-y-auto min-w-[200px]"
    >
      {items.map((item, index) => {
        const Icon = ICON_MAP[item.icon] || Pilcrow;
        return (
          <button
            key={item.title}
            ref={(el) => { itemRefs.current[index] = el; }}
            onClick={() => command(item)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 text-left transition-colors',
              index === selectedIndex ? 'bg-secondary' : 'hover:bg-secondary/50',
            )}
          >
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{item.title}</div>
              <div className="text-xs text-muted-foreground truncate">{item.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
