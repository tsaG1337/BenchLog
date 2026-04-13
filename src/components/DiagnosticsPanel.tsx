import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchDebugStats, fetchDebugLogs, DebugStats } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trash2, Circle, Download } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────

function fmt(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

function fmtUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Sparkline ──────────────────────────────────────────────────────

function Sparkline({ data, color, height = 32, width = 160 }: { data: number[]; color: string; height?: number; width?: number }) {
  if (data.length < 2) return <div style={{ width, height }} className="bg-secondary/50 rounded" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

// ─── Types ──────────────────────────────────────────────────────────

type LogLevel = 'log' | 'info' | 'warn' | 'error';
type LogSource = 'client' | 'server';

interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  source: LogSource;
  message: string;
}

const LOG_LIMIT = 400;
let logIdCounter = 0;

const levelColor: Record<LogLevel, string> = {
  log:   'text-foreground/70',
  info:  'text-primary',
  warn:  'text-amber-500',
  error: 'text-destructive',
};
const levelBadge: Record<LogLevel, string> = {
  log:   'bg-secondary text-muted-foreground',
  info:  'bg-primary/15 text-primary',
  warn:  'bg-amber-500/15 text-amber-500',
  error: 'bg-destructive/15 text-destructive',
};

// ─── Main component ─────────────────────────────────────────────────

export function DiagnosticsPanel() {
  const [stats, setStats] = useState<DebugStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DebugStats[]>([]);
  const [recording, setRecording] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<LogLevel | 'all' | 'server' | 'client'>('all');
  const logEndRef = useRef<HTMLDivElement>(null);
  const origConsole = useRef<Partial<Record<LogLevel, (...args: unknown[]) => void>>>({});
  const lastServerTs = useRef<number>(0);

  // ── Client console interception ──────────────────────────────────
  useEffect(() => {
    const levels: LogLevel[] = ['log', 'info', 'warn', 'error'];

    const addClientEntry = (level: LogLevel, args: unknown[]) => {
      const message = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      setLogs(prev => {
        const next = [...prev, { id: logIdCounter++, ts: Date.now(), level, source: 'client' as LogSource, message }];
        return next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next;
      });
    };

    levels.forEach(level => {
      origConsole.current[level] = (console[level] as (...a: unknown[]) => void).bind(console);
      (console as unknown as Record<string, (...a: unknown[]) => void>)[level] = (...args) => {
        origConsole.current[level]?.(...args);
        addClientEntry(level, args);
      };
    });

    return () => {
      levels.forEach(level => {
        (console as unknown as Record<string, unknown>)[level] = origConsole.current[level];
      });
    };
  }, []);

  // ── Auto-scroll log ──────────────────────────────────────────────
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── Poll stats + server logs ─────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const [s, serverLogs] = await Promise.all([
        fetchDebugStats(),
        fetchDebugLogs(lastServerTs.current),
      ]);

      setStats(s);
      setError(null);

      if (recording) {
        setHistory(prev => {
          const next = [...prev, s];
          return next.length > 60 ? next.slice(-60) : next;
        });
      }

      if (serverLogs.length > 0) {
        lastServerTs.current = serverLogs[serverLogs.length - 1].ts;
        const entries: LogEntry[] = serverLogs.map(e => ({
          id: logIdCounter++,
          ts: e.ts,
          level: e.level,
          source: 'server' as LogSource,
          message: e.message,
        }));
        setLogs(prev => {
          const next = [...prev, ...entries].sort((a, b) => a.ts - b.ts);
          return next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next;
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch stats');
    }
  }, [recording]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [poll]);

  // ── Derived data ─────────────────────────────────────────────────
  const heapHistory    = history.map(s => s.memory.heapUsed);
  const rssHistory     = history.map(s => s.memory.rss);
  const externalHistory = history.map(s => s.memory.external);

  const filteredLogs = logs.filter(l => {
    if (logFilter === 'all') return true;
    if (logFilter === 'server' || logFilter === 'client') return l.source === logFilter;
    return l.level === logFilter;
  });

  const serverCount = logs.filter(l => l.source === 'server').length;
  const clientCount = logs.filter(l => l.source === 'client').length;

  const exportLogs = () => {
    const header = [
      `Benchlog Diagnostics Export`,
      `Generated: ${new Date().toISOString()}`,
      stats ? `Node: ${stats.node.version} · ${stats.node.platform}/${stats.node.arch}` : '',
      stats ? `Uptime: ${fmtUptime(stats.uptime)}` : '',
      stats ? `Heap Used: ${fmt(stats.memory.heapUsed)} / ${fmt(stats.memory.heapTotal)}  RSS: ${fmt(stats.memory.rss)}` : '',
      `Entries: ${logs.length} total (${serverCount} server, ${clientCount} client)`,
      '─'.repeat(80),
    ].filter(Boolean).join('\n');

    const body = logs.map(e => {
      const time = new Date(e.ts).toISOString();
      const src  = e.source === 'server' ? 'SRV' : 'CLI';
      const lvl  = e.level.toUpperCase().padEnd(5);
      return `${time}  ${src}  ${lvl}  ${e.message}`;
    }).join('\n');

    const blob = new Blob([header + '\n' + body + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchlog-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 text-sm">

      {/* ── Server Memory ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Server Memory</span>
          <div className="flex items-center gap-2">
            {stats && <span className="text-xs text-muted-foreground">uptime {fmtUptime(stats.uptime)}</span>}
            <button
              onClick={() => setRecording(r => !r)}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                recording ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10' : 'border-border text-muted-foreground'
              }`}
            >
              <Circle className={`w-1.5 h-1.5 ${recording ? 'fill-emerald-500' : 'fill-muted-foreground'}`} />
              {recording ? 'Recording' : 'Paused'}
            </button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={poll}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-3">{error}</p>}

        <div className="space-y-2">
          {([
            { label: 'Heap Used', value: stats?.memory.heapUsed,  history: heapHistory,     color: '#f59e0b' },
            { label: 'RSS',       value: stats?.memory.rss,        history: rssHistory,      color: '#3b82f6' },
            { label: 'External',  value: stats?.memory.external,   history: externalHistory, color: '#8b5cf6' },
          ] as const).map(({ label, value, history: h, color }) => (
            <div key={label} className="flex items-center gap-3 bg-secondary/40 rounded-lg px-3 py-2">
              <div className="w-24 shrink-0">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
                <p className="font-mono font-semibold text-foreground">{value != null ? fmt(value) : '—'}</p>
              </div>
              <div className="flex-1 flex justify-end">
                <Sparkline data={h} color={color} />
              </div>
            </div>
          ))}
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="bg-secondary/40 rounded-lg px-3 py-2">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Heap Total</p>
              <p className="font-mono font-semibold">{fmt(stats.memory.heapTotal)}</p>
            </div>
            <div className="bg-secondary/40 rounded-lg px-3 py-2">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Array Buffers</p>
              <p className="font-mono font-semibold">{fmt(stats.memory.arrayBuffers)}</p>
            </div>
          </div>
        )}

        {history.length > 1 && (() => {
          const delta = heapHistory[heapHistory.length - 1] - heapHistory[0];
          const trend = delta > 1024 * 1024
            ? { label: `+${fmt(delta)} since recording started`, cls: 'text-amber-500' }
            : delta < -1024 * 1024
            ? { label: `${fmt(delta)} since recording started`, cls: 'text-emerald-500' }
            : { label: 'Heap stable', cls: 'text-muted-foreground/60' };
          return <p className={`text-[10px] mt-1.5 ${trend.cls}`}>{trend.label}</p>;
        })()}
      </div>

      {/* ── Database & Files ──────────────────────────────────────── */}
      {stats && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Database & Files</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { label: 'Sessions',        value: stats.db.sessions },
              { label: 'Expenses',        value: stats.db.expenses },
              { label: 'Blog Posts',      value: stats.db.blogPosts },
              { label: 'Photos',          value: stats.uploads.sessionImages, note: `+ ${stats.uploads.sessionThumbs} thumbs` },
              { label: 'Receipts',        value: stats.uploads.receipts },
            ]).map(({ label, value, note }) => (
              <div key={label} className="bg-secondary/40 rounded-lg px-3 py-2">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
                <p className="font-mono font-semibold text-foreground">{value}</p>
                {note && <p className="text-[9px] text-muted-foreground/50">{note}</p>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-1.5 font-mono truncate">{stats.db.path}</p>
        </div>
      )}

      {/* ── Runtime ───────────────────────────────────────────────── */}
      {stats && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Runtime</p>
          <div className="bg-secondary/40 rounded-lg px-3 py-2 font-mono text-xs text-muted-foreground space-y-0.5">
            <p>Node {stats.node.version} · {stats.node.platform}/{stats.node.arch}</p>
            <p>Polled {history.length} sample{history.length !== 1 ? 's' : ''} · 2 s interval</p>
          </div>
        </div>
      )}

      {/* ── Unified Log ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Log</span>
            <span className="text-[10px] text-muted-foreground/50">
              {serverCount} server · {clientCount} client
            </span>
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {(['all', 'server', 'client', 'log', 'info', 'warn', 'error'] as const).map(f => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize ${
                  logFilter === f
                    ? 'border-primary/40 text-primary bg-primary/10'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                }`}
              >
                {f}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground ml-1" title="Export log" onClick={exportLogs}>
              <Download className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" title="Clear log" onClick={() => setLogs([])}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="bg-secondary/30 border border-border rounded-lg h-52 overflow-y-auto p-2 font-mono text-[10px] space-y-0.5">
          {filteredLogs.length === 0 ? (
            <p className="text-muted-foreground/40 text-center py-6">No log entries yet</p>
          ) : (
            filteredLogs.map(entry => (
              <div key={entry.id} className="flex gap-1.5 items-start">
                <span className="text-muted-foreground/40 shrink-0 tabular-nums">
                  {new Date(entry.ts).toTimeString().slice(0, 8)}
                </span>
                <span className={`shrink-0 px-1 rounded text-[9px] font-bold ${
                  entry.source === 'server'
                    ? 'bg-violet-500/15 text-violet-400'
                    : 'bg-secondary text-muted-foreground/60'
                }`}>
                  {entry.source === 'server' ? 'SRV' : 'CLI'}
                </span>
                <span className={`shrink-0 px-1 rounded text-[9px] uppercase font-bold ${levelBadge[entry.level]}`}>
                  {entry.level}
                </span>
                <span className={`break-all ${levelColor[entry.level]}`}>{entry.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

    </div>
  );
}
