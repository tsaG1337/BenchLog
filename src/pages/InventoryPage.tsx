import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Pencil, Trash2, Search, ChevronRight, ChevronDown, Package, MapPin, Boxes, BarChart3, X, Camera, ShoppingCart, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchInvLocations, createInvLocation, updateInvLocation, deleteInvLocation,
  fetchInvParts, createInvPart, updateInvPart, deleteInvPart,
  fetchInvStock, createInvStock, updateInvStock, deleteInvStock,
  fetchInvStats, lookupInvPart, fetchGeneralSettings,
  fetchCheckSessions, createCheckSession, updateCheckSession, deleteCheckSession, fetchCheckSession, updateCheckItem,
  type InvLocation, type InvPart, type InvStock, type InvStats, type CheckSession, type CheckItem,
} from '@/lib/api';
import { AppShell, MIcon } from '@/components/AppShell';
import { LabelScanner, type ScanResult } from '@/components/inventory/LabelScanner';
import { MassIngestion } from '@/components/inventory/MassIngestion';
import { getVendorConfig } from '@/lib/ocrVendors';
import { findBagFuzzy, isBagLabel, getAllEntries, type ManifestEntry, type BagDefinition } from '@/lib/kitManifest';
import { ingestInvPart } from '@/lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

// ─── Constants ─────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'locations' | 'parts';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Overview', icon: BarChart3 },
  { id: 'parts', label: 'Inventory', icon: Package },
  { id: 'locations', label: 'Locations', icon: MapPin },
];
const CATEGORIES = ['hardware', 'structure', 'avionics', 'engine', 'electrical', 'paint', 'interior', 'tools', 'consumable', 'other'];
const KITS = ['Wing Kit', 'Fuselage Kit', 'Empennage Kit', 'Finishing Kit', 'Engine Kit', 'Avionics Kit', ''];
const STATUSES = ['in_stock', 'installed', 'reserved', 'backordered'] as const;
const CONDITIONS = ['new', 'used', 'damaged'] as const;
const STATUS_COLORS: Record<string, string> = {
  in_stock: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  installed: 'bg-primary/15 text-primary',
  reserved: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  backordered: 'bg-destructive/15 text-destructive',
};

// ─── Helpers ───────────────────────────────────────────────────────────
/** Round to 2 decimal places to avoid floating point display issues */
function roundQty(n: number): number | string { const r = Math.round(n * 100) / 100; return Number.isInteger(r) ? r : r; }

function buildLocationTree(locations: InvLocation[]): (InvLocation & { children: InvLocation[]; depth: number })[] {
  const map = new Map<number, InvLocation & { children: InvLocation[]; depth: number }>();
  for (const l of locations) map.set(Number(l.id), { ...l, children: [], depth: 0 });
  const roots: (InvLocation & { children: InvLocation[]; depth: number })[] = [];
  for (const l of map.values()) {
    const pid = l.parentId ? Number(l.parentId) : null;
    if (pid && map.has(pid)) map.get(pid)!.children.push(l);
    else roots.push(l);
  }
  const flat: (InvLocation & { children: InvLocation[]; depth: number })[] = [];
  function walk(nodes: typeof roots, depth: number) {
    for (const n of nodes) { n.depth = depth; flat.push(n); walk(n.children, depth + 1); }
  }
  walk(roots, 0);
  return flat;
}

function buildPath(locId: number, locations: InvLocation[]): string {
  const map = new Map(locations.map(l => [l.id, l]));
  const parts: string[] = [];
  let cur = map.get(locId);
  while (cur) { parts.unshift(cur.name); cur = cur.parentId ? map.get(cur.parentId) : undefined; }
  return parts.join(' → ');
}

/** Return only leaf locations (those with no children) */
function getLeafLocations(locations: InvLocation[]): InvLocation[] {
  const parentIds = new Set(locations.map(l => l.parentId ? Number(l.parentId) : null).filter(Boolean));
  return locations.filter(l => !parentIds.has(Number(l.id)));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MAIN PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function InventoryPage() {
  const { demoMode } = useAuth();
  const readOnly = demoMode;
  const [tab, setTab] = useState<Tab>('dashboard');
  const [filterLocationId, setFilterLocationId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState('BenchLog');

  // Data
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [parts, setParts] = useState<InvPart[]>([]);
  const [stock, setStock] = useState<InvStock[]>([]);
  const [stats, setStats] = useState<InvStats | null>(null);
  const [checkSessions, setCheckSessions] = useState<CheckSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [ocrVendor, setOcrVendor] = useState('vans');
  const [aircraftType, setAircraftType] = useState('vans-rv10');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [l, p, s, st, cs] = await Promise.all([fetchInvLocations(), fetchInvParts(), fetchInvStock(), fetchInvStats(), fetchCheckSessions()]);
      setLocations(l); setParts(p); setStock(s); setStats(st); setCheckSessions(cs);
    } catch { toast.error('Failed to load inventory'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { fetchGeneralSettings().then(s => { setProjectName(s.projectName); setOcrEnabled(!!s.ocrEnabled); setOcrVendor(s.ocrVendor || 'vans'); setAircraftType(s.aircraftType || 'vans-rv10'); }).catch(() => {}); }, []);

  return (
    <AppShell activePage="inventory" projectName={projectName}>
      {/* ── Tab Bar ──────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 sm:mb-6 bg-card rounded-lg p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.id === 'dashboard' ? 'Home' : t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground text-sm">Loading inventory...</div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardTab stats={stats} stock={stock} locations={locations} checkSessions={checkSessions} aircraftType={aircraftType} onRefresh={loadAll} />}
          {tab === 'locations' && <LocationsTab locations={locations} stock={stock} parts={parts} readOnly={readOnly} onRefresh={loadAll} onViewLocationStock={(locId) => { setFilterLocationId(locId); setTab('parts'); }} />}
          {tab === 'parts' && <PartsTab parts={parts} stock={stock} locations={locations} readOnly={readOnly} onRefresh={loadAll} ocrEnabled={ocrEnabled} ocrVendor={ocrVendor} aircraftType={aircraftType} initialLocationFilter={filterLocationId} onClearLocationFilter={() => setFilterLocationId(null)} onGoToLocations={() => setTab('locations')} />}
        </>
      )}
    </AppShell>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DASHBOARD TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DashboardTab({ stats, stock, locations, checkSessions, aircraftType, onRefresh }: {
  stats: InvStats | null; stock: InvStock[]; locations: InvLocation[];
  checkSessions: CheckSession[]; aircraftType: string; onRefresh: () => void;
}) {
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<InvStock[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const handleLookup = async () => {
    if (!lookupQuery.trim()) return;
    setLookupLoading(true);
    try {
      const results = await lookupInvPart(lookupQuery.trim());
      setLookupResults(results);
    } catch { toast.error('Lookup failed'); }
    setLookupLoading(false);
  };

  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const [sessionItems, setSessionItems] = useState<CheckItem[]>([]);
  const [sessionItemsLoading, setSessionItemsLoading] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'pending' | 'verified' | 'missing'>('all');

  // "Mark as Received" state
  const [receivingItem, setReceivingItem] = useState<{ sessionId: number; item: CheckItem } | null>(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [receiveLocId, setReceiveLocId] = useState<number | null>(null);
  const [receiveSaving, setReceiveSaving] = useState(false);
  const leafLocs = useMemo(() => getLeafLocations(locations), [locations]);

  const openReceive = (sessionId: number, item: CheckItem) => {
    const shortfall = item.qtyExpected - item.qtyFound;
    setReceivingItem({ sessionId, item });
    setReceiveQty(shortfall > 0 ? shortfall : item.qtyExpected);
    setReceiveLocId(leafLocs[0]?.id ?? null);
  };

  const handleReceive = async () => {
    if (!receivingItem || !receiveLocId || receiveQty <= 0) return;
    setReceiveSaving(true);
    const { sessionId, item } = receivingItem;
    try {
      // 1. Find or create the part in inventory
      const existingParts = await fetchInvParts();
      let part = existingParts.find(p => p.partNumber.toUpperCase() === item.partNumber.toUpperCase());
      if (!part) {
        part = await createInvPart({ partNumber: item.partNumber, name: item.nomenclature || '', subKit: item.subKit || '', bag: item.bag || '', category: 'other' });
      }

      // 2. Check for existing backordered stock and update it, otherwise create new stock
      const allStock = await fetchInvStock();
      const backorderedStock = allStock.find(s =>
        Number(s.partId) === part!.id && s.status === 'backordered'
      );
      if (backorderedStock) {
        await updateInvStock(backorderedStock.id, {
          quantity: backorderedStock.quantity + receiveQty,
          status: 'in_stock',
          locationId: receiveLocId,
        });
      } else {
        await createInvStock({
          partId: part.id, locationId: receiveLocId, quantity: receiveQty,
          unit: item.unit || 'pcs', status: 'in_stock', condition: 'new',
        });
      }

      // 3. Update the check item: add received qty, mark as verified if now complete
      const newQtyFound = item.qtyFound + receiveQty;
      const newStatus = newQtyFound >= item.qtyExpected ? 'verified' : 'missing';
      await updateCheckItem(sessionId, item.id, { qtyFound: newQtyFound, status: newStatus });

      setSessionItems(prev => prev.map(i => i.id === item.id ? { ...i, qtyFound: newQtyFound, status: newStatus } : i));
      setReceivingItem(null);
      onRefresh();
      toast.success(`${item.partNumber}: ${receiveQty} ${item.unit || 'pcs'} received — ${newStatus === 'verified' ? 'now verified' : 'still short'}`);
    } catch (err: any) { toast.error(err.message || 'Failed to receive item'); }
    setReceiveSaving(false);
  };

  const handleToggleItemStatus = async (sessionId: number, item: CheckItem, newStatus: 'missing' | 'pending') => {
    try {
      await updateCheckItem(sessionId, item.id, { status: newStatus });
      setSessionItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
      onRefresh();
    } catch { toast.error('Failed to update item'); }
  };

  const exportSessionItems = (session: CheckSession, items: CheckItem[], filter: 'all' | 'verified' | 'not_confirmed') => {
    const filtered = filter === 'all' ? items
      : filter === 'verified' ? items.filter(i => i.status === 'verified')
      : items.filter(i => i.status !== 'verified');

    const rows = filtered.map(i => ({
      'Part Number': i.partNumber,
      'Description': i.nomenclature || '',
      'Sub-Kit': i.subKit || '',
      'Bag': i.bag || '',
      'Qty Expected': roundQty(i.qtyExpected),
      'Qty Found': roundQty(i.qtyFound),
      'Unit': i.unit,
      'Status': i.status === 'verified' ? 'Confirmed' : i.status === 'missing' ? 'Missing' : 'Not checked',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String((r as any)[key]).length)) + 2,
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    const label = filter === 'all' ? 'All Items' : filter === 'verified' ? 'Confirmed' : 'Missing';
    XLSX.utils.book_append_sheet(wb, ws, label);

    const fileName = `${session.kitLabel.replace(/\s+/g, '_')}_${label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${filtered.length} items`);
  };

  const toggleSessionDetail = async (id: number) => {
    if (expandedSessionId === id) { setExpandedSessionId(null); return; }
    setExpandedSessionId(id);
    setSessionItemsLoading(true);
    setSessionFilter('all');
    try {
      const detail = await fetchCheckSession(id);
      setSessionItems(detail.items || []);
    } catch { toast.error('Failed to load session items'); }
    setSessionItemsLoading(false);
  };

  const handleDeleteSession = async (id: number) => {
    if (!confirm('Delete this check session? Progress will be lost.')) return;
    try { await deleteCheckSession(id); if (expandedSessionId === id) setExpandedSessionId(null); onRefresh(); toast.success('Session deleted'); }
    catch { toast.error('Failed to delete session'); }
  };

  const handlePauseResume = async (session: CheckSession) => {
    const newStatus = session.status === 'active' ? 'paused' : 'active';
    try { await updateCheckSession(session.id, { status: newStatus }); onRefresh(); }
    catch { toast.error('Failed to update session'); }
  };

  const handleComplete = async (session: CheckSession) => {
    try { await updateCheckSession(session.id, { status: 'completed' }); onRefresh(); toast.success('Session marked complete'); }
    catch { toast.error('Failed to complete session'); }
  };

  // Split sessions: active/paused first, completed below
  const activeSessions = checkSessions.filter(s => s.status !== 'completed');
  const completedSessions = checkSessions.filter(s => s.status === 'completed');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Quick Lookup */}
      <div className="bg-card rounded-lg p-4 sm:p-5">
        <h2 className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">Quick Part Lookup</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={lookupQuery}
              onChange={e => setLookupQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              placeholder="Part number (e.g. AN3-5A)"
              className="w-full pl-10 pr-4 py-2.5 rounded-md bg-muted/50 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleLookup}
            disabled={lookupLoading}
            className="px-4 sm:px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-label text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
          >
            {lookupLoading ? '...' : 'Find'}
          </button>
        </div>
        {lookupResults !== null && (
          <div className="mt-3">
            {lookupResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results for "{lookupQuery}"</p>
            ) : (
              <div className="space-y-2">
                {lookupResults.map(r => (
                  <div key={r.id} className="p-3 rounded-md bg-muted/30 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-medium">{r.partNumber}</span>
                        <span className="text-muted-foreground ml-2 hidden sm:inline">{r.partName}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status]}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs sm:hidden mt-0.5">{r.partName}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">×{r.quantity} {r.unit}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {r.locationPath || r.locationName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon="inventory_2" label="Parts" value={String(stats?.totalParts ?? 0)} />
        <StatCard icon="warehouse" label="Locations" value={String(stats?.totalLocations ?? 0)} />
        <StatCard icon="check_circle" label="Installed" value={String(stats?.installed ?? 0)} accent="blue" />
        <StatCard icon="local_shipping" label="Backordered" value={String(stats?.backordered ?? 0)} accent="red" />
      </div>

      {/* Kit Check Sessions */}
      {(activeSessions.length > 0 || completedSessions.length > 0) && (
        <div className="space-y-3">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Kit Check Sessions</p>
          {activeSessions.map(session => {
            const pct = session.totalItems > 0 ? Math.round(((session.verifiedItems + session.missingItems) / session.totalItems) * 100) : 0;
            const remaining = session.totalItems - session.verifiedItems - session.missingItems;
            const isExpanded = expandedSessionId === session.id;
            const filteredItems = sessionFilter === 'all' ? sessionItems : sessionItems.filter(i => i.status === sessionFilter);
            // Group by sub-kit/bag
            const grouped = new Map<string, CheckItem[]>();
            for (const item of filteredItems) {
              const key = item.bag || item.subKit || 'Other';
              const arr = grouped.get(key) || [];
              arr.push(item);
              grouped.set(key, arr);
            }
            return (
              <div key={session.id} className="bg-card rounded-lg overflow-hidden">
                {/* Card header — clickable */}
                <button onClick={() => toggleSessionDetail(session.id)} className="w-full text-left p-4 sm:p-5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MIcon name="fact_check" className="text-lg text-primary" />
                      <div>
                        <p className="text-sm font-bold">{session.kitLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.status === 'paused' && <span className="text-amber-500 font-medium">Paused · </span>}
                          {session.verifiedItems} verified · {session.missingItems} missing · {remaining} remaining
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-headline font-black text-primary">{pct}%</span>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div className="h-full flex">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${session.totalItems > 0 ? (session.verifiedItems / session.totalItems) * 100 : 0}%` }} />
                      <div className="bg-destructive transition-all" style={{ width: `${session.totalItems > 0 ? (session.missingItems / session.totalItems) * 100 : 0}%` }} />
                    </div>
                  </div>
                </button>

                {/* Action buttons */}
                <div className="flex gap-2 px-4 sm:px-5 pb-4 sm:pb-5">
                  <button onClick={() => handlePauseResume(session)}
                    className="flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-muted/50 hover:bg-muted transition-colors">
                    {session.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  {pct === 100 && (
                    <button onClick={() => handleComplete(session)}
                      className="flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 transition-colors">
                      Complete
                    </button>
                  )}
                  <button onClick={() => handleDeleteSession(session.id)}
                    className="px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expanded item list */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {sessionItemsLoading ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">Loading items...</div>
                    ) : (
                      <>
                        {/* Filter tabs + export */}
                        <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-2">
                          <div className="flex gap-1 overflow-x-auto">
                            {([['all', `All (${sessionItems.length})`], ['pending', `Pending (${sessionItems.filter(i => i.status === 'pending').length})`], ['verified', `Verified (${sessionItems.filter(i => i.status === 'verified').length})`], ['missing', `Missing (${sessionItems.filter(i => i.status === 'missing').length})`]] as const).map(([key, label]) => (
                              <button key={key} onClick={() => setSessionFilter(key)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${sessionFilter === key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <div className="relative shrink-0 group">
                            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
                              <MIcon name="download" className="text-sm" /> Export
                            </button>
                            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[180px] z-20 hidden group-hover:block">
                              <button onClick={() => exportSessionItems(session, sessionItems, 'all')}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-muted/50 transition-colors">
                                Export all items
                              </button>
                              <button onClick={() => exportSessionItems(session, sessionItems, 'verified')}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-muted/50 transition-colors text-emerald-500">
                                Export confirmed only
                              </button>
                              <button onClick={() => exportSessionItems(session, sessionItems, 'not_confirmed')}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-muted/50 transition-colors text-destructive">
                                Export missing / not confirmed
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Grouped items */}
                        <div className="max-h-[60vh] overflow-y-auto">
                          {filteredItems.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">No items match this filter</div>
                          ) : (
                            Array.from(grouped.entries()).map(([group, groupItems]) => {
                              const bagVerified = groupItems.filter(i => i.status === 'verified').length;
                              const bagMissing = groupItems.filter(i => i.status === 'missing').length;
                              const bagTotal = groupItems.length;
                              const bagChecked = bagVerified + bagMissing;
                              return (
                              <div key={group}>
                                <div className="sticky top-0 z-10 px-4 py-1.5 bg-muted/40 backdrop-blur-sm flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group}</span>
                                    <span className="text-[10px] text-muted-foreground">({bagTotal})</span>
                                  </div>
                                  {bagChecked > 0 && (
                                    <div className="flex items-center gap-2">
                                      {bagVerified > 0 && <span className="text-[10px] text-emerald-500 font-medium">{bagVerified} verified</span>}
                                      {bagMissing > 0 && <span className="text-[10px] text-destructive font-medium">{bagMissing} missing</span>}
                                      {bagChecked === bagTotal && <MIcon name="check_circle" className="text-xs text-emerald-500" />}
                                    </div>
                                  )}
                                </div>
                                <div className="divide-y divide-border/50">
                                  {groupItems.map(item => (
                                    <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                                      {/* Status icon */}
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                        item.status === 'verified' ? 'bg-emerald-500/15' :
                                        item.status === 'missing' ? 'bg-destructive/15' :
                                        item.qtyFound > 0 ? 'bg-amber-500/15' : 'bg-muted/50'
                                      }`}>
                                        {item.status === 'verified' && <MIcon name="check" className="text-sm text-emerald-500" />}
                                        {item.status === 'missing' && <MIcon name="close" className="text-sm text-destructive" />}
                                        {item.status === 'pending' && item.qtyFound > 0 && <MIcon name="remove" className="text-sm text-amber-500" />}
                                        {item.status === 'pending' && item.qtyFound === 0 && <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />}
                                      </div>
                                      {/* Part info */}
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-mono truncate ${item.status === 'pending' ? 'text-muted-foreground' : 'font-medium'}`}>
                                          {item.partNumber}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">{item.nomenclature}</p>
                                      </div>
                                      {/* Qty */}
                                      <div className="shrink-0 text-right">
                                        <span className={`text-xs font-mono ${item.qtyFound > 0 && item.qtyFound < item.qtyExpected ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                          {roundQty(item.qtyFound)}/{roundQty(item.qtyExpected)} {item.unit !== 'pcs' ? item.unit : ''}
                                        </span>
                                      </div>
                                      {/* Actions */}
                                      <div className="shrink-0 flex items-center gap-1">
                                        {item.status === 'pending' && (
                                          <button onClick={() => handleToggleItemStatus(session.id, item, 'missing')}
                                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Mark as missing">
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {item.status === 'missing' && (
                                          <>
                                            <button onClick={() => openReceive(session.id, item)}
                                              className="p-1 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400 transition-colors" title="Mark as received">
                                              <MIcon name="add_circle" className="text-sm" />
                                            </button>
                                            <button onClick={() => handleToggleItemStatus(session.id, item, 'pending')}
                                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Reset to pending">
                                              <MIcon name="undo" className="text-sm" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {completedSessions.length > 0 && (
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                {completedSessions.length} completed session{completedSessions.length !== 1 ? 's' : ''}
              </summary>
              <div className="mt-2 space-y-2">
                {completedSessions.map(session => (
                  <div key={session.id} className="bg-card rounded-lg p-3 sm:p-4 flex items-center justify-between opacity-70">
                    <div>
                      <p className="text-sm font-medium">{session.kitLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.verifiedItems} verified · {session.missingItems} missing · {new Date(session.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <MIcon name="check_circle" className="text-emerald-500" />
                      <button onClick={() => handleDeleteSession(session.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Categories Breakdown */}
      {stats && stats.byCategory.length > 1 && (
        <div className="bg-card rounded-lg p-4 sm:p-5">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">Parts by Category</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-2">
            {stats.byCategory.map(c => (
              <div key={c.category} className="flex items-center justify-between p-2 sm:p-2.5 rounded-md bg-muted/30 text-xs sm:text-sm">
                <span className="capitalize">{c.category}</span>
                <span className="font-mono text-muted-foreground">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Receive Item Dialog ── */}
      {receivingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReceivingItem(null)}>
          <div className="bg-card rounded-xl p-5 mx-4 max-w-sm w-full space-y-4 border border-border shadow-xl" onClick={e => e.stopPropagation()}>
            <div>
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400 mb-1">Mark as Received</p>
              <p className="text-sm font-mono font-bold">{receivingItem.item.partNumber}</p>
              <p className="text-xs text-muted-foreground">{receivingItem.item.nomenclature}</p>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
              Expected: <strong className="text-foreground">{roundQty(receivingItem.item.qtyExpected)}</strong> ·
              Found: <strong className="text-foreground">{roundQty(receivingItem.item.qtyFound)}</strong> ·
              Short: <strong className="text-destructive">{roundQty(receivingItem.item.qtyExpected - receivingItem.item.qtyFound)}</strong>
              {receivingItem.item.unit !== 'pcs' && ` ${receivingItem.item.unit}`}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Qty Received</label>
                <input type="number" value={receiveQty} onChange={e => setReceiveQty(Number(e.target.value))} min={0} step="any"
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              </div>
              <div>
                <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Location</label>
                <select value={receiveLocId ?? ''} onChange={e => setReceiveLocId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                  {leafLocs.length === 0 && <option value="">No locations</option>}
                  {leafLocs.map(l => <option key={l.id} value={l.id}>{buildPath(l.id, locations)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setReceivingItem(null)}
                className="flex-1 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleReceive} disabled={receiveSaving || !receiveLocId || receiveQty <= 0}
                className="flex-1 px-3 py-2.5 rounded-md bg-emerald-600 text-foreground font-bold text-sm hover:bg-emerald-500 transition-colors disabled:opacity-40">
                {receiveSaving ? 'Saving...' : 'Receive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: string }) {
  const color = accent === 'red' ? 'text-destructive' : 'text-primary';
  return (
    <div className="bg-card rounded-lg px-3 py-2.5 flex items-center gap-2.5">
      <MIcon name={icon} className={`text-base ${color}`} />
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-headline font-black leading-none">{value}</span>
        <span className="font-label text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LOCATIONS TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LocationsTab({ locations, stock, parts, readOnly, onRefresh, onViewLocationStock }: {
  locations: InvLocation[]; stock: InvStock[]; parts: InvPart[]; readOnly: boolean; onRefresh: () => void;
  onViewLocationStock: (locationId: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InvLocation | null>(null);
  const [selectedLocs, setSelectedLocs] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const tree = useMemo(() => buildLocationTree(locations), [locations]);

  // Count stock items per location
  const stockCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const s of stock) counts[s.locationId] = (counts[s.locationId] || 0) + 1;
    return counts;
  }, [stock]);

  // Map part IDs to part numbers for display in delete warning
  const partMap = useMemo(() => new Map(parts.map(p => [p.id, p])), [parts]);

  const handleSave = async (data: Partial<InvLocation>) => {
    try {
      if (editing) await updateInvLocation(editing.id, data);
      else await createInvLocation(data);
      setShowForm(false); setEditing(null); onRefresh();
      toast.success(editing ? 'Location updated' : 'Location created');
    } catch (err: any) { toast.error(err.message); }
  };

  // Collect all descendant IDs of a location
  const getDescendants = useCallback((id: number): number[] => {
    const result: number[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const loc of locations) {
        if (loc.parentId === parentId) { result.push(loc.id); queue.push(loc.id); }
      }
    }
    return result;
  }, [locations]);

  const handleDelete = async (id: number) => {
    const descendants = getDescendants(id);
    const allIds = [id, ...descendants];
    const totalStock = allIds.reduce((sum, locId) => sum + (stockCounts[locId] || 0), 0);

    // Block if any location in the tree has stock
    if (totalStock > 0) {
      const locStock = stock.filter(s => allIds.includes(s.locationId));
      const itemList = locStock.slice(0, 5).map(s => {
        const p = partMap.get(s.partId);
        const locName = locations.find(l => l.id === s.locationId)?.name || '';
        return p ? `  ${p.partNumber} — ${s.quantity} ${s.unit || 'pcs'} (${locName})` : `  Part #${s.partId}`;
      }).join('\n');
      const more = locStock.length > 5 ? `\n  ... and ${locStock.length - 5} more` : '';
      const action = confirm(
        `This location${descendants.length > 0 ? ' and its sub-locations have' : ' has'} ${totalStock} stock entr${totalStock !== 1 ? 'ies' : 'y'}:\n\n${itemList}${more}\n\nReassign them first before deleting.\nClick OK to view these items in the Inventory tab.`
      );
      if (action) onViewLocationStock(id);
      return;
    }

    // No stock — confirm with list of child locations
    if (descendants.length > 0) {
      const childNames = descendants.map(cid => {
        const loc = locations.find(l => l.id === cid);
        return loc ? `  • ${loc.name}` : '';
      }).filter(Boolean).join('\n');
      if (!confirm(`Delete this location and ${descendants.length} sub-location${descendants.length !== 1 ? 's' : ''}?\n\n${childNames}`)) return;
    } else {
      if (!confirm('Delete this empty location?')) return;
    }
    try { await deleteInvLocation(id, descendants.length > 0); onRefresh(); toast.success('Location deleted'); }
    catch (err: any) { toast.error(err.message); }
  };

  const toggleLocSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLocs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleLocSelectAll = () => {
    if (selectedLocs.size === tree.length) setSelectedLocs(new Set());
    else setSelectedLocs(new Set(tree.map(l => l.id)));
  };

  const handleBulkDeleteLocs = async () => {
    // Expand selection to include all descendants of selected locations
    const allIds = new Set<number>();
    for (const id of selectedLocs) {
      allIds.add(id);
      for (const d of getDescendants(id)) allIds.add(d);
    }

    // Check for stock in any of these locations
    const totalStock = [...allIds].reduce((sum, locId) => sum + (stockCounts[locId] || 0), 0);
    if (totalStock > 0) {
      const locStock = stock.filter(s => allIds.has(s.locationId));
      const itemList = locStock.slice(0, 5).map(s => {
        const p = partMap.get(s.partId);
        const locName = locations.find(l => l.id === s.locationId)?.name || '';
        return p ? `  ${p.partNumber} — ${s.quantity} ${s.unit || 'pcs'} (${locName})` : `  Part #${s.partId}`;
      }).join('\n');
      const more = locStock.length > 5 ? `\n  ... and ${locStock.length - 5} more` : '';
      alert(`Cannot delete — ${totalStock} stock entr${totalStock !== 1 ? 'ies' : 'y'} exist in these locations:\n\n${itemList}${more}\n\nReassign stock first before deleting.`);
      return;
    }

    if (!confirm(`Delete ${allIds.size} location${allIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      // Delete leaves first (children before parents) by sorting deepest-first
      const sorted = [...allIds].map(id => {
        const loc = tree.find(l => l.id === id);
        return { id, depth: loc?.depth ?? 0 };
      }).sort((a, b) => b.depth - a.depth);
      for (const { id } of sorted) {
        await deleteInvLocation(id, false);
      }
      setSelectedLocs(new Set());
      onRefresh();
      toast.success(`${allIds.size} location${allIds.size !== 1 ? 's' : ''} deleted`);
    } catch (err: any) { toast.error(err.message); }
    setBulkDeleting(false);
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex justify-end">
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground font-label text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add Location
          </button>
        </div>
      )}

      {showForm && (
        <LocationForm
          location={editing}
          locations={locations}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* Bulk action bar */}
      {selectedLocs.size > 0 && !readOnly && (
        <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium">{selectedLocs.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedLocs(new Set())}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
              Clear
            </button>
            <button onClick={handleBulkDeleteLocs} disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {tree.length === 0 ? (
        <div className="bg-card rounded-lg text-center py-16 text-muted-foreground">
          <p className="text-lg">No locations yet</p>
          <p className="text-sm mt-1">Create your first storage location to start organizing parts.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg overflow-hidden divide-y divide-border">
          {/* Select all header */}
          {!readOnly && (
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/30">
              <input type="checkbox" checked={selectedLocs.size === tree.length && tree.length > 0}
                onChange={toggleLocSelectAll}
                className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
              <span className="text-xs text-muted-foreground">
                {selectedLocs.size === tree.length && tree.length > 0 ? 'Deselect all' : 'Select all'} ({tree.length})
              </span>
            </div>
          )}
          {tree.map((loc, idx) => {
            // Determine which ancestor depths should show a continuing vertical line
            const hasNextSibling = tree.slice(idx + 1).some(
              (n) => n.depth === loc.depth && String(n.parentId) === String(loc.parentId)
            );
            // Build guide lines for each depth level
            const guides: boolean[] = [];
            if (loc.depth > 0) {
              let cur = loc;
              for (let d = loc.depth - 1; d >= 0; d--) {
                const parentOfCur = tree.find(n => Number(n.id) === Number(cur.parentId));
                const parentIdx = parentOfCur ? tree.indexOf(parentOfCur) : -1;
                // Check if this ancestor has more children after current branch
                const ancestorHasMore = parentIdx >= 0 && tree.slice(idx + 1).some(
                  n => n.depth === d + 1 && Number(n.parentId) === Number(parentOfCur!.id)
                );
                guides[d] = ancestorHasMore;
                cur = parentOfCur || cur;
              }
            }

            return (
              <div key={loc.id} className={`flex items-center justify-between px-3 sm:px-4 py-0 hover:bg-muted/30 transition-colors ${selectedLocs.has(loc.id) ? 'bg-primary/5' : ''}`}>
                <div className="flex items-center gap-0 min-w-0 py-2.5 sm:py-3">
                  {/* Checkbox */}
                  {!readOnly && (
                    <div className="shrink-0 mr-2" onClick={e => toggleLocSelect(loc.id, e)}>
                      <input type="checkbox" checked={selectedLocs.has(loc.id)} readOnly
                        className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                    </div>
                  )}
                  {/* Tree guide lines */}
                  {Array.from({ length: loc.depth }, (_, d) => (
                    <span
                      key={d}
                      className="inline-flex items-center justify-center shrink-0"
                      style={{ width: 24, height: 32 }}
                    >
                      {d < loc.depth - 1 ? (
                        // Vertical pass-through line for ancestors that have more children
                        guides[d] ? (
                          <span className="w-px h-full bg-border" />
                        ) : (
                          <span style={{ width: 24 }} />
                        )
                      ) : (
                        // Branch connector for the immediate parent
                        <svg width="24" height="32" className="text-border shrink-0">
                          {/* Vertical line from top to middle */}
                          <line x1="12" y1="0" x2="12" y2="16" stroke="currentColor" strokeWidth="1" />
                          {/* Horizontal line from middle to right */}
                          <line x1="12" y1="16" x2="24" y2="16" stroke="currentColor" strokeWidth="1" />
                          {/* Continue vertical line down if there are more siblings */}
                          {hasNextSibling && (
                            <line x1="12" y1="16" x2="12" y2="32" stroke="currentColor" strokeWidth="1" />
                          )}
                        </svg>
                      )}
                    </span>
                  ))}
                  <MIcon name="folder" className="text-base sm:text-lg text-muted-foreground shrink-0 ml-1 mr-2" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium truncate block">{loc.name}</span>
                    {loc.description && <span className="text-xs text-muted-foreground hidden sm:inline">{loc.description}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{stockCounts[loc.id] || 0}</span>
                  {!readOnly && (
                    <>
                      <button onClick={() => { setEditing(loc); setShowForm(true); }} className="p-1 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(loc.id)} className="p-1 rounded hover:bg-muted"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LocationForm({ location, locations, onSave, onCancel }: {
  location: InvLocation | null; locations: InvLocation[]; onSave: (data: Partial<InvLocation>) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(location?.name || '');
  const [description, setDescription] = useState(location?.description || '');
  const [parentId, setParentId] = useState<number | null>(location?.parentId ?? null);

  return (
    <div className="bg-card rounded-lg p-5 space-y-4 border border-border">
      <p className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{location ? 'Edit Location' : 'New Location'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Shelf 1"
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Parent Location</label>
          <select value={parentId ?? ''} onChange={e => setParentId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">None (root)</option>
            {locations.filter(l => l.id !== location?.id).map(l => (
              <option key={l.id} value={l.id}>{buildPath(l.id, locations)}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description"
          className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">Cancel</button>
        <button onClick={() => name && onSave({ name, description, parentId })}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-label text-xs font-bold uppercase tracking-wider hover:opacity-90">
          {location ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PARTS TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PartsTab({ parts, stock, locations, readOnly, onRefresh, ocrEnabled, ocrVendor, aircraftType, initialLocationFilter, onClearLocationFilter, onGoToLocations }: {
  parts: InvPart[]; stock: InvStock[]; locations: InvLocation[]; readOnly: boolean; onRefresh: () => void;
  ocrEnabled?: boolean; ocrVendor?: string; aircraftType?: string;
  initialLocationFilter?: number | null; onClearLocationFilter?: () => void;
  onGoToLocations?: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InvPart | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterKit, setFilterKit] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLocId, setFilterLocId] = useState<number | null>(initialLocationFilter ?? null);
  const [filterBag, setFilterBag] = useState('');

  // Sync external location filter
  useEffect(() => {
    if (initialLocationFilter != null) setFilterLocId(initialLocationFilter);
  }, [initialLocationFilter]);
  const [showMassIngest, setShowMassIngest] = useState(false);
  const [bulkMoving, setBulkMoving] = useState(false);
  const [expandedParts, setExpandedParts] = useState<Set<number>>(new Set());
  const [editingStock, setEditingStock] = useState<InvStock | null>(null);
  const [showStockFormForPart, setShowStockFormForPart] = useState<number | null>(null);
  const [selectedParts, setSelectedParts] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Build stock index by part ID (coerce to number — PG BIGSERIAL returns strings)
  const stockByPart = useMemo(() => {
    const map = new Map<number, InvStock[]>();
    for (const s of stock) {
      const pid = Number(s.partId);
      const arr = map.get(pid) || [];
      arr.push(s);
      map.set(pid, arr);
    }
    return map;
  }, [stock]);

  const availableKits = useMemo(() => {
    const kits = new Set<string>();
    for (const s of stock) { if (s.sourceKit) kits.add(s.sourceKit); }
    return Array.from(kits).sort();
  }, [stock]);

  const availableBags = useMemo(() => {
    const bags = new Set<string>();
    for (const p of parts) { if (p.bag) bags.add(p.bag); }
    for (const s of stock) { if (s.batch) bags.add(s.batch); }
    return Array.from(bags).sort();
  }, [parts, stock]);

  const filtered = useMemo(() => {
    let list = parts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => {
        if (p.partNumber.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.manufacturer.toLowerCase().includes(q) || (p.subKit && p.subKit.toLowerCase().includes(q)) || (p.bag && p.bag.toLowerCase().includes(q))) return true;
        const ps = stockByPart.get(Number(p.id)) || [];
        return ps.some(s => (s.sourceKit && s.sourceKit.toLowerCase().includes(q)) || (s.batch && s.batch.toLowerCase().includes(q)));
      });
    }
    if (filterCat) list = list.filter(p => p.category === filterCat);
    if (filterKit) list = list.filter(p => {
      const ps = stockByPart.get(Number(p.id)) || [];
      return ps.some(s => s.sourceKit === filterKit);
    });
    if (filterStatus) {
      list = list.filter(p => {
        const ps = stockByPart.get(Number(p.id)) || [];
        if (filterStatus === 'no_stock') return ps.length === 0;
        return ps.some(s => s.status === filterStatus);
      });
    }
    if (filterLocId) {
      list = list.filter(p => {
        const ps = stockByPart.get(Number(p.id)) || [];
        return ps.some(s => s.locationId === filterLocId);
      });
    }
    if (filterBag) list = list.filter(p => {
      if (p.bag === filterBag) return true;
      const ps = stockByPart.get(Number(p.id)) || [];
      return ps.some(s => s.batch === filterBag);
    });
    return list;
  }, [parts, search, filterCat, filterKit, filterStatus, filterLocId, filterBag, stockByPart]);

  // Clear selection when filters change to prevent invisible bulk actions on non-visible items
  useEffect(() => {
    setSelectedParts(new Set());
  }, [search, filterCat, filterKit, filterStatus, filterLocId, filterBag]);

  const toggleExpanded = (id: number) => {
    setExpandedParts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async (data: Partial<InvPart> & { _stock?: { locationId: number; quantity: number; unit: string; status: string; condition: string } }) => {
    try {
      const { _stock, ...partData } = data;
      let savedPart: InvPart;
      if (editing) {
        savedPart = await updateInvPart(editing.id, partData);
      } else {
        savedPart = await createInvPart(partData);
        if (_stock && _stock.locationId) {
          await createInvStock({
            partId: savedPart.id, locationId: _stock.locationId,
            quantity: _stock.quantity, unit: _stock.unit,
            status: _stock.status as any, condition: _stock.condition as any,
          });
        }
      }
      setShowForm(false); setEditing(null); onRefresh();
      toast.success(editing ? 'Part updated' : _stock?.locationId ? 'Part created with stock entry' : 'Part created');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeletePart = async (id: number) => {
    if (!confirm('Delete this part and all its stock entries?')) return;
    try { await deleteInvPart(id); onRefresh(); toast.success('Part deleted'); }
    catch (err: any) { toast.error(err.message); }
  };

  const handleSaveStock = async (data: Partial<InvStock>) => {
    try {
      if (editingStock) await updateInvStock(editingStock.id, data);
      else await createInvStock(data);

      // Option B: detect backordered → in_stock transition and offer to update check items
      if (editingStock && editingStock.status === 'backordered' && data.status === 'in_stock') {
        const part = parts.find(p => p.id === Number(editingStock.partId));
        if (part) {
          try {
            const sessions = await fetchCheckSessions();
            const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'paused');
            for (const session of activeSessions) {
              const detail = await fetchCheckSession(session.id);
              const missingItem = detail.items?.find(
                (i: CheckItem) => i.status === 'missing' && i.partNumber.toUpperCase() === part.partNumber.toUpperCase()
              );
              if (missingItem) {
                const newQty = data.quantity != null ? data.quantity : editingStock.quantity;
                if (confirm(`"${part.partNumber}" is marked as missing in kit check "${session.kitLabel}". Mark it as received (qty: ${newQty})?`)) {
                  const newQtyFound = missingItem.qtyFound + newQty;
                  const newStatus = newQtyFound >= missingItem.qtyExpected ? 'verified' : 'missing';
                  await updateCheckItem(session.id, missingItem.id, { qtyFound: newQtyFound, status: newStatus });
                  toast.success(`Kit check updated: ${part.partNumber} → ${newStatus}`);
                }
              }
            }
          } catch { /* non-critical — check item update is best-effort */ }
        }
      }

      setEditingStock(null); setShowStockFormForPart(null); onRefresh();
      toast.success(editingStock ? 'Stock updated' : 'Stock entry added');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteStock = async (id: number) => {
    if (!confirm('Delete this stock entry?')) return;
    try { await deleteInvStock(id); onRefresh(); toast.success('Stock entry deleted'); }
    catch (err: any) { toast.error(err.message); }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedParts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedParts.size === filtered.length) setSelectedParts(new Set());
    else setSelectedParts(new Set(filtered.map(p => p.id)));
  };

  const [bulkMoveTarget, setBulkMoveTarget] = useState<number | null>(null);
  const [showMoveUI, setShowMoveUI] = useState(false);
  const handleBulkMove = async () => {
    if (!bulkMoveTarget || selectedParts.size === 0) return;
    setBulkMoving(true);
    try {
      let moved = 0;
      for (const pid of selectedParts) {
        const partStk = stockByPart.get(Number(pid)) || [];
        for (const s of partStk) {
          // Only move stock that matches current filters
          if (filterLocId && s.locationId !== filterLocId) continue;
          if (s.locationId !== bulkMoveTarget) {
            await updateInvStock(s.id, { locationId: bulkMoveTarget });
            moved++;
          }
        }
      }
      onRefresh();
      setBulkMoveTarget(null);
      setShowMoveUI(false);
      setSelectedParts(new Set());
      toast.success(`Moved ${moved} stock entr${moved !== 1 ? 'ies' : 'y'} to ${buildPath(bulkMoveTarget, locations)}`);
    } catch (err: any) { toast.error(err.message); }
    setBulkMoving(false);
  };

  const handleBulkDelete = async () => {
    const count = selectedParts.size;
    if (!confirm(`Delete ${count} part${count !== 1 ? 's' : ''} and all their stock entries? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selectedParts) {
        await deleteInvPart(id);
      }
      setSelectedParts(new Set());
      onRefresh();
      toast.success(`${count} part${count !== 1 ? 's' : ''} deleted`);
    } catch (err: any) { toast.error(err.message); }
    setBulkDeleting(false);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search parts..."
              className="w-full pl-10 pr-8 py-2.5 rounded-md bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-muted-foreground" /></button>}
          </div>
          {!readOnly && (
            <>
              {ocrEnabled && (
                <button onClick={() => {
                    if (locations.length === 0) { toast.error('Create at least one location first (Locations tab)'); return; }
                    setShowMassIngest(true);
                  }}
                  disabled={locations.length === 0}
                  title={locations.length === 0 ? 'Create a location first (Locations tab)' : undefined}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-md bg-emerald-600 text-white font-label text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600">
                  <MIcon name="inventory_2" className="text-base" /> <span className="hidden sm:inline">Mass Scan</span><span className="sm:hidden">Mass</span>
                </button>
              )}
              <button onClick={() => {
                  if (locations.length === 0) { toast.error('Create at least one location first (Locations tab)'); return; }
                  setEditing(null); setShowForm(true);
                }}
                disabled={locations.length === 0}
                title={locations.length === 0 ? 'Create a location first (Locations tab)' : undefined}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-md bg-primary text-primary-foreground font-label text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Part</span><span className="sm:hidden">Add</span>
              </button>
            </>
          )}
        </div>
        {!readOnly && locations.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
            <MIcon name="info" className="text-base" />
            <span>No locations yet — <button onClick={onGoToLocations} className="underline hover:text-amber-900 dark:hover:text-amber-300 font-medium">create one</button> before adding parts.</span>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-md bg-card border border-border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
          <select value={filterKit} onChange={e => setFilterKit(e.target.value)}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-md bg-card border border-border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">All Kits</option>
            {availableKits.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-md bg-card border border-border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
            <option value="no_stock">No stock</option>
          </select>
          <select value={filterLocId ?? ''} onChange={e => { const v = e.target.value ? Number(e.target.value) : null; setFilterLocId(v); if (!v) onClearLocationFilter?.(); }}
            className={`flex-1 min-w-[120px] px-3 py-2 rounded-md border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${filterLocId ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'}`}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{buildPath(l.id, locations)}</option>)}
          </select>
          {availableBags.length > 0 && (
            <select value={filterBag} onChange={e => setFilterBag(e.target.value)}
              className={`flex-1 min-w-[120px] px-3 py-2 rounded-md border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${filterBag ? 'bg-amber-500/10 border-amber-500/30' : 'bg-card border-border'}`}>
              <option value="">All Bags</option>
              {availableBags.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </div>
      </div>

      {showMassIngest && (
        <MassIngestion
          vendorId={ocrVendor}
          aircraftType={aircraftType}
          locations={getLeafLocations(locations)}
          onClose={() => setShowMassIngest(false)}
          onDone={(items) => { setShowMassIngest(false); onRefresh(); toast.success(`Mass scan complete: ${items.reduce((s, i) => s + i.scannedQty, 0)} parts scanned (${items.length} unique)`); }}
        />
      )}

      {showForm && (
        <PartForm part={editing} locations={locations} existingParts={parts} onSave={handleSave} onAddStock={async (data) => {
          try {
            await createInvStock(data);
            setShowForm(false); setEditing(null); onRefresh();
            toast.success('Stock added to existing part');
          } catch (err: any) { toast.error(err.message); }
        }} onCancel={() => { setShowForm(false); setEditing(null); }} ocrEnabled={ocrEnabled} ocrVendor={ocrVendor} aircraftType={aircraftType} onBagIngest={onRefresh} />
      )}

      {/* Bulk action bar */}
      {selectedParts.size > 0 && !readOnly && (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5">
            <span className="text-sm font-medium">{selectedParts.size} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setSelectedParts(new Set()); setShowMoveUI(false); }}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                Clear
              </button>
              <button onClick={() => { setShowMoveUI(v => !v); setBulkMoveTarget(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                <MapPin className="w-3.5 h-3.5" /> Move Selected
              </button>
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
              </button>
            </div>
          </div>
          {showMoveUI && (
            <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-4 py-2.5">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">Move to:</span>
              <select
                value={bulkMoveTarget ?? ''}
                onChange={e => setBulkMoveTarget(e.target.value ? Number(e.target.value) : null)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded bg-card border border-border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select location...</option>
                {getLeafLocations(locations).map(l => <option key={l.id} value={l.id}>{buildPath(l.id, locations)}</option>)}
              </select>
              <button
                onClick={handleBulkMove}
                disabled={!bulkMoveTarget || bulkMoving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
              >
                {bulkMoving ? 'Moving...' : 'Move'}
              </button>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-card rounded-lg text-center py-16 text-muted-foreground">
          <p className="text-lg">{search || filterCat || filterKit || filterStatus || filterLocId || filterBag ? 'No parts match your filters' : 'No parts yet'}</p>
          <p className="text-sm mt-1">{!search && !filterCat && !filterKit && !filterStatus && !filterLocId && !filterBag && 'Add your first part to start tracking inventory.'}</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg overflow-hidden divide-y divide-border">
          {/* Select all header */}
          {!readOnly && (
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/30">
              <input type="checkbox" checked={selectedParts.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
              <span className="text-xs text-muted-foreground">
                {selectedParts.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'} ({filtered.length})
              </span>
            </div>
          )}
          {filtered.map(p => {
            let allPartStock = stockByPart.get(Number(p.id)) || [];
            if (filterLocId) allPartStock = allPartStock.filter(s => s.locationId === filterLocId);
            if (filterBag) allPartStock = allPartStock.filter(s => s.batch === filterBag || (!s.batch && p.bag === filterBag));
            const partStock = allPartStock;
            const isExpanded = expandedParts.has(p.id);
            const totalQty = partStock.reduce((sum, s) => sum + s.quantity, 0);
            const hasBackorder = partStock.some(s => s.status === 'backordered');
            const stockUnit = partStock[0]?.unit || 'pcs';

            return (
              <div key={p.id}>
                {/* ── Part row ── */}
                <button onClick={() => toggleExpanded(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors">
                  {/* Checkbox */}
                  {!readOnly && (
                    <div className="shrink-0" onClick={e => toggleSelect(p.id, e)}>
                      <input type="checkbox" checked={selectedParts.has(p.id)} readOnly
                        className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                    </div>
                  )}
                  {/* Expand icon */}
                  <div className="shrink-0 w-5">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                  {/* Part info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-sm cursor-pointer hover:text-primary transition-colors" title="Click to copy" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(p.partNumber); toast.success(`Copied "${p.partNumber}"`); }}>{p.partNumber}</span>
                      <span className="text-sm text-muted-foreground truncate cursor-pointer hover:text-foreground transition-colors" title="Click to copy" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(p.name); toast.success(`Copied "${p.name}"`); }}>{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      {p.subKit && <span>{p.subKit}</span>}
                      {filterBag && p.bag && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80 text-[10px] font-bold">{p.bag}</span>}
                      {p.manufacturer && <span>{(p.subKit || (filterBag && p.bag)) ? '· ' : ''}{p.manufacturer}</span>}
                    </div>
                  </div>
                  {/* Stock summary */}
                  <div className="shrink-0 text-right">
                    {partStock.length > 0 ? (
                      <>
                        <span className={`text-sm font-mono font-bold ${hasBackorder ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {totalQty}{stockUnit === 'lb' ? ' lb' : ''}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {partStock.length} entr{partStock.length !== 1 ? 'ies' : 'y'}
                          {hasBackorder && <span className="text-destructive ml-1">· backordered</span>}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">no stock</span>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="shrink-0 flex gap-1" onClick={e => e.stopPropagation()}>
                    <a href={`https://store.vansaircraft.com/catalogsearch/result/?q=${encodeURIComponent(p.partNumber)}`} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-muted" title="Search Van's Store">
                      <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                    <a href={`https://www.google.com/search?q=site:aircraftspruce.com+${encodeURIComponent(p.partNumber)}`} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-muted" title="Search Aircraft Spruce">
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                    {!readOnly && <>
                      <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => handleDeletePart(p.id)} className="p-1.5 rounded hover:bg-muted"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </>}
                  </div>
                </button>

                {/* ── Expanded stock entries ── */}
                {isExpanded && (
                  <div className="bg-muted/20 border-t border-border">
                    {partStock.length === 0 ? (
                      <div className="px-12 py-3 text-xs text-muted-foreground">No stock entries for this part.</div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {partStock.map(s => (
                          <div key={s.id} className="flex items-center gap-3 px-4 pl-12 py-2.5 text-sm">
                            <Boxes className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[s.status]}`}>{s.status.replace('_', ' ')}</span>
                                <span className="font-mono text-xs">{s.quantity} {s.unit}</span>
                                <span className="text-xs capitalize text-muted-foreground">{s.condition}</span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                                <MapPin className="w-3 h-3" /> {s.locationName || 'Unknown'}
                                {s.sourceKit && <span className="ml-1 text-indigo-500/70">· {s.sourceKit}</span>}
                                {s.batch && <span className="ml-1 text-primary/70">· {s.batch}</span>}
                                {s.notes && <span className="ml-1 truncate max-w-[200px]">· {s.notes}</span>}
                              </div>
                            </div>
                            {!readOnly && (
                              <div className="shrink-0 flex gap-1">
                                <button onClick={() => { setEditingStock(s); setShowStockFormForPart(p.id); }} className="p-1 rounded hover:bg-muted"><Pencil className="w-3 h-3 text-muted-foreground" /></button>
                                <button onClick={() => handleDeleteStock(s.id)} className="p-1 rounded hover:bg-muted"><Trash2 className="w-3 h-3 text-destructive" /></button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add stock button */}
                    {!readOnly && showStockFormForPart !== p.id && (
                      <div className="px-12 py-2 border-t border-border/30">
                        <button onClick={() => { setEditingStock(null); setShowStockFormForPart(p.id); }}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                          <Plus className="w-3 h-3" /> Add stock entry
                        </button>
                      </div>
                    )}
                    {/* Inline stock form */}
                    {showStockFormForPart === p.id && (
                      <div className="px-8 py-3 border-t border-border/30">
                        <StockForm entry={editingStock} parts={parts} locations={locations}
                          fixedPartId={p.id}
                          onSave={handleSaveStock}
                          onCancel={() => { setShowStockFormForPart(null); setEditingStock(null); }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">{filtered.length} part{filtered.length !== 1 ? 's' : ''} · {stock.length} stock entr{stock.length !== 1 ? 'ies' : 'y'}</p>
    </div>
  );
}

function PartForm({ part, locations, existingParts, onSave, onAddStock, onCancel, ocrEnabled, ocrVendor, aircraftType, onBagIngest }: {
  part: InvPart | null; locations: InvLocation[];
  existingParts: InvPart[];
  onSave: (data: Partial<InvPart> & { _stock?: { locationId: number; quantity: number; unit: string; status: string; condition: string } }) => void;
  onAddStock: (data: { partId: number; locationId: number; quantity: number; unit: string; status: string; condition: string }) => void;
  onCancel: () => void;
  ocrEnabled?: boolean;
  ocrVendor?: string;
  aircraftType?: string;
  onBagIngest?: () => void;
}) {
  const vendorConfig = useMemo(() => getVendorConfig(ocrVendor || 'vans'), [ocrVendor]);
  const [partNumber, setPartNumber] = useState(part?.partNumber || '');
  const [name, setName] = useState(part?.name || '');
  const [manufacturer, setManufacturer] = useState(part?.manufacturer || '');
  const [kit, setKit] = useState(part?.kit || '');
  const [subKit, setSubKit] = useState(part?.subKit || '');
  const [category, setCategory] = useState(part?.category || 'other');
  const [mfgDate, setMfgDate] = useState(part?.mfgDate || '');
  const [notes, setNotes] = useState(part?.notes || '');
  const [showScanner, setShowScanner] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Autocomplete from manifest + existing inventory parts
  const allManifestEntries = useMemo(() => getAllEntries(aircraftType || 'vans-rv10'), [aircraftType]);
  type Suggestion = { partNumber: string; name: string; subKit?: string; source: 'manifest' | 'inventory' };
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!partNumber || partNumber.length < 2 || !showSuggestions) return [];
    const q = partNumber.toUpperCase();
    const seen = new Set<string>();
    const results: Suggestion[] = [];
    // Manifest entries first
    for (const e of allManifestEntries) {
      if (results.length >= 8) break;
      if (e.partNumber.toUpperCase().includes(q)) {
        seen.add(e.partNumber.toUpperCase());
        results.push({ partNumber: e.partNumber, name: e.nomenclature, subKit: e.subKit, source: 'manifest' });
      }
    }
    // Then existing inventory parts (skip duplicates already matched from manifest)
    if (results.length < 8) {
      for (const p of existingParts) {
        if (results.length >= 8) break;
        const key = p.partNumber.toUpperCase();
        if (!seen.has(key) && key.includes(q)) {
          seen.add(key);
          results.push({ partNumber: p.partNumber, name: p.name, subKit: p.subKit || undefined, source: 'inventory' });
        }
      }
    }
    return results;
  }, [partNumber, showSuggestions, allManifestEntries, existingParts]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectSuggestion = (entry: Suggestion) => {
    setPartNumber(entry.partNumber);
    setName(entry.name);
    if (entry.subKit) setSubKit(entry.subKit);
    setShowSuggestions(false);
  };

  // Detect if typed part number matches an existing part in DB
  const matchedExisting = useMemo(() => {
    if (!partNumber || part) return null; // only for new-part mode
    return existingParts.find(p => p.partNumber.toUpperCase() === partNumber.toUpperCase()) ?? null;
  }, [partNumber, existingParts, part]);

  // Bag detection state
  type BagItemSt = 'pending' | 'checked' | 'backordered';
  const [detectedBag, setDetectedBag] = useState<{ bagId: string; kitId: string; bag: BagDefinition; entries: ManifestEntry[] } | null>(null);
  const [bagMode, setBagMode] = useState<'prompt' | 'verify' | null>(null);
  const [bagItemStatuses, setBagItemStatuses] = useState<BagItemSt[]>([]);
  const [bagIngesting, setBagIngesting] = useState(false);

  const handleScanResult = (result: ScanResult) => {
    if (result.partNumber) {
      setPartNumber(result.partNumber);
      // Check if scanned value is a bag label
      if (isBagLabel(result.partNumber) && aircraftType) {
        const found = findBagFuzzy(aircraftType, result.partNumber);
        if (found) {
          setDetectedBag({ bagId: found.bag.id, kitId: found.kitId, bag: found.bag, entries: found.entries });
          setBagMode('prompt');
          toast.success(`Bag detected: ${found.bag.id}`);
          return;
        }
      }
      setDetectedBag(null);
      setBagMode(null);
    }
    if (result.name) setName(result.name);
    if (result.subKit) setSubKit(result.subKit);
    if (result.mfgDate) setMfgDate(result.mfgDate);
    toast.success('Label scanned');
  };

  // "No" — ingest all items as not verified
  const bagSkipVerify = async () => {
    if (!detectedBag) return;
    setBagIngesting(true);
    try {
      for (const entry of detectedBag.entries) {
        await ingestInvPart({
          partNumber: entry.partNumber,
          name: entry.nomenclature,
          subKit: entry.subKit || '',
          bag: detectedBag.bagId,
          notes: 'Bag not verified',
          quantity: entry.qtyRequired || 1,
          unit: entry.unit || 'pcs',
        });
      }
      toast.success(`${detectedBag.bagId}: ${detectedBag.entries.length} items added (not verified)`);
    } catch (err: any) { toast.error(err.message || 'Bag ingest failed'); }
    setBagIngesting(false);
    setDetectedBag(null);
    setBagMode(null);
    onBagIngest?.();
    onCancel();
  };

  // "Yes" — enter verify mode
  const bagStartVerify = () => {
    if (!detectedBag) return;
    setBagItemStatuses(detectedBag.entries.map(() => 'pending'));
    setBagMode('verify');
  };

  // Cycle item: pending → checked → backordered → pending
  const cycleBagItem = (idx: number) => {
    setBagItemStatuses(prev => {
      const u = [...prev];
      u[idx] = u[idx] === 'pending' ? 'checked' : u[idx] === 'checked' ? 'backordered' : 'pending';
      return u;
    });
  };

  // Mark all pending as checked
  const bagConfirmAll = () => {
    setBagItemStatuses(prev => prev.map(s => s === 'pending' ? 'checked' : s));
  };

  // Finish — ingest all with status
  const bagFinishVerify = async () => {
    if (!detectedBag) return;
    setBagIngesting(true);
    try {
      for (let i = 0; i < detectedBag.entries.length; i++) {
        const entry = detectedBag.entries[i];
        const st = bagItemStatuses[i];
        const notesArr: string[] = [];
        if (st === 'backordered') notesArr.push('BACKORDERED');
        if (st === 'pending') notesArr.push('Not verified');
        await ingestInvPart({
          partNumber: entry.partNumber,
          name: entry.nomenclature,
          subKit: entry.subKit || '',
          bag: detectedBag.bagId,
          quantity: st === 'backordered' ? 0 : (entry.qtyRequired || 1),
          unit: entry.unit || 'pcs',
          status: st === 'backordered' ? 'backordered' : 'in_stock',
          ...(notesArr.length > 0 ? { notes: notesArr.join(', ') } : {}),
        });
      }
      const bo = bagItemStatuses.filter(s => s === 'backordered').length;
      toast.success(`${detectedBag.bagId}: ${detectedBag.entries.length} items added${bo > 0 ? ` (${bo} backordered)` : ''}`);
    } catch (err: any) { toast.error(err.message || 'Bag ingest failed'); }
    setBagIngesting(false);
    setDetectedBag(null);
    setBagMode(null);
    onBagIngest?.();
    onCancel();
  };
  // Stock fields (only for new parts)
  const leafLocs = getLeafLocations(locations);
  const [locationId, setLocationId] = useState<number>(leafLocs[0]?.id || 0);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('pcs');
  const [status, setStatus] = useState('in_stock');
  const [condition, setCondition] = useState('new');
  const isNew = !part;

  const handleSubmit = () => {
    if (!partNumber) return;
    const data: Partial<InvPart> & { _stock?: { locationId: number; quantity: number; unit: string; status: string; condition: string } } = {
      partNumber, name, manufacturer, kit, subKit, category, mfgDate, bag: part?.bag || '', notes,
    };
    if (isNew && locationId) {
      data._stock = { locationId, quantity, unit, status, condition };
    }
    onSave(data);
  };

  return (
    <div className="bg-card rounded-lg p-5 space-y-4 border border-border">
      <div className="flex items-center justify-between">
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{part ? 'Edit Part' : 'New Part'}</p>
        {!part && ocrEnabled && (
          <button onClick={() => setShowScanner(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Camera className="w-3.5 h-3.5" /> Scan Label
          </button>
        )}
      </div>

      {showScanner && <LabelScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} vendorId={ocrVendor} />}

      {/* Bag prompt: "Do you want to verify contents?" */}
      {detectedBag && bagMode === 'prompt' && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div>
            <p className="font-label text-[10px] uppercase tracking-wider font-bold text-primary">Bag Detected</p>
            <p className="text-base font-mono font-bold">{detectedBag.bagId}</p>
            <p className="text-xs text-muted-foreground">{detectedBag.bag.description} — {detectedBag.entries.length} item{detectedBag.entries.length !== 1 ? 's' : ''}</p>
          </div>
          <p className="text-sm">Do you want to verify its contents?</p>
          <div className="flex gap-2">
            <button onClick={bagSkipVerify} disabled={bagIngesting}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md bg-amber-600/20 border border-amber-600/30 text-amber-600 dark:text-amber-400 font-bold text-sm hover:bg-amber-600/30 transition-colors disabled:opacity-50">
              {bagIngesting ? 'Adding...' : 'No'}
            </button>
            <button onClick={bagStartVerify}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 transition-colors">
              Yes, Verify
            </button>
          </div>
          <button onClick={() => { setDetectedBag(null); setBagMode(null); setPartNumber(''); }} className="text-xs text-muted-foreground hover:text-foreground">
            Cancel — add as regular part instead
          </button>
        </div>
      )}

      {/* Bag verify: interactive checklist */}
      {detectedBag && bagMode === 'verify' && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-label text-[10px] uppercase tracking-wider font-bold text-primary">Verifying Bag</p>
              <p className="text-base font-mono font-bold">{detectedBag.bagId}</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {bagItemStatuses.filter(s => s !== 'pending').length}/{detectedBag.entries.length} checked
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">Tap item to cycle: pending → checked → backordered</p>

          <div className="space-y-0.5 max-h-[40vh] overflow-y-auto rounded-lg bg-muted/50 p-1">
            {detectedBag.entries.map((entry, idx) => {
              const st = bagItemStatuses[idx];
              return (
                <button key={entry.partNumber} onClick={() => cycleBagItem(idx)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted transition-colors text-left">
                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                    st === 'checked' ? 'bg-emerald-500/20' : st === 'backordered' ? 'bg-destructive/20' : 'bg-muted'
                  }`}>
                    {st === 'checked' && <span className="text-emerald-500 text-xs">✓</span>}
                    {st === 'backordered' && <span className="text-destructive text-xs">!</span>}
                    {st === 'pending' && <span className="w-2 h-2 rounded-full border border-muted-foreground/40" />}
                  </div>
                  <span className={`text-xs font-mono shrink-0 ${st === 'pending' ? 'text-muted-foreground' : ''}`}>{entry.partNumber}</span>
                  <span className="text-xs truncate flex-1">{entry.nomenclature}</span>
                  <span className="text-xs text-muted-foreground shrink-0">×{entry.qtyRequired}{entry.unit === 'lb' ? ' lb' : ''}</span>
                  {st === 'backordered' && <span className="text-[9px] text-destructive font-bold shrink-0">BO</span>}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 pt-1">
            {bagItemStatuses.some(s => s === 'pending') && (
              <button onClick={bagConfirmAll}
                className="w-full px-3 py-2 rounded-md bg-primary/20 border border-primary/30 text-primary font-bold text-sm hover:bg-primary/30 transition-colors">
                All Items Confirmed
              </button>
            )}
            <button onClick={bagFinishVerify} disabled={bagIngesting}
              className="w-full px-3 py-2.5 rounded-md bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 transition-colors disabled:opacity-50">
              {bagIngesting ? 'Adding...' : 'Done — Add to Inventory'}
            </button>
          </div>
        </div>
      )}

      {/* Part number field — always shown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="relative" ref={suggestionsRef}>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Part Number *</label>
          <input value={partNumber}
            onChange={e => { setPartNumber(e.target.value); setShowSuggestions(true); }}
            onFocus={() => { if (partNumber.length >= 2) setShowSuggestions(true); }}
            placeholder="e.g. AN3-5A" autoComplete="off"
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {suggestions.map(entry => (
                <button key={`${entry.source}-${entry.partNumber}`} onClick={() => selectSuggestion(entry)}
                  className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/30 last:border-b-0 flex items-baseline gap-2">
                  <span className="text-sm font-mono font-bold text-foreground shrink-0">{entry.partNumber}</span>
                  <span className="text-xs text-muted-foreground truncate">{entry.name}</span>
                  {entry.subKit && <span className="text-[10px] text-primary/60 shrink-0">[{entry.subKit}]</span>}
                  <span className={`text-[9px] font-bold uppercase tracking-wider shrink-0 ml-auto ${entry.source === 'manifest' ? 'text-blue-400/70' : 'text-emerald-400/70'}`}>
                    {entry.source === 'manifest' ? 'manifest' : 'inventory'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Existing part found — add stock mode */}
      {matchedExisting && isNew ? (
        <>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <p className="font-label text-[10px] uppercase tracking-wider font-bold text-primary">Existing Part Found</p>
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-mono font-bold">{matchedExisting.partNumber}</span>
              <span className="text-xs text-muted-foreground">{matchedExisting.name}</span>
              {matchedExisting.subKit && <span className="text-[10px] text-primary/60">[{matchedExisting.subKit}]</span>}
            </div>
            <p className="text-xs text-muted-foreground">This part already exists. Add stock to it below.</p>
          </div>

          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-4 py-3">
              You need to create at least one location before you can add stock. Go to the <strong>Locations</strong> tab first.
            </p>
          ) : (
            <div className="border-t border-border pt-4">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">Add Stock</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Location *</label>
                  <select value={locationId} onChange={e => setLocationId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value={0}>— Select —</option>
                    {getLeafLocations(locations).map(l => <option key={l.id} value={l.id}>{buildPath(l.id, locations)}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Quantity</label>
                    <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min={0} step="any"
                      className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="w-20">
                    <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Unit</label>
                    <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="pcs"
                      className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
                <div>
                  <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={() => {
                if (!locationId) { toast.error('Select a location'); return; }
                onAddStock({ partId: matchedExisting.id, locationId, quantity, unit, status, condition });
              }}
              disabled={!locationId || locations.length === 0}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-label text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50">
              Add Stock
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Part detail fields — new or edit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Description</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. AN3 Bolt 5/8 length"
                className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Manufacturer</label>
              <input value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="e.g. Aircraft Spruce"
                className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary/30">
                {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Kit Reference</label>
              <select value={kit} onChange={e => setKit(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">None</option>
                {KITS.filter(Boolean).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            {vendorConfig.subKits.length > 0 && (
              <div>
                <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Sub-Kit</label>
                <select value={subKit} onChange={e => setSubKit(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">None</option>
                  {vendorConfig.subKits.map(sk => <option key={sk} value={sk}>{sk}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Mfg Date</label>
              <input value={mfgDate} onChange={e => setMfgDate(e.target.value)} placeholder="e.g. 01/15/2025"
                className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes"
                className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          {/* Stock fields — only when creating a new part. Visually distinct
              to make it obvious this creates a SECOND object (a stock entry)
              alongside the part. Set Location to "Skip" if you don't have
              stock yet (e.g. planning / backordered). */}
          {isNew && locations.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Initial Stock Entry</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Creating this part will also add a stock entry at the location below. Set Location to <span className="font-semibold">Skip</span> if you don't have any yet.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Location</label>
                  <select value={locationId} onChange={e => setLocationId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value={0}>— Skip (no stock yet) —</option>
                    {getLeafLocations(locations).map(l => <option key={l.id} value={l.id}>{buildPath(l.id, locations)}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Quantity</label>
                    <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min={0} step="any"
                      disabled={!locationId}
                      className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50" />
                  </div>
                  <div className="w-20">
                    <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Unit</label>
                    <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="pcs"
                      disabled={!locationId}
                      className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50" />
                  </div>
                </div>
                <div>
                  <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    disabled={!locationId}
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value)}
                    disabled={!locationId}
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={handleSubmit}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-label text-xs font-bold uppercase tracking-wider hover:opacity-90">
              {part ? 'Update' : (isNew && locationId && locations.length > 0) ? 'Create + Add Stock' : 'Create'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STOCK FORM (inline within expanded part rows)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StockForm({ entry, parts, locations, fixedPartId, onSave, onCancel }: {
  entry: InvStock | null; parts: InvPart[]; locations: InvLocation[];
  fixedPartId?: number;
  onSave: (data: Partial<InvStock>) => void; onCancel: () => void;
}) {
  const leafLocs = getLeafLocations(locations);
  const [partId, setPartId] = useState(entry?.partId ?? fixedPartId ?? (parts[0]?.id || 0));
  const [locationId, setLocationId] = useState(entry?.locationId ?? (leafLocs[0]?.id || 0));
  const [quantity, setQuantity] = useState(entry?.quantity ?? 1);
  const [unit, setUnit] = useState(entry?.unit || 'pcs');
  const [status, setStatus] = useState(entry?.status || 'in_stock');
  const [condition, setCondition] = useState(entry?.condition || 'new');
  const [batch, setBatch] = useState(entry?.batch || '');
  const [sourceKit, setSourceKit] = useState(entry?.sourceKit || '');
  const [notes, setNotes] = useState(entry?.notes || '');

  if (parts.length === 0 || locations.length === 0) {
    return (
      <div className="bg-card rounded-lg p-5 border border-border text-center text-muted-foreground">
        <p>You need to create {parts.length === 0 ? 'parts' : ''}{parts.length === 0 && locations.length === 0 ? ' and ' : ''}{locations.length === 0 ? 'locations' : ''} first.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg p-5 space-y-4 border border-border">
      <p className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{entry ? 'Edit Stock Entry' : 'New Stock Entry'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!fixedPartId && (
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Part *</label>
            <select value={partId} onChange={e => setPartId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {parts.map(p => <option key={p.id} value={p.id}>{p.partNumber} — {p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Location *</label>
          <select value={locationId} onChange={e => setLocationId(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            {getLeafLocations(locations).map(l => <option key={l.id} value={l.id}>{buildPath(l.id, locations)}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Quantity</label>
            <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min={0} step="any"
              className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="w-20">
            <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Unit</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="pcs"
              className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as any)}
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary/30">
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Condition</label>
          <select value={condition} onChange={e => setCondition(e.target.value as any)}
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm capitalize focus:outline-none focus:ring-2 focus:ring-primary/30">
            {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Kit</label>
          <select value={sourceKit} onChange={e => setSourceKit(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">— none —</option>
            {KITS.filter(Boolean).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Bag / Batch</label>
          <input value={batch} onChange={e => setBatch(e.target.value)} placeholder="Optional"
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="font-label text-[10px] uppercase mb-1 block text-muted-foreground">Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional"
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">Cancel</button>
        <button onClick={() => partId && locationId && onSave({ partId, locationId, quantity, unit, status: status as any, condition: condition as any, batch, sourceKit, notes })}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-label text-xs font-bold uppercase tracking-wider hover:opacity-90">
          {entry ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
}
