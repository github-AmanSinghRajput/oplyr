import { useEffect, useRef, type RefObject } from 'react';

const BAR_COUNT = 64;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 48;
const NOISE_FLOOR = 0.035;

interface VoiceListeningStripProps {
  active: boolean;
  analyserRef: RefObject<AnalyserNode | null>;
}

export function VoiceListeningStrip({ active, analyserRef }: VoiceListeningStripProps) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const smoothRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));

  useEffect(() => {
    let rafId: number | null = null;

    const draw = () => {
      const analyser = analyserRef.current;
      const live = active && analyser !== null;
      const smooth = smoothRef.current;

      if (live) {
        if (dataRef.current.length !== analyser.frequencyBinCount) {
          dataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }

        analyser.getByteFrequencyData(dataRef.current);
      }

      const data = dataRef.current;
      const maxBin = Math.max(8, Math.min(data.length - 1, 320));

      for (let index = 0; index < BAR_COUNT; index += 1) {
        let target = 0;

        if (live) {
          const t = index / Math.max(1, BAR_COUNT - 1);
          const bin = Math.max(2, Math.floor(2 + Math.pow(t, 1.7) * (maxBin - 2)));
          const start = Math.max(1, bin - 2);
          const end = Math.min(data.length - 1, bin + 2);
          let total = 0;

          for (let sample = start; sample <= end; sample += 1) {
            total += data[sample] / 255;
          }

          const average = total / Math.max(1, end - start + 1);
          target = Math.max(0, (average - NOISE_FLOOR) / (1 - NOISE_FLOOR));
          target = Math.min(1, Math.pow(target * 1.85, 0.72));
        }

        smooth[index] += (target - smooth[index]) * (live ? 0.38 : 0.18);

        const bar = barsRef.current[index];
        if (!bar) continue;

        const height = MIN_HEIGHT + smooth[index] * (MAX_HEIGHT - MIN_HEIGHT);
        const opacity = 0.26 + smooth[index] * 0.74;
        const scaleX = 0.78 + smooth[index] * 0.3;
        bar.style.height = `${height}px`;
        bar.style.opacity = String(opacity);
        bar.style.transform = `scaleX(${scaleX})`;
      }

      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [active, analyserRef]);

  return (
    <div
      className={`voice-listening-strip${active ? ' is-active' : ''}`}
      aria-label="Live microphone frequency animation"
    >
      <div className="voice-listening-strip__meta">
        <span>{active ? 'Live mic signal' : 'Signal idle'}</span>
        <span>Realtime frequency strip</span>
      </div>
      <div className="voice-listening-strip__rail" aria-hidden="true">
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <span
            key={index}
            ref={(element) => {
              barsRef.current[index] = element;
            }}
          />
        ))}
      </div>
    </div>
  );
}
