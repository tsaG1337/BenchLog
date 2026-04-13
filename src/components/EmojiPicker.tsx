import { useState, useRef, useEffect } from 'react';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Aviation',
    emojis: ['✈️', '🛩️', '🚁', '🛫', '🛬', '🪂', '🏁', '🔺'],
  },
  {
    label: 'Tools & Parts',
    emojis: ['🔧', '🪛', '🔩', '🪚', '🛠️', '⚙️', '🔨', '🧰', '🪜', '📐', '📏', '🪝', '🧲', '🧵'],
  },
  {
    label: 'Electrical',
    emojis: ['📡', '🔌', '💡', '🔋', '⚡', '📟', '🖥️', '💻'],
  },
  {
    label: 'Materials',
    emojis: ['🎨', '🪣', '🧪', '🛢️', '⛽', '🪟', '🪵', '🧱'],
  },
  {
    label: 'General',
    emojis: ['📋', '📝', '📦', '🏗️', '🚀', '🛞', '🎯', '✅', '⭐', '🔥', '💪', '🏆'],
  },
];

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="w-10 h-8 text-center text-base bg-background/50 border border-border rounded flex items-center justify-center hover:border-primary transition-colors"
        title="Pick icon"
      >
        {value || '📋'}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg p-3 w-[280px] max-h-[320px] overflow-y-auto scrollbar-themed"
          onClick={e => e.stopPropagation()}
        >
          {EMOJI_GROUPS.map(group => (
            <div key={group.label} className="mb-2 last:mb-0">
              <p className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-wider mb-1">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.emojis.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { onChange(emoji); setOpen(false); }}
                    className={`w-8 h-8 rounded flex items-center justify-center text-lg hover:bg-primary/10 transition-colors ${
                      value === emoji ? 'bg-primary/20 ring-1 ring-primary' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Custom input */}
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-wider mb-1">
              Custom
            </p>
            <input
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="Type emoji..."
              className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1"
              maxLength={4}
            />
          </div>
        </div>
      )}
    </div>
  );
}
