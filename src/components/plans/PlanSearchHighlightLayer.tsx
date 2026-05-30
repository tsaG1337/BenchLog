/**
 * Per-page absolutely-positioned overlay that paints yellow rectangles
 * over every search match's text item.
 *
 * Rectangles arrive normalized (0..1) from the search engine, so this
 * component just multiplies by 100% — zoom-agnostic by construction.
 *
 * The currently-active match (if it falls on this page) gets a deeper
 * amber + ring so the user can see which hit `Enter` is about to jump
 * to.
 */
import type { PdfSearchMatch } from '@/lib/plans/pdfSearch';

interface Props {
  matches: PdfSearchMatch[];
  currentIndex: number;
}

export function PlanSearchHighlightLayer({ matches, currentIndex }: Props) {
  if (matches.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none">
      {matches.map(match => {
        const isActive = match.index === currentIndex;
        return match.rects.map((r, j) => (
          <div
            key={`${match.index}-${j}`}
            className={
              isActive
                ? 'absolute bg-amber-400/60 ring-1 ring-amber-600 rounded-[1px]'
                : 'absolute bg-amber-300/35 rounded-[1px]'
            }
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
            }}
          />
        ));
      })}
    </div>
  );
}
