import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square, Pause } from 'lucide-react';

interface TimerProps {
  onStop: (durationMinutes: number, startTime: Date, endTime: Date) => void;
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
}

export function Timer({ onStop, isRunning, onStart, onPause }: TimerProps) {
  const [elapsed, setElapsed] = useState(0); // seconds
  const startRef = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedElapsed = useRef(0);

  useEffect(() => {
    if (isRunning) {
      startRef.current = new Date();
      intervalRef.current = setInterval(() => {
        setElapsed(pausedElapsed.current + Math.floor((Date.now() - startRef.current!.getTime()) / 1000));
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      pausedElapsed.current = elapsed;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  const handleStop = () => {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - elapsed * 1000);
    onStop(elapsed / 60, startTime, endTime);
    setElapsed(0);
    pausedElapsed.current = 0;
    startRef.current = null;
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
