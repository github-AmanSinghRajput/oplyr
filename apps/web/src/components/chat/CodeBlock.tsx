import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
}

export function CodeBlock({
  children,
  className,
  ...props
}: CodeBlockProps & React.HTMLAttributes<HTMLElement>) {
  const isInline = !className;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = String(children).replace(/\n$/, '');
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [children]);

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

  const lang = (className ?? '').replace('language-', '');

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
        <code className={cn('text-sm leading-relaxed', className)} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}
