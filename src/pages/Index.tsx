import { useState, useCallback, useEffect, useRef } from 'react';
import { generateId } from '@/lib/utils';
import { Timer } from '@/components/Timer';
import { SessionHistory } from '@/components/SessionHistory';
import { SessionImages } from '@/components/SessionImages';
import { WorkSession } from '@/lib/types';
import { fetchSessions, createSession, deleteSessionApi, updateSessionApi, fetchGeneralSettings, startTimer, stopTimer, getTimerStatus } from '@/lib/api';

const SESSIONS_PAGE_SIZE = 50;
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { ExportDialog } from '@/components/ExportDialog';
import { ManualEntryDialog } from '@/components/ManualEntryDialog';
import { WorkPackagePicker } from '@/components/WorkPackagePicker';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell, MIcon } from '@/components/AppShell';
import { toast } from 'sonner';

// ─── Speech Recognition ────────────────────────────────────────────
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

const Index = () => {
  const { demoMode } = useAuth();
  const [openDialog, setOpenDialog] = useState<'manual' | 'export' | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [section, setSection] = useState('fuselage');
  const [plansPage, setPlansPage] = useState('');
  const [plansSection, setPlansSection] = useState('');
  const [plansStep, setPlansStep] = useState('');
  const [notes, setNotes] = useState('');
  const [projectName, setProjectName] = useState('Build Tracker');
  const [targetHours, setTargetHours] = useState(2500);
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>('24h');
  const [serverStartedAt, setServerStartedAt] = useState<string | null>(null);
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);

  // Dictation state
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const toggleListening = () => {
    if (!SpeechRecognitionAPI) {
      toast.error('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) {
        setNotes(prev => (prev ? prev + ' ' : '') + final.trim());
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };
    recognition.onend = () => { setIsListening(false); setInterimText(''); };
    recognition.onerror = (e: any) => {
      if (e.error !== 'aborted') toast.error('Microphone error: ' + e.error);
      setIsListening(false);
      setInterimText('');
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // ─── Data loading ────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const page = await fetchSessions({ limit: SESSIONS_PAGE_SIZE, offset: 0 });
      setSessions(page.sessions);
      setSessionsHasMore(page.hasMore);
      setSessionsOffset(SESSIONS_PAGE_SIZE);
    } catch { toast.error('Failed to load sessions. Is the backend running?'); }
  }, []);

  const loadMoreSessions = useCallback(async () => {
    try {
      const page = await fetchSessions({ limit: SESSIONS_PAGE_SIZE, offset: sessionsOffset });
      setSessions(prev => [...prev, ...page.sessions]);
      setSessionsHasMore(page.hasMore);
      setSessionsOffset(prev => prev + SESSIONS_PAGE_SIZE);
    } catch { toast.error('Failed to load more sessions.'); }
  }, [sessionsOffset]);

  useEffect(() => {
    if (projectName) document.title = `${projectName} — Tracker`;
  }, [projectName]);

  useEffect(() => {
    loadSessions();
    fetchGeneralSettings().then(s => {
      setProjectName(s.projectName);
      setTargetHours(s.targetHours || 2500);
      setTimeFormat(s.timeFormat || '24h');
    }).catch(() => {});
    getTimerStatus().then(status => {
      if (status.running && status.section) {
        setIsRunning(true);
        setSection(status.section);
        if (status.imageUrls?.length) setPendingImageUrls(status.imageUrls);
      }
    }).catch(() => {});
  }, [loadSessions]);

  // ─── Timer handlers ──────────────────────────────────────────────
  const handleStart = async () => {
    if (demoMode) { setServerStartedAt(new Date().toISOString()); setIsRunning(true); return; }
    try {
      const result = await startTimer(section);
      setServerStartedAt(result.startedAt);
      setIsRunning(true);
    } catch (err: any) { toast.error('Failed to start timer: ' + err.message); }
  };

  const handlePause = () => {};

  const handleStop = useCallback(async (durationMinutes: number, startTime: Date, endTime: Date) => {
    if (demoMode) {
      setIsRunning(false); setServerStartedAt(null);
      setPlansPage(''); setPlansSection(''); setPlansStep(''); setNotes('');
      toast.info('Demo mode — session not saved.');
      return;
    }
    const p = plansPage.trim().replace(/,+$/, '');
    const s = plansSection.trim().replace(/,+$/, '');
    const st = plansStep.trim().replace(/,+$/, '');
    const plansRef = [p && `Page ${p}`, s && `Section ${s}`, st && `Step ${st}`].filter(Boolean).join(', ');
    try {
      await stopTimer(notes, plansRef || undefined, pendingImageUrls);
      await loadSessions();
    } catch (err: any) { toast.error('Failed to save session: ' + err.message); }
    setIsRunning(false);
    setPlansPage(''); setPlansSection(''); setPlansStep(''); setNotes('');
    setPendingImageUrls([]);
  }, [demoMode, plansPage, plansSection, plansStep, notes, pendingImageUrls, loadSessions]);

  const handleDelete = async (id: string) => {
    try { await deleteSessionApi(id); await loadSessions(); }
    catch (err: any) { toast.error('Failed to delete session: ' + err.message); }
  };

  const handleUpdate = async (id: string, updates: Partial<WorkSession>) => {
    try { await updateSessionApi(id, updates); await loadSessions(); }
    catch (err: any) { toast.error('Failed to update session: ' + err.message); }
  };

  const handleManualAdd = async (entry: { section: string; date: Date; hours: number; minutes: number; notes: string; plansPage: string; plansSection: string; plansStep: string; imageUrls: string[] }) => {
    const durationMinutes = entry.hours * 60 + entry.minutes;
    const startTime = new Date(entry.date);
    startTime.setHours(12, 0, 0, 0);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    const plansRef = [entry.plansPage && `Page ${entry.plansPage}`, entry.plansSection && `Section ${entry.plansSection}`, entry.plansStep && `Step ${entry.plansStep}`].filter(Boolean).join(', ');
    const session: WorkSession = {
      id: generateId(), section: entry.section,
      startTime: startTime.toISOString(), endTime: endTime.toISOString(),
      durationMinutes, notes: entry.notes,
      plansReference: plansRef || undefined,
      imageUrls: entry.imageUrls.length > 0 ? entry.imageUrls : undefined,
    };
    try { await createSession(session); await loadSessions(); }
    catch (err: any) { toast.error('Failed to save session: ' + err.message); }
  };

  // ─── Header actions ──────────────────────────────────────────────
  const headerActions = (
    <>
      {!demoMode && (
        <button
          onClick={() => setOpenDialog('manual')}
          className="font-label text-[10px] font-bold py-2 px-4 rounded hover:opacity-90 transition-colors flex items-center gap-2 uppercase tracking-wider shadow-sm bg-primary text-primary-foreground"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Entry</span>
        </button>
      )}
    </>
  );

  return (
    <AppShell activePage="tracker" projectName={projectName} headerRight={headerActions}>
      {/* Dialogs */}
      <ManualEntryDialog open={openDialog === 'manual'} onOpenChange={o => setOpenDialog(o ? 'manual' : null)} onAdd={handleManualAdd} />
      <ExportDialog sessions={sessions} open={openDialog === 'export'} onOpenChange={o => setOpenDialog(o ? 'export' : null)} timeFormat={timeFormat} />

      <div className="space-y-6">
        {/* ━━━ Bento Grid ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left Column (8/12): Timer, Sections, Notes ──────── */}
          <div className="lg:col-span-8 space-y-6">

            {/* Timer Card */}
            <div className="bg-card rounded-lg p-6 sm:p-8">
              <Timer
                isRunning={isRunning}
                onStart={handleStart}
                onPause={handlePause}
                onStop={handleStop}
                serverStartedAt={serverStartedAt}
                demoMode={demoMode}
              />
            </div>

            {/* Assembly Section & Work Package Picker */}
            <div className="bg-muted/40 rounded-lg p-4">
              <WorkPackagePicker
                section={section}
                onSectionChange={setSection}
                plansSection={plansSection}
                onPlansSectionChange={setPlansSection}
              />
            </div>

            {/* Build Notes */}
            <div className="bg-card rounded-lg p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-label text-[10px] font-bold uppercase text-muted-foreground tracking-[0.15em]">Build Notes & Observations</h3>
                {SpeechRecognitionAPI && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all font-label text-[10px] font-bold uppercase ${
                      isListening
                        ? 'bg-destructive/10 text-destructive border border-destructive/30'
                        : 'text-primary hover:bg-primary/10'
                    }`}
                  >
                    {isListening ? (
                      <>
                        <span className="flex items-end gap-[3px] h-4">
                          {[0.4, 0.7, 1, 0.7, 0.4].map((scale, i) => (
                            <span
                              key={i}
                              className="w-[3px] rounded-full bg-destructive animate-bounce"
                              style={{ height: `${scale * 100}%`, animationDelay: `${i * 0.1}s`, animationDuration: `${0.5 + i * 0.1}s` }}
                            />
                          ))}
                        </span>
                        Stop
                      </>
                    ) : (
                      <>
                        <MIcon name="mic" className="text-sm" />
                        Dictate Note
                      </>
                    )}
                  </button>
                )}
              </div>
              <Textarea
                placeholder="Document specific riveting techniques, torque values, or observations..."
                value={notes}
                maxLength={10000}
                onChange={(e) => setNotes(e.target.value)}
                className={`bg-muted/50 border-none min-h-[160px] text-sm font-body placeholder:font-label placeholder:uppercase placeholder:text-[10px] placeholder:tracking-[0.15em] placeholder:text-muted-foreground/40 ${
                  isListening ? 'ring-1 ring-destructive/50' : ''
                }`}
              />
              {interimText && (
                <p className="text-xs text-muted-foreground italic px-1">{interimText}...</p>
              )}
            </div>
          </div>

          {/* ── Right Column (4/12): Plans Reference, Images ────── */}
          <div className="lg:col-span-4 space-y-6">

            {/* Technical Reference */}
            <div className="bg-card rounded-lg p-6 space-y-5">
              <h3 className="font-label text-[10px] font-bold uppercase text-muted-foreground tracking-[0.15em] border-b border-border pb-3">Plans Reference</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-label text-[10px] font-bold uppercase text-muted-foreground">Page</label>
                  <Input
                    placeholder="e.g. 8"
                    value={plansPage}
                    onChange={(e) => setPlansPage(e.target.value)}
                    className="bg-muted/50 border-none font-mono font-bold text-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-label text-[10px] font-bold uppercase text-muted-foreground">Step</label>
                  <Input
                    placeholder="e.g. C-02"
                    value={plansStep}
                    onChange={(e) => setPlansStep(e.target.value)}
                    className="bg-muted/50 border-none font-mono font-bold text-primary"
                  />
                </div>
              </div>
            </div>

            {/* Session Images */}
            <div className="bg-card rounded-lg p-6 space-y-3">
              <h3 className="font-label text-[10px] font-bold uppercase text-muted-foreground tracking-[0.15em]">Session Visuals</h3>
              <SessionImages
                sessionId="pending"
                imageUrls={pendingImageUrls}
                onImagesChange={setPendingImageUrls}
                editable
                demoMode={demoMode}
              />
            </div>

            {/* Session History */}
            <div className="bg-card rounded-lg p-6 space-y-3">
              <h3 className="font-label text-[10px] font-bold uppercase text-muted-foreground tracking-[0.15em]">Recent Sessions</h3>
              <SessionHistory sessions={sessions} onDelete={handleDelete} onUpdate={handleUpdate} readOnly={demoMode} timeFormat={timeFormat} hasMore={sessionsHasMore} onLoadMore={loadMoreSessions} />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default Index;
