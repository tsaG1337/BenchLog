import { useState, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { generateId } from '@/lib/utils';
import { Timer } from '@/components/Timer';
import { SessionForm } from '@/components/SessionForm';
import { Dashboard } from '@/components/Dashboard';
import { SessionHistory } from '@/components/SessionHistory';
import { WorkSession } from '@/lib/types';
import { fetchSessions, createSession, deleteSessionApi, updateSessionApi, fetchGeneralSettings, fetchBuildStats, startTimer, stopTimer, getTimerStatus } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Wrench, BarChart3, Clock, BookOpen, LogOut, Menu, Settings, Plus, Download, NotebookPen, Eye, Info, Wallet } from 'lucide-react';
import { ExportDialog } from '@/components/ExportDialog';
import { ManualEntryDialog } from '@/components/ManualEntryDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { AboutDialog } from '@/components/AboutDialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const Index = () => {
  const { logout, demoMode } = useAuth();
  const location = useLocation();
  const [openDialog, setOpenDialog] = useState<'settings' | 'manual' | 'export' | 'about' | null>(
    (location.state as any)?.openSettings ? 'settings' : null
  );
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [section, setSection] = useState('fuselage');
  const [plansPage, setPlansPage] = useState('');
  const [plansSection, setPlansSection] = useState('');
  const [plansStep, setPlansStep] = useState('');
  const [notes, setNotes] = useState('');
  const [projectName, setProjectName] = useState('Build Tracker');
  const [targetHours, setTargetHours] = useState(2500);
  const [progressMode, setProgressMode] = useState<'time' | 'packages'>('time');
  const [packageProgressPct, setPackageProgressPct] = useState(0);
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>('24h');
  const [serverStartedAt, setServerStartedAt] = useState<string | null>(null);
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      toast.error('Failed to load sessions. Is the backend running?');
    }
  }, []);

  useEffect(() => {
    if (projectName) document.title = projectName;
  }, [projectName]);

  useEffect(() => {
    loadSessions();
    fetchGeneralSettings().then(s => {
      setProjectName(s.projectName);
      setTargetHours(s.targetHours || 2500);
      setTimeFormat(s.timeFormat || '24h');
    }).catch(() => {});
    fetchBuildStats().then(s => {
      setProgressMode(s.progressMode || 'time');
      setPackageProgressPct(s.progressPct);
    }).catch(() => {});
    
    // Check for active timer on mount
    getTimerStatus().then(status => {
      if (status.running && status.section) {
        setIsRunning(true);
        setSection(status.section);
      }
    }).catch(() => {});
  }, [loadSessions]);

  const handleStart = async () => {
    if (demoMode) {
      setServerStartedAt(new Date().toISOString());
      setIsRunning(true);
      return;
    }
    try {
      const result = await startTimer(section);
      setServerStartedAt(result.startedAt);
      setIsRunning(true);
    } catch (err: any) {
      toast.error('Failed to start timer: ' + err.message);
    }
  };

  const handlePause = () => {
    // Pause is client-side only - just stops the UI from updating
  };

  const handleStop = useCallback(async (durationMinutes: number, startTime: Date, endTime: Date) => {
    if (demoMode) {
      setIsRunning(false);
      setServerStartedAt(null);
      setPlansPage('');
      setPlansSection('');
      setPlansStep('');
      setNotes('');
      toast.info('Demo mode — session not saved.');
      return;
    }

    const p = plansPage.trim().replace(/,+$/, '');
    const s = plansSection.trim().replace(/,+$/, '');
    const st = plansStep.trim().replace(/,+$/, '');
    const plansRef = [p && `Page ${p}`, s && `Section ${s}`, st && `Step ${st}`]
      .filter(Boolean)
      .join(', ');

    try {
      await stopTimer(notes, plansRef || undefined, pendingImageUrls);
      await loadSessions();
    } catch (err: any) {
      toast.error('Failed to save session: ' + err.message);
    }

    setIsRunning(false);
    setPlansPage('');
    setPlansSection('');
    setPlansStep('');
    setNotes('');
    setPendingImageUrls([]);
  }, [demoMode, plansPage, plansSection, plansStep, notes, pendingImageUrls, loadSessions]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSessionApi(id);
      await loadSessions();
    } catch (err: any) {
      toast.error('Failed to delete session: ' + err.message);
    }
  };

  const handleUpdate = async (id: string, updates: Partial<WorkSession>) => {
    try {
      await updateSessionApi(id, updates);
      await loadSessions();
    } catch (err: any) {
      toast.error('Failed to update session: ' + err.message);
    }
  };

  const handleManualAdd = async (entry: { section: string; date: Date; hours: number; minutes: number; notes: string; plansPage: string; plansSection: string; plansStep: string; imageUrls: string[] }) => {
    const durationMinutes = entry.hours * 60 + entry.minutes;
    const startTime = new Date(entry.date);
    startTime.setHours(12, 0, 0, 0);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    const plansRef = [entry.plansPage && `Page ${entry.plansPage}`, entry.plansSection && `Section ${entry.plansSection}`, entry.plansStep && `Step ${entry.plansStep}`].filter(Boolean).join(', ');

    const session: WorkSession = {
      id: generateId(),
      section: entry.section,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes,
      notes: entry.notes,
      plansReference: plansRef || undefined,
      imageUrls: entry.imageUrls.length > 0 ? entry.imageUrls : undefined,
    };

    try {
      await createSession(session);
      await loadSessions();
    } catch (err: any) {
      toast.error('Failed to save session: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {demoMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <Eye className="w-4 h-4 shrink-0" />
          <span>Demo mode — the timer and form are fully interactive, but sessions are not saved.</span>
        </div>
      )}
      <header className="border-b border-border bg-card/50">
        <div className="container max-w-4xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center glow-amber">
            <Wrench className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight truncate flex-1">
            {projectName}
          </h1>

          {/* Dropdown menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
                <Menu className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {!demoMode && (
                <DropdownMenuItem onClick={() => setOpenDialog('settings')}>
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </DropdownMenuItem>
              )}
              {!demoMode && (
                <DropdownMenuItem onClick={() => setOpenDialog('manual')}>
                  <Plus className="w-4 h-4 mr-2" /> Add Entry
                </DropdownMenuItem>
              )}
              {!demoMode && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => setOpenDialog('export')}>
                <Download className="w-4 h-4 mr-2" /> Build Report
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/blog" className="flex items-center w-full">
                  <NotebookPen className="w-4 h-4 mr-2" /> Build Blog
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/expenses" className="flex items-center w-full">
                  <Wallet className="w-4 h-4 mr-2" /> Expenses
                </Link>
              </DropdownMenuItem>
                      <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setOpenDialog('about')}>
                <Info className="w-4 h-4 mr-2" /> About
              </DropdownMenuItem>
              {!demoMode && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Dialogs driven by dropdown */}
      <SettingsDialog
        open={openDialog === 'settings'}
        onOpenChange={o => setOpenDialog(o ? 'settings' : null)}
        onProjectNameChange={setProjectName}
        onTargetHoursChange={setTargetHours}
        onSettingsSaved={() => {
          fetchBuildStats().then(s => {
            setProgressMode(s.progressMode || 'time');
            setPackageProgressPct(s.progressPct);
          }).catch(() => {});
          fetchGeneralSettings().then(s => setTimeFormat(s.timeFormat || '24h')).catch(() => {});
        }}
      />
      <ManualEntryDialog
        open={openDialog === 'manual'}
        onOpenChange={o => setOpenDialog(o ? 'manual' : null)}
        onAdd={handleManualAdd}
      />
      <ExportDialog
        sessions={sessions}
        open={openDialog === 'export'}
        onOpenChange={o => setOpenDialog(o ? 'export' : null)}
        timeFormat={timeFormat}
      />
      <AboutDialog
        open={openDialog === 'about'}
        onOpenChange={o => setOpenDialog(o ? 'about' : null)}
      />

      <main className="container max-w-4xl py-6 space-y-6">
        <div className="bg-card border border-border rounded-xl p-8">
          <Timer
            isRunning={isRunning}
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
            serverStartedAt={serverStartedAt}
            demoMode={demoMode}
          />
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <SessionForm
            section={section}
            onSectionChange={setSection}
            plansPage={plansPage}
            onPlansPageChange={setPlansPage}
            plansSection={plansSection}
            onPlansSectionChange={setPlansSection}
            plansStep={plansStep}
            onPlansStepChange={setPlansStep}
            notes={notes}
            onNotesChange={setNotes}
            pendingImageUrls={pendingImageUrls}
            onPendingImageUrlsChange={setPendingImageUrls}
            demoMode={demoMode}
          />
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="w-full bg-card border border-border">
            <TabsTrigger value="dashboard" className="flex-1 gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <BarChart3 className="w-4 h-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <Clock className="w-4 h-4" /> History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-4">
            <Dashboard sessions={sessions} targetHours={targetHours} progressMode={progressMode} packageProgressPct={packageProgressPct} />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <SessionHistory sessions={sessions} onDelete={handleDelete} onUpdate={handleUpdate} readOnly={demoMode} timeFormat={timeFormat} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
