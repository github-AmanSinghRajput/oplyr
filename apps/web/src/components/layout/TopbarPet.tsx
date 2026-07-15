/**
 * TopbarPet — a tiny rubber duck that waddles along the bottom edge of the top bar (the border is
 * its floor). Purely cosmetic; a dev can switch it off in Settings.
 *
 * Performance contract (this is why it's safe to leave running): every animation is a CSS
 * `transform` keyframe, so it lives on the GPU compositor thread — no JS, no requestAnimationFrame,
 * no timers, no layout/paint of the surrounding bar. It's `pointer-events: none` so it can never
 * intercept a click, it clips to a lane that stays clear of the right-hand controls, and it fully
 * stops for anyone with `prefers-reduced-motion`.
 */
export function TopbarPet() {
  return (
    <div className="pet-lane" aria-hidden="true">
      <style>{PET_CSS}</style>
      <div className="pet-walk">
        <div className="pet-bob">
          <svg
            className="pet-svg"
            width="28"
            height="24"
            viewBox="0 0 28 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="geometricPrecision"
          >
            {/* tail */}
            <polygon points="1,10 6,8.5 6,13.5" fill="#EDA919" />
            {/* legs (behind the body so their tops tuck under it) */}
            <g className="pet-leg pet-leg-1">
              <rect x="9" y="18.2" width="1.7" height="4.2" rx="0.7" fill="#F97316" />
              <rect x="7.8" y="22" width="3.6" height="1.5" rx="0.7" fill="#F97316" />
            </g>
            <g className="pet-leg pet-leg-2">
              <rect x="14.2" y="18.2" width="1.7" height="4.2" rx="0.7" fill="#EA6C0A" />
              <rect x="13" y="22" width="3.6" height="1.5" rx="0.7" fill="#EA6C0A" />
            </g>
            {/* body */}
            <ellipse cx="12" cy="14" rx="9" ry="6.2" fill="#FFCE3A" />
            {/* wing */}
            <ellipse cx="11" cy="14.5" rx="4.6" ry="3" fill="#EDA919" />
            {/* head */}
            <circle cx="19" cy="8" r="5" fill="#FFCE3A" />
            {/* beak */}
            <polygon points="23,6.6 28,8 23,9.8" fill="#F97316" />
            {/* eye */}
            <circle cx="20" cy="6.6" r="1.05" fill="#1F2933" />
            <circle cx="20.4" cy="6.2" r="0.34" fill="#FFFFFF" />
          </svg>
        </div>
      </div>
    </div>
  );
}

const PET_CSS = `
.pet-lane {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  /* how far the duck paces: full bar width minus the sidebar offset and a margin that keeps it
     clear of the right-hand controls; clamped so it never overshoots on very wide/narrow windows */
  --pet-range: clamp(40px, calc(100vw - var(--sidebar-left, 56px) - 540px), 1100px);
}
.pet-walk {
  position: absolute;
  bottom: -2px;
  left: 0;
  will-change: transform;
  transform: translateX(4px);
  animation: pet-walk 17s linear infinite;
}
.pet-bob { animation: pet-bob 0.44s steps(2) infinite; }
.pet-leg { transform-box: fill-box; transform-origin: center; animation: pet-step 0.44s steps(2) infinite; }
.pet-leg-2 { animation-delay: -0.22s; }
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
@keyframes pet-step {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-1.6px); }
}

@media (prefers-reduced-motion: reduce) {
  .pet-walk, .pet-bob, .pet-leg { animation: none; }
  .pet-walk { transform: translateX(10px); }
}
`;
