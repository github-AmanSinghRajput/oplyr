import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/providers/ThemeProvider';

/**
 * Renders a ```mermaid fence as a diagram.
 *
 * Two things drive the design:
 *
 *  - **The source is agent-generated**, so it is frequently invalid — and it arrives a character at
 *    a time while a reply streams, which means most render attempts during a turn WILL fail. A
 *    failed diagram must therefore degrade to the code it came from, never blank the message or
 *    surface a stack trace.
 *  - **Mermaid is large** (hundreds of KB), so it is imported lazily on first use. A conversation
 *    with no diagrams never pays for it.
 */
export function MermaidDiagram({ source }: { source: string }) {
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);

  useEffect(() => {
    const seq = ++renderSeq.current;
    let cancelled = false;
    setFailed(false);

    const trimmed = source.trim();
    if (!trimmed) {
      setSvg(null);
      return;
    }

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          // The diagram text comes from an agent, so never let it inject markup or scripts.
          securityLevel: 'strict',
          theme: theme === 'light' ? 'neutral' : 'dark',
          fontFamily: 'inherit'
        });

        // `parse` throws on invalid syntax without leaving anything in the DOM, which is what makes
        // the streaming case survivable — we find out it's incomplete before trying to draw it.
        await mermaid.parse(trimmed);
        const { svg: rendered } = await mermaid.render(`mmd-${seq}-${Date.now()}`, trimmed);
        if (!cancelled && seq === renderSeq.current) {
          setSvg(rendered);
        }
      } catch {
        // Invalid or still-streaming: fall back to showing the source.
        if (!cancelled && seq === renderSeq.current) {
          setSvg(null);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, theme]);

  if (svg) {
    return (
      <div
        ref={hostRef}
        className="my-3 flex justify-center overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-1 p-3"
        // Mermaid returns an SVG string and we render it under securityLevel 'strict', which strips
        // scripts and inline handlers from the diagram source.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  // Not a diagram (yet). Show the source so nothing is ever lost.
  return (
    <div className="my-3 overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface-1">
      <div className="flex items-center justify-between border-b border-border bg-surface-2/50 px-3 py-1.5">
        <span className="font-mono text-xs text-text-tertiary">mermaid</span>
        {failed ? <span className="text-xs text-text-tertiary">diagram not valid yet</span> : null}
      </div>
      <pre className="overflow-x-auto p-3">
        <code className="text-sm leading-relaxed">{source}</code>
      </pre>
    </div>
  );
}
