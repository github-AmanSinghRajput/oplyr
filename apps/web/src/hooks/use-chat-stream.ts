import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/providers/ApiProvider';
import { useToast } from '@/providers/ToastProvider';
import { mergeUniqueMessages } from '@/containers/voice-console/lib/helpers';
import type {
  ApprovalRequiredResponse,
  ChatAttachment,
  ChatStreamEvent,
  MessageEntry,
  ReplyResponse,
} from '@/containers/voice-console/lib/types';

const TYPING_TICK_MS = 16;

export interface ChatStreamHandle {
  messages: MessageEntry[];
  setMessages: React.Dispatch<React.SetStateAction<MessageEntry[]>>;
  typedMessageText: Record<string, string>;
  typingTargets: Record<string, string>;
  activeChatStreamMessageId: string | null;
  draftAttachments: ChatAttachment[];
  setDraftAttachments: React.Dispatch<React.SetStateAction<ChatAttachment[]>>;
  textInput: string;
  setTextInput: (value: string) => void;
  isSubmittingTurn: boolean;
  isStreaming: boolean;
  streamChatMessage: (
    message: string,
    source: 'voice' | 'text',
    options?: {
      voiceTurnId?: string;
      attachmentIds?: string[];
      onStarted?: (event: Extract<ChatStreamEvent, { type: 'started' }>) => void;
      onDelta?: (event: Extract<ChatStreamEvent, { type: 'delta' }>) => void;
      onActivity?: (event: Extract<ChatStreamEvent, { type: 'activity' }>) => void;
    },
  ) => Promise<ReplyResponse | ApprovalRequiredResponse>;
  abortActiveChatStream: () => void;
  handleAttachFiles: (files: File[]) => Promise<void>;
  handleRemoveDraftAttachment: (attachmentId: string) => void;
  loadLogs: () => Promise<void>;
  activeVoiceAssistantMessageIdRef: React.MutableRefObject<string | null>;
}

export function useChatStream(): ChatStreamHandle {
  const { service } = useApi();
  const { pushToast } = useToast();

  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<ChatAttachment[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [typedMessageText, setTypedMessageText] = useState<Record<string, string>>({});
  const [typingTargets, setTypingTargets] = useState<Record<string, string>>({});
  const [activeChatStreamMessageId, setActiveChatStreamMessageId] = useState<string | null>(null);

  const chatStreamAbortRef = useRef<AbortController | null>(null);
  const activeChatStreamDraftRef = useRef<{
    userMessageId: string;
    assistantMessageId: string;
  } | null>(null);
  const activeVoiceAssistantMessageIdRef = useRef<string | null>(null);

  // Typing animation effect
  useEffect(() => {
    const typingEntries = Object.entries(typingTargets);
    if (typingEntries.length === 0) return;

    const interval = window.setInterval(() => {
      setTypedMessageText((current) => {
        let changed = false;
        const next = { ...current };
        for (const [messageId, targetText] of typingEntries) {
          const currentText = next[messageId] ?? '';
          if (currentText === targetText) continue;
          const step = Math.max(1, Math.ceil((targetText.length - currentText.length) / 12));
          next[messageId] = targetText.slice(0, Math.min(targetText.length, currentText.length + step));
          changed = true;
        }
        return changed ? next : current;
      });
    }, TYPING_TICK_MS);

    return () => window.clearInterval(interval);
  }, [typingTargets]);

  function clearTypingStateForMessage(messageId: string) {
    setTypingTargets((current) => {
      if (!(messageId in current)) return current;
      const next = { ...current };
      delete next[messageId];
      return next;
    });
    setTypedMessageText((current) => {
      if (!(messageId in current)) return current;
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  function clearActiveChatStreamDraft(options: { removeMessages: boolean }) {
    const draft = activeChatStreamDraftRef.current;
    if (!draft) return;

    activeChatStreamDraftRef.current = null;
    setActiveChatStreamMessageId((current) =>
      current === draft.assistantMessageId ? null : current,
    );
    clearTypingStateForMessage(draft.assistantMessageId);

    if (activeVoiceAssistantMessageIdRef.current === draft.assistantMessageId) {
      activeVoiceAssistantMessageIdRef.current = null;
    }

    if (options.removeMessages) {
      setMessages((current) =>
        current.filter(
          (message) =>
            message.id !== draft.userMessageId && message.id !== draft.assistantMessageId,
        ),
      );
    }
  }

  const abortActiveChatStream = useCallback(() => {
    chatStreamAbortRef.current?.abort();
    chatStreamAbortRef.current = null;
    clearActiveChatStreamDraft({ removeMessages: true });
  }, []);

  const streamChatMessage = useCallback(
    async (
      message: string,
      source: 'voice' | 'text',
      options: {
        voiceTurnId?: string;
        attachmentIds?: string[];
        onStarted?: (event: Extract<ChatStreamEvent, { type: 'started' }>) => void;
        onDelta?: (event: Extract<ChatStreamEvent, { type: 'delta' }>) => void;
        onActivity?: (event: Extract<ChatStreamEvent, { type: 'activity' }>) => void;
      } = {},
    ): Promise<ReplyResponse | ApprovalRequiredResponse> => {
      abortActiveChatStream();
      const abortController = new AbortController();
      chatStreamAbortRef.current = abortController;
      let result: ReplyResponse | ApprovalRequiredResponse | null = null;

      try {
        try {
          await service.streamMessage(
            message,
            source,
            (event) => {
              if (event.type === 'started') {
                activeChatStreamDraftRef.current = {
                  userMessageId: event.userMessage.id,
                  assistantMessageId: event.assistantMessage.id,
                };
                setActiveChatStreamMessageId(event.assistantMessage.id);
                setMessages((current) =>
                  mergeUniqueMessages(current, [event.userMessage, event.assistantMessage]),
                );
                setTypingTargets((current) => ({
                  ...current,
                  [event.assistantMessage.id]: event.assistantMessage.text,
                }));
                setTypedMessageText((current) => ({
                  ...current,
                  [event.assistantMessage.id]: current[event.assistantMessage.id] ?? '',
                }));
                options.onStarted?.(event);
                return;
              }

              if (event.type === 'delta') {
                setMessages((current) =>
                  mergeUniqueMessages(current, [event.assistantMessage]),
                );
                setTypingTargets((current) => ({
                  ...current,
                  [event.assistantMessage.id]: event.assistantMessage.text,
                }));
                options.onDelta?.(event);
                return;
              }

              if (event.type === 'activity') {
                options.onActivity?.(event);
                return;
              }

              if (event.type === 'completed') {
                result = event.result;
                setMessages((current) =>
                  mergeUniqueMessages(current, [
                    event.result.userMessage,
                    event.result.assistantMessage,
                  ]),
                );
                clearActiveChatStreamDraft({ removeMessages: false });
                return;
              }

              throw new Error(event.error);
            },
            {
              signal: abortController.signal,
              voiceTurnId: options.voiceTurnId,
              attachments: options.attachmentIds ?? [],
            },
          );
        } catch (streamError) {
          if (abortController.signal.aborted) throw streamError;
          console.warn('[chat][stream] stream failed, falling back to batch', streamError);
        }

        if (!result) {
          clearActiveChatStreamDraft({ removeMessages: true });
          const batchResult = await service.sendMessage(
            message,
            source,
            options.voiceTurnId,
            options.attachmentIds ?? [],
          );
          setMessages((current) =>
            mergeUniqueMessages(current, [batchResult.userMessage, batchResult.assistantMessage]),
          );
          clearTypingStateForMessage(batchResult.assistantMessage.id);
          return batchResult;
        }

        const completedResult = result as ReplyResponse | ApprovalRequiredResponse;
        clearTypingStateForMessage(completedResult.assistantMessage.id);
        return completedResult;
      } finally {
        if (chatStreamAbortRef.current === abortController) {
          chatStreamAbortRef.current = null;
        }
        if (!result && !abortController.signal.aborted) {
          setActiveChatStreamMessageId(null);
        }
      }
    },
    [service, abortActiveChatStream],
  );

  const handleAttachFiles = useCallback(
    async (files: File[]) => {
      const maxAttachments = 8;
      const availableSlots = Math.max(0, maxAttachments - draftAttachments.length);
      const nextFiles = files.slice(0, availableSlots);
      if (nextFiles.length === 0) return;

      try {
        const uploaded = await Promise.all(
          nextFiles.map((file) => service.uploadChatAttachment(file)),
        );
        setDraftAttachments((current) => [...current, ...uploaded]);
      } catch {
        pushToast('error', 'Attachment upload failed', 'VOCOD could not attach one of those files.');
      }
    },
    [service, pushToast, draftAttachments.length],
  );

  const handleRemoveDraftAttachment = useCallback((attachmentId: string) => {
    setDraftAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    );
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const body = await service.getLogs();
      setMessages((current) => mergeUniqueMessages(current, body.messages));
    } catch {
      // Silent fail — logs are non-critical
    }
  }, [service]);

  return {
    messages,
    setMessages,
    typedMessageText,
    typingTargets,
    activeChatStreamMessageId,
    draftAttachments,
    setDraftAttachments,
    textInput,
    setTextInput,
    isSubmittingTurn,
    isStreaming: Boolean(activeChatStreamMessageId),
    streamChatMessage,
    abortActiveChatStream,
    handleAttachFiles,
    handleRemoveDraftAttachment,
    loadLogs,
    activeVoiceAssistantMessageIdRef,
  };
}
