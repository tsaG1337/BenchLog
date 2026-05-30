import type { Annotation } from '@/lib/wiring/types';
import { useGroupDrag } from '@/lib/wiring/useGroupDrag';
import { annotationPlainText } from './AnnotationEditor';

interface Props {
  annotation: Annotation;
  selected: boolean;
  onSelect: (id: string, shift: boolean) => void;
}

/**
 * Renders a free-text comment or a numbered note marker (engineering-drawing
 * style triangle with a number inside + description text next to it).
 *
 * Drag-to-move snaps to the 10-px grid, matching devices and labels.
 */
export function AnnotationView({ annotation, selected, onSelect }: Props) {
  const drag = useGroupDrag({
    kind: 'annotation',
    id: annotation.id,
    position: annotation.position,
  });
  const onPointerUp = (e: React.PointerEvent) => {
    const wasClick = drag.onPointerUp(e);
    if (wasClick) onSelect(annotation.id, e.shiftKey);
  };
  const onClick = (e: React.MouseEvent) => {
    // The hook's pointer-up already routes click-without-drag to onSelect;
    // this stops bubble so a stray click doesn't fall through to the canvas
    // background and clear the selection mid-shift-click.
    e.stopPropagation();
  };

  const stroke = selected ? 'hsl(var(--primary))' : 'hsl(var(--foreground))';
  // Cursor stays as "grab" — the active "grabbing" state would require
  // re-rendering on pointerdown which the hook doesn't trigger by design.
  const cursorStyle: React.CSSProperties = { cursor: 'grab' };

  if (annotation.kind === 'text') {
    // Annotation text is stored as TipTap HTML; strip to plain text + line
    // breaks for the on-canvas render. SVG <text> can't carry formatting
    // runs cleanly here, so the schematic stays plain even if the user
    // applied bold/italic in the editor (those are preserved in storage).
    const fontSize = annotation.fontSize ?? 12;
    const lines = annotationPlainText(annotation.text).split(/\r?\n/);
    const lineHeight = fontSize * 1.3;
    return (
      <g
        style={cursorStyle}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        {/* Invisible hit rect covering the text bounds. Sized roughly from
            the longest line + line count so clicking anywhere on the text
            area selects/drags it. */}
        {(() => {
          const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
          const w = Math.max(longest * fontSize * 0.55, 30);
          const h = lines.length * lineHeight + 4;
          return (
            <rect
              x={annotation.position.x - 2}
              y={annotation.position.y - fontSize}
              width={w}
              height={h}
              fill="transparent"
              stroke={selected ? stroke : 'none'}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          );
        })()}
        <text
          x={annotation.position.x}
          y={annotation.position.y}
          fontSize={fontSize}
          fill="hsl(var(--foreground))"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={annotation.position.x} dy={i === 0 ? 0 : lineHeight}>
              {line || ' '}
            </tspan>
          ))}
        </text>
      </g>
    );
  }

  // Note marker — equilateral triangle with the number inside, plus the
  // description text rendered to the right of the triangle.
  const R = 14; // triangle "radius" — distance from centre to vertices
  const cx = annotation.position.x + R;
  const cy = annotation.position.y + R;
  const v0 = `${cx},${cy - R}`;
  const v1 = `${cx - R * 0.9},${cy + R * 0.7}`;
  const v2 = `${cx + R * 0.9},${cy + R * 0.7}`;
  const trianglePath = `M ${v0} L ${v1} L ${v2} Z`;

  return (
    <g
      style={cursorStyle}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    >
      <path
        d={trianglePath}
        fill="hsl(var(--background))"
        stroke={stroke}
        strokeWidth={selected ? 2 : 1.2}
      />
      <text
        x={cx}
        y={cy + 4}
        fontSize={12}
        fontWeight={700}
        textAnchor="middle"
        fill="hsl(var(--foreground))"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {annotation.number}
      </text>
      {(() => {
        const plain = annotationPlainText(annotation.text);
        if (!plain) return null;
        return (
          <text
            x={cx + R * 0.9 + 8}
            y={cy + 4}
            fontSize={11}
            fill="hsl(var(--foreground))"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {plain}
          </text>
        );
      })()}
    </g>
  );
}
