import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { OplyrLogoMark } from '@/components/branding/OplyrLogoMark';
import { useStatus } from '@/providers/StatusProvider';
import type { MessageEntry } from '@/containers/voice-console/lib/types';

const STARTERS = [
  'Explain how this project is put together',
  'What changed most recently, and why?',
  'Find where this handles errors'
];

interface MessageListProps {
  messages: MessageEntry[];
  streamingMessageId?: string | null;
  typedMessages?: Record<string, string>;
  apiBaseUrl?: string;
  liveActivity?: string | null;
  activityLog?: string[];
  /** Fills the composer from a starter prompt on the empty state. */
  onSuggestion?: (text: string) => void;
}

export function MessageList({
  messages,
  streamingMessageId,
  typedMessages,
  apiBaseUrl,
  liveActivity,
  activityLog,
  onSuggestion
}: MessageListProps) {
  const { status } = useStatus();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lastMessage = messages[messages.length - 1];
  const lastMessageSignature =
    lastMessage == null
      ? 'empty'
      : `${lastMessage.id}:${typedMessages?.[lastMessage.id] ?? lastMessage.text}`;

  useEffect(() => {
    if (!showScrollButton) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lastMessageSignature, showScrollButton]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollButton(distanceFromBottom > 100);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
      {messages.length === 0 ? (
        <EmptyChat
          displayName={status?.appSettings.displayName ?? null}
          workspaceLabel={status?.workspace?.projectName ?? null}
          onSuggestion={onSuggestion}
        />
      ) : null}
      <div className="flex flex-col gap-4">
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i === messages.length - 1 ? 0.05 : 0 }}
          >
            <MessageBubble
              message={msg}
              isStreaming={msg.id === streamingMessageId}
              typedText={typedMessages?.[msg.id]}
              apiBaseUrl={apiBaseUrl}
              liveActivity={msg.id === streamingMessageId ? liveActivity : null}
              activityLog={msg.id === streamingMessageId ? activityLog : undefined}
              showAuthor
            />
          </motion.div>
        ))}
      </div>
      <div ref={bottomRef} />

      <AnimatePresence>
        {showScrollButton && (
          <motion.div
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full shadow-2"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              <ArrowDown size={14} className="mr-1" /> New messages
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * What a connected project looks like before the first message. A blank scroll area gave no hint
 * that anything was ready, or what to ask for.
 */
function EmptyChat({
  displayName,
  workspaceLabel,
  onSuggestion
}: {
  displayName: string | null;
  workspaceLabel: string | null;
  onSuggestion?: (text: string) => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex items-center gap-3">
        <OplyrLogoMark className="h-8 w-8 shrink-0" />
        <h2 className="font-serif text-[30px] leading-none text-text-primary">
          {displayName ? `Welcome, ${displayName}` : 'Welcome to Oplyr'}
        </h2>
      </div>
      <p className="mt-3 text-sm text-text-secondary">
        {workspaceLabel
          ? `Ask anything about ${workspaceLabel}. Nothing is written without your approval.`
          : 'Ask anything about your project. Nothing is written without your approval.'}
      </p>
      {onSuggestion ? (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onSuggestion(starter)}
              className="rounded-pill border border-border px-3.5 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent-border hover:text-text-primary"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
