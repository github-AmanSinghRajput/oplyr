import type { ReactNode } from 'react';
import type { DeskPet } from '@/containers/voice-console/lib/types';

/**
 * TopbarPet — a tiny 2D companion that waddles along the bottom edge of the top bar (the border is
 * its floor). Purely cosmetic; devs pick their pet (or switch it off) in Settings/onboarding.
 *
 * Performance contract (why it's safe to leave running): every animation is a CSS `transform`
 * keyframe, so it lives on the GPU compositor thread — no JS, no timers, no layout/paint of the bar.
 * It's `pointer-events: none` so it can never intercept a click, clips to a lane that stays clear of
 * the right-hand controls, and fully stops under `prefers-reduced-motion`.
 */
export function TopbarPet({ pet = 'duck' }: { pet?: DeskPet }) {
  const walker = PETS[pet] ?? PETS.duck;
  // Ground-walkers step with legs + bob; the bird floats + flaps instead.
  const gaitClass = pet === 'bird' ? 'pet-fly' : pet === 'frog' ? 'pet-hop' : 'pet-bob';
  return (
    <div className="pet-lane" aria-hidden="true">
      <style>{PET_CSS}</style>
      <div className="pet-walk">
        <div className={gaitClass}>{walker}</div>
      </div>
    </div>
  );
}

// ── Minimal 2D pets (viewBox 0 0 30 24, standing on the baseline). Leg groups use pet-leg-1/2 so the
//    shared step animation drives them; the bird uses pet-wing for a flap. ─────────────────────────
const PETS: Record<DeskPet, ReactNode> = {
  duck: (
    <svg className="pet-svg" width="30" height="24" viewBox="0 0 30 24" fill="none">
      <polygon points="1,10 6,8.5 6,13.5" fill="#EDA919" />
      <g className="pet-leg pet-leg-1">
        <rect x="9" y="18.2" width="1.7" height="4.2" rx="0.7" fill="#F97316" />
        <rect x="7.8" y="22" width="3.6" height="1.5" rx="0.7" fill="#F97316" />
      </g>
      <g className="pet-leg pet-leg-2">
        <rect x="14.2" y="18.2" width="1.7" height="4.2" rx="0.7" fill="#EA6C0A" />
        <rect x="13" y="22" width="3.6" height="1.5" rx="0.7" fill="#EA6C0A" />
      </g>
      <ellipse cx="12" cy="14" rx="9" ry="6.2" fill="#FFCE3A" />
      <ellipse cx="11" cy="14.5" rx="4.6" ry="3" fill="#EDA919" />
      <circle cx="19" cy="8" r="5" fill="#FFCE3A" />
      <polygon points="23,6.6 28,8 23,9.8" fill="#F97316" />
      <circle cx="20" cy="6.6" r="1.05" fill="#1F2933" />
      <circle cx="20.4" cy="6.2" r="0.34" fill="#FFFFFF" />
    </svg>
  ),
  bird: (
    <svg className="pet-svg" width="30" height="24" viewBox="0 0 30 24" fill="none">
      {/* tail */}
      <polygon points="2,11 8,9.5 8,14" fill="#2A9D8F" />
      {/* body */}
      <ellipse cx="13" cy="13" rx="6.4" ry="4.4" fill="#34B4A0" />
      {/* head */}
      <circle cx="19.5" cy="10" r="3.6" fill="#34B4A0" />
      {/* beak */}
      <polygon points="22.5,9 27,10 22.5,11.2" fill="#F4A340" />
      {/* eye */}
      <circle cx="20.4" cy="9.2" r="0.9" fill="#1F2933" />
      <circle cx="20.7" cy="8.9" r="0.3" fill="#FFFFFF" />
      {/* flapping wing */}
      <g className="pet-wing">
        <ellipse cx="12.5" cy="11.5" rx="4.4" ry="2.6" fill="#2A9D8F" />
      </g>
    </svg>
  ),
  frog: (
    <svg className="pet-svg" width="30" height="24" viewBox="0 0 30 24" fill="none">
      {/* back legs (folded, springy) */}
      <g className="pet-leg pet-leg-1">
        <path d="M7 17 q-3 1 -3 4 l3 -1 z" fill="#4CA64C" />
      </g>
      <g className="pet-leg pet-leg-2">
        <path d="M20 17 q3 1 3 4 l-3 -1 z" fill="#4CA64C" />
      </g>
      {/* body */}
      <ellipse cx="14" cy="16" rx="8.6" ry="4.8" fill="#5CB85C" />
      {/* eyes */}
      <circle cx="10" cy="10" r="2.7" fill="#5CB85C" />
      <circle cx="18" cy="10" r="2.7" fill="#5CB85C" />
      <circle cx="10" cy="9.6" r="1.4" fill="#FFFFFF" />
      <circle cx="18" cy="9.6" r="1.4" fill="#FFFFFF" />
      <circle cx="10.2" cy="9.8" r="0.7" fill="#1F2933" />
      <circle cx="18.2" cy="9.8" r="0.7" fill="#1F2933" />
      {/* smile */}
      <path
        d="M9 17 q5 2.5 10 0"
        stroke="#3B8A3B"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  cat: (
    <svg className="pet-svg" width="30" height="24" viewBox="0 0 30 24" fill="none">
      {/* tail — curls up at the back */}
      <path
        d="M5 15 q-3.6 -1 -3 -5 q0.4 -2.6 2.5 -1.8"
        stroke="#8A9096"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* four legs, stepping in diagonal pairs (back-left + front-right, then the other diagonal) */}
      <g className="pet-leg pet-leg-1">
        <rect x="8" y="17.4" width="1.8" height="5.6" rx="0.8" fill="#8A9096" />
        <rect x="18.4" y="17.4" width="1.8" height="5.6" rx="0.8" fill="#8A9096" />
      </g>
      <g className="pet-leg pet-leg-2">
        <rect x="11.4" y="17.4" width="1.8" height="5.6" rx="0.8" fill="#7E848A" />
        <rect x="15" y="17.4" width="1.8" height="5.6" rx="0.8" fill="#7E848A" />
      </g>
      {/* body */}
      <ellipse cx="14" cy="14.4" rx="9" ry="4.8" fill="#9AA0A6" />
      {/* head */}
      <circle cx="22" cy="10.6" r="4" fill="#9AA0A6" />
      {/* ears + pink inners */}
      <polygon points="18.8,7.6 19.8,3.9 21.1,7" fill="#9AA0A6" />
      <polygon points="22.9,7 24.2,3.9 25.1,7.6" fill="#9AA0A6" />
      <polygon points="19.5,6.9 20,5.3 20.7,6.7" fill="#E58BA0" />
      <polygon points="23.4,6.8 24.1,5.3 24.6,7" fill="#E58BA0" />
      {/* face */}
      <circle cx="20.9" cy="10.4" r="0.9" fill="#1F2933" />
      <circle cx="23.3" cy="10.4" r="0.9" fill="#1F2933" />
      <polygon points="21.6,11.7 23,11.7 22.3,12.6" fill="#E58BA0" />
    </svg>
  ),
  dog: (
    <svg className="pet-svg" width="30" height="24" viewBox="0 0 30 24" fill="none">
      {/* wagging tail */}
      <g className="pet-wing">
        <path
          d="M4.5 15 q-3.6 -1.8 -1.6 -5.6"
          stroke="#96682F"
          strokeWidth="2.1"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      {/* four legs, stepping in diagonal pairs */}
      <g className="pet-leg pet-leg-1">
        <rect x="8" y="17.4" width="2" height="5.6" rx="0.9" fill="#96682F" />
        <rect x="18.4" y="17.4" width="2" height="5.6" rx="0.9" fill="#96682F" />
      </g>
      <g className="pet-leg pet-leg-2">
        <rect x="11.4" y="17.4" width="2" height="5.6" rx="0.9" fill="#8A5E2A" />
        <rect x="15" y="17.4" width="2" height="5.6" rx="0.9" fill="#8A5E2A" />
      </g>
      {/* body */}
      <ellipse cx="14" cy="14.4" rx="9.2" ry="5" fill="#B5824A" />
      {/* head */}
      <circle cx="21.8" cy="11" r="4.3" fill="#B5824A" />
      {/* floppy ear */}
      <ellipse cx="20" cy="9" rx="1.8" ry="3.4" fill="#96682F" transform="rotate(-20 20 9)" />
      {/* snout + nose */}
      <ellipse cx="25.2" cy="12.2" rx="2.7" ry="1.9" fill="#C79A64" />
      <circle cx="27" cy="12" r="1.05" fill="#3A2A1A" />
      {/* eye */}
      <circle cx="22.4" cy="10.6" r="1" fill="#1F2933" />
    </svg>
  )
};

/** Static (non-animated) pet glyph for pickers — onboarding choice + Settings preview. */
export function PetPreview({ pet }: { pet: DeskPet }) {
  return <span style={{ display: 'inline-flex' }}>{PETS[pet] ?? PETS.duck}</span>;
}

const PET_CSS = `
.pet-lane {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  --pet-range: clamp(40px, calc(100vw - var(--sidebar-left, 56px) - 540px), 1100px);
}
.pet-walk {
  position: absolute;
  bottom: -2px;
  left: 0;
  will-change: transform;
  transform: translateX(4px);
  animation: pet-walk 34s linear infinite;
}
.pet-bob { animation: pet-bob 0.68s steps(2) infinite; }
.pet-hop { animation: pet-hop 1.15s cubic-bezier(0.3, 0, 0.2, 1) infinite; }
.pet-fly { animation: pet-fly 1.5s ease-in-out infinite; }
.pet-leg { transform-box: fill-box; transform-origin: top center; animation: pet-step 0.68s steps(2) infinite; }
.pet-leg-2 { animation-delay: -0.34s; }
.pet-wing { transform-box: fill-box; transform-origin: 60% 100%; animation: pet-flap 0.32s ease-in-out infinite alternate; }
.pet-svg { display: block; }

@keyframes pet-walk {
  0%   { transform: translateX(4px) scaleX(1); }
  46%  { transform: translateX(var(--pet-range)) scaleX(1); }
  50%  { transform: translateX(var(--pet-range)) scaleX(-1); }
  96%  { transform: translateX(4px) scaleX(-1); }
  100% { transform: translateX(4px) scaleX(1); }
}
@keyframes pet-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-1px); }
}
@keyframes pet-hop {
  0%, 55%  { transform: translateY(0); }
  72%      { transform: translateY(-5px); }
  100%     { transform: translateY(0); }
}
@keyframes pet-fly {
  0%, 100% { transform: translateY(-3px); }
  50%      { transform: translateY(-7px); }
}
@keyframes pet-step {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-1.6px); }
}
@keyframes pet-flap {
  0%   { transform: rotate(-6deg); }
  100% { transform: rotate(22deg); }
}

@media (prefers-reduced-motion: reduce) {
  .pet-walk, .pet-bob, .pet-hop, .pet-fly, .pet-leg, .pet-wing { animation: none; }
  .pet-walk { transform: translateX(10px); }
}
`;
