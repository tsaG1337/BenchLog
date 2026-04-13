import { useState, useEffect } from 'react';
import { useSections } from '@/contexts/SectionsContext';
import { fetchFlowchartPackages, type FlowItem, type PackagesMap } from '@/lib/api';
import { ChevronDown, X } from 'lucide-react';

interface WorkPackagePickerProps {
  /** Assembly section id (e.g. 'empennage') */
  section: string;
  onSectionChange: (s: string) => void;
  /** Work-package number (e.g. '7' for Rudder). Empty = section-only. */
  plansSection: string;
  onPlansSectionChange: (v: string) => void;
  /** Compact layout for dialogs */
  compact?: boolean;
}

export function WorkPackagePicker({
  section, onSectionChange,
  plansSection, onPlansSectionChange,
  compact,
}: WorkPackagePickerProps) {
  const { sections } = useSections();
  const [packages, setPackages] = useState<PackagesMap>({});
  const [expanded, setExpanded] = useState(!!section);

  useEffect(() => { fetchFlowchartPackages().then(setPackages).catch(() => {}); }, []);

  const activeSection = sections.find(s => s.id === section);
  const tree = section ? (packages[section] || []) : [];

  const handleSectionClick = (id: string) => {
    if (section === id) {
      // Toggle off
      onSectionChange('');
      onPlansSectionChange('');
      setExpanded(false);
    } else {
      onSectionChange(id);
      onPlansSectionChange('');
      setExpanded(true);
    }
  };

  const handlePackageClick = (pkgNum: string) => {
    if (plansSection === pkgNum) {
      onPlansSectionChange('');
    } else {
      onPlansSectionChange(pkgNum);
    }
  };

  // Extract package number from label like "7 Rudder" → "7"
  const getPkgNum = (label: string) => /^(\d+)/.exec(label.trim())?.[1] || '';
  // Extract label text like "EE1 Engine Installation" or "7 Rudder"
  const getPkgId = (label: string) => /^([A-Z0-9-]+)/.exec(label.trim())?.[1] || '';

  const renderPackageTree = (items: FlowItem[], depth: number = 0): React.ReactNode => {
    return items.map(item => {
      const num = getPkgNum(item.label) || getPkgId(item.label);
      const isActive = plansSection === num;
      const hasChildren = item.children && item.children.length > 0;

      return (
        <div key={item.id}>
          <button
            onClick={() => num && handlePackageClick(num)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all flex items-center gap-2 overflow-hidden ${
              depth > 0 ? 'ml-4' : ''
            } ${
              isActive
                ? 'bg-primary/15 text-primary font-medium border border-primary/30'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {depth > 0 && <span className="text-muted-foreground/40 text-xs">└</span>}
            <span className="font-mono text-xs text-muted-foreground/70 min-w-[2ch]">{num}</span>
            <span className="truncate">{item.label.replace(/^[A-Z0-9-]+\s*/, '')}</span>
          </button>
          {hasChildren && renderPackageTree(item.children!, depth + 1)}
        </div>
      );
    });
  };

  const chipSize = compact
    ? 'px-2 py-1.5 text-[10px] gap-1'
    : 'px-2 py-2 text-[9px] gap-2';

  return (
    <div className="space-y-3">
      {/* Step 1: Section chips */}
      <div>
        <label className="font-label text-[10px] font-bold uppercase text-muted-foreground tracking-[0.15em] mb-2 block">
          Assembly Section
        </label>
        <div className={`grid ${compact ? 'grid-cols-2 gap-1.5' : 'grid-cols-4 gap-2'}`}>
          {sections.map((s) => {
            const isActive = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleSectionClick(s.id)}
                className={`flex items-center ${chipSize} rounded-md transition-all font-label font-bold uppercase ${
                  isActive
                    ? compact
                      ? 'bg-primary/15 border border-primary text-primary'
                      : 'bg-primary text-primary-foreground shadow-md'
                    : compact
                      ? 'bg-card border border-border text-muted-foreground hover:border-muted-foreground/50'
                      : 'bg-card hover:bg-card/80 text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={compact ? 'text-xs' : 'text-sm'}>{s.icon}</span>
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Work packages (shown when a section is selected and has packages) */}
      {section && tree.length > 0 && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.15em]">
                Work Package
                {plansSection && (
                  <span className="ml-2 text-primary font-mono normal-case">
                    #{plansSection}
                  </span>
                )}
              </span>
            </button>
            {plansSection && (
              <button
                onClick={() => { onPlansSectionChange(''); setExpanded(false); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Clear work package"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {expanded && (
            <div className={`space-y-0.5 ${compact ? 'max-h-[200px]' : 'max-h-[260px]'} overflow-y-auto overflow-x-hidden scrollbar-themed rounded-md bg-muted/30 p-2`}>
              {renderPackageTree(tree)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
