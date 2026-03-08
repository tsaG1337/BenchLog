import { useState, useCallback, useEffect } from 'react';
import { generateId } from '@/lib/utils';
import { Timer } from '@/components/Timer';
import { SessionForm } from '@/components/SessionForm';
import { Dashboard } from '@/components/Dashboard';
import { SessionHistory } from '@/components/SessionHistory';
import { WorkSession } from '@/lib/types';
import { fetchSessions, createSession, deleteSessionApi, updateSessionApi, fetchGeneralSettings } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wrench, BarChart3, Clock } from 'lucide-react';
import { ExportDialog } from '@/components/ExportDialog';
import { ManualEntryDialog } from '@/components/ManualEntryDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { toast } from 'sonner';

const Index = () => {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [section, setSection] = useState('fuselage');
  const [plansPage, setPlansPage] = useState('');
  const [plansSection, setPlansSection] = useState('');
  const [plansStep, setPlansStep] = useState('');
  const [notes, setNotes] = useState('');
  const [projectName, setProjectName] = useState('RV-10 Build Tracker');
  const [targetHours, setTargetHours] = useState(2500);

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
    loadSessions();
    fetchGeneralSettings().then(s => {
      setProjectName(s.projectName);
      setTargetHours(s.targetHours || 2500);
    }).catch(() => {});
  }, [loadSessions]);

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);

  const handleStop = useCallback(async (durationMinutes: number, startTime: Date, endTime: Date) => {
    const plansRef = [plansPage && `Page ${plansPage}`, plansSection && `Section ${plansSection}`, plansStep && `Step ${plansStep}`]
      .filter(Boolean)
      .join(', ');

    const session: WorkSession = {
      id: generateId(),
      section,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes,
      notes,
      plansReference: plansRef || undefined,
    };

    try {
      await createSession(session);
      await loadSessions();
    } catch (err: any) {
      toast.error('Failed to save session: ' + err.message);
    }

    setIsRunning(false);
    setPlansPage('');
    setPlansSection('');
    setPlansStep('');
    setNotes('');
  }, [section, plansPage, plansSection, plansStep, notes, loadSessions]);

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

  const handleManualAdd = async (entry: { section: string; date: Date; hours: number; minutes: number; notes: string; plansPage: string; plansSection: string; plansStep: string }) => {
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
      <header className="border-b border-border bg-card/50">
        <div className="container max-w-4xl py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center glow-amber">
            <Wrench className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground tracking-tight">{projectName}</h1>
          </div>
          <SettingsDialog onProjectNameChange={setProjectName} onTargetHoursChange={setTargetHours} />
          <ManualEntryDialog onAdd={handleManualAdd} />
          <ExportDialog sessions={sessions} />
        </div>
      </header>

      <main className="container max-w-4xl py-6 space-y-6">
        <div className="bg-card border border-border rounded-xl p-8">
          <Timer
            isRunning={isRunning}
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
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
            <Dashboard sessions={sessions} targetHours={targetHours} />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <SessionHistory sessions={sessions} onDelete={handleDelete} onUpdate={handleUpdate} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
