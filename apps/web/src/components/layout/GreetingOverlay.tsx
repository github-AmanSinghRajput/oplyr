import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * GreetingOverlay — the "hello" moment on a fresh app start. It plays two roles at once:
 *
 *  1. Boot cover (fixes the reopen flash): while the app is still resolving whether a returning user
 *     goes straight to the dashboard, this sits opaque on top so the VoiceBootstrap → Onboarding
 *     screens never flicker past. AppShell holds it in `reveal={false}` (calm glass) until it knows.
 *  2. Greeting: once the user lands on the workspace (a returning user on launch, or a new user right
 *     after finishing onboarding), `reveal` flips true and a warm, randomly-chosen multilingual "hello"
 *     is inked on in a handwriting hand, then the whole thing fades out. Dismissable via the ✕.
 *
 * Offline-safe by design: the script face is the macOS system font "Snell Roundhand" (with fallbacks),
 * so nothing is fetched at runtime; the write-on is a pure CSS clip-path reveal on the GPU.
 */

type Hello = { word: string; lang: string };

// Romanized on purpose — the cursive face only carries Latin glyphs, so this keeps every greeting in
// the same elegant ink hand instead of falling back to a blocky system font for non-Latin scripts.
const HELLOS: Hello[] = [
  { word: 'Hello', lang: 'English' },
  { word: 'Namaste', lang: 'Hindi' },
  { word: 'Bonjour', lang: 'French' },
  { word: 'Hola', lang: 'Spanish' },
  { word: 'Ciao', lang: 'Italian' },
  { word: 'Hallo', lang: 'German' },
  { word: 'Olá', lang: 'Portuguese' },
  { word: 'Konnichiwa', lang: 'Japanese' },
  { word: 'Annyeong', lang: 'Korean' },
  { word: 'Salaam', lang: 'Persian' },
  { word: 'Marhaba', lang: 'Arabic' },
  { word: 'Privet', lang: 'Russian' },
  { word: 'Shalom', lang: 'Hebrew' },
  { word: 'Sawubona', lang: 'Zulu' },
  { word: 'Xin chào', lang: 'Vietnamese' },
  { word: 'Kia ora', lang: 'Māori' },
  { word: 'Ni hao', lang: 'Mandarin' },
  { word: 'Yassou', lang: 'Greek' },
  { word: 'Merhaba', lang: 'Turkish' },
  { word: 'Jambo', lang: 'Swahili' },
  { word: 'Sawasdee', lang: 'Thai' },
  { word: 'Aloha', lang: 'Hawaiian' },
  { word: 'Witaj', lang: 'Polish' },
  { word: 'Kumusta', lang: 'Tagalog' },
  { word: 'Vanakkam', lang: 'Tamil' },
  { word: 'Hej', lang: 'Swedish' },
  { word: 'Ahoj', lang: 'Czech' },
  { word: 'Bula', lang: 'Fijian' }
];

// Sub-lines that work for anyone (no "back" assumption). Named + generic variants.
const SUBS_ANY_NAMED: Array<(name: string) => string> = [
  (n) => `Ready when you are, ${n}.`,
  (n) => `Let's build something, ${n}.`,
  (n) => `Let's smash some bugs, ${n}.`,
  (n) => `The room's yours, ${n}.`,
  (n) => `What are we shipping, ${n}?`,
  (n) => `Let's get into it, ${n}.`
];
const SUBS_ANY_GENERIC = [
  'Ready when you are.',
  "Let's build something.",
  "Let's smash some bugs.",
  'Your agents are standing by.',
  'What are we shipping today?',
  'The workspace is yours.'
];
// First-ever greeting (brand-new user) — welcoming, never "back".
const SUBS_NEW_NAMED: Array<(name: string) => string> = [
  (n) => `Welcome, ${n}.`,
  (n) => `Glad you're here, ${n}.`
];
const SUBS_NEW_GENERIC = ['Welcome to Oplyr.', "Glad you're here."];
// Returning user — "back" is fair game.
const SUBS_RETURNING_NAMED: Array<(name: string) => string> = [
  (n) => `Welcome back, ${n}.`,
  (n) => `Good to see you, ${n}.`
];
const SUBS_RETURNING_GENERIC = ['Welcome back to Oplyr.', 'Good to see you again.'];

const GREET_RECENT_KEY = 'oplyr-greet-recent';
const GREETED_KEY = 'oplyr-greeted';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function GreetingOverlay({
  reveal,
  userName,
  onDone
}: {
  reveal: boolean;
  userName?: string | null;
  onDone: () => void;
}) {
  const [exiting, setExiting] = useState(false);

  // The set of recently-shown greetings + whether we've greeted before (→ returning user). Read once.
  const recent = useMemo<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(GREET_RECENT_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }, []);
  const isReturning = useMemo(() => {
    try {
      return localStorage.getItem(GREETED_KEY) === '1';
    } catch {
      return false;
    }
  }, []);

  // Chosen once on mount (while still the boot cover) so it stays stable when `reveal` flips true.
  // Exclude recently-shown languages so it genuinely rotates through the set instead of clustering.
  const greeting = useMemo(() => {
    const fresh = HELLOS.filter((h) => !recent.has(h.word));
    return pick(fresh.length ? fresh : HELLOS);
  }, [recent]);
  const subline = useMemo(() => {
    const name = userName?.trim();
    const named = [...SUBS_ANY_NAMED, ...(isReturning ? SUBS_RETURNING_NAMED : SUBS_NEW_NAMED)];
    const generic = [
      ...SUBS_ANY_GENERIC,
      ...(isReturning ? SUBS_RETURNING_GENERIC : SUBS_NEW_GENERIC)
    ];
    return name ? pick(named)(name) : pick(generic);
  }, [userName, isReturning]);

  // Once the greeting actually shows, remember it (so it's skipped next time) and mark that we've
  // greeted (so the next launch is treated as a returning user, not new).
  useEffect(() => {
    if (!reveal) return;
    try {
      const next = [greeting.word, ...Array.from(recent)].slice(0, 12);
      localStorage.setItem(GREET_RECENT_KEY, JSON.stringify([...new Set(next)]));
      localStorage.setItem(GREETED_KEY, '1');
    } catch {
      /* localStorage unavailable — greeting still works, just no rotation memory */
    }
  }, [reveal, greeting, recent]);

  const dismiss = useCallback(() => {
    setExiting(true);
    // Let the fade play out before we unmount and reveal the app underneath.
    window.setTimeout(onDone, 620);
  }, [onDone]);

  // Auto-dismiss once the greeting has fully drawn + a beat to read it. Only armed in greeting mode —
  // the plain boot cover stays until AppShell decides where the user is headed.
  useEffect(() => {
    if (!reveal) return;
    // Everything is fully inked by ~2.4s; hold until ~5.4s so there's a comfortable beat to read the
    // greeting, the message, and the language sign-off before it fades.
    const timer = window.setTimeout(dismiss, 4400);
    return () => window.clearTimeout(timer);
  }, [reveal, dismiss]);

  return createPortal(
    <div
      className={`greet-root${exiting ? ' is-exiting' : ''}${reveal ? ' is-greeting' : ''}`}
      role="dialog"
      aria-label="Welcome to Oplyr"
    >
      <style>{GREET_CSS}</style>
      <div className="greet-veil" />
      {reveal && (
        <>
          <button className="greet-close" type="button" onClick={dismiss} aria-label="Dismiss">
            <X size={18} strokeWidth={2} />
          </button>
          <div className="greet-stage">
            <div className="greet-word">{greeting.word}</div>
            <svg className="greet-swash" viewBox="0 0 260 24" fill="none" aria-hidden="true">
              <path
                d="M6 15 C 60 3, 120 22, 175 9 S 250 6, 254 12"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
            <div className="greet-sub">{subline}</div>
            <div className="greet-sign">
              <span className="greet-sign-dash" aria-hidden="true">
                ~
              </span>
              Greeting in {greeting.lang}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

const GREET_CSS = `
.greet-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  opacity: 1;
  transition: opacity 0.6s ease;
}
.greet-root.is-exiting {
  opacity: 0;
  pointer-events: none;
}

/* Warm, deep glass — plum + skin-tone hues over an inky base, blurring the app behind it. Near-opaque
   so the boot screens never show through (the anti-flash job); the depth reads as tinted glass. */
.greet-veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(115% 85% at 28% 18%, rgba(122, 59, 107, 0.42), transparent 60%),
    radial-gradient(120% 100% at 78% 88%, rgba(214, 142, 120, 0.30), transparent 55%),
    radial-gradient(90% 70% at 50% 40%, rgba(255, 255, 255, 0.05), transparent 60%),
    linear-gradient(160deg, #0b0a0f 0%, #16121c 55%, #0b0a0f 100%);
  backdrop-filter: blur(30px) saturate(125%);
  -webkit-backdrop-filter: blur(30px) saturate(125%);
}
/* Calm breathing while it's still just the boot cover (no greeting yet). */
.greet-root:not(.is-greeting) .greet-veil {
  animation: greet-breathe 3.2s ease-in-out infinite;
}
@keyframes greet-breathe {
  0%, 100% { opacity: 0.94; }
  50% { opacity: 1; }
}

.greet-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0 24px;
  overflow: visible;
}

.greet-word {
  font-family: 'Snell Roundhand', 'Bradley Hand', 'Segoe Script', cursive;
  font-weight: 700;
  font-size: clamp(76px, 14vw, 176px);
  line-height: 1.3;
  /* Room for the tall cursive caps + swashes so glyphs are never trimmed. */
  padding: 0.06em 0.16em;
  color: #f6efe8;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 40px rgba(246, 239, 232, 0.22), 0 0 1px rgba(246, 239, 232, 0.55);
  overflow: visible;
  /* Handwriting write-on: the ink is uncovered left → right. Top/bottom insets stay far negative so
     tall cursive capitals + descenders are never clipped; the left is slightly negative so a leading
     flourish on the first letter isn't cut off either. */
  clip-path: inset(-120% 100% -120% -8%);
  animation: greet-ink 1.9s cubic-bezier(0.22, 0.68, 0.2, 1) 0.15s forwards;
}
@keyframes greet-ink {
  from { clip-path: inset(-120% 100% -120% -8%); }
  to { clip-path: inset(-120% -16% -120% -8%); }
}

.greet-swash {
  display: block;
  width: clamp(180px, 26vw, 330px);
  height: 22px;
  margin: 4px auto 0;
  color: #cf94b0;
  filter: drop-shadow(0 1px 10px rgba(207, 148, 176, 0.35));
}
.greet-swash path {
  stroke-dasharray: 330;
  stroke-dashoffset: 330;
  animation: greet-swash 0.9s ease 1s forwards;
}
@keyframes greet-swash {
  to { stroke-dashoffset: 0; }
}

.greet-sub {
  margin-top: 22px;
  font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(16px, 1.9vw, 24px);
  font-weight: 400;
  letter-spacing: 0.01em;
  color: rgba(246, 239, 232, 0.76);
  opacity: 0;
  transform: translateY(7px);
  animation: greet-rise 0.7s ease 1.4s forwards;
}
/* Sign-off that drifts to the right, like an attribution under the greeting. Deliberately a refined
   italic serif — a different type family from the cursive greeting and the sans subline. */
.greet-sign {
  align-self: flex-end;
  margin-top: 32px;
  margin-right: clamp(6px, 5vw, 72px);
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  font-family: 'Hoefler Text', 'Baskerville', 'Iowan Old Style', 'Palatino', Georgia, serif;
  font-style: italic;
  font-size: clamp(17px, 2.1vw, 29px);
  font-weight: 500;
  letter-spacing: 0.015em;
  color: rgba(246, 239, 232, 0.66);
  opacity: 0;
  transform: translateY(7px);
  animation: greet-rise 0.8s ease 1.75s forwards;
}
.greet-sign-dash {
  font-style: normal;
  font-size: 1.15em;
  color: rgba(207, 148, 176, 0.9);
}
@keyframes greet-rise {
  to { opacity: 1; transform: translateY(0); }
}

.greet-close {
  position: absolute;
  top: 22px;
  right: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: rgba(246, 239, 232, 0.6);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
  opacity: 0;
  animation: greet-rise 0.6s ease 1.9s forwards;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}
.greet-close:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.13);
  border-color: rgba(255, 255, 255, 0.22);
}

@media (prefers-reduced-motion: reduce) {
  .greet-veil,
  .greet-word,
  .greet-swash path,
  .greet-sub,
  .greet-sign,
  .greet-close {
    animation: none;
  }
  .greet-word { clip-path: none; }
  .greet-swash path { stroke-dashoffset: 0; }
  .greet-sub,
  .greet-sign,
  .greet-close { opacity: 1; transform: none; }
}
`;
