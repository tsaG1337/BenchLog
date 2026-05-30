import { useState } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { useWiring } from '@/lib/wiring/store';

export function SheetTabs() {
  const sheets = useWiring(s => s.sheets);
  const activeId = useWiring(s => s.activeSheetId);
  const setActive = useWiring(s => s.setActiveSheet);
  const addSheet = useWiring(s => s.addSheet);
  const renameSheet = useWiring(s => s.renameSheet);
  const removeSheet = useWiring(s => s.removeSheet);

  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1 border-b border-border bg-card/30 px-2 overflow-x-auto">
      {sheets.map(sh => {
        const isActive = sh.id === activeId;
        const isEditing = editingId === sh.id;
        return (
          <div
            key={sh.id}
            className={`group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-b-2 whitespace-nowrap ${
              isActive
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => !isEditing && setActive(sh.id)}
            onDoubleClick={() => setEditingId(sh.id)}
          >
            {isEditing ? (
              <input
                autoFocus
                defaultValue={sh.name}
                onBlur={(e) => { renameSheet(sh.id, e.target.value.trim() || sh.name); setEditingId(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="bg-background border border-border rounded px-1 py-0.5 text-xs w-32"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span>{sh.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingId(sh.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  title="Rename"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {sheets.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete sheet "${sh.name}"? Wires on this sheet will be removed.`)) {
                        removeSheet(sh.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    title="Delete sheet"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      <button
        onClick={() => addSheet()}
        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        title="New sheet"
      >
        <Plus className="w-3 h-3" /> New sheet
      </button>
    </div>
  );
}
