import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { PET_ART } from './pet-art';
import { PET_CSS } from './pet-styles';
import { PET_TRAITS, usePetMotion } from './pet-behaviour';
import type { DeskPet } from '@/containers/voice-console/lib/types';

/**
 * A companion that lives along the bottom edge of whatever it's placed in — that edge is its floor.
 * Purely cosmetic and click-through: it can never intercept a click, it clips to its lane, and both
 * the motion and the act loop stop under `prefers-reduced-motion`.
 *
 * Used twice: waddling on the topbar's border, and standing on top of the chat composer.
 */
export function PetCompanion({
  pet,
  /** Keep the pet clear of anything anchored to the right of the lane. */
  reservedRight = 0,
  className
}: {
  pet: DeskPet;
  reservedRight?: number;
  className?: string;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const { act, x, facing, travelMs } = usePetMotion(pet, laneRef, reservedRight);
  const gait = (PET_TRAITS[pet] ?? PET_TRAITS.duck).gait;

  // The species tags the lane as well as the rig, so rules can reach the travel wrapper — the bird's
  // flight altitude is a static offset there rather than part of any animation.
  return (
    <div
      ref={laneRef}
      className={cn('pet-lane', `pet-species-${pet}`, className)}
      aria-hidden="true"
    >
      <PetStyles />
      <div
        className="pet-walk"
        style={{ transform: `translateX(${x}px)`, transitionDuration: `${travelMs}ms` }}
      >
        {/* Cues sit outside the facing wrapper so they're never rendered mirrored. */}
        {act === 'sleep' ? <span className="pet-cue pet-cue-zzz">z</span> : null}
        {act === 'call' ? (
          <span className="pet-cue pet-cue-sound">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path
                d="M2 2.4a4 4 0 010 4.2M5 1.2a6.2 6.2 0 010 6.6"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            </svg>
          </span>
        ) : null}
        <div className="pet-face" style={{ transform: `scaleX(${facing})` }}>
          <div
            className={cn(
              'pet-rig',
              `pet-${pet}`,
              act === 'walk' ? `pet-gait-${gait}` : `pet-act-${act}`
            )}
          >
            {PET_ART[pet] ?? PET_ART.duck}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * React 19 hoists a `<style>` carrying `href` + `precedence` into the document head and dedupes it
 * by href, so mounting several companions still yields exactly one stylesheet.
 */
function PetStyles() {
  return (
    <style href="oplyr-pet-companion" precedence="default">
      {PET_CSS}
    </style>
  );
}

/** Static glyph for the pickers — onboarding choice + Settings preview. */
export function PetPreview({ pet }: { pet: DeskPet }) {
  return (
    <span className={cn('inline-flex h-7 w-[38px]', `pet-${pet}`)}>
      {/* The pickers can render before any lane is mounted, so they carry the stylesheet too. */}
      <PetStyles />
      {PET_ART[pet] ?? PET_ART.duck}
    </span>
  );
}
