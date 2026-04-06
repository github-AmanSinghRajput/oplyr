import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/cn';
import { CodeBlock } from './CodeBlock';
import type { MessageEntry } from '@/containers/voice-console/lib/types';
import { formatClock } from '@/containers/voice-console/lib/helpers';

interface MessageBubbleProps {
  message: MessageEntry;
  isStreaming?: boolean;
  typedText?: string;
  apiBaseUrl?: string;
}

export function MessageBubble({ message, isStreaming, typedText }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const displayText = typedText ?? message.text;

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-3',
        isUser
          ? 'bg-accent-muted border border-accent-border text-text-primary'
          : 'bg-surface-1 border border-border text-text-primary',
      )}>
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayText}</p>
        ) : (
          <div className="text-sm leading-relaxed prose-sm">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{ code: CodeBlock }}
            >
              {displayText}
            </Markdown>
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-accent rounded-full animate-pulse ml-0.5" />
            )}
          </div>
        )}

        {message.attachments?.length ? (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
            {message.attachments.map((att) => (
              <span key={att.id} className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-text-secondary">
                {att.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <span className="text-[10px] text-text-tertiary px-1">
        {message.source === 'voice' ? '\uD83C\uDF99 ' : ''}{formatClock(message.createdAt)}
      </span>
    </div>
  );
}
