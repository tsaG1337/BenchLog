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

  // Track the previous serverStartTime so we can distinguish "null on initial
  // mount, server poll hasn't reported yet" from "null because the server has
  // confirmed the timer stopped". On every remount serverStartTime begins as
  // null (and the polling effect needs up to 2 s to overwrite it), so the
  // old unconditional cleanup was racing the localStorage restore effect —
  // wiping isPaused and the persisted pause keys before the user's actual
  // pause state could be applied. Hence: "I paused, navigated away, came
  // back, the timer is running again."
  const prevServerStartTimeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!serverStartTime) {
      setElapsed(0);
      // Only treat this as "the timer actually stopped" if it was previously
      // running in this component instance. Initial mount keeps the restored
      // pause state intact.
      if (prevServerStartTimeRef.current) {
        setIsPaused(false);
        totalPausedSecsRef.current = 0;
        pausedAtRef.current = null;
        localStorage.removeItem('timer_paused');
        localStorage.removeItem('timer_paused_secs');
        localStorage.removeItem('timer_paused_at');
      }
      prevServerStartTimeRef.current = null;
      return;
    }
    prevServerStartTimeRef.current = serverStartTime;
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

  // Cobalt timer card layout: label + giant digits on the left, action stack
  // on the right. Replaces the centered tower layout — same behavior, same
  // start/pause/resume/stop semantics, just compact and horizontally biased
  // so the card hugs its contents and doesn't fight neighboring cards for
  // vertical space.
  const live = isRunning && !isPaused;
  const Digit = ({ children }: { children: React.ReactNode }) => (
    <span className={`font-headline font-bold tracking-tight tabular-nums transition-colors ${
      live ? 'text-foreground' : elapsed > 0 ? 'text-foreground/70' : 'text-muted-foreground/40'
    }`}>{children}</span>
  );
  const Sep = () => (
    <span className={`font-headline font-bold tracking-tight ${live ? 'text-primary' : 'text-muted-foreground/30'}`}>:</span>
  );

  return (
    <div className="relative">
      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        {/* ── Left: label + digits ──────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${live ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`}
              style={live ? { boxShadow: '0 0 8px hsl(var(--primary))' } : undefined}
            />
            <span className="font-label text-[10px] font-bold uppercase text-muted-foreground tracking-[0.18em]">
              Active session timer{isPaused ? ' · paused' : ''}
            </span>
          </div>
          <div className="flex items-baseline gap-1 leading-none text-5xl sm:text-6xl md:text-7xl">
            <Digit>{pad(hours)}</Digit>
            <Sep />
            <Digit>{pad(minutes)}</Digit>
            <Sep />
            <span className={`font-headline font-bold tracking-tight tabular-nums ${live ? 'text-primary' : 'text-muted-foreground/40'}`}>
              {pad(seconds)}
            </span>
          </div>
        </div>

        {/* ── Right: action stack ───────────────────────────────── */}
        <div className="flex md:flex-col gap-2 md:w-[200px] md:shrink-0">
          {!isRunning && elapsed === 0 && (
            <button
              onClick={onStart}
              className="flex-1 md:w-full h-11 bg-primary text-primary-foreground font-label font-bold uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[.98]"
            >
              <MIcon name="play_arrow" className="text-lg" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} />
              Start session
            </button>
          )}
          {(isRunning || elapsed > 0) && (
            <>
              {isRunning && !isPaused && (
                <button
                  onClick={handlePause}
                  className="flex-1 md:w-full h-11 bg-secondary text-foreground font-label font-bold uppercase tracking-wider rounded-md border border-border flex items-center justify-center gap-2 hover:bg-accent transition-colors"
                >
                  <MIcon name="pause" className="text-base" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} />
                  Pause
                </button>
              )}
              {isRunning && isPaused && (
                <button
                  onClick={handleResume}
                  className="flex-1 md:w-full h-11 bg-secondary text-primary font-label font-bold uppercase tracking-wider rounded-md border border-primary/40 flex items-center justify-center gap-2 hover:bg-primary/10 transition-colors"
                >
                  <MIcon name="play_arrow" className="text-base" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} />
                  Resume
                </button>
              )}
              <button
                onClick={handleStop}
                className="flex-1 md:w-full h-11 bg-primary text-primary-foreground font-label font-bold uppercase tracking-wider rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[.98]"
              >
                <MIcon name="stop" className="text-base" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} />
                Stop &amp; log
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
