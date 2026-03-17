import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '';

type ItemStatus = 'none' | 'in-progress' | 'done';
type StatusMap = Record<string, ItemStatus>;

interface FlowItem {
  id: string;
  label: string;
}

interface FlowGroup {
  title: string;
  items: FlowItem[];
}

const FLOWCHART_DATA: FlowGroup[] = [
  {
    title: 'EMPENNAGE / TAILCONE KIT',
    items: [
      { id: '6', label: '6 Vertical Stabilizer' },
      { id: '7', label: '7 Rudder' },
      { id: '8', label: '8 Horizontal Stabilizer' },
      { id: '9', label: '9 Elevator' },
      { id: '10', label: '10 Tailcone' },
      { id: '11', label: '11 Emp Attachment' },
      { id: '12', label: '12 Emp Fairings' },
    ],
  },
  {
    title: 'WING KIT',
    items: [
      { id: '13', label: '13 Main Spar' },
      { id: '14', label: '14 Wing Ribs' },
      { id: '15', label: '15 Rear Spar' },
      { id: '16', label: '16 Top Wing Skins' },
      { id: '17', label: '17 Outbd Leading Edge' },
      { id: '18', label: '18 Fuel Tank' },
      { id: '19', label: '19 Stall Warning System' },
      { id: '20', label: '20 Bottom Wing Skins' },
      { id: '21', label: '21 Aileron' },
      { id: '22', label: '22 Flap' },
      { id: '23', label: '23 Aileron Actuation' },
      { id: '24', label: '24 Wing Tip' },
    ],
  },
  {
    title: 'FUSELAGE KIT',
    items: [
      { id: '25', label: '25 Mid Fuselage Bulkheads' },
      { id: '26', label: '26 Mid Fuse Ribs & Bottom Skins' },
      { id: '27', label: '27 Firewall' },
      { id: '28', label: '28 Fwd Fuse Ribs, Bhds & Bottom Skin' },
      { id: '29', label: '29 Fuse Side Skins' },
      { id: '30', label: '30 Step Installation' },
      { id: '31', label: '31 Upper Forward Fuselage Assembly' },
      { id: '32', label: '32 Tailcone Attachment' },
      { id: '33', label: '33 Baggage Area' },
      { id: '34', label: '34 Baggage Door' },
      { id: '35', label: '35 Access Covers & Floor Panels' },
      { id: '36', label: '36 Brake Lines' },
      { id: '37', label: '37 Fuel System' },
      { id: '38', label: '38 Rudder Pedals & Brake System' },
      { id: '39', label: '39 Control System' },
      { id: '40', label: '40 Flap System' },
      { id: '41', label: '41 Upper Forward Fuselage Installation' },
      { id: '42', label: '42 Rear Seat Backs' },
      { id: '43', label: '43 Cabin Cover' },
      { id: '44', label: '44 Wing Attachment' },
    ],
  },
  {
    title: 'FINISH KIT',
    items: [
      { id: '45', label: '45 Cabin Doors & Transparencies' },
      { id: '45A', label: '45A Cabin Door Safety Latch' },
      { id: '46', label: '46 Engine Mount & Landing Gear' },
      { id: '47', label: '47 Spinner & Cowling' },
      { id: '48', label: '48 Gear Leg & Wheel Fairings' },
      { id: '49', label: '49 Seats & Seat Belts' },
      { id: '50', label: '50 Cabin Heat & Ventilation' },
    ],
  },
  {
    title: 'FIREWALL FORWARD KIT',
    items: [
      { id: 'FF1', label: 'FF1 Engine Installation' },
      { id: 'FF2', label: 'FF2 Cowl Baffle' },
      { id: 'FF3', label: 'FF3 Control Cables' },
      { id: 'FF4', label: 'FF4 Fuel System' },
      { id: 'FF5', label: 'FF5 Oil System' },
      { id: 'FF6', label: 'FF6 Exhaust System' },
    ],
  },
  {
    title: 'OPTIONAL KIT',
    items: [
      { id: 'OP-36', label: 'OP-36 Wingtip Lighting' },
      { id: 'OP-37', label: 'OP-37 Wiring Harness' },
    ],
  },
];

function getStatusColor(status: ItemStatus) {
  switch (status) {
    case 'done':
      return 'bg-emerald-600/80 text-emerald-50 border-emerald-500';
    case 'in-progress':
      return 'bg-amber-500/70 text-amber-50 border-amber-400';
    default:
      return 'bg-muted/60 text-muted-foreground border-border';
  }
}

function nextStatus(current: ItemStatus): ItemStatus {
  if (current === 'none') return 'in-progress';
  if (current === 'in-progress') return 'done';
  return 'none';
}

async function fetchFlowchartStatus(): Promise<StatusMap> {
  const res = await fetch(`${API_URL}/api/flowchart-status`);
  if (!res.ok) return {};
  return res.json();
}

async function saveFlowchartStatus(statuses: StatusMap): Promise<void> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API_URL}/api/flowchart-status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(statuses),
  });
  if (!res.ok) throw new Error('Failed to save');
}

// Full-size flowchart content
function FlowchartContent({ statuses, onToggle, isAuthenticated }: {
  statuses: StatusMap;
  onToggle: (id: string) => void;
  isAuthenticated: boolean;
}) {
  return (
    <div className="space-y-4">
      {FLOWCHART_DATA.map(group => (
        <div key={group.title}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
            {group.title}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map(item => {
              const status = statuses[item.id] || 'none';
              return (
                <button
                  key={item.id}
                  onClick={() => isAuthenticated && onToggle(item.id)}
                  className={cn(
                    'px-2 py-1 rounded border text-[11px] font-medium transition-all leading-tight',
                    getStatusColor(status),
                    isAuthenticated ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                  )}
                  title={isAuthenticated ? `Click to cycle: none → in progress → done` : item.label}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {/* Legend */}
      <div className="flex items-center gap-3 pt-2 border-t border-border text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-600/80 border border-emerald-500 inline-block" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-500/70 border border-amber-400 inline-block" /> In Progress
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-muted/60 border border-border inline-block" /> Not Started
        </span>
      </div>
    </div>
  );
}

// Thumbnail mini-preview
function FlowchartThumbnail({ statuses }: { statuses: StatusMap }) {
  const allItems = FLOWCHART_DATA.flatMap(g => g.items);
  const doneCount = allItems.filter(i => statuses[i.id] === 'done').length;
  const wipCount = allItems.filter(i => statuses[i.id] === 'in-progress').length;
  const total = allItems.length;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-0.5">
        {allItems.map(item => {
          const status = statuses[item.id] || 'none';
          return (
            <div
              key={item.id}
              className={cn(
                'w-full aspect-square rounded-sm border',
                status === 'done' ? 'bg-emerald-600/80 border-emerald-500' :
                status === 'in-progress' ? 'bg-amber-500/70 border-amber-400' :
                'bg-muted/40 border-border'
              )}
              title={item.label}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        {doneCount}/{total} done · {wipCount} in progress
      </p>
    </div>
  );
}

export function BuildFlowchart() {
  const { isAuthenticated } = useAuth();
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchFlowchartStatus().then(setStatuses).catch(() => {});
  }, []);

  const handleToggle = useCallback((id: string) => {
    setStatuses(prev => {
      const next = { ...prev, [id]: nextStatus(prev[id] || 'none') };
      saveFlowchartStatus(next).catch(() => toast.error('Failed to save status'));
      return next;
    });
  }, []);

  return (
    <>
      {/* Sidebar thumbnail */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Build Progress
        </h3>
        <button
          onClick={() => setExpanded(true)}
          className="w-full p-2 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors cursor-pointer"
        >
          <FlowchartThumbnail statuses={statuses} />
        </button>
      </div>

      {/* Expanded overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-card border border-border rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-auto relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">RV-10 Build Progress</h2>
              <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <FlowchartContent
              statuses={statuses}
              onToggle={handleToggle}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      )}
    </>
  );
}
