import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import { CodeBlock } from '@/components/chat/CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';

/**
 * The ONE markdown renderer. Chat and the docs browser previously configured react-markdown
 * separately and had already drifted: chat overrode `pre` to strip the outer wrapper (CodeBlock
 * renders its own) while the docs browser did not, so every code block there came out inside nested
 * `<pre>` elements. Anything that changes how markdown looks belongs here, once.
 */

/** CodeBlock renders its own `<pre>`, so the one react-markdown emits has to be unwrapped. */
const PassThroughPre = ({ children }: { children?: ReactNode }) => <>{children}</>;

/** Routes ```mermaid fences to a diagram and everything else to the normal code block. */
function CodeOrDiagram({
  className,
  children,
  ...props
}: { className?: string; children?: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  // rehype-highlight leaves unknown languages untouched, so a mermaid fence still arrives as a
  // plain string here while a `ts` fence arrives as an array of token elements.
  if (/language-mermaid/.test(className ?? '') && typeof children === 'string') {
    return <MermaidDiagram source={children} />;
  }
  return (
    <CodeBlock className={className} {...props}>
      {children}
    </CodeBlock>
  );
}

const COMPONENTS = { code: CodeOrDiagram, pre: PassThroughPre };

export function MarkdownContent({
  children,
  variant
}: {
  children: string;
  /**
   * `chat` treats a single newline as a line break, because that is what an agent means when it
   * writes statements on their own lines — under strict CommonMark they collapse into one run-on
   * paragraph. `doc` keeps CommonMark exactly, since a real .md file in the user's repo was authored
   * with those rules and would gain spurious breaks otherwise.
   */
  variant: 'chat' | 'doc';
}) {
  return (
    <Markdown
      remarkPlugins={
        variant === 'chat' ? [remarkGfm, remarkMath, remarkBreaks] : [remarkGfm, remarkMath]
      }
      // KaTeX before highlight: it consumes the math nodes, so highlight never sees them.
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={COMPONENTS}
    >
      {children}
    </Markdown>
  );
}
