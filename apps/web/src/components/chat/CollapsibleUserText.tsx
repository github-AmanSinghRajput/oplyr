import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** Collapsed height, in pixels. Roughly eight lines: enough to recognise what you sent. */
const COLLAPSED_HEIGHT = 168;
/** Ignore a few pixels of overflow, or a message that just clears the line looks truncated. */
const SLACK = 12;

/**
 * A user message that stays short until you ask for the rest.
 *
 * Pasting a stack trace or a page of logs used to push the reply you were waiting for off the
 * screen, and you already know what you sent — the answer is the part worth the space. So anything
 * past about eight lines is clipped, faded out at the bottom, and expandable.
 *
 * The control only appears when the text genuinely overflows, measured rather than guessed from
 * character count: a wrapped paragraph and a pasted log of the same length occupy very different
 * heights, and a "Show more" button under a message that is already whole is its own small lie.
 */
export function CollapsibleUserText({ text }: { text: string }) {
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const node = bodyRef.current;
    if (!node) return;
    setOverflowing(node.scrollHeight > COLLAPSED_HEIGHT + SLACK);
  }, []);

  useEffect(() => {
    measure();
    const node = bodyRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    // The bubble is a percentage of the pane, so the same text wraps differently as the window or
    // the sidebar changes. Re-measure rather than decide once on mount.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, text]);

  const clipped = overflowing && !expanded;

  return (
    <div>
      <p
        ref={bodyRef}
        className="text-sm leading-relaxed whitespace-pre-wrap"
        style={
          clipped
            ? {
                maxHeight: COLLAPSED_HEIGHT,
                overflow: 'hidden',
                // Fade the TEXT's own alpha rather than laying a coloured gradient over it. The
                // bubble's fill is a translucent token, so an overlay in that colour cannot hide
                // anything — it only tints. A mask needs no knowledge of what is behind it and so
                // is correct in both themes and over any background.
                maskImage: 'linear-gradient(to bottom, black 62%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 62%, transparent 100%)'
              }
            : undefined
        }
      >
        {text}
      </p>

      {overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-1 flex items-center gap-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Show less' : 'Show full message'}
        </button>
      ) : null}
    </div>
  );
}
