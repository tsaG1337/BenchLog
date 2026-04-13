import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Trash2 } from 'lucide-react';
import { fetchVisitorStats, clearVisitorStats, VisitorStats } from '@/lib/api';
import { toast } from 'sonner';

function countryToFlag(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + 127397));
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

const PERIODS = [7, 30, 90, 365];

export function VisitorStatsPanel() {
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await fetchVisitorStats(days));
    } catch (err: any) {
      toast.error('Failed to load visitor stats: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const handleClear = async () => {
    if (!confirm('Clear all visitor statistics? This cannot be undone.')) return;
    setClearing(true);
    try {
      await clearVisitorStats();
      toast.success('Visitor stats cleared');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setClearing(false);
    }
  };

  const maxCountry  = Math.max(1, ...(stats?.countries  ?? []).map(c => c.count));
  const maxReferrer = Math.max(1, ...(stats?.referrers  ?? []).map(r => r.count));
  const maxPost     = Math.max(1, ...(stats?.topPosts   ?? []).map(p => p.count));

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {PERIODS.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${days === d ? 'bg-primary/15 border-primary text-primary' : 'bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground/50'}`}>
              {d}d
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 w-7 p-0">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={clearing}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1">
            <Trash2 className="w-3 h-3" /> Clear
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/50 border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{stats?.totalPeriod ?? '—'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Visitors (last {days}d)</p>
        </div>
        <div className="bg-muted/50 border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{stats?.total ?? '—'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total (all time)</p>
        </div>
      </div>

      {/* Daily sparkline */}
      {stats && stats.daily.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground mb-2">Daily visits</p>
            <div className="flex items-end gap-0.5 h-10">
              {(() => {
                const maxDay = Math.max(1, ...stats.daily.map(d => d.count));
                return stats.daily.map(d => (
                  <div key={d.date} title={`${d.date}: ${d.count}`}
                    className="flex-1 bg-primary/50 rounded-sm min-w-[2px]"
                    style={{ height: `${Math.max(10, Math.round((d.count / maxDay) * 100))}%` }} />
                ));
              })()}
            </div>
          </div>
        </>
      )}

      {/* Countries */}
      <Separator />
      <div>
        <p className="text-xs text-muted-foreground mb-2">Top countries</p>
        {stats?.countries.length === 0 && <p className="text-xs text-muted-foreground/50">No data yet</p>}
        <div className="space-y-1.5">
          {stats?.countries.map(c => (
            <div key={c.country} className="flex items-center gap-2 text-xs">
              <span className="text-base leading-none">{countryToFlag(c.country)}</span>
              <span className="w-7 text-muted-foreground font-mono">{c.country}</span>
              <Bar value={c.count} max={maxCountry} />
              <span className="w-6 text-right text-muted-foreground">{c.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Referrers */}
      <Separator />
      <div>
        <p className="text-xs text-muted-foreground mb-2">Top referrers</p>
        {stats?.referrers.length === 0 && <p className="text-xs text-muted-foreground/50">No external referrers yet</p>}
        <div className="space-y-1.5">
          {stats?.referrers.map(r => (
            <div key={r.domain} className="flex items-center gap-2 text-xs">
              <span className="w-36 truncate text-foreground font-mono">{r.domain}</span>
              <Bar value={r.count} max={maxReferrer} />
              <span className="w-6 text-right text-muted-foreground">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top posts */}
      <Separator />
      <div>
        <p className="text-xs text-muted-foreground mb-2">Most viewed posts</p>
        {stats?.topPosts.length === 0 && <p className="text-xs text-muted-foreground/50">No post views yet</p>}
        <div className="space-y-1.5">
          {stats?.topPosts.map(p => (
            <div key={p.post_id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-foreground">{p.title ?? p.post_id}</span>
              <Bar value={p.count} max={maxPost} />
              <span className="w-6 text-right text-muted-foreground shrink-0">{p.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
