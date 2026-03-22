import { useState } from 'react';
import { ChevronDown, ChevronRight, Calendar, Layers } from 'lucide-react';
import { BlogArchiveEntry } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { cn } from '@/lib/utils';
import { BuildFlowchart } from './BuildFlowchart';
import { ActivityHeatmap } from './ActivityHeatmap';

interface BlogSidebarProps {
  archive: BlogArchiveEntry[];
  activeSection?: string;
  activeYear?: string;
  activeMonth?: string;
  onFilterChange: (filters: { section?: string; year?: string; month?: string; plansSection?: string }) => void;
  projectName?: string;
  sectionHours?: Record<string, number>;
  showActivity?: boolean;
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function BlogSidebar({ archive, activeSection, activeYear, activeMonth, onFilterChange, projectName, sectionHours = {}, showActivity = true }: BlogSidebarProps) {
  const { sections } = useSections();
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => {
    const years = new Set<string>();
    if (archive.length > 0) years.add(archive[0].year);
    return years;
  });

  // Group archive by year
  const archiveByYear: Record<string, BlogArchiveEntry[]> = {};
  for (const entry of archive) {
    if (!archiveByYear[entry.year]) archiveByYear[entry.year] = [];
    archiveByYear[entry.year].push(entry);
  }
  const years = Object.keys(archiveByYear).sort((a, b) => b.localeCompare(a));

  const toggleYear = (year: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  };

  const isActiveTime = (year: string, month?: string) =>
    activeYear === year && (month ? activeMonth === month : !activeMonth);

  return (
    <aside className="space-y-6">
      {/* Section filter */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4" /> Sections
        </h3>
        <div className="space-y-1">
          <button
            onClick={() => onFilterChange({ year: activeYear, month: activeMonth })}
            className={cn(
              'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors',
              !activeSection ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-secondary'
            )}
          >
            All Sections
          </button>
          {sections.map(sec => (
            <button
              key={sec.id}
              onClick={() => onFilterChange({ section: sec.id, year: activeYear, month: activeMonth })}
              className={cn(
                'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2',
                activeSection === sec.id ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-secondary'
              )}
            >
              <span>{sec.icon}</span>
              <span className="flex-1 truncate">{sec.label}</span>
              {sectionHours[sec.id] ? (
                <span className="text-[10px] text-muted-foreground shrink-0">{sectionHours[sec.id]}h</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Archive tree */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Archive
        </h3>
        <div className="space-y-1">
          <button
            onClick={() => onFilterChange({ section: activeSection })}
            className={cn(
              'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors',
              !activeYear ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-secondary'
            )}
          >
            All Time
          </button>
          {years.map(year => {
            const isExpanded = expandedYears.has(year);
            const yearTotal = archiveByYear[year].reduce((s, e) => s + e.count, 0);
            return (
              <div key={year}>
                <button
                  onClick={() => toggleYear(year)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1',
                    isActiveTime(year) ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-secondary'
                  )}
                >
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span
                    className="flex-1 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onFilterChange({ section: activeSection, year }); }}
                  >
                    {year}
                  </span>
                  <span className="text-muted-foreground text-xs">({yearTotal})</span>
                </button>
                {isExpanded && (
                  <div className="ml-5 space-y-0.5 mt-0.5">
                    {archiveByYear[year].map(entry => (
                      <button
                        key={entry.month}
                        onClick={() => onFilterChange({ section: activeSection, year, month: entry.month })}
                        className={cn(
                          'w-full text-left px-3 py-1 rounded-md text-sm transition-colors flex items-center justify-between',
                          isActiveTime(year, entry.month) ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        )}
                      >
                        <span>{MONTH_NAMES[parseInt(entry.month)]}</span>
                        <span className="text-xs">({entry.count})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Heatmap */}
      {showActivity && <ActivityHeatmap compact />}

      {/* Build Progress Flowchart */}
      <BuildFlowchart projectName={projectName} onPlansSectionFilter={plansSection => onFilterChange({ plansSection })} />
    </aside>
  );
}
