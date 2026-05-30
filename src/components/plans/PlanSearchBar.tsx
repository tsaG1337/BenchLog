/**
 * Browser-find-style bar that floats over the PDF viewer.
 *
 * Visual model: a compact pill in the top-right of the canvas area —
 * input on the left, match counter, prev/next, sidebar toggle, close.
 * Keyboard:
 *   • Enter            → next match
 *   • Shift+Enter      → prev match
 *   • Esc              → close the bar
 *
 * The bar owns no search state of its own — it's a thin controlled
 * view over `usePdfTextSearch`.
 */
import { useEffect, useRef } from 'react';
import { MIcon } from '@/components/AppShell';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  matchCount: number;
  currentIndex: number;
  isSearching: boolean;
  tooShort: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function PlanSearchBar({
  query, onQueryChange,
  matchCount, currentIndex, isSearching, tooShort,
  onNext, onPrev, onClose,
  sidebarOpen, onToggleSidebar,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + select on mount so Ctrl+F → start typing immediately
  // overwrites any leftover query.
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matchCount === 0) return;
      if (e.shiftKey) onPrev();
      else onNext();
    }
  };

  const status = (() => {
    if (tooShort) return 'min 2 chars';
    if (isSearching) return 'searching…';
    if (!query.trim()) return '';
    if (matchCount === 0) return '0 matches';
    return `${currentIndex + 1} / ${matchCount}`;
  })();

  return (
    <div
      className="absolute z-30 top-2 right-2 flex items-center gap-1 px-1.5 py-1 rounded-md
                 bg-card/95 backdrop-blur shadow-md border border-border"
      // Stop the click reaching the page wrapper underneath (which would
      // otherwise drop an SB marker if place-sb mode is active).
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <MIcon name="search" className="text-base text-muted-foreground ml-1" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Find in PDF…"
        className="w-44 md:w-56 px-1.5 py-0.5 bg-transparent text-sm outline-none"
      />
      <span className="text-[11px] text-muted-foreground tabular-nums min-w-[58px] text-right pr-1">
        {status}
      </span>
      <button
        onClick={onPrev}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
        className="p-1 rounded hover:bg-muted disabled:opacity-30 transition"
      >
        <MIcon name="keyboard_arrow_up" className="text-base" />
      </button>
      <button
        onClick={onNext}
        disabled={matchCount === 0}
        title="Next match (Enter)"
        className="p-1 rounded hover:bg-muted disabled:opacity-30 transition"
      >
        <MIcon name="keyboard_arrow_down" className="text-base" />
      </button>
      <span className="mx-1 h-4 w-px bg-border" />
      <button
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Hide match list' : 'Show match list'}
        aria-pressed={sidebarOpen}
        className={`p-1 rounded transition ${
          sidebarOpen ? 'bg-amber-500/20 text-amber-700' : 'hover:bg-muted text-muted-foreground'
        }`}
      >
        <MIcon name="list" className="text-base" />
      </button>
      <button
        onClick={onClose}
        title="Close search (Esc)"
        className="p-1 rounded hover:bg-muted text-muted-foreground transition"
      >
        <MIcon name="close" className="text-base" />
      </button>
    </div>
  );
}
