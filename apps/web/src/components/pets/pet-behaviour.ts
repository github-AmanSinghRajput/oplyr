import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DeskPet } from '@/containers/voice-console/lib/types';

/**
 * The companion's brain: what it decides to do, and where it is.
 *
 * Travel is a plain CSS transition on `transform` driven from here, not a long looping keyframe that
 * gets paused. The keyframe approach froze the pet mid-turn (scaleX interpolating through 0 left it
 * squashed to nothing) and re-rasterised on every pause/resume, which is what made the acts look
 * broken. One `setTimeout` per act is the entire JS cost; everything visible is a composited
 * transform.
 */

export type PetAct =
  | 'walk'
  | 'idle'
  | 'look'
  | 'sit'
  | 'sleep'
  | 'peck'
  | 'call'
  | 'flap'
  | 'preen'
  | 'tongue'
  | 'jump'
  | 'groom'
  | 'stretch'
  | 'wag'
  | 'dig'
  | 'snap'
  | 'wave'
  | 'burrow';

export type PetGait = 'waddle' | 'hop' | 'glide' | 'prowl' | 'trot' | 'scuttle';

interface PetTraits {
  gait: PetGait;
  /** Travel speed in px per second. */
  speed: number;
  /** Symmetric characters (front-facing frog, sideways crab) never turn around. */
  flips: boolean;
  /** Shortest journey worth starting, in px. A leaper or a flier needs room for a real arc. */
  minTravel: number;
  /** Weighted act table. `walk` travels; every other act happens in place. */
  acts: [PetAct, number][];
}

/** Each species behaves like itself — a duck forages and preens, a dog digs and wags, a crab snaps. */
export const PET_TRAITS: Record<DeskPet, PetTraits> = {
  duck: {
    gait: 'waddle',
    speed: 20,
    flips: true,
    minTravel: 40,
    acts: [
      ['walk', 38],
      ['peck', 14],
      ['call', 10],
      ['flap', 9],
      ['preen', 9],
      ['idle', 8],
      ['look', 6],
      ['sleep', 6]
    ]
  },
  // Airborne: it cruises rather than hops, so its in-place acts are aerial too — no ground pecking,
  // no hopping, no sleeping mid-flight.
  bird: {
    gait: 'glide',
    speed: 46,
    flips: true,
    minTravel: 90,
    acts: [
      ['walk', 42],
      ['flap', 16],
      ['call', 14],
      ['look', 12],
      ['preen', 10],
      ['idle', 6]
    ]
  },
  frog: {
    gait: 'hop',
    // One leap covers ~a body length per hop cycle; the long minimum keeps journeys to several
    // real leaps instead of one twitchy little hop.
    speed: 34,
    flips: false,
    minTravel: 100,
    acts: [
      ['walk', 34],
      ['call', 16],
      ['tongue', 14],
      ['jump', 12],
      ['idle', 10],
      ['look', 7],
      ['sleep', 7]
    ]
  },
  cat: {
    gait: 'prowl',
    speed: 28,
    flips: true,
    minTravel: 45,
    acts: [
      ['walk', 30],
      ['groom', 16],
      ['sit', 14],
      ['stretch', 12],
      ['look', 10],
      ['sleep', 10],
      ['call', 8]
    ]
  },
  dog: {
    gait: 'trot',
    speed: 34,
    flips: true,
    minTravel: 50,
    acts: [
      ['walk', 32],
      ['wag', 16],
      ['call', 12],
      ['dig', 12],
      ['sit', 10],
      ['stretch', 9],
      ['sleep', 9]
    ]
  },
  crab: {
    gait: 'scuttle',
    speed: 42,
    flips: false,
    minTravel: 35,
    acts: [
      ['walk', 34],
      ['snap', 18],
      ['wave', 15],
      ['burrow', 10],
      ['idle', 9],
      ['look', 7],
      ['sleep', 7]
    ]
  }
};

/** How long each in-place act runs, in ms. */
const ACT_MS: Record<Exclude<PetAct, 'walk'>, [number, number]> = {
  idle: [2000, 3800],
  look: [2000, 3200],
  sit: [3000, 6000],
  sleep: [6000, 11000],
  peck: [1800, 3200],
  call: [1600, 2600],
  flap: [1200, 2000],
  preen: [1800, 3000],
  tongue: [1600, 2600],
  jump: [1300, 2200],
  groom: [2200, 3600],
  stretch: [1800, 2600],
  wag: [1800, 3000],
  dig: [1800, 2800],
  snap: [1400, 2400],
  wave: [1500, 2500],
  burrow: [2400, 4000]
};

/** Must match the `.pet-face` transition in the stylesheet. */
export const TURN_MS = 240;
/** Rendered footprint of the character, in px. */
export const STAGE_WIDTH = 38;
export const STAGE_HEIGHT = 28;

export interface PetMotion {
  act: PetAct;
  x: number;
  facing: 1 | -1;
  /** Duration of the transform transition; 0 for in-place acts. */
  travelMs: number;
}

function pickAct(table: [PetAct, number][], avoid: PetAct): PetAct {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  const roll = () => {
    let remaining = Math.random() * total;
    for (const [act, weight] of table) {
      remaining -= weight;
      if (remaining <= 0) {
        return act;
      }
    }
    return table[0][0];
  };
  const first = roll();
  // One re-roll so the pet doesn't repeat itself twice in a row.
  return first === avoid ? roll() : first;
}

/**
 * Runs the act loop and reports where the pet is. `reservedRight` keeps it clear of whatever lives
 * at the right end of its lane (the topbar's controls, for instance).
 */
export function usePetMotion(
  pet: DeskPet,
  laneRef: RefObject<HTMLElement | null>,
  reservedRight = 0
): PetMotion {
  const [motion, setMotion] = useState<PetMotion>({
    act: 'walk',
    x: 4,
    facing: 1,
    travelMs: 0
  });
  const rangeRef = useRef(160);
  // Where the character actually IS on screen. This has to outlive the behaviour effect: swapping
  // pets re-runs that effect, and restarting from a hardcoded x while the element still sits at its
  // old offset made the new pet's first walk run backwards from wherever the previous one stopped.
  const posRef = useRef<{ x: number; facing: 1 | -1 }>({ x: 4, facing: 1 });

  // Track the usable width without restarting the behaviour loop.
  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) {
      return;
    }
    const measure = () => {
      rangeRef.current = Math.max(0, lane.clientWidth - reservedRight - STAGE_WIDTH);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    return () => observer.disconnect();
  }, [laneRef, reservedRight]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const traits = PET_TRAITS[pet] ?? PET_TRAITS.duck;
    let timer = 0;
    let last: PetAct = 'walk';

    // A symmetric character has no mirrored pose to inherit from whichever pet was here before.
    // Correcting the ref is enough — every setMotion below publishes the facing from it.
    if (!traits.flips) {
      posRef.current = { ...posRef.current, facing: 1 };
    }

    /** Somewhere far enough away that the journey reads as travel rather than a twitch. */
    const pickTarget = (from: number): number => {
      const range = rangeRef.current;
      if (range < 24) {
        return from;
      }
      const minTravel = Math.min(traits.minTravel, range * 0.5);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const target = Math.random() * range;
        if (Math.abs(target - from) >= minTravel) {
          return target;
        }
      }
      return from > range / 2 ? 0 : range;
    };

    const runAct = (act: PetAct) => {
      last = act;
      const [min, max] = ACT_MS[act as Exclude<PetAct, 'walk'>];
      setMotion((prev) => ({ ...prev, act, facing: posRef.current.facing, travelMs: 0 }));
      timer = window.setTimeout(next, min + Math.random() * (max - min));
    };

    const startWalk = () => {
      const from = posRef.current.x;
      const target = pickTarget(from);
      const distance = Math.abs(target - from);
      if (distance < 2) {
        // Nowhere to go (a very narrow lane) — do something in place instead.
        runAct('idle');
        return;
      }

      last = 'walk';
      const heading: 1 | -1 = target > from ? 1 : -1;
      const travelMs = Math.max(500, (distance / traits.speed) * 1000);
      const go = () => {
        posRef.current = { x: target, facing: posRef.current.facing };
        setMotion({ act: 'walk', x: target, facing: posRef.current.facing, travelMs });
        timer = window.setTimeout(next, travelMs + 120);
      };

      if (traits.flips && heading !== posRef.current.facing) {
        // Turn on the spot first, so it never walks backwards out of a turn.
        posRef.current = { x: from, facing: heading };
        setMotion((prev) => ({ ...prev, act: 'idle', facing: heading, travelMs: 0 }));
        timer = window.setTimeout(go, TURN_MS);
        return;
      }
      go();
    };

    const next = () => {
      const act = pickAct(traits.acts, last);
      if (act === 'walk') {
        startWalk();
      } else {
        runAct(act);
      }
    };

    startWalk();
    return () => window.clearTimeout(timer);
  }, [pet]);

  return motion;
}
