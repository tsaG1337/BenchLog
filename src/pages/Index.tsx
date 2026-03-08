import { useState, useCallback } from 'react';
import { Timer } from '@/components/Timer';
import { SessionForm } from '@/components/SessionForm';
import { Dashboard } from '@/components/Dashboard';
import { SessionHistory } from '@/components/SessionHistory';
import { AssemblySection, WorkSession } from '@/lib/types';
import { getSessions, addSession, deleteSession, updateSession } from '@/lib/storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wrench, BarChart3, Clock } from 'lucide-react';
import { ExportDialog } from '@/components/ExportDialog';

const Index = () => {
  const [sessions, setSessions] = useState<WorkSession[]>(getSessions);
  const [isRunning, setIsRunning] = useState(false);
  const [section, setSection] = useState<AssemblySection>('fuselage');
  const [plansPage, setPlansPage] = useState('');
  const [plansSection, setPlansSection] = useState('');
  const [plansStep, setPlansStep] = useState('');
  const [notes, setNotes] = useState('');

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);

  const handleStop = useCallback((durationMinutes: number, startTime: Date, endTime: Date) => {
    const plansRef = [plansPage && `Page ${plansPage}`, plansSection && `Section ${plansSection}`, plansStep && `Step ${plansStep}`]
      .filter(Boolean)
      .join(', ');

    const session: WorkSession = {
      id: crypto.randomUUID(),
      section,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes,
      notes,
      plansReference: plansRef || undefined,
    };

    addSession(session);
    setSessions(getSessions());
    setIsRunning(false);
    setPlansPage('');
    setPlansSection('');
    setPlansStep('');
    setNotes('');
  }, [section, plansPage, plansSection, plansStep, notes]);

  const handleDelete = (id: string) => {
    deleteSession(id);
    setSessions(getSessions());
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="container max-w-4xl py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center glow-amber">
            <Wrench className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground tracking-tight">RV-10 Build Tracker</h1>
            <p className="text-xs text-muted-foreground">Van's Aircraft — Time & Progress Log</p>
          </div>
          <ExportDialog sessions={sessions} />
        </div>
      </header>

      <main className="container max-w-4xl py-6 space-y-6">
        {/* Timer */}
        <div className="bg-card border border-border rounded-xl p-8">
          <Timer
            isRunning={isRunning}
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
          />
        </div>

        {/* Session form */}
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

        {/* Tabs for Dashboard / History */}
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
            <Dashboard sessions={sessions} />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <SessionHistory sessions={sessions} onDelete={handleDelete} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
