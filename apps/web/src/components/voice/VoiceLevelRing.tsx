import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * A live input-level ring around the mic button.
 *
 * Two jobs. It answers the one question a person actually has while talking to a computer — "is it
 * hearing me?" — without them having to interpret a graph. And it gives the control its own visual
 * weight: the button was a bare circle next to a checkbox in a wide column, which read as unfinished.
 *
 * Reads the analyser directly and paints on its own canvas, so a 60fps level never re-renders React.
 */
export function VoiceLevelRing({
  analyserRef,
  active,
  size = 72
}: {
  analyserRef: RefObject<AnalyserNode | null>;
  /** Only listen while the mic is actually open; otherwise rest at the idle ring. */
  active: boolean;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  const levelRef = useRef(0);
  const freqRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  const paletteRef = useRef({ accent: '#c882b4', track: 'rgba(233,221,237,0.12)' });
  const frameRef = useRef(0);

  // Mirrored in a layout effect rather than assigned during render: the draw loop reads it every
  // frame and must not depend on render-phase mutation.
  useLayoutEffect(() => {
    activeRef.current = active;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      rafRef.current = window.requestAnimationFrame(draw);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(size * dpr)) {
        canvas.width = Math.floor(size * dpr);
        canvas.height = Math.floor(size * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, size, size);

      frameRef.current += 1;
      if (frameRef.current === 1 || frameRef.current % 60 === 0) {
        const style = getComputedStyle(canvas);
        paletteRef.current = {
          accent: style.getPropertyValue('--color-accent').trim() || paletteRef.current.accent,
          track: style.getPropertyValue('--color-border').trim() || paletteRef.current.track
        };
      }
      const { accent, track } = paletteRef.current;

      const analyser = analyserRef.current;
      let target = 0;
      if (activeRef.current && analyser) {
        analyser.getByteFrequencyData(freqRef.current);
        const freq = freqRef.current;
        const usable = Math.floor(freq.length * 0.35);
        let sum = 0;
        for (let i = 0; i < usable; i += 1) sum += freq[i]!;
        target = Math.min(1, sum / usable / 100);
      }
      // Snap up, ease down: the same asymmetry that makes a level feel attached to a voice.
      levelRef.current += (target - levelRef.current) * (target > levelRef.current ? 0.4 : 0.09);
      const level = levelRef.current;

      const mid = size / 2;
      const radius = mid - 4;

      ctx.lineCap = 'round';
      ctx.strokeStyle = track;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mid, mid, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (level > 0.02) {
        // Grows clockwise from the top, so it reads as filling rather than spinning.
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(mid, mid, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * level);
        ctx.stroke();
      }
    };

    rafRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [analyserRef, size]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
