import type { ReactNode } from 'react';
import type { DeskPet } from '@/containers/voice-console/lib/types';

/**
 * Pet artwork — flat 2D vector characters on a 44x32 stage with the ground at y=31.
 *
 * Every pet is built from the same named parts so one stylesheet can animate all of them:
 *
 *   .pet-head    the head (+ beak/muzzle/eyes), pivoting at the neck — pecks, calls, looks, tucks
 *   .pet-eye     everything that should blink
 *   .pet-tail    pivots at its base — sways, wags
 *   .pet-wing    pivots at the shoulder — flaps
 *   .pet-leg     pivots at the hip; .pet-leg-1 / .pet-leg-2 are opposite diagonals so they alternate
 *   .pet-throat  the frog's vocal sac — inflates on a croak
 *   .pet-tongue  the frog's tongue — flicks out
 *   .pet-claw-l / .pet-claw-r  the crab's pincers — snap and wave
 *
 * A part that a given species doesn't have simply isn't there, and the rules that drive it no-op.
 */
export const PET_ART: Record<DeskPet, ReactNode> = {
  // ── Duck: flat wide bill, round head on a short neck, plump body, upturned tail, webbed feet ────
  duck: (
    <svg className="pet-svg" viewBox="0 0 44 32" fill="none">
      <ellipse
        className="pet-shadow"
        cx="21"
        cy="30.4"
        rx="12"
        ry="1.3"
        fill="#000"
        opacity="0.13"
      />

      <g className="pet-leg pet-leg-1">
        <rect x="16" y="23.5" width="1.9" height="5.6" rx="0.95" fill="#E8730F" />
        <path d="M13.4 29.1h7.1l-1.7 1.9h-3.7z" fill="#F5811F" />
      </g>
      <g className="pet-leg pet-leg-2">
        <rect x="22.4" y="23.5" width="1.9" height="5.6" rx="0.95" fill="#F5811F" />
        <path d="M19.8 29.1h7.1l-1.7 1.9h-3.7z" fill="#FF9330" />
      </g>

      {/* upturned tail */}
      <path d="M11.5 19C6.4 18.1 3.2 15 2.6 10.9c4.1 1.1 7.6 3.6 9.2 6.3z" fill="#F0B429" />

      <ellipse cx="20" cy="20.5" rx="12" ry="8" fill="#FFD34E" />
      <ellipse cx="19.2" cy="23.2" rx="8.2" ry="4.6" fill="#F5C13B" />

      {/* neck wedge tying the head to the body */}
      <path d="M27 16.4c0.2-4 1.8-7 4.4-8.4l3.1 4.6c-2.6 1.6-4.4 4.4-4.9 7z" fill="#FFD34E" />

      <g className="pet-wing">
        <path d="M13.6 18.4c5-3.2 11.2-2.7 13.4 0.4-2.8 4.2-9.8 4.4-13.4-0.4z" fill="#F0B429" />
        <path
          d="M16.2 20.4c3.2 1 6.6 0.8 9-0.6M17 22c2.6 0.7 5.2 0.5 7.2-0.4"
          stroke="#DFA31C"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
      </g>

      <g className="pet-head">
        <circle cx="33" cy="9.6" r="6.2" fill="#FFD34E" />
        {/* flat, rounded bill — the single strongest duck cue */}
        <path d="M38.2 8.4c3.1-0.5 5.3 0.5 5.3 2.1 0 1.7-2.4 2.7-5.5 2z" fill="#F5811F" />
        <path d="M38.4 11h4.9" stroke="#D8630A" strokeWidth="0.65" strokeLinecap="round" />
        <circle cx="40.8" cy="9.6" r="0.4" fill="#C9600F" />
        <g className="pet-eye">
          <circle cx="34.6" cy="8" r="1.5" fill="#1F2933" />
          <circle cx="35.1" cy="7.4" r="0.5" fill="#FFF" />
        </g>
      </g>
    </svg>
  ),

  // ── Bird: chubby songbird — big head, short cone beak, crest, fanned tail, thin legs ───────────
  bird: (
    <svg className="pet-svg" viewBox="0 0 44 32" fill="none">
      <ellipse
        className="pet-shadow"
        cx="21"
        cy="30.4"
        rx="9.5"
        ry="1.2"
        fill="#000"
        opacity="0.13"
      />

      <g className="pet-leg pet-leg-1">
        <path d="M18 24.6v4.4" stroke="#E8892B" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M16.2 29.4h3.8" stroke="#E8892B" strokeWidth="1.3" strokeLinecap="round" />
      </g>
      <g className="pet-leg pet-leg-2">
        <path d="M23.4 24.6v4.4" stroke="#F0A83A" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M21.6 29.4h3.8" stroke="#F0A83A" strokeWidth="1.3" strokeLinecap="round" />
      </g>

      <g className="pet-tail">
        <path
          d="M12.4 19.6C7.2 18.8 3 16.2 1.2 13.6l0.8 8.2c3.6 1.2 7.6 1 10.4-0.4z"
          fill="#2F7FA6"
        />
        <path
          d="M3 15.4l7.6 4.2M2.6 18.6l8 2.4"
          stroke="#25688A"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
      </g>

      <ellipse cx="20" cy="20" rx="10.6" ry="8" fill="#4FA9D6" />
      <ellipse cx="21.4" cy="22.8" rx="7.4" ry="4.6" fill="#F0E4C8" />

      <g className="pet-head">
        {/* crest feathers */}
        <path d="M27.6 6.8c1.2-3.4 3-4.2 4.6-3.4-1.2 1.4-1.6 2.8-1.4 4.2z" fill="#2F7FA6" />
        <circle cx="30" cy="12.4" r="6.8" fill="#4FA9D6" />
        <path d="M36.2 11.2L43.4 13.2 36.2 15.2z" fill="#F0A83A" />
        <path d="M36.4 13.2h6.6" stroke="#D08A20" strokeWidth="0.6" strokeLinecap="round" />
        <circle cx="33.2" cy="14.6" r="1.5" fill="#FFF" opacity="0.22" />
        <g className="pet-eye">
          <circle cx="31.6" cy="11" r="1.7" fill="#1F2933" />
          <circle cx="32.2" cy="10.4" r="0.55" fill="#FFF" />
        </g>
      </g>

      <g className="pet-wing">
        <path d="M13.8 17c5.2-3.6 12-2.5 13.8 1.6-4.2 4.2-11.2 3.6-13.8-1.6z" fill="#3C90BC" />
        <path
          d="M16.4 19.2c3.4 1.2 7 1 9.4-0.6M17.4 21c2.8 0.9 5.6 0.7 7.6-0.4"
          stroke="#2F7FA6"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
      </g>
    </svg>
  ),

  // ── Frog: symmetric front view — wide squat body, domed eyes on top, big grin, folded hind legs ─
  frog: (
    <svg className="pet-svg" viewBox="0 0 44 32" fill="none">
      <ellipse
        className="pet-shadow"
        cx="22"
        cy="30.4"
        rx="13.5"
        ry="1.3"
        fill="#000"
        opacity="0.13"
      />

      <g className="pet-leg pet-leg-1">
        <path d="M11.6 21.6c-5 1.4-7.4 4.6-6.4 8.6l6.8-2.6z" fill="#3E9E42" />
        <path d="M5.2 30.2h5.4" stroke="#357F38" strokeWidth="1.3" strokeLinecap="round" />
      </g>
      <g className="pet-leg pet-leg-2">
        <path d="M32.4 21.6c5 1.4 7.4 4.6 6.4 8.6l-6.8-2.6z" fill="#3E9E42" />
        <path d="M33.4 30.2h5.4" stroke="#357F38" strokeWidth="1.3" strokeLinecap="round" />
      </g>

      <ellipse cx="22" cy="22.6" rx="14" ry="7.6" fill="#58C45A" />
      <ellipse cx="22" cy="25.4" rx="9.6" ry="4.4" fill="#A8E6A0" opacity="0.85" />
      <ellipse className="pet-throat" cx="22" cy="26" rx="5.6" ry="2.8" fill="#7ED37E" />

      {/* front feet, toes out */}
      <path
        d="M16.4 29.4h-3.6M16.4 30.4h-3.2M27.6 29.4h3.6M27.6 30.4h3.2"
        stroke="#3E9E42"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      <path
        d="M11.6 20.4c4.6 4.6 16.2 4.6 20.8 0"
        stroke="#3B8A3E"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        className="pet-tongue"
        d="M22 24.2c5.4 0.6 9.8-1.2 12.6-4"
        stroke="#E0688B"
        strokeWidth="2.1"
        fill="none"
        strokeLinecap="round"
      />

      <g className="pet-head">
        {/* eye domes sit on top of the head — the frog cue */}
        <circle cx="15" cy="14.4" r="5.1" fill="#58C45A" />
        <circle cx="29" cy="14.4" r="5.1" fill="#58C45A" />
        <g className="pet-eye">
          <circle cx="15" cy="13.6" r="3.3" fill="#FFF" />
          <circle cx="29" cy="13.6" r="3.3" fill="#FFF" />
          <circle cx="15.7" cy="13.9" r="1.75" fill="#1F2933" />
          <circle cx="29.7" cy="13.9" r="1.75" fill="#1F2933" />
          <circle cx="14.4" cy="12.4" r="0.6" fill="#FFF" />
          <circle cx="28.4" cy="12.4" r="0.6" fill="#FFF" />
        </g>
      </g>
    </svg>
  ),

  // ── Cat: triangular ears, slit pupils, whiskers, curled-up tail ────────────────────────────────
  cat: (
    <svg className="pet-svg" viewBox="0 0 44 32" fill="none">
      <ellipse
        className="pet-shadow"
        cx="21"
        cy="30.4"
        rx="12.5"
        ry="1.3"
        fill="#000"
        opacity="0.13"
      />

      <path
        className="pet-tail"
        d="M9 22C3.2 20.8 1.2 15.8 3.8 11.8c1-1.5 3-1.3 3.5 0.4"
        stroke="#7E848A"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />

      <g className="pet-leg pet-leg-1">
        <rect x="11.4" y="23.8" width="2.3" height="6.3" rx="1.15" fill="#7E848A" />
        <rect x="26.4" y="23.8" width="2.3" height="6.3" rx="1.15" fill="#7E848A" />
      </g>
      <g className="pet-leg pet-leg-2">
        <rect x="15.4" y="23.8" width="2.3" height="6.3" rx="1.15" fill="#8F959B" />
        <rect x="22.4" y="23.8" width="2.3" height="6.3" rx="1.15" fill="#8F959B" />
      </g>

      <ellipse cx="20" cy="20.8" rx="12.5" ry="6.6" fill="#9AA0A6" />
      <ellipse cx="27.4" cy="21.4" rx="6.2" ry="6.2" fill="#9AA0A6" />

      <g className="pet-head">
        <path d="M27.4 9.8L28.2 4.2 32.2 8.2z" fill="#9AA0A6" />
        <path d="M33.6 8.1L37.6 4 38.4 9.8z" fill="#9AA0A6" />
        <path d="M28.8 9L29.2 6.3 31.1 8.4z" fill="#E58BA0" />
        <path d="M34.7 8.5L36.9 6.2 37.3 9.1z" fill="#E58BA0" />
        <circle cx="32.6" cy="13" r="6.4" fill="#9AA0A6" />
        <ellipse cx="34.8" cy="15.6" rx="3.7" ry="2.7" fill="#B7BCC1" />
        <path
          className="pet-whiskers"
          d="M36.6 14.8l6-1.6M36.8 16l6.2 0.4M36.6 17.2l5.6 2"
          stroke="#EDEFF1"
          strokeWidth="0.6"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path d="M33.7 14.3h2.1l-1.05 1.3z" fill="#E58BA0" />
        <path
          d="M34.65 15.8v0.9M34.65 16.7c-0.7 0.7-1.6 0.6-2.1 0M34.65 16.7c0.7 0.7 1.6 0.6 2.1 0"
          stroke="#6E747A"
          strokeWidth="0.55"
          fill="none"
          strokeLinecap="round"
        />
        <g className="pet-eye">
          <ellipse cx="30.6" cy="12.2" rx="1.7" ry="2.1" fill="#D9C24E" />
          <ellipse cx="34.9" cy="12.2" rx="1.7" ry="2.1" fill="#D9C24E" />
          <rect x="30.25" y="10.6" width="0.75" height="3.2" rx="0.37" fill="#1F2933" />
          <rect x="34.55" y="10.6" width="0.75" height="3.2" rx="0.37" fill="#1F2933" />
        </g>
      </g>
    </svg>
  ),

  // ── Dog: floppy ear, long muzzle, red collar, curled tail ──────────────────────────────────────
  dog: (
    <svg className="pet-svg" viewBox="0 0 44 32" fill="none">
      <ellipse
        className="pet-shadow"
        cx="21"
        cy="30.4"
        rx="12.5"
        ry="1.3"
        fill="#000"
        opacity="0.13"
      />

      <path
        className="pet-tail"
        d="M9 21.4C3.8 19.4 2.4 14.4 5 11.2"
        stroke="#9C6B36"
        strokeWidth="2.8"
        fill="none"
        strokeLinecap="round"
      />

      <g className="pet-leg pet-leg-1">
        <rect x="11.4" y="23.6" width="2.5" height="6.5" rx="1.25" fill="#9C6B36" />
        <rect x="26.2" y="23.6" width="2.5" height="6.5" rx="1.25" fill="#9C6B36" />
      </g>
      <g className="pet-leg pet-leg-2">
        <rect x="15.4" y="23.6" width="2.5" height="6.5" rx="1.25" fill="#8A5E2A" />
        <rect x="22.2" y="23.6" width="2.5" height="6.5" rx="1.25" fill="#8A5E2A" />
      </g>

      <ellipse cx="20" cy="20.8" rx="12.5" ry="7" fill="#C08A50" />
      <ellipse cx="27.4" cy="20.8" rx="6.6" ry="6.6" fill="#C08A50" />

      <g className="pet-head">
        <circle cx="32.4" cy="12" r="6.7" fill="#C08A50" />
        <ellipse cx="38.2" cy="14.8" rx="5" ry="3.4" fill="#DCB183" />
        <ellipse cx="41.7" cy="13.5" rx="1.55" ry="1.3" fill="#33251A" />
        <path
          d="M41.4 15.2c-1.8 2.2-4 2-5.2 0.6"
          stroke="#9C6B36"
          strokeWidth="0.7"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M31.4 7.4c1.6-0.5 3.2-0.2 4.2 0.7"
          stroke="#9C6B36"
          strokeWidth="0.7"
          fill="none"
          strokeLinecap="round"
        />
        <g className="pet-ear">
          <path d="M28.4 7c-3.2-0.6-5 2-4.4 5.6 0.5 2.8 2.6 3.9 4.4 2.8z" fill="#9C6B36" />
        </g>
        <g className="pet-eye">
          <circle cx="33.6" cy="10.9" r="1.55" fill="#1F2933" />
          <circle cx="34.2" cy="10.3" r="0.5" fill="#FFF" />
        </g>
      </g>

      {/* collar reads instantly as "someone's dog" */}
      <path d="M28.9 16.6l7.2 2.6-0.9 2.4-7.2-2.6z" fill="#D94F4F" />
      <circle cx="32" cy="21.4" r="1.15" fill="#F2C14E" />
    </svg>
  ),

  // ── Crabby: wide shell, stalk eyes, two big pincers, three legs a side. Moves sideways. ────────
  crab: (
    <svg className="pet-svg" viewBox="0 0 44 32" fill="none">
      <ellipse
        className="pet-shadow"
        cx="22"
        cy="30.4"
        rx="14"
        ry="1.3"
        fill="#000"
        opacity="0.13"
      />

      <g
        className="pet-leg pet-leg-1"
        stroke="#C25E3F"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M12.4 21.8C8.4 23 6 25.4 5.4 28.6" />
        <path d="M12 27.4C9.2 28.8 7.8 29.8 7.4 30.8" />
        <path d="M31.6 21.8C35.6 23 38 25.4 38.6 28.6" />
        <path d="M32 27.4C34.8 28.8 36.2 29.8 36.6 30.8" />
      </g>
      <g
        className="pet-leg pet-leg-2"
        stroke="#B85536"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M11.4 24.8C7.8 26.4 6 28.4 6 30.8" />
        <path d="M32.6 24.8C36.2 26.4 38 28.4 38 30.8" />
      </g>

      <g className="pet-claw pet-claw-l">
        <path d="M11.4 20.8L6.6 21.8" stroke="#C25E3F" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M7.4 18.4c-3 -1 -6 0.4 -6.4 2.2l6.2 1.4z" fill="#D97757" />
        <path d="M7.6 22.4c-2.6 1.6 -4.6 3.6 -3.8 5.2l5.4 -3.8z" fill="#C25E3F" />
      </g>
      <g className="pet-claw pet-claw-r">
        <path d="M32.6 20.8L37.4 21.8" stroke="#C25E3F" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M36.6 18.4c3 -1 6 0.4 6.4 2.2l-6.2 1.4z" fill="#D97757" />
        <path d="M36.4 22.4c2.6 1.6 4.6 3.6 3.8 5.2l-5.4 -3.8z" fill="#C25E3F" />
      </g>

      <path
        d="M5 20.6C5 14 12.6 9.6 22 9.6s17 4.4 17 11c0 3.9-7 5.5-17 5.5S5 24.5 5 20.6z"
        fill="#D97757"
      />
      <path
        d="M10 15.8c3-3 7.4-4.4 12-4.4"
        stroke="#EDA189"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="14.6" cy="20.4" r="1.15" fill="#C25E3F" />
      <circle cx="29.4" cy="20.4" r="1.15" fill="#C25E3F" />
      <path
        d="M19.4 23.2c1.7 1.5 3.5 1.5 5.2 0"
        stroke="#A84B31"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />

      <g className="pet-head">
        <rect x="17.3" y="4.4" width="1.7" height="6.6" rx="0.85" fill="#C25E3F" />
        <rect x="25" y="4.4" width="1.7" height="6.6" rx="0.85" fill="#C25E3F" />
        <g className="pet-eye">
          <circle cx="18.15" cy="3.8" r="2.7" fill="#FFF8F2" />
          <circle cx="25.85" cy="3.8" r="2.7" fill="#FFF8F2" />
          <circle cx="18.6" cy="3.9" r="1.25" fill="#2A1A12" />
          <circle cx="26.3" cy="3.9" r="1.25" fill="#2A1A12" />
        </g>
      </g>
    </svg>
  )
};

export const PET_LABELS: Record<DeskPet, string> = {
  duck: 'Duck',
  bird: 'Bird',
  frog: 'Frog',
  cat: 'Cat',
  dog: 'Dog',
  crab: 'Crabby'
};

export const PET_EMOJI: Record<DeskPet, string> = {
  duck: '🦆',
  bird: '🐦',
  frog: '🐸',
  cat: '🐱',
  dog: '🐶',
  crab: '🦀'
};
