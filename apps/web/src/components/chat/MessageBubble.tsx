import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/cn';
import { CodeBlock } from './CodeBlock';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import type { MessageEntry } from '@/containers/voice-console/lib/types';
import { formatClock } from '@/containers/voice-console/lib/helpers';

interface MessageBubbleProps {
  message: MessageEntry;
  isStreaming?: boolean;
  typedText?: string;
  apiBaseUrl?: string;
  /** Current agent action shown while this bubble is streaming (e.g. "Reading page.tsx"). */
  liveActivity?: string | null;
  /** Chronological log of the turn's actions, for the expandable timeline. */
  activityLog?: string[];
}

export function MessageBubble({
  message,
  isStreaming,
  typedText,
  liveActivity,
  activityLog
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const displayText = typedText ?? message.text;
  const hasText = displayText.trim().length > 0;

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-accent-muted border border-accent-border text-text-primary'
            : 'bg-surface-1 border border-border text-text-primary'
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayText}</p>
        ) : (
          <>
            <div className="text-sm leading-relaxed prose-sm">
              {isStreaming && !hasText ? (
                // No text yet — surface what the agent is actually doing instead of a blank bubble.
                <AgentActivityTimeline
                  activities={activityLog ?? []}
                  working
                  current={liveActivity}
                />
              ) : (
                <>
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
                </>
              )}
            </div>
            {isStreaming && hasText && (
              // Text is flowing — keep the action timeline visible as a subtle caption beneath it.
              <div className="mt-2 border-t border-border/50 pt-2">
                <AgentActivityTimeline
                  activities={activityLog ?? []}
                  working
                  current={liveActivity}
                />
              </div>
            )}
          </>
        )}

        {message.attachments?.length ? (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
            {message.attachments.map((att) => (
              <span
                key={att.id}
                className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-text-secondary"
              >
                {att.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <span className="text-[10px] text-text-tertiary px-1">
        {message.source === 'voice' ? '\uD83C\uDF99 ' : ''}
        {formatClock(message.createdAt)}
      </span>
    </div>
  );
}
