/**
 * One stylesheet for every companion. Rules are keyed off two classes on the rig: the species
 * (`pet-dog`) and what it's currently doing (`pet-gait-trot` while travelling, `pet-act-dig`
 * otherwise). Gait and act are mutually exclusive — walking *is* the gait — so they never fight over
 * the rig's own transform, and part-level rules (`.pet-act-dig .pet-leg-2`) layer on top.
 *
 * Everything animated here is a transform or an opacity, so it all composites on the GPU.
 */
export const PET_CSS = `
.pet-lane {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
/* Sits the lane just above its host instead of inside it, so the host's top border is the floor. */
.pet-lane-top {
  inset: auto 0 100% 0;
  height: 28px;
}
.pet-walk {
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 38px;
  height: 28px;
  transform: translateX(0);
  transition-property: transform;
  transition-timing-function: linear;
  transition-duration: 0ms;
  will-change: transform;
}
.pet-face {
  width: 100%;
  height: 100%;
  transition: transform 240ms ease-in-out;
  will-change: transform;
}
/* Its own layer, so the continuously-running gait/act keyframes composite instead of repainting
   the character into the bar on every frame. */
.pet-rig {
  width: 100%;
  height: 100%;
  transform-origin: 50% 100%;
  will-change: transform;
}
.pet-svg { display: block; width: 100%; height: 100%; }

.pet-head, .pet-tail, .pet-wing, .pet-leg, .pet-throat, .pet-tongue, .pet-claw, .pet-eye, .pet-ear {
  transform-box: fill-box;
}
.pet-head { transform-origin: 22% 92%; }
.pet-tail { transform-origin: 100% 100%; }
.pet-wing { transform-origin: 28% 40%; }
.pet-leg { transform-origin: 50% 8%; }
.pet-throat { transform-origin: 50% 25%; }
.pet-tongue { transform-origin: 0% 50%; transform: scaleX(0); }
.pet-eye { transform-origin: 50% 50%; }
.pet-ear { transform-origin: 60% 6%; }
.pet-claw-l { transform-origin: 100% 45%; }
.pet-claw-r { transform-origin: 0% 45%; }
/* The frog's head is a pair of eye domes and the crab's is a pair of stalks — both pivot centrally. */
.pet-frog .pet-head, .pet-crab .pet-head { transform-origin: 50% 100%; }

/* ── Gaits ──────────────────────────────────────────────────────────────────────────────────── */
/* Duck: rocking waddle, feet planted wide. */
.pet-gait-waddle { animation: gait-waddle 0.42s ease-in-out infinite alternate; }
.pet-gait-waddle .pet-leg { animation: leg-step 0.7s steps(2) infinite; }
.pet-gait-waddle .pet-leg-2 { animation-delay: -0.35s; }

/* Frog: one big committed leap per cycle — crouch, launch, arc, land, recover. Paired with its
   travel speed, each cycle covers roughly a body length rather than a stack of little hops. */
.pet-gait-hop { animation: gait-hop 1.15s cubic-bezier(0.32, 0, 0.3, 1) infinite; }
.pet-gait-hop .pet-leg { animation: leg-kick 1.15s ease-in-out infinite; }

/* Bird: it flies. Cruising above the floor on a slow sine, banking gently, wings on a long beat and
   legs tucked back. The lift is a static offset on the lane rather than part of the animation, so
   the bird stays airborne for its in-place acts too and never snaps to the ground between them. */
.pet-species-bird .pet-walk { bottom: 8px; }
.pet-gait-glide { animation: gait-glide 1.5s ease-in-out infinite; }
.pet-gait-glide .pet-wing { animation: wing-glide 0.6s ease-in-out infinite alternate; }
.pet-gait-glide .pet-tail { animation: tail-sway 1.5s ease-in-out infinite alternate; }
.pet-species-bird .pet-leg { transform: translateY(-1px) rotate(-24deg); }

/* Cat: smooth low prowl, tail swaying slowly behind it. */
.pet-gait-prowl { animation: gait-prowl 0.62s ease-in-out infinite alternate; }
.pet-gait-prowl .pet-leg { animation: leg-step 0.62s steps(2) infinite; }
.pet-gait-prowl .pet-tail { animation: tail-sway 1.7s ease-in-out infinite alternate; }
.pet-gait-prowl .pet-leg-2 { animation-delay: -0.31s; }

/* Dog: bouncier trot with the tail going the whole time. */
.pet-gait-trot { animation: gait-trot 0.26s ease-in-out infinite alternate; }
.pet-gait-trot .pet-leg { animation: leg-step 0.52s steps(2) infinite; }
.pet-gait-trot .pet-tail { animation: act-wag 0.2s ease-in-out infinite alternate; }
.pet-gait-trot .pet-leg-2 { animation-delay: -0.26s; }

.pet-gait-scuttle { animation: gait-scuttle 0.17s ease-in-out infinite alternate; }
.pet-gait-scuttle .pet-leg { animation: leg-shuffle 0.17s steps(2) infinite; }
.pet-gait-scuttle .pet-leg-2 { animation-delay: -0.085s; }

/* ── Acts ───────────────────────────────────────────────────────────────────────────────────── */
.pet-act-idle { animation: act-breathe 2.6s ease-in-out infinite; }

.pet-act-look .pet-head { animation: act-look 2.2s ease-in-out infinite; }

.pet-act-sit { animation: act-sit 0.42s ease-out forwards; }
.pet-act-sit .pet-tail { animation: tail-sway 1.9s ease-in-out infinite alternate; }

.pet-act-sleep { animation: act-sleep 3.4s ease-in-out infinite; }
.pet-act-sleep .pet-head { animation: act-tuck 0.7s ease-out forwards; }

.pet-act-peck .pet-head { animation: act-peck 0.62s ease-in-out infinite; }

.pet-act-call { animation: act-call-body 0.8s ease-out infinite; }
.pet-act-call .pet-head { animation: act-call 0.8s ease-out infinite; }
.pet-act-call .pet-throat { animation: act-throat 0.8s ease-out infinite; }

.pet-act-flap { animation: act-hover 0.34s ease-in-out infinite; }
.pet-act-flap .pet-wing { animation: act-flap 0.16s ease-in-out infinite alternate; }

.pet-act-preen .pet-head { animation: act-preen 1.7s ease-in-out infinite; }

.pet-act-tongue .pet-tongue { animation: act-tongue 1.3s ease-out infinite; }

.pet-act-jump { animation: act-jump 0.8s cubic-bezier(0.3, 0, 0.3, 1) infinite; }

.pet-act-groom .pet-head { animation: act-groom 1.2s ease-in-out infinite; }

.pet-act-stretch { animation: act-stretch 1.9s ease-in-out infinite; }
.pet-act-stretch .pet-tail { animation: tail-sway 1.9s ease-in-out infinite alternate; }

.pet-act-wag { animation: act-wiggle 0.3s ease-in-out infinite alternate; }
.pet-act-wag .pet-tail { animation: act-wag 0.15s ease-in-out infinite alternate; }

.pet-act-dig { animation: act-dig-body 0.26s ease-in-out infinite alternate; }
.pet-act-dig .pet-leg-2 { animation: act-dig-paw 0.16s ease-in-out infinite alternate; }

.pet-act-snap .pet-claw-l { animation: act-snap 0.44s ease-in-out infinite; }
.pet-act-snap .pet-claw-r { animation: act-snap 0.44s ease-in-out infinite; animation-delay: -0.22s; }

.pet-act-wave .pet-claw-r { animation: act-wave 1s ease-in-out infinite; }

.pet-act-burrow { animation: act-burrow 2.6s ease-in-out infinite; }

/* Blinking runs constantly — except asleep, where the eyes just stay shut. */
.pet-eye { animation: pet-blink 5.4s ease-in-out infinite; }
.pet-act-sleep .pet-eye { animation: none; transform: scaleY(0.1); }

/* ── Thought cues ───────────────────────────────────────────────────────────────────────────── */
.pet-cue { position: absolute; pointer-events: none; color: var(--color-text-tertiary); }
.pet-cue-zzz {
  left: 26px;
  bottom: 16px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  animation: cue-zzz 2.3s ease-out infinite;
}
.pet-cue-sound {
  left: 30px;
  bottom: 16px;
  line-height: 0;
  animation: cue-sound 0.8s ease-out infinite;
}

/* ── Keyframes ──────────────────────────────────────────────────────────────────────────────── */
@keyframes gait-waddle {
  from { transform: rotate(-4deg); }
  to   { transform: rotate(4deg); }
}
@keyframes gait-hop {
  0%   { transform: translateY(0) scale(1, 1); }
  12%  { transform: translateY(1px) scale(1.14, 0.8); }   /* crouch */
  26%  { transform: translateY(-5px) scale(0.9, 1.16); }  /* launch */
  50%  { transform: translateY(-13px) scale(0.97, 1.05); }/* apex */
  74%  { transform: translateY(-4px) scale(1, 1); }
  88%  { transform: translateY(0) scale(1.12, 0.84); }    /* land */
  100% { transform: translateY(0) scale(1, 1); }          /* recover */
}
@keyframes gait-trot {
  from { transform: translateY(0); }
  to   { transform: translateY(-1.6px); }
}
@keyframes gait-prowl {
  from { transform: translateY(0); }
  to   { transform: translateY(-0.8px); }
}
@keyframes gait-glide {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50%      { transform: translateY(-5px) rotate(2deg); }
}
@keyframes wing-glide {
  from { transform: rotate(-32deg); }
  to   { transform: rotate(28deg); }
}
/* Push off, tuck at the apex, reach out again to land. */
@keyframes leg-kick {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  12%      { transform: translateY(1.5px) rotate(4deg); }
  26%      { transform: translateY(1px) rotate(-8deg); }
  50%      { transform: translateY(-2.5px) rotate(-20deg); }
  80%      { transform: translateY(0.5px) rotate(-6deg); }
}
@keyframes gait-scuttle {
  from { transform: translateY(0) rotate(-1.5deg); }
  to   { transform: translateY(-1.6px) rotate(1.5deg); }
}
/* Legs pivot at the hip and the art faces +x, so a NEGATIVE rotation swings the foot forward. The
   lifted leg must reach forward and the planted one stay put — positive here is what made the walk
   read backwards, feet skating away from the direction of travel. */
@keyframes leg-step {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50%      { transform: translateY(-2px) rotate(-8deg); }
}
@keyframes leg-shuffle {
  0%, 100% { transform: translateX(0); }
  50%      { transform: translateX(1.4px); }
}
@keyframes tail-sway {
  from { transform: rotate(-7deg); }
  to   { transform: rotate(9deg); }
}
@keyframes pet-blink {
  0%, 93%, 100% { transform: scaleY(1); }
  96%           { transform: scaleY(0.08); }
}
@keyframes act-breathe {
  0%, 100% { transform: scaleY(1); }
  50%      { transform: scaleY(1.05) translateY(-0.4px); }
}
@keyframes act-look {
  0%, 100% { transform: rotate(0deg); }
  22%      { transform: rotate(-13deg); }
  55%      { transform: rotate(13deg); }
  78%      { transform: rotate(0deg); }
}
@keyframes act-sit {
  to { transform: translateY(3.5px) scaleY(0.82) scaleX(1.06); }
}
@keyframes act-sleep {
  0%, 100% { transform: translateY(2.5px) scaleY(0.88) scaleX(1.06); }
  50%      { transform: translateY(2.5px) scaleY(0.93) scaleX(1.03); }
}
/* Head pivots at the neck with the beak/muzzle on the +x side, so positive rotation lowers it.
   Sleeping tucks the head DOWN — negative was pointing it at the ceiling. */
@keyframes act-tuck {
  to { transform: translateY(2px) rotate(26deg); }
}
@keyframes act-peck {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  35%, 55% { transform: rotate(34deg) translateY(3px); }
}
@keyframes act-call {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  30%      { transform: rotate(-16deg) translateY(-1.5px); }
  60%      { transform: rotate(-11deg) translateY(-1px); }
}
@keyframes act-call-body {
  0%, 100% { transform: translateY(0); }
  30%      { transform: translateY(-1.5px); }
}
@keyframes act-throat {
  0%, 100% { transform: scale(1); }
  45%      { transform: scale(1.5, 1.7); }
}
@keyframes act-flap {
  from { transform: rotate(-26deg); }
  to   { transform: rotate(34deg); }
}
@keyframes act-hover {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-5px); }
}
/* Preening buries the beak in the back feathers — down and back over the wing, not up in the air. */
@keyframes act-preen {
  0%, 100% { transform: rotate(0deg); }
  38%      { transform: rotate(74deg) translate(-2px, 1px); }
  55%      { transform: rotate(64deg) translate(-2px, 0); }
  72%      { transform: rotate(74deg) translate(-2px, 1px); }
}
@keyframes act-tongue {
  0%, 100%  { transform: scaleX(0); }
  12%, 34%  { transform: scaleX(1); }
  46%       { transform: scaleX(0); }
}
@keyframes act-jump {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  14%      { transform: translateY(1px) scale(1.14, 0.8); }
  30%      { transform: translateY(-7px) scale(0.9, 1.16); }
  50%      { transform: translateY(-14px) scale(0.97, 1.05); }
  74%      { transform: translateY(-3px) scale(1, 1); }
  88%      { transform: translateY(0) scale(1.12, 0.84); }
}
@keyframes act-groom {
  0%, 100% { transform: rotate(0deg); }
  30%, 60% { transform: rotate(28deg) translate(-2px, 3px); }
  45%      { transform: rotate(22deg) translate(-2px, 2px); }
}
@keyframes act-stretch {
  0%, 100% { transform: scaleX(1) scaleY(1) translateY(0); }
  45%      { transform: scaleX(1.14) scaleY(0.84) translateY(2px); }
}
@keyframes act-wiggle {
  from { transform: rotate(-1.6deg); }
  to   { transform: rotate(1.6deg); }
}
@keyframes act-wag {
  from { transform: rotate(-16deg); }
  to   { transform: rotate(20deg); }
}
@keyframes act-dig-body {
  from { transform: rotate(0deg) translateY(0); }
  to   { transform: rotate(-4deg) translateY(1px); }
}
@keyframes act-dig-paw {
  from { transform: translateY(0) rotate(-16deg); }
  to   { transform: translateY(-3px) rotate(24deg); }
}
@keyframes act-snap {
  0%, 100% { transform: rotate(0deg); }
  30%      { transform: rotate(-20deg) scale(1.1); }
  60%      { transform: rotate(6deg); }
}
@keyframes act-wave {
  0%, 100%  { transform: rotate(0deg) translateY(0); }
  25%, 75%  { transform: rotate(-42deg) translateY(-3px); }
  50%       { transform: rotate(-20deg) translateY(-3px); }
}
@keyframes act-burrow {
  0%, 100% { transform: translateY(0); }
  45%, 60% { transform: translateY(7px); }
}
@keyframes cue-zzz {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.6); }
  22%  { opacity: 0.85; }
  100% { opacity: 0; transform: translate(8px, -13px) scale(1.2); }
}
@keyframes cue-sound {
  0%   { opacity: 0; transform: translateX(0) scale(0.7); }
  30%  { opacity: 0.9; }
  100% { opacity: 0; transform: translateX(6px) scale(1.15); }
}

@media (prefers-reduced-motion: reduce) {
  .pet-walk { transition: none; }
  .pet-face { transition: none; }
  .pet-lane * { animation: none !important; }
}
`;
