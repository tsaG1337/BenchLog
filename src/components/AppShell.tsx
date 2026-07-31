import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AboutDialog } from '@/components/AboutDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ExportDialog } from '@/components/ExportDialog';
import { CommandPalette, useCommandPalette } from '@/components/CommandPalette';
import { TourController } from '@/components/onboarding/TourController';
import { fetchSessions, fetchGeneralSettings } from '@/lib/api';
import type { WorkSession } from '@/lib/types';
import type { GeneralSettings } from '@/lib/api';

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
  { id: 'wiring',      label: 'Wiring',          icon: 'cable',                 to: '/wiring' },
  { id: 'plans',       label: 'Plans',           icon: 'menu_book',             to: '/plans' },
];

// Width of the persistent icon rail on md+ viewports. Keep in sync with
// the `md:pl-14` padding applied to <main> below — the rail is fixed-positioned
// and would otherwise overlap content.
const RAIL_WIDTH_PX = 56;

// ─── Props ──────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  dashboard:   'Dashboard',
  blog:        'Build Log',
  tracker:     'Session Tracker',
  expenses:    'Project Expenses',
  inventory:   'Parts Inventory',
  inspections: 'Inspections',
  wiring:      'Wiring Diagrams',
  plans:       'Plans Library',
};

interface AppShellProps {
  activePage: 'dashboard' | 'blog' | 'tracker' | 'expenses' | 'inventory' | 'inspections' | 'wiring' | 'plans';
  projectName: string;
  pageTitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** When true, the <main> stretches to the full viewport width instead of being capped at max-w-7xl. */
  fullWidth?: boolean;
  /** Shrinks the top bar on mobile (h-12 vs h-16, no project-name subtitle).
   *  Used for full-canvas viewers like the PDF reader where every vertical
   *  pixel matters. md+ layout is unaffected. */
  compactHeaderOnMobile?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// APP SHELL — persistent icon rail (md+) + overlay drawer (all sizes)
// + global Cmd/Ctrl+K command palette.
//
// On md+ screens a thin icon-only rail is always visible on the left.
// Clicking the rail's menu icon (or the topbar menu on mobile) opens the
// labeled drawer, which renders as an overlay on top of the rail with a
// dimmed backdrop — page content does not reflow on expansion.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function AppShell({ activePage, projectName, pageTitle, headerRight, children, fullWidth = false, compactHeaderOnMobile = false }: AppShellProps) {
  const { isAuthenticated, demoMode, logout, role, latestNews, hasUnseenNews, markNewsSeen } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportSessions, setExportSessions] = useState<WorkSession[]>([]);
  const [featureFlags, setFeatureFlags] = useState<GeneralSettings['featureFlags']>(undefined);
  const palette = useCommandPalette();

  // Feature flags drive visibility of nav items for non-admin users. Admins
  // see the full nav regardless. Missing flag entries default to enabled.
  useEffect(() => {
    fetchGeneralSettings().then(s => setFeatureFlags(s.featureFlags)).catch(() => {});
  }, []);

  const visibleNavItems = NAV_ITEMS.filter(item => {
    // Only REAL admin sessions bypass feature flags. In demo mode the
    // server fakes role='admin' for anonymous visitors so they can browse
    // the app, so `role === 'admin'` alone is not a sufficient signal —
    // require `!demoMode` as well. (For a normal deployment `demoMode` is
    // always false, so a real admin still bypasses.)
    if (role === 'admin' && !demoMode) return true;
    const flag = featureFlags?.[item.id as keyof NonNullable<GeneralSettings['featureFlags']>];
    return flag !== false;
  });

  const newsUrl = latestNews ? `https://benchlog.build/news/${latestNews.slug}/` : null;
  const handleNewsClick = () => {
    if (hasUnseenNews) markNewsSeen();
  };

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

  // Keep the browser tab title in sync with the active page. Previously most
  // pages forgot to set document.title, so it inherited whatever the last
  // page (or the SSR public blog) had left behind — e.g. "Foo — Build Journal"
  // sticking around on /plans. Doing it once here covers every authenticated
  // page. Pages that want a custom title (e.g. an open blog post) can pass
  // `pageTitle` to override the activePage default.
  useEffect(() => {
    const label = pageTitle || PAGE_TITLES[activePage] || 'BenchLog';
    document.title = projectName ? `${projectName} — ${label}` : `${label} — BenchLog`;
  }, [activePage, projectName, pageTitle]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:bg-primary focus:text-primary-foreground focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      {/* ━━━ COLLAPSED ICON RAIL (md+ only) ━━━━━━━━━━━━━━━━━━━━━━━ */}
      <aside
        aria-label="Primary navigation rail"
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-30 flex-col items-center bg-card border-r border-border"
        style={{ width: RAIL_WIDTH_PX }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          data-tour-id="nav-menu"
          className="w-10 h-10 mt-3 mb-3 flex items-center justify-center rounded hover:bg-accent transition-colors text-foreground"
        >
          <MIcon name="menu" />
        </button>
        <nav className="flex flex-col gap-1 mt-2 flex-1">
          {visibleNavItems.map(item => {
            const isActive = item.id === activePage;
            return (
              <Link
                key={item.id}
                to={item.to}
                aria-label={item.label}
                title={item.label}
                // data-tour-id targets used by the spotlight tour to
                // highlight rail items by their nav id (`tracker`,
                // `plans`, etc.). Keeping the attribute mirror the
                // NAV_ITEMS id means new entries automatically pick
                // up a stable selector — no extra wiring.
                data-tour-id={`nav-${item.id}`}
                className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
                  isActive
                    ? 'bg-primary/[0.12] text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <MIcon name={item.icon} />
              </Link>
            );
          })}
        </nav>
        {isAuthenticated && !demoMode && newsUrl && (
          <a
            href={newsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleNewsClick}
            aria-label="What's New"
            title="What's New"
            className="relative w-10 h-10 mb-1 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <MIcon name="new_releases" />
            {hasUnseenNews && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            )}
          </a>
        )}
        <button
          onClick={() => palette.setOpen(true)}
          aria-label="Search (Ctrl+K)"
          title="Search (Ctrl+K)"
          data-tour-id="nav-search"
          className="w-10 h-10 mb-3 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Search className="h-4 w-4" />
        </button>
      </aside>

      {/* ━━━ EXPANDED OVERLAY DRAWER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      />
      <div
        className={`fixed left-0 top-0 h-screen w-72 z-50 overflow-y-auto transition-transform duration-300 ease-out bg-card border-r border-border ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4">
          <div>
            <span className="font-headline font-black text-xl tracking-tighter block leading-tight text-foreground">
              Bench<span className="text-primary">Log</span>
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
            {/* GLOBAL SEARCH (Ctrl+K trigger) */}
            <button
              onClick={() => { setSidebarOpen(false); palette.setOpen(true); }}
              className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-input/50 hover:bg-accent transition-colors text-sm text-muted-foreground w-full text-left"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1">Search…</span>
              <span className="font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded border border-border">⌘K</span>
            </button>

            {/* NAVIGATION */}
            <div className="flex flex-col gap-0.5">
              <div className="font-bold text-xs tracking-widest uppercase mb-1 text-muted-foreground">
                Navigation
              </div>
              {visibleNavItems.map(item => {
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

              {isAuthenticated && !demoMode && newsUrl && (
                <a
                  href={newsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { setSidebarOpen(false); handleNewsClick(); }}
                  className="relative flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-foreground"
                >
                  <MIcon name="new_releases" className="text-xl text-muted-foreground" />
                  What's New
                  {hasUnseenNews && (
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </a>
              )}

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

              {/* Show Log-in entry whenever there's no real authenticated
                  session — demo deployments fake `isAuthenticated:true`, so
                  we also surface the link in demo mode (relabelled to
                  "Admin login" to set expectations). */}
              {(!isAuthenticated || demoMode) && (
                <Link
                  to="/login"
                  state={{ from: `/${activePage}` }}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-1.5 rounded hover:opacity-80 transition-colors text-sm text-foreground"
                >
                  <MIcon name="login" className="text-xl text-muted-foreground" />
                  {demoMode ? 'Admin login' : 'Log in'}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ━━━ MAIN AREA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-col min-h-screen md:pl-14">
        {/* ─── Top Nav (fixed) ───────────────────────────────────── */}
        <header className="fixed top-0 right-0 left-0 md:left-14 z-30 shadow-sm bg-card border-b border-border">
          {demoMode && (
            <div className="px-4 py-2 flex items-center justify-center gap-2 text-sm bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Eye className="w-4 h-4 shrink-0" />
              <span>Demo mode — read only. No data can be created or changed.</span>
            </div>
          )}
          <div className={`flex justify-between items-center ${compactHeaderOnMobile ? 'h-12 md:h-16' : 'h-16'} px-4 sm:px-6`}>
            <div className="flex items-center gap-4">
              {/* Mobile menu button — only visible below md (rail covers md+) */}
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
                className="md:hidden p-2 -ml-2 rounded hover:opacity-70 transition-colors text-foreground"
              >
                <MIcon name="menu" />
              </button>
              <div>
                <span className={`font-headline font-black tracking-tighter block leading-tight text-foreground ${compactHeaderOnMobile ? 'text-lg md:text-xl' : 'text-xl'}`}>
                  Bench<span className="text-primary">Log</span>
                </span>
                <span className={`font-label text-[10px] text-muted-foreground ${compactHeaderOnMobile ? 'hidden md:block' : 'block'}`}>
                  {projectName}
                </span>
              </div>
              <span className={`font-label text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground ${compactHeaderOnMobile ? 'hidden md:block' : 'hidden sm:block'}`}>
                /&ensp;{pageTitle || PAGE_TITLES[activePage] || ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Topbar search trigger — opens command palette */}
              <button
                onClick={() => palette.setOpen(true)}
                aria-label="Search (Ctrl+K)"
                title="Search (Ctrl+K)"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-input/40 hover:bg-accent transition-colors text-xs text-muted-foreground"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search…</span>
                <span className="font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded border border-border">⌘K</span>
              </button>
              {headerRight}
            </div>
          </div>
        </header>

        {/* ─── Page Content ──────────────────────────────────────── */}
        <main id="main-content" className={`${fullWidth ? 'px-0 pb-0' : 'px-4 sm:px-6 pb-8 max-w-7xl'} w-full flex-grow mx-auto ${demoMode ? (compactHeaderOnMobile ? 'pt-24 md:pt-28' : 'pt-28') : (compactHeaderOnMobile ? 'pt-16 md:pt-20' : 'pt-20')}`}>
          <h1 className="sr-only">{pageTitle || PAGE_TITLES[activePage] || 'BenchLog'}</h1>
          {children}
        </main>
      </div>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
      <AboutDialog open={showAbout} onOpenChange={setShowAbout} />
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      <ExportDialog sessions={exportSessions} open={showExport} onOpenChange={setShowExport} />
      {/* Drives the spotlight tour when the user is post-wizard but
          tourStatus is still 'pending'. Renders nothing; manages a
          driver.js instance internally. Safe to mount everywhere
          AppShell is mounted — the controller gates itself. */}
      <TourController />
    </div>
  );
}
