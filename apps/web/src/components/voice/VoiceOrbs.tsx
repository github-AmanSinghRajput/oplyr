import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type OrbMode = 'idle' | 'recording' | 'speaking';

interface VoiceOrbsProps {
  mode: OrbMode;
  analyserRef: RefObject<AnalyserNode | null>;
}

/** Trail points held per orb at full voice. A long ribbon: at cruising speed this is most of the
 *  width of the canvas, which is what lets the thread fold back over itself and read as woven. */
const MAX_TRAIL = 240;
/** Energy rises quickly and falls slowly, so the field leaps awake and drifts home. */
const ENERGY_ATTACK = 0.14;
const ENERGY_RELEASE = 0.018;
/** Fraction of the short edge an orb may travel per frame at full voice.
 *  Fast enough to cross the canvas in a couple of seconds, slow enough that consecutive trail
 *  samples stay close and the thread curves instead of breaking into straight chords. */
const MAX_SPEED = 0.0055;
/** Floor on the speed ceiling, so a spent orb can still travel home at a graceful pace.
 *  Without this the cap collapsed to almost nothing at zero voice and the return crawled: measured
 *  at 0.08px per frame, which is over a minute to cross the canvas. */
const RETURN_SPEED = 0.003;
/** Velocity retained each frame. High, so movement carries rather than jerks. */
const DAMPING = 0.955;

interface Orb {
  /** Where it sits at rest, as a multiple of the spacing: -1, 0, +1 on one horizontal line. */
  slot: number;
  /** Distinct offsets into the wander field, so no two ever follow the same path. */
  seed: number;
  colorVar: string;
  fallback: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  trail: Array<{ x: number; y: number; z: number }>;
}

function createOrbs(): Orb[] {
  return [
    { slot: -1, seed: 0, colorVar: '--color-accent', fallback: '#c882b4' },
    { slot: 0, seed: 37.4, colorVar: '--color-success', fallback: '#7ad6a4' },
    { slot: 1, seed: 71.9, colorVar: '--color-warning', fallback: '#e8bf7c' }
  ].map((base) => ({ ...base, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, trail: [] }));
}

/**
 * Smooth, non-repeating wander direction.
 *
 * Three sines at incommensurate frequencies never line up, so the heading drifts organically and
 * never loops — the difference between a creature exploring and an object on a track. Cheap enough
 * to run per orb per frame, with no noise library.
 */
function wanderAngle(time: number, seed: number): number {
  return (
    Math.sin(time * 0.31 + seed) * 2.1 +
    Math.sin(time * 0.17 + seed * 1.7) * 1.6 +
    Math.sin(time * 0.53 + seed * 0.6) * 0.9
  );
}

/**
 * The voice field: three orbs at rest on one line, that swim when you speak.
 *
 * Two earlier attempts were wrong in instructive ways. A row of bars was a CLI level meter — flat,
 * and it read as instrumentation. Orbiting bodies were worse: an orbit is a track, so however
 * pretty the trails were, the motion was visibly on rails and never surprised you.
 *
 * This is free motion. At rest the three sit still, evenly spaced across the middle. Your voice
 * gives them a wander force whose heading comes from three out-of-phase sines, so each one explores
 * the box on its own non-repeating path, crossing the others as it goes. Speed is capped low
 * deliberately: slow motion is what lets a trail stay a continuous thread instead of a chain of
 * straight chords, which is what fast movement between frames actually looks like. When you stop, a
 * spring that strengthens as the voice fades draws them back to their line and the damping settles
 * them still.
 *
 * Depth is a wandering z per orb driving scale, alpha and thread width, with painter ordering each
 * frame — so threads pass behind orbs rather than over them.
 */
export function VoiceOrbs({ mode, analyserRef }: VoiceOrbsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef(mode);
  const freqRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  const energyRef = useRef(0);
  const timeRef = useRef(0);
  const frameRef = useRef(0);
  const seededRef = useRef(false);
  const orbsRef = useRef<Orb[]>(createOrbs());
  const paletteRef = useRef<string[]>(['#c882b4', '#7ad6a4', '#e8bf7c']);

  useLayoutEffect(() => {
    modeRef.current = mode;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const orbs = orbsRef.current;

    const draw = () => {
      rafRef.current = window.requestAnimationFrame(draw);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const short = Math.min(w, h);
      const spacing = Math.min(w * 0.17, short * 0.26);

      // Rest is a real position, not a slow drift: on first paint they are placed and still.
      if (!seededRef.current) {
        for (const orb of orbs) {
          orb.x = cx + orb.slot * spacing;
          orb.y = cy;
        }
        seededRef.current = true;
      }

      // Theme tokens, re-read so a light/dark switch is picked up.
      frameRef.current += 1;
      if (frameRef.current === 1 || frameRef.current % 60 === 0) {
        const style = getComputedStyle(canvas);
        paletteRef.current = orbs.map(
          (orb) => style.getPropertyValue(orb.colorVar).trim() || orb.fallback
        );
      }
      const palette = paletteRef.current;

      // ── One number for "how loudly are you speaking". ──
      const analyser = analyserRef.current;
      const currentMode = modeRef.current;
      let target = 0;
      if (currentMode === 'recording' && analyser) {
        analyser.getByteFrequencyData(freqRef.current);
        const freq = freqRef.current;
        // Speech energy sits low in the spectrum; the top of the range is mostly silence.
        const usable = Math.floor(freq.length * 0.35);
        let sum = 0;
        for (let i = 0; i < usable; i += 1) sum += freq[i]!;
        target = Math.min(1, sum / usable / 105);
      } else if (currentMode === 'speaking') {
        target = 0.5;
      }
      const rate = target > energyRef.current ? ENERGY_ATTACK : ENERGY_RELEASE;
      energyRef.current += (target - energyRef.current) * rate;
      const energy = reduceMotion ? 0 : energyRef.current;

      timeRef.current += 0.016;
      const t = timeRef.current;

      // Effectively released while you speak. At 0.0016 this was still a leash: it cancelled the
      // wander a short way out and kept all three circling their own rest points.
      const homing = 0.00012 + 0.026 * (1 - energy) ** 2;
      const margin = short * 0.1;

      const drawn = orbs.map((orb, index) => {
        const restX = cx + orb.slot * spacing;

        // ── Wander: a slowly turning heading, only while there is voice to drive it. ──
        if (energy > 0.001) {
          const angle = wanderAngle(t, orb.seed);
          const push = short * 0.0007 * energy;
          orb.vx += Math.cos(angle) * push;
          orb.vy += Math.sin(angle) * push;
          // Depth wanders on its own slower rhythm, so the thread crosses in front of and behind
          // the others as it travels rather than lying flat.
          orb.vz += Math.sin(t * 0.29 + orb.seed * 1.3) * 0.011 * energy;
        }

        // ── Home: toward the resting line. ──
        orb.vx += (restX - orb.x) * homing;
        orb.vy += (cy - orb.y) * homing;
        orb.vz += (0 - orb.z) * homing;

        // ── Walls: a soft cushion rather than a bounce, so nothing snaps. ──
        // Firm enough to actually hold. At a tenth of this the orbs sailed clean out of the box.
        if (orb.x < margin) orb.vx += (margin - orb.x) * 0.022;
        if (orb.x > w - margin) orb.vx -= (orb.x - (w - margin)) * 0.022;
        if (orb.y < margin) orb.vy += (margin - orb.y) * 0.022;
        if (orb.y > h - margin) orb.vy -= (orb.y - (h - margin)) * 0.022;

        orb.vx *= DAMPING;
        orb.vy *= DAMPING;
        orb.vz *= DAMPING;

        // Cap the step so a loud syllable cannot fling an orb across the box in one frame — which
        // is precisely what turned the threads into straight lines.
        const speed = Math.hypot(orb.vx, orb.vy);
        const ceiling = Math.max(short * MAX_SPEED * energy, short * RETURN_SPEED);
        if (speed > ceiling) {
          orb.vx = (orb.vx / speed) * ceiling;
          orb.vy = (orb.vy / speed) * ceiling;
        }

        orb.x += orb.vx;
        orb.y += orb.vy;
        // Backstop: whatever the forces conspire to do, an orb never leaves the canvas.
        orb.x = Math.max(0, Math.min(w, orb.x));
        orb.y = Math.max(0, Math.min(h, orb.y));
        orb.z = Math.max(-1, Math.min(1, orb.z + orb.vz));

        orb.trail.push({ x: orb.x, y: orb.y, z: orb.z });
        // The thread grows as you speak and retracts as you stop, so silence is three quiet points.
        const wanted = Math.round(2 + MAX_TRAIL * energy);
        while (orb.trail.length > wanted) orb.trail.shift();

        return { orb, color: palette[index] ?? orb.fallback };
      });

      // Painter's algorithm: furthest first, so a thread genuinely passes behind an orb.
      drawn.sort((a, b) => a.orb.z - b.orb.z);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const { orb, color } of drawn) {
        const depth = 0.5 + 0.5 * ((orb.z + 1) / 2);
        const points = orb.trail;

        // ── The thread ──
        // Each span is a quadratic through the midpoints of its neighbours, so the path curves
        // through every sample instead of cutting a straight chord between them. Stroked span by
        // span, because width and alpha have to taper along the length and a single path cannot.
        if (points.length > 2) {
          for (let i = 1; i < points.length - 1; i += 1) {
            const previous = points[i - 1]!;
            const current = points[i]!;
            const next = points[i + 1]!;
            const from = { x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 };
            const to = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };

            // Newest end is brightest and thickest; the tail dissolves.
            const along = i / (points.length - 1);
            const spanDepth = 0.5 + 0.5 * ((current.z + 1) / 2);
            ctx.globalAlpha = along ** 1.6 * 0.55 * spanDepth;
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(0.35, along ** 1.4 * 2.1 * spanDepth);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.quadraticCurveTo(current.x, current.y, to.x, to.y);
            ctx.stroke();
          }
        }

        // ── The orb ── same size for all three, breathing only with depth and voice.
        const size = short * 0.014 * (0.85 + 0.3 * depth) * (1 + 0.18 * energy);
        const halo = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, size * 5);
        halo.addColorStop(0, color);
        halo.addColorStop(1, 'transparent');
        ctx.globalAlpha = 0.22 * depth;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, size * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.55 + 0.45 * depth;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

    rafRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [analyserRef]);

  return <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />;
}
