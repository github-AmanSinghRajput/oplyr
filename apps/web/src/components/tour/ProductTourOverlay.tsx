import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTour } from '@/providers/TourProvider';
import { Button } from '@/components/ui/button';

const CARD_WIDTH = 320;

// Renders the active coach-mark: a dimming spotlight around the target element (via a big box-shadow
// "hole") plus a tooltip card. Falls back to a centered card when a step has no target or the target
// isn't on screen. Mounted only after onboarding, so tours never fire during first-run setup.
export function ProductTourOverlay() {
  const { active, next, skip } = useTour();
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Auto-start is intentionally DISABLED. It previously fired per-screen on every navigation
  // (felt random) and re-appeared after app updates for users who'd already taken it. The tour is
  // also being rewritten for v1.0 (single cross-page walkthrough), so until then the tour only runs
  // on demand — via Settings → "Replay tour" (resetTours). Re-enable auto-start with the rewrite.

  // Resolve + track the spotlight target for the current step.
  useEffect(() => {
    const targetSel = active?.step.target;
    if (!targetSel) {
      setRect(null);
      return;
    }

    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${targetSel}"]`);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else if (tries++ < 20) {
        // Element may mount a few frames late (screen transition) — poll briefly.
        raf = requestAnimationFrame(measure);
      } else {
        setRect(null);
      }
    };
    measure();

    const onReflow = () => {
      const el = document.querySelector(`[data-tour="${targetSel}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [active]);

  // Escape skips the tour.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skip]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!rect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: CARD_WIDTH };
    }
    const placeBelow = window.innerHeight - rect.bottom > 210;
    const top = placeBelow ? rect.bottom + 14 : Math.max(16, rect.top - 200);
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - CARD_WIDTH - 16);
    return { top, left, width: CARD_WIDTH };
  }, [rect]);

  if (!active) return null;

  const isLast = active.index === active.total - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 2px #68dbff, 0 0 0 9999px rgba(2, 4, 10, 0.66)',
            transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease'
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(2, 4, 10, 0.66)' }} />
      )}

      <div
        className="absolute rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4 shadow-2xl"
        style={cardStyle}
      >
        <div className="mb-1 flex items-center justify-between gap-4">
          <span className="text-xs font-medium text-text-tertiary">
            {active.index + 1} / {active.total}
          </span>
          <button
            type="button"
            onClick={skip}
            className="text-xs text-text-tertiary transition-colors hover:text-text-secondary"
          >
            Skip tour
          </button>
        </div>
        <h3 className="text-sm font-semibold text-text-primary">{active.step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{active.step.body}</p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" className="h-7 text-xs" onClick={next}>
            {isLast ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
