import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square, Pause } from 'lucide-react';
import { getTimerStatus } from '@/lib/api';

interface TimerProps {
  onStop: (durationMinutes: number, startTime: Date, endTime: Date) => void;
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  serverStartedAt?: string | null;
  demoMode?: boolean;
}

export function Timer({ onStop, isRunning, onStart, onPause, serverStartedAt, demoMode }: TimerProps) {
  const [elapsed, setElapsed] = useState(0); // seconds (adjusted for pauses)
  const [serverStartTime, setServerStartTime] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const totalPausedSecsRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);

  // Use prop serverStartedAt immediately
  useEffect(() => {
    if (serverStartedAt) {
      setServerStartTime(serverStartedAt);
    }
  }, [serverStartedAt]);

  // Poll server for timer status every 2 seconds (skip in demo mode)
  useEffect(() => {
    if (demoMode) return;

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
  }, [demoMode]);

  // Calculate elapsed time from server start time, minus paused time
  useEffect(() => {
    if (!serverStartTime) {
      setElapsed(0);
      setIsPaused(false);
      totalPausedSecsRef.current = 0;
      pausedAtRef.current = null;
      return;
    }

    const updateElapsed = () => {
      if (isPaused) return;
      const startTime = new Date(serverStartTime);
      const now = new Date();
      const rawElapsed = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));
      const adjusted = Math.max(0, rawElapsed - totalPausedSecsRef.current);
      setElapsed(adjusted);
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
    // If currently paused, account for the final pause segment
    if (pausedAtRef.current !== null) {
      totalPausedSecsRef.current += Math.floor((Date.now() - pausedAtRef.current) / 1000);
      pausedAtRef.current = null;
    }
    const endTime = new Date();
    const startTime = serverStartTime ? new Date(serverStartTime) : new Date(endTime.getTime() - elapsed * 1000);
    const rawDurationSecs = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    const adjustedDurationMins = Math.max(0, (rawDurationSecs - totalPausedSecsRef.current)) / 60;
    setIsPaused(false);
    totalPausedSecsRef.current = 0;
    onStop(adjustedDurationMins, startTime, endTime);
  };

  const handlePause = () => {
    pausedAtRef.current = Date.now();
    setIsPaused(true);
    onPause();
  };

  const handleResume = () => {
    if (pausedAtRef.current !== null) {
      totalPausedSecsRef.current += Math.floor((Date.now() - pausedAtRef.current) / 1000);
      pausedAtRef.current = null;
    }
    setIsPaused(false);
    // Don't call onStart() - resume is client-side only, server timer keeps running
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className={`timer-display text-6xl md:text-7xl font-bold transition-all ${isRunning && !isPaused ? 'text-primary' : elapsed > 0 ? 'text-accent-foreground' : 'text-muted-foreground'}`}>
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </div>
      {isPaused && (
        <p className="text-sm text-muted-foreground animate-pulse">Paused</p>
      )}
      <div className="flex gap-3">
          {!isRunning && elapsed === 0 && (
            <Button onClick={onStart} size="lg" className="gap-2 text-lg px-8">
              <Play className="w-5 h-5" /> Start
            </Button>
          )}
          {isRunning && (
            isPaused ? (
              <Button onClick={handleResume} size="lg" className="gap-2 text-lg px-8">
                <Play className="w-5 h-5" /> Resume
              </Button>
            ) : (
              <Button onClick={handlePause} variant="secondary" size="lg" className="gap-2 text-lg px-8">
                <Pause className="w-5 h-5" /> Pause
              </Button>
            )
          )}
          {(isRunning || elapsed > 0) && (
            <Button onClick={handleStop} variant="destructive" size="lg" className="gap-2 text-lg px-8">
              <Square className="w-5 h-5" /> Stop & Log
            </Button>
          )}
        </div>
    </div>
  );
}
