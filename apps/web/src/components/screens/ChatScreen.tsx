import { type FormEvent } from 'react';
import { MessageList } from '@/components/chat/MessageList';
import { ChatComposer } from '@/components/chat/ChatComposer';
import type { ChatAttachment, MessageEntry } from '@/containers/voice-console/lib/types';

interface ChatScreenProps {
  apiBaseUrl: string;
  messages: MessageEntry[];
  textInput: string;
  draftAttachments: ChatAttachment[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  typedMessages: Record<string, string>;
  disabled: boolean;
  onTextInputChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onStartVoice: () => void;
  onCancelStreaming: () => void;
}

export function ChatScreen({
  apiBaseUrl,
  messages,
  textInput,
  draftAttachments,
  isStreaming,
  streamingMessageId,
  typedMessages,
  disabled,
  onTextInputChange,
  onSubmit,
  onAttachFiles,
  onRemoveAttachment,
  onStartVoice,
  onCancelStreaming
}: ChatScreenProps) {
  return (
    <div className="flex flex-col h-[calc(100vh-var(--topbar-height))]">
      <MessageList
        messages={messages}
        streamingMessageId={streamingMessageId}
        typedMessages={typedMessages}
        apiBaseUrl={apiBaseUrl}
      />
      <ChatComposer
        value={textInput}
        onChange={onTextInputChange}
        onSubmit={onSubmit}
        onAttachFiles={onAttachFiles}
        onRemoveAttachment={onRemoveAttachment}
        onStartVoice={onStartVoice}
        onCancelStreaming={onCancelStreaming}
        draftAttachments={draftAttachments}
        disabled={disabled}
        isStreaming={isStreaming}
      />
    </div>
  );
}
