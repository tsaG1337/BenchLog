import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useSections } from '@/contexts/SectionsContext';
import { fetchFlowchartPackages, FlowItem, PackagesMap } from '@/lib/api';

interface BlogSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Sets the plans-section server filter (same as flowchart chip) */
  onPlansSectionChange: (plansSection: string) => void;
  /** Called when the user submits the search (button click or Enter) */
  onSearch: () => void;
}

function flattenItems(items: FlowItem[], depth = 0): { item: FlowItem; depth: number }[] {
  const result: { item: FlowItem; depth: number }[] = [];
  for (const it of items) {
    result.push({ item: it, depth });
    if (it.children?.length) result.push(...flattenItems(it.children, depth + 1));
  }
  return result;
}

/** Same logic as BuildFlowchart — extract leading number from a package label */
function extractSectionNumber(label: string): string | null {
  const m = /^(\d+)/.exec(label.trim());
  return m ? m[1] : null;
}

export function BlogSearchBar({
  query,
  onQueryChange,
  onPlansSectionChange,
  onSearch,
}: BlogSearchBarProps) {
  const { sections } = useSections();
  const [packages, setPackages] = useState<PackagesMap>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFlowchartPackages().then(setPackages).catch(() => {});
  }, []);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const packageOptions: { packageId: string; packageLabel: string; sectionId: string; depth: number }[] = [];
  for (const section of sections) {
    for (const { item, depth } of flattenItems(packages[section.id] || [])) {
      packageOptions.push({ packageId: item.id, packageLabel: item.label, sectionId: section.id, depth });
    }
  }

  const handlePackageSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const opt = packageOptions.find(o => o.packageId === e.target.value);
    if (!opt) return;
    e.target.value = '';
    const num = extractSectionNumber(opt.packageLabel);
    if (num) {
      onPlansSectionChange(num);
      onQueryChange('');
    } else {
      onQueryChange(opt.packageLabel);
    }
  };

  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); onSearch(); }}>
      {/* Text search input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search posts, plans reference…"
          className="w-full h-9 pl-9 pr-8 rounded-md border border-border bg-background/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Work package picker */}
      {packageOptions.length > 0 && (
        <select
          defaultValue=""
          onChange={handlePackageSelect}
          className="h-9 rounded-md border border-border bg-background/50 px-3 text-sm text-muted-foreground"
        >
          <option value="" disabled>Filter by work package…</option>
          {sections.map(sec => {
            const opts = packageOptions.filter(o => o.sectionId === sec.id);
            if (!opts.length) return null;
            return (
              <optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>
                {opts.map(o => (
                  <option key={o.packageId} value={o.packageId}>
                    {'  '.repeat(o.depth)}{o.packageLabel}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      )}

      {/* Search button */}
      <button
        type="submit"
        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
      >
        Search
      </button>
    </form>
  );
}
