import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square, Pause } from 'lucide-react';
import { getTimerStatus } from '@/lib/api';

interface TimerProps {
  onStop: (durationMinutes: number, startTime: Date, endTime: Date) => void;
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  serverStartedAt?: string | null;
}

export function Timer({ onStop, isRunning, onStart, onPause, serverStartedAt }: TimerProps) {
  const [elapsed, setElapsed] = useState(0); // seconds
  const [serverStartTime, setServerStartTime] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Use prop serverStartedAt immediately, then sync with polling
  useEffect(() => {
    if (serverStartedAt) {
      setServerStartTime(serverStartedAt);
    }
  }, [serverStartedAt]);

  // Poll server for timer status every 2 seconds
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const status = await getTimerStatus();
        if (status.running && status.startedAt) {
          setServerStartTime(status.startedAt);
        } else {
          setServerStartTime(null);
        }
      } catch (err) {
        console.error('Failed to poll timer status:', err);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Calculate elapsed time from server start time
  useEffect(() => {
    if (!serverStartTime) {
      setElapsed(0);
      setIsPaused(false);
      return;
    }

    const updateElapsed = () => {
      if (isPaused) return; // Don't update when paused
      const startTime = new Date(serverStartTime);
      const now = new Date();
      const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));
      setElapsed(elapsedSeconds);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [serverStartTime, isPaused]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  const handleStop = () => {
    const endTime = new Date();
    const startTime = serverStartTime ? new Date(serverStartTime) : new Date(endTime.getTime() - elapsed * 1000);
    onStop(elapsed / 60, startTime, endTime);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className={`timer-display text-6xl md:text-7xl font-bold transition-all ${isRunning ? 'text-primary glow-amber-strong' : elapsed > 0 ? 'text-accent-foreground' : 'text-muted-foreground'}`}>
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </div>
      <div className="flex gap-3">
        {!isRunning && elapsed === 0 && (
          <Button onClick={onStart} size="lg" className="gap-2 text-lg px-8">
            <Play className="w-5 h-5" /> Start
          </Button>
        )}
        {isRunning && (
          <Button onClick={onPause} variant="secondary" size="lg" className="gap-2 text-lg px-8">
            <Pause className="w-5 h-5" /> Pause
          </Button>
        )}
        {(isRunning || elapsed > 0) && (
          <Button onClick={handleStop} variant="destructive" size="lg" className="gap-2 text-lg px-8">
            <Square className="w-5 h-5" /> Stop & Log
          </Button>
        )}
        {!isRunning && elapsed > 0 && (
          <Button onClick={onStart} size="lg" className="gap-2 text-lg px-8">
            <Play className="w-5 h-5" /> Resume
          </Button>
        )}
      </div>
    </div>
  );
}
