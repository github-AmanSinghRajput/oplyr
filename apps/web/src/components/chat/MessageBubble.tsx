import { type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/cn';
import '../markdown.css';
import { CodeBlock } from './CodeBlock';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import { MemoryChip } from './MemoryChip';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import type { AssistantProviderId, MessageEntry } from '@/containers/voice-console/lib/types';
import { formatClock } from '@/containers/voice-console/lib/helpers';

// Short agent names for the room's author label (Agentic Chat).
const AGENT_LABEL: Record<AssistantProviderId, string> = {
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini'
};

// react-markdown wraps fenced code in a default <pre>; CodeBlock renders its OWN <pre> wrapper, so
// without this passthrough the block gets double-wrapped (invalid nesting + a doubled box/margins).
// This makes CodeBlock the single source of truth for block rendering.
const MarkdownPre = ({ children }: { children?: ReactNode }) => <>{children}</>;

interface MessageBubbleProps {
  message: MessageEntry;
  isStreaming?: boolean;
  typedText?: string;
  apiBaseUrl?: string;
  /** Current agent action shown while this bubble is streaming (e.g. "Reading page.tsx"). */
  liveActivity?: string | null;
  /** Chronological log of the turn's actions, for the expandable timeline. */
  activityLog?: string[];
  /** Show the authoring agent's logo + name (Agentic Chat room). Off on the voice screen, which has
   *  its own agent header. */
  showAuthor?: boolean;
}

export function MessageBubble({
  message,
  isStreaming,
  typedText,
  liveActivity,
  activityLog,
  showAuthor
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
            {showAuthor && message.authorProviderId ? (
              <div className="mb-1.5 flex items-center gap-1.5">
                <ProviderLogo providerId={message.authorProviderId} size="sm" />
                <span className="text-[11px] font-semibold text-text-secondary">
                  {AGENT_LABEL[message.authorProviderId]}
                </span>
              </div>
            ) : null}
            <div className="md-body text-sm leading-relaxed">
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
                    components={{ code: CodeBlock, pre: MarkdownPre }}
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
            {!isStreaming && message.memory?.atoms?.length ? (
              <MemoryChip atoms={message.memory.atoms} />
            ) : null}
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
