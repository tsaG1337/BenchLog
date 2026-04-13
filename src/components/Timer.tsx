import { useState, useEffect, useRef } from 'react';
import { getTimerStatus } from '@/lib/api';
import { MIcon } from '@/components/AppShell';

interface TimerProps {
  onStop: (durationMinutes: number, startTime: Date, endTime: Date) => void;
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  serverStartedAt?: string | null;
  demoMode?: boolean;
}

export function Timer({ onStop, isRunning, onStart, onPause, serverStartedAt, demoMode }: TimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const [serverStartTime, setServerStartTime] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const totalPausedSecsRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);

  useEffect(() => {
    setServerStartTime(serverStartedAt ?? null);
  }, [serverStartedAt]);

  useEffect(() => {
    if (demoMode) return;
    const pollStatus = async () => {
      try {
        const status = await getTimerStatus();
        if (status.running && status.startedAt) {
          // Only update if the start time actually changed (avoid pause state reset)
          setServerStartTime(prev =>
            prev && new Date(prev).getTime() === new Date(status.startedAt).getTime() ? prev : status.startedAt
          );
        } else {
          setServerStartTime(null);
        }
      } catch {}
    };
    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [demoMode]);

  // Persist pause state to localStorage so it survives page refresh
  // Skip the first render to avoid clearing state before the restore effect runs
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (isPaused) {
      localStorage.setItem('timer_paused', '1');
      localStorage.setItem('timer_paused_secs', String(totalPausedSecsRef.current));
      if (pausedAtRef.current !== null) {
        localStorage.setItem('timer_paused_at', String(pausedAtRef.current));
      }
    } else if (serverStartTime) {
      localStorage.removeItem('timer_paused');
      localStorage.removeItem('timer_paused_at');
      localStorage.setItem('timer_paused_secs', String(totalPausedSecsRef.current));
    }
  }, [isPaused, serverStartTime]);

  // Restore pause state from localStorage on mount
  useEffect(() => {
    const wasPaused = localStorage.getItem('timer_paused') === '1';
    const savedSecs = Math.max(0, Math.min(parseInt(localStorage.getItem('timer_paused_secs') || '0', 10) || 0, 7 * 24 * 3600));
    const savedPausedAt = localStorage.getItem('timer_paused_at');
    const parsedPausedAt = savedPausedAt ? parseInt(savedPausedAt, 10) : NaN;
    // Validate: pausedAt must be a recent timestamp (within last 7 days) and not in the future
    const now = Date.now();
    const validPausedAt = !isNaN(parsedPausedAt) && parsedPausedAt > now - 7 * 24 * 3600 * 1000 && parsedPausedAt <= now;
    if (wasPaused && validPausedAt) {
      totalPausedSecsRef.current = savedSecs;
      pausedAtRef.current = parsedPausedAt;
      setIsPaused(true);
    } else if (savedSecs > 0) {
      totalPausedSecsRef.current = savedSecs;
    }
  }, []);

  useEffect(() => {
    if (!serverStartTime) {
      setElapsed(0);
      setIsPaused(false);
      totalPausedSecsRef.current = 0;
      pausedAtRef.current = null;
      localStorage.removeItem('timer_paused');
      localStorage.removeItem('timer_paused_secs');
      localStorage.removeItem('timer_paused_at');
      return;
    }
    const updateElapsed = () => {
      if (isPaused) return;
      const startTime = new Date(serverStartTime);
      const now = new Date();
      const rawElapsed = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));
      setElapsed(Math.max(0, rawElapsed - totalPausedSecsRef.current));
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
    localStorage.removeItem('timer_paused');
    localStorage.removeItem('timer_paused_secs');
    localStorage.removeItem('timer_paused_at');
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
  };

  return (
    <div className="relative overflow-hidden">
      {/* Gradient accent bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-primary/70 to-primary" />

      <div className="flex flex-col items-center justify-center pt-8 pb-6">
        <span className="font-label text-[10px] font-bold uppercase text-muted-foreground tracking-[0.2em] mb-3">
          Active Session Timer
        </span>

        {/* Clock display */}
        <div className="flex items-baseline">
          <span className={`text-5xl sm:text-7xl md:text-8xl font-headline font-black tracking-tighter transition-colors ${
            isRunning && !isPaused ? 'text-foreground' : elapsed > 0 ? 'text-foreground/70' : 'text-muted-foreground/40'
          }`}>
            {pad(hours)}
          </span>
          <span className={`text-5xl sm:text-7xl md:text-8xl font-headline font-black tracking-tighter ${
            isRunning && !isPaused ? 'text-primary animate-pulse' : 'text-muted-foreground/30'
          }`}>:</span>
          <span className={`text-5xl sm:text-7xl md:text-8xl font-headline font-black tracking-tighter transition-colors ${
            isRunning && !isPaused ? 'text-foreground' : elapsed > 0 ? 'text-foreground/70' : 'text-muted-foreground/40'
          }`}>
            {pad(minutes)}
          </span>
          <span className={`text-5xl sm:text-7xl md:text-8xl font-headline font-black tracking-tighter ${
            isRunning && !isPaused ? 'text-primary animate-pulse' : 'text-muted-foreground/30'
          }`}>:</span>
          <span className={`text-5xl sm:text-7xl md:text-8xl font-headline font-black tracking-tighter transition-colors ${
            isRunning && !isPaused ? 'text-foreground' : elapsed > 0 ? 'text-foreground/70' : 'text-muted-foreground/40'
          }`}>
            {pad(seconds)}
          </span>
          <span className="font-label text-xl text-muted-foreground ml-4 font-normal tracking-wider">HRS</span>
        </div>

        {isPaused && (
          <p className="text-sm text-muted-foreground animate-pulse mt-2 font-label uppercase tracking-widest">Paused</p>
        )}

        {/* Controls */}
        <div className="flex gap-4 w-full max-w-md mt-8">
          {!isRunning && elapsed === 0 && (
            <button
              onClick={onStart}
              className="flex-1 h-14 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-label font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-3 shadow-lg shadow-primary/10 hover:opacity-90 transition-all active:scale-95"
            >
              <MIcon name="play_arrow" className="text-xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} />
              Start Session
            </button>
          )}
          {(isRunning || elapsed > 0) && (
            <>
              {isRunning && !isPaused && (
                <button
                  onClick={handlePause}
                  className="w-14 h-14 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <MIcon name="pause" className="text-xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} />
                </button>
              )}
              {isRunning && isPaused && (
                <button
                  onClick={handleResume}
                  className="w-14 h-14 flex items-center justify-center rounded-lg border border-border text-primary hover:bg-primary/10 transition-colors"
                >
                  <MIcon name="play_arrow" className="text-xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} />
                </button>
              )}
              <button
                onClick={handleStop}
                className="flex-1 h-14 bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground font-label font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-3 shadow-lg shadow-destructive/10 hover:opacity-90 transition-all active:scale-95"
              >
                <MIcon name="stop" className="text-xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} />
                Log Session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
