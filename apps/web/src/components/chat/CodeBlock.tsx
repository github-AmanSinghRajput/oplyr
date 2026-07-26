import { useCallback, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
}

// Last-resort clipboard write for environments where the async Clipboard API is unavailable/blocked.
function fallbackCopy(text: string) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(el);
  }
}

export function CodeBlock({
  children,
  className,
  ...props
}: CodeBlockProps & React.HTMLAttributes<HTMLElement>) {
  const isInline = !className;
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const handleCopy = useCallback(() => {
    // rehype-highlight turns the code into token <span>s, so `children` is an array of React
    // elements — String(children) would copy "[object Object]…". Read the rendered text instead.
    const text = (codeRef.current?.textContent ?? '').replace(/\n$/, '');
    const flash = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(flash, () => {
        fallbackCopy(text);
        flash();
      });
    } else {
      fallbackCopy(text);
      flash();
    }
  }, []);

  if (isInline) {
    return (
      <code
        className="px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-surface-2 text-accent text-[0.85em] font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  // rehype-highlight adds both `hljs` and `language-x` classes — pull out only the real language.
  const lang = /language-([\w-]+)/.exec(className ?? '')?.[1] ?? '';

  return (
    <div className="relative group rounded-[var(--radius-control)] overflow-hidden border border-border bg-surface-1 my-3">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-2/50">
        <span className="text-xs text-text-tertiary font-mono">{lang || 'code'}</span>
        <button
          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          onClick={handleCopy}
          type="button"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3">
        <code ref={codeRef} className={cn('text-sm leading-relaxed', className)} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}
