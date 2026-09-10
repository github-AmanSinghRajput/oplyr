import { useEffect, useState } from 'react';

/**
 * How long the current turn has been running.
 *
 * A long agent turn used to look identical to a hung one: no elapsed time, no progress, nothing to
 * distinguish "reviewing a monorepo" from "stuck". One reported turn ran for ten full minutes
 * before its timeout fired, and from the outside there was no way to tell. Seeing the seconds move
 * is most of the difference between patience and a force-quit.
 */
export function VoiceElapsed({ running }: { running: boolean }) {
  // Only the interval writes state: no setState in the effect body, and no clock read during
  // render. There is deliberately no reset logic either — the parent gives this a `key` that
  // changes when a turn starts, so each run mounts fresh at zero.
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  if (!running || seconds < 3) return null;

  const label =
    seconds < 60
      ? `${seconds}s`
      : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;

  return (
    <span className="font-mono text-xs tabular-nums text-text-tertiary" aria-live="off">
      {label}
      {/* The agent's own ceiling. Saying so beats an unexplained stop at ten minutes. */}
      {seconds >= 8 * 60 ? (
        <span className="ml-1.5 text-warning">nearing the 10m limit</span>
      ) : null}
    </span>
  );
}
