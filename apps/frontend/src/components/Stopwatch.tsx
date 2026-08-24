import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

interface StopwatchProps {
  /** Called with elapsed whole minutes whenever the stopwatch ticks past a full minute or is stopped. */
  onMinutesChange?: (minutes: number) => void;
  compact?: boolean;
}

/**
 * Live stopwatch widget — counts up from 00:00:00.
 * Displays HH:MM:SS and reports elapsed whole minutes via onMinutesChange.
 */
export default function Stopwatch({ onMinutesChange, compact = false }: StopwatchProps) {
  const [elapsed, setElapsed] = useState(0); // seconds
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const tick = useCallback(() => {
    const secs = Math.floor((Date.now() - startRef.current) / 1000);
    setElapsed(secs);
    const mins = Math.floor(secs / 60);
    if (mins > 0) onMinutesChange?.(mins);
  }, [onMinutesChange]);

  const handleStart = () => {
    startRef.current = Date.now() - elapsed * 1000;
    intervalRef.current = setInterval(tick, 1000);
    setRunning(true);
  };

  const handlePause = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  };

  const handleReset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setElapsed(0);
    onMinutesChange?.(0);
  };

  const handleToggle = () => {
    if (running) handlePause();
    else handleStart();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Format HH:MM:SS
  const hours = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const display = [hours, mins, secs].map((n) => String(n).padStart(2, "0")).join(":");

  return (
    <div className={`inline-flex items-center gap-2 border border-slate-200 rounded-lg ${compact ? "px-2 py-1" : "px-3 py-2"} bg-slate-50`}>
      {/* Timer display */}
      <span className={`font-mono font-semibold text-slate-800 tabular-nums ${compact ? "text-xs" : "text-sm"}`}>
        {display}
      </span>

      {/* Start / Pause */}
      <button
        type="button"
        onClick={handleToggle}
        className={`flex items-center justify-center rounded-md transition ${
          running
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
        } ${compact ? "w-6 h-6" : "w-7 h-7"}`}
        title={running ? "Pause" : "Start"}
      >
        {running ? (
          <Pause className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        ) : (
          <Play className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        )}
      </button>

      {/* Reset */}
      <button
        type="button"
        onClick={handleReset}
        className={`flex items-center justify-center rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 transition ${compact ? "w-6 h-6" : "w-7 h-7"}`}
        title="Reset"
      >
        <RotateCcw className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </button>
    </div>
  );
}
