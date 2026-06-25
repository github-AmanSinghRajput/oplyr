import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type WaveformMode = 'idle' | 'recording' | 'speaking';

interface VoiceWaveformProps {
  mode: WaveformMode;
  analyserRef: RefObject<AnalyserNode | null>;
  height?: number;
}

const POINTS = 80;

/**
 * Smooth, glowing audio waveform. While `recording`, it renders the live mic signal
 * (oscilloscope-style bipolar wave); while `speaking` it shows a gentle pulse; idle is a calm
 * breathing line. Amplitudes are lerp-smoothed every frame for a fluid 60fps feel.
 */
export function VoiceWaveform({ mode, analyserRef, height = 96 }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef(mode);
  const smoothRef = useRef<Float32Array>(new Float32Array(POINTS));
  const timeDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(2048));
  const phaseRef = useRef(0);
  const accentRef = useRef('#00d4f5');
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    modeRef.current = mode;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tracePath = (points: { x: number; y: number }[]) => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, w, h);

      // Cache the accent color; refresh occasionally so theme changes are picked up.
      frameRef.current += 1;
      if (frameRef.current === 1 || frameRef.current % 30 === 0) {
        const c = getComputedStyle(canvas).getPropertyValue('--accent').trim();
        if (c) accentRef.current = c;
      }
      const accent = accentRef.current;
      const mid = h / 2;
      phaseRef.current += 0.05;

      const smooth = smoothRef.current;
      const analyser = analyserRef.current;
      const currentMode = modeRef.current;
      const recordingMode = currentMode === 'recording';
      const recording = recordingMode && analyser !== null;
      if (recording) {
        analyser.getByteTimeDomainData(timeDataRef.current);
      }
      const data = timeDataRef.current;

      for (let i = 0; i < POINTS; i += 1) {
        let target: number;
        if (recording) {
          const idx = Math.floor((i / POINTS) * data.length);
          const raw = (data[idx] - 128) / 128;
          target = Math.abs(raw) < 0.015 ? 0 : Math.max(-1, Math.min(1, raw * 3.2));
        } else if (recordingMode) {
          target = 0;
        } else if (currentMode === 'speaking') {
          target = 0.4 * Math.sin(phaseRef.current * 1.4 + i * 0.3);
        } else {
          target = 0.1 * Math.sin(phaseRef.current * 0.8 + i * 0.22);
        }
        // Taper toward the edges for a clean, contained shape.
        target *= Math.sin((i / (POINTS - 1)) * Math.PI);
        // Lerp toward the target for fluid motion.
        smooth[i] += (target - smooth[i]) * 0.25;
      }

      const stepX = w / (POINTS - 1);
      const amp = h * 0.42;
      const points = Array.from({ length: POINTS }, (_, i) => ({
        x: i * stepX,
        y: mid - smooth[i] * amp
      }));

      // Soft filled body between the wave and the centerline.
      ctx.save();
      tracePath(points);
      ctx.lineTo(w, mid);
      ctx.lineTo(0, mid);
      ctx.closePath();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();

      // Glowing stroke (drawn twice for a richer bloom).
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = accent;
      ctx.strokeStyle = accent;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2.5;
      tracePath(points);
      ctx.stroke();
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.5;
      tracePath(points);
      ctx.stroke();
      ctx.restore();

      rafRef.current = window.requestAnimationFrame(draw);
    };

    rafRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [analyserRef]);

  return <canvas ref={canvasRef} className="w-full" style={{ height }} aria-hidden="true" />;
}
