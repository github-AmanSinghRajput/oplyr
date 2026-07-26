import { type FormEvent } from 'react';
import { MessageList } from '@/components/chat/MessageList';
import { ChatComposer } from '@/components/chat/ChatComposer';
import type {
  AssistantProviderId,
  ChatAttachment,
  MessageEntry
} from '@/containers/voice-console/lib/types';

interface ChatScreenProps {
  apiBaseUrl: string;
  messages: MessageEntry[];
  textInput: string;
  draftAttachments: ChatAttachment[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  typedMessages: Record<string, string>;
  liveActivity: string | null;
  activityLog: string[];
  disabled: boolean;
  onTextInputChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onStartVoice: () => void;
  onCancelStreaming: () => void;
  mentionAgents: AssistantProviderId[];
}

export function ChatScreen({
  apiBaseUrl,
  messages,
  textInput,
  draftAttachments,
  isStreaming,
  streamingMessageId,
  typedMessages,
  liveActivity,
  activityLog,
  disabled,
  onTextInputChange,
  onSubmit,
  onAttachFiles,
  onRemoveAttachment,
  onStartVoice,
  onCancelStreaming,
  mentionAgents
}: ChatScreenProps) {
  return (
    <div className="flex flex-col h-[calc(100vh-var(--topbar-height)-3rem)] min-h-0 overflow-hidden">
      <MessageList
        messages={messages}
        streamingMessageId={streamingMessageId}
        typedMessages={typedMessages}
        apiBaseUrl={apiBaseUrl}
        liveActivity={liveActivity}
        activityLog={activityLog}
      />
      <div data-tour="composer">
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
          mentionAgents={mentionAgents}
        />
      </div>
    </div>
  );
}
