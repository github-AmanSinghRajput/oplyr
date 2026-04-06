import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import type { MessageEntry } from '@/containers/voice-console/lib/types';

interface MessageListProps {
  messages: MessageEntry[];
  streamingMessageId?: string | null;
  typedMessages?: Record<string, string>;
  apiBaseUrl?: string;
}

export function MessageList({ messages, streamingMessageId, typedMessages, apiBaseUrl }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    if (!showScrollButton) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, showScrollButton]);

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
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
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
              className="rounded-full shadow-lg"
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
