/**
 * Right-docked overview panel listing every search hit, grouped by
 * page. Clicking a row jumps to that match — i.e. updates the
 * search hook's currentIndex which then drives both scroll and the
 * "active" highlight colour.
 *
 * Modelled after the Power PDF "Search Results" pane the user
 * referenced — page header, indented snippet rows underneath.
 */
import { MIcon } from '@/components/AppShell';
import type { PdfSearchMatch } from '@/lib/plans/pdfSearch';

interface Props {
  matchesByPage: Map<number, PdfSearchMatch[]>;
  totalMatches: number;
  currentIndex: number;
  onPickMatch: (index: number) => void;
  query: string;
  isSearching: boolean;
}

export function PlanSearchSidebar({
  matchesByPage, totalMatches, currentIndex, onPickMatch, query, isSearching,
}: Props) {
  const pages = Array.from(matchesByPage.keys()).sort((a, b) => a - b);

  return (
    <aside
      className="absolute z-20 top-12 right-2 bottom-2 w-72 flex flex-col
                 rounded-md bg-card/95 backdrop-blur shadow-md border border-border"
      // Same click guard as the search bar — stops the underlying page
      // from receiving SB-placement clicks.
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <header className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="text-xs font-semibold flex items-center gap-1.5">
          <MIcon name="list" className="text-sm text-muted-foreground" />
          Matches
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {isSearching ? 'searching…' : `${totalMatches} hit${totalMatches === 1 ? '' : 's'}`}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {totalMatches === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">
            {query.trim()
              ? isSearching ? 'Scanning the document…' : 'No matches for this query.'
              : 'Type in the search bar to find text in this PDF.'}
          </div>
        ) : (
          pages.map(pageNum => {
            const list = matchesByPage.get(pageNum) ?? [];
            return (
              <div key={pageNum} className="border-b border-border/60 last:border-b-0">
                <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Page {pageNum}
                  <span className="ml-2 normal-case font-normal text-muted-foreground/70">
                    ({list.length})
                  </span>
                </div>
                <ul>
                  {list.map(m => {
                    const isActive = m.index === currentIndex;
                    return (
                      <li key={m.index}>
                        <button
                          onClick={() => onPickMatch(m.index)}
                          className={`w-full text-left px-3 py-1.5 text-[11px] leading-snug
                            border-l-2 transition ${
                            isActive
                              ? 'bg-amber-500/15 border-amber-500 text-foreground'
                              : 'border-transparent hover:bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {renderSnippetWithHighlight(m.snippet, query)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

/** Bold the query substring(s) inside the snippet. Case-insensitive,
 *  matches the same query the search engine used so what's bold in the
 *  sidebar matches what's highlighted on the page. */
function renderSnippetWithHighlight(snippet: string, query: string) {
  const q = query.trim();
  if (!q) return snippet;
  const lower = snippet.toLowerCase();
  const needle = q.toLowerCase();
  const out: Array<string | JSX.Element> = [];
  let cursor = 0;
  let keyCounter = 0;
  while (true) {
    const idx = lower.indexOf(needle, cursor);
    if (idx === -1) {
      out.push(snippet.slice(cursor));
      break;
    }
    if (idx > cursor) out.push(snippet.slice(cursor, idx));
    out.push(
      <mark key={keyCounter++} className="bg-amber-300/70 text-foreground rounded px-0.5">
        {snippet.slice(idx, idx + needle.length)}
      </mark>,
    );
    cursor = idx + needle.length;
  }
  return out;
}
