import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AboutDialog } from '@/components/AboutDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ExportDialog } from '@/components/ExportDialog';
import { fetchSessions } from '@/lib/api';
import type { WorkSession } from '@/lib/types';

// ─── Icon helper (Material Symbols via CSS) ─────────────────────────
export function MIcon({ name, className = '', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24", ...style }}
    >
      {name}
    </span>
  );
}

// ─── Sidebar nav items ──────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',      icon: 'analytics',             to: '/dashboard' },
  { id: 'blog',        label: 'Blog',            icon: 'receipt_long',          to: '/blog' },
  { id: 'tracker',     label: 'Session Tracker', icon: 'timer',                 to: '/tracker' },
  { id: 'expenses',    label: 'Expenses',        icon: 'account_balance_wallet', to: '/expenses' },
  { id: 'inventory',   label: 'Inventory',       icon: 'inventory_2',           to: '/inventory' },
  { id: 'inspections', label: 'Inspections',     icon: 'fact_check',            to: '/inspections' },
];

// ─── Props ──────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  dashboard:   'Dashboard',
  blog:        'Build Log',
  tracker:     'Session Tracker',
  expenses:    'Project Expenses',
  inventory:   'Parts Inventory',
  inspections: 'Inspections',
};

interface AppShellProps {
  activePage: 'dashboard' | 'blog' | 'tracker' | 'expenses' | 'inventory' | 'inspections';
  projectName: string;
  pageTitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// APP SHELL — shared layout: sidebar, header, bottom nav
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function AppShell({ activePage, projectName, pageTitle, headerRight, children }: AppShellProps) {
  const { isAuthenticated, demoMode, logout, role } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportSessions, setExportSessions] = useState<WorkSession[]>([]);

  const handleExportClick = async () => {
    try {
      const page = await fetchSessions({ limit: 10000 });
      setExportSessions(page.sessions);
    } catch {
      setExportSessions([]);
    }
    setShowExport(true);
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:bg-primary focus:text-primary-foreground focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>
      {/* ━━━ SIDEBAR (slide-in overlay) ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      />
      <div
        className={`fixed left-0 top-0 h-screen w-72 z-50 overflow-y-auto transition-transform duration-300 ease-out bg-card ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4">
          <div>
            <span className="font-headline font-black text-xl tracking-tighter block leading-tight text-foreground">
              BenchLog
            </span>
            <span className="font-label text-xs block mt-0.5 text-muted-foreground">
              {projectName}
            </span>
          </div>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close navigation" className="p-1 rounded hover:opacity-70">
            <MIcon name="close" className="text-xl text-foreground" />
          </button>
        </div>
        <div className="px-4 pb-4">
          <div className="flex flex-col gap-4">
            {/* NAVIGATION */}
            <div className="flex flex-col gap-0.5">
              <div className="font-bold text-xs tracking-widest uppercase mb-1 text-muted-foreground">
                Navigation
              </div>
              {NAV_ITEMS.map(item => {
                const isActive = item.id === activePage;
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-1.5 rounded transition-colors text-sm ${isActive ? 'font-medium bg-primary/[0.12] text-primary' : 'hover:opacity-80 text-foreground'}`}
                  >
                    <MIcon name={item.icon} className={`text-xl ${!isActive ? 'text-muted-foreground' : ''}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* EXPORT */}
            {(isAuthenticated || demoMode) && (
              <div className="flex flex-col gap-0.5">
                <div className="font-bold text-xs tracking-widest uppercase mb-1 text-muted-foreground">
                  Export
                </div>
                <button
                  onClick={() => { setSidebarOpen(false); handleExportClick(); }}
                  className="flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-left text-foreground w-full"
                >
                  <MIcon name="picture_as_pdf" className="text-xl text-muted-foreground" />
                  Build Report
                </button>
              </div>
            )}

            {/* ACCOUNT */}
            <div className="flex flex-col gap-0.5">
              <div className="font-bold text-xs tracking-widest uppercase mb-1 text-muted-foreground">
                Account
              </div>

              {isAuthenticated && !demoMode && (
                <button
                  onClick={() => { setSidebarOpen(false); setShowSettings(true); }}
                  className="flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-left text-foreground w-full"
                >
                  <MIcon name="settings" className="text-xl text-muted-foreground" />
                  Settings
                </button>
              )}

              <button
                onClick={() => { setSidebarOpen(false); setShowAbout(true); }}
                className="flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-left text-foreground"
              >
                <MIcon name="info" className="text-xl text-muted-foreground" />
                About
              </button>

              <a
                href={`mailto:bugs@benchlog.build?subject=${encodeURIComponent('[BenchLog Bug] ' + projectName)}`}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-foreground"
              >
                <MIcon name="bug_report" className="text-xl text-muted-foreground" />
                Report a Bug
              </a>

              {role === 'admin' && isAuthenticated && !demoMode && (
                <Link
                  to="/admin"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-foreground"
                >
                  <MIcon name="admin_panel_settings" className="text-xl text-muted-foreground" />
                  Admin Panel
                </Link>
              )}

              {isAuthenticated && !demoMode && (
                <button
                  onClick={() => { setSidebarOpen(false); logout(); }}
                  className="flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-left text-destructive"
                >
                  <MIcon name="logout" className="text-xl" />
                  Sign out
                </button>
              )}

              {!isAuthenticated && !demoMode && (
                <Link
                  to="/login"
                  state={{ from: `/${activePage}` }}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-foreground"
                >
                  <MIcon name="login" className="text-xl text-muted-foreground" />
                  Log in
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ━━━ MAIN AREA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-col min-h-screen">
        {/* ─── Top Nav (fixed) ───────────────────────────────────── */}
        <header className="fixed top-0 right-0 left-0 z-30 shadow-sm bg-card">
          {demoMode && (
            <div className="px-4 py-2 flex items-center justify-center gap-2 text-sm bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Eye className="w-4 h-4 shrink-0" />
              <span>Demo mode — read only. No data can be created or changed.</span>
            </div>
          )}
          <div className="flex justify-between items-center h-16 px-4 sm:px-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
                className="p-2 -ml-2 rounded hover:opacity-70 transition-colors text-foreground"
              >
                <MIcon name="menu" />
              </button>
              <div>
                <span className="font-headline font-black text-xl tracking-tighter block leading-tight text-foreground">
                  BenchLog
                </span>
                <span className="font-label text-[10px] block text-muted-foreground">
                  {projectName}
                </span>
              </div>
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground hidden sm:block">
                /&ensp;{pageTitle || PAGE_TITLES[activePage] || ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {headerRight}
            </div>
          </div>
        </header>

        {/* ─── Page Content ──────────────────────────────────────── */}
        <main id="main-content" className={`px-4 sm:px-6 pb-8 w-full flex-grow mx-auto max-w-7xl ${demoMode ? 'pt-28' : 'pt-20'}`}>
          <h1 className="sr-only">{pageTitle || PAGE_TITLES[activePage] || 'BenchLog'}</h1>
          {children}
        </main>
      </div>

      <AboutDialog open={showAbout} onOpenChange={setShowAbout} />
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      <ExportDialog sessions={exportSessions} open={showExport} onOpenChange={setShowExport} />
    </div>
  );
}
