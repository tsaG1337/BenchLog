import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useWiring } from '@/lib/wiring/store';
import { colorForText } from './NetLabelView';

// Module-level resolver so callers (Pin, Wire, canvas background) can `await
// askForNetLabel()` without prop-drilling. The dialog component below
// registers itself on mount; the fallback uses window.prompt so the
// experience still works (degraded) if the dialog isn't mounted for some
// reason (tests, alternate hosts).
let pendingResolver: ((v: string | null) => void) | null = null;
let openSetter: ((v: boolean) => void) | null = null;

/**
 * Open the net-label picker and resolve with the chosen text (or null if the
 * user cancelled). Existing distinct net names are surfaced as a list inside
 * the dialog so the user can pick rather than re-type. The dialog is mounted
 * once at the WiringPage level — calling this before mount is a programmer
 * error and rejects synchronously so it surfaces in the console.
 */
export function askForNetLabel(): Promise<string | null> {
  if (!openSetter) {
    return Promise.reject(new Error('NetLabelPickerDialog is not mounted'));
  }
  return new Promise((resolve) => {
    pendingResolver = resolve;
    openSetter!(true);
  });
}

/** Mount this once at the WiringPage level. The picker reads existing labels
 *  from the store so the suggestion list is always in sync. */
export function NetLabelPickerDialog() {
  const netLabels = useWiring(s => s.netLabels);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Distinct existing net names, sorted by descending attachment count so the
  // most-used nets surface first. Each entry carries the deterministic
  // swatch colour so the picker matches what the user sees on the canvas.
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of netLabels) {
      const t = n.text.trim();
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([text, count]) => ({ text, count, color: colorForText(text) }))
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  }, [netLabels]);

  // Filter suggestions by the current input text (case-insensitive substring).
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter(s => s.text.toLowerCase().includes(q));
  }, [suggestions, value]);

  // Register/unregister this dialog as the active picker.
  useEffect(() => {
    openSetter = setOpen;
    return () => { if (openSetter === setOpen) openSetter = null; };
  }, []);

  // Autofocus the input when opening, and reset value each open so a stale
  // typed string from the previous session doesn't pre-fill.
  useEffect(() => {
    if (open) {
      setValue('');
      // requestAnimationFrame because shadcn's Dialog focus trap fights an
      // immediate .focus() on first render.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const submit = (text: string | null) => {
    const r = pendingResolver;
    pendingResolver = null;
    setOpen(false);
    if (r) r(text && text.trim() ? text.trim() : null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) submit(null); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle>Net label</DialogTitle>
          <DialogDescription className="text-xs">
            Pick from an existing net or type a new name. Pins sharing the same name are on the same implicit net.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Net name
          </label>
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 5V, GND, SkyView Power"
            className="mt-1 h-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit(value); }
              if (e.key === 'Escape') { e.preventDefault(); submit(null); }
            }}
          />
        </div>

        {/* Existing nets — clicking a row submits with that name. */}
        <div className="border-t border-border bg-card/30 max-h-[260px] overflow-y-auto">
          <div className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {filtered.length === 0
              ? (suggestions.length === 0 ? 'No existing nets yet' : 'No matches — Enter creates a new net')
              : `${filtered.length} existing net${filtered.length === 1 ? '' : 's'}`}
          </div>
          <ul>
            {filtered.map(s => (
              <li key={s.text}>
                <button
                  type="button"
                  onClick={() => submit(s.text)}
                  className="w-full flex items-center gap-2 px-5 py-2 text-left text-sm hover:bg-accent transition-colors"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-sm shrink-0"
                    style={{ background: s.color }}
                  />
                  <span className="flex-1 truncate text-foreground">{s.text}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    {s.count} {s.count === 1 ? 'pin' : 'pins'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => submit(null)}>Cancel</Button>
          <Button size="sm" onClick={() => submit(value)} disabled={!value.trim()}>
            {value.trim() && suggestions.some(s => s.text === value.trim())
              ? 'Use existing net'
              : 'Create net'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
