import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/providers/ApiProvider';
import { useToast } from '@/providers/ToastProvider';
import { mergeUniqueMessages } from '@/containers/voice-console/lib/helpers';
import type {
  ApprovalRequiredResponse,
  AssistantErrorKind,
  ChatAttachment,
  ChatStreamEvent,
  MessageEntry,
  ReplyResponse
} from '@/containers/voice-console/lib/types';

const TYPING_TICK_MS = 16;

/** Carries the assistant error classification (e.g. rate_limit) up from a stream 'error' event. */
class ChatStreamError extends Error {
  readonly kind: AssistantErrorKind;
  constructor(message: string, kind: AssistantErrorKind = 'unknown') {
    super(message);
    this.name = 'ChatStreamError';
    this.kind = kind;
  }
}

export interface ChatStreamHandle {
  messages: MessageEntry[];
  setMessages: React.Dispatch<React.SetStateAction<MessageEntry[]>>;
  typedMessageText: Record<string, string>;
  typingTargets: Record<string, string>;
  activeChatStreamMessageId: string | null;
  /** The agent's current streamed action (e.g. "Reading page.tsx"), or null when not streaming. */
  liveActivity: string | null;
  /** Chronological log of the current turn's actions, for the expandable activity timeline. */
  activityLog: string[];
  draftAttachments: ChatAttachment[];
  setDraftAttachments: React.Dispatch<React.SetStateAction<ChatAttachment[]>>;
  textInput: string;
  setTextInput: (value: string) => void;
  isSubmittingTurn: boolean;
  isStreaming: boolean;
  /** True for the entire turn (send → resolve), across chat + voice. Use to gate single-flight. */
  isTurnActive: boolean;
  streamChatMessage: (
    message: string,
    source: 'voice' | 'text',
    options?: {
      voiceTurnId?: string;
      attachmentIds?: string[];
      onStarted?: (event: Extract<ChatStreamEvent, { type: 'started' }>) => void;
      onDelta?: (event: Extract<ChatStreamEvent, { type: 'delta' }>) => void;
      onActivity?: (event: Extract<ChatStreamEvent, { type: 'activity' }>) => void;
    }
  ) => Promise<ReplyResponse | ApprovalRequiredResponse>;
  abortActiveChatStream: () => void;
  resetChatState: () => void;
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
  const [isSubmittingTurn] = useState(false);
  // True for the WHOLE turn — from the moment a message is sent until it resolves — including the
  // pre-stream gap. This is the single source of truth for "an agent turn is in flight", shared by
  // the chat and voice views so both reflect the same turn and neither can start a second one.
  const [isTurnActive, setIsTurnActive] = useState(false);
  const [typedMessageText, setTypedMessageText] = useState<Record<string, string>>({});
  const [typingTargets, setTypingTargets] = useState<Record<string, string>>({});
  const [activeChatStreamMessageId, setActiveChatStreamMessageId] = useState<string | null>(null);
  const [liveActivity, setLiveActivity] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<string[]>([]);

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
          next[messageId] = targetText.slice(
            0,
            Math.min(targetText.length, currentText.length + step)
          );
          changed = true;
        }
        return changed ? next : current;
      });
    }, TYPING_TICK_MS);

    return () => window.clearInterval(interval);
  }, [typingTargets]);

  const clearTypingStateForMessage = useCallback((messageId: string) => {
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
  }, []);

  const clearActiveChatStreamDraft = useCallback(
    (options: { removeMessages: boolean }) => {
      const draft = activeChatStreamDraftRef.current;
      if (!draft) return;

      activeChatStreamDraftRef.current = null;
      setActiveChatStreamMessageId((current) =>
        current === draft.assistantMessageId ? null : current
      );
      setLiveActivity(null);
      clearTypingStateForMessage(draft.assistantMessageId);

      if (activeVoiceAssistantMessageIdRef.current === draft.assistantMessageId) {
        activeVoiceAssistantMessageIdRef.current = null;
      }

      if (options.removeMessages) {
        setMessages((current) =>
          current.filter(
            (message) =>
              message.id !== draft.userMessageId && message.id !== draft.assistantMessageId
          )
        );
      }
    },
    [clearTypingStateForMessage]
  );

  const abortActiveChatStream = useCallback(() => {
    chatStreamAbortRef.current?.abort();
    chatStreamAbortRef.current = null;
    clearActiveChatStreamDraft({ removeMessages: true });
    setIsTurnActive(false);
    setActiveChatStreamMessageId(null);
    setLiveActivity(null);
  }, [clearActiveChatStreamDraft]);

  const resetChatState = useCallback(() => {
    chatStreamAbortRef.current?.abort();
    chatStreamAbortRef.current = null;
    activeChatStreamDraftRef.current = null;
    activeVoiceAssistantMessageIdRef.current = null;
    setMessages([]);
    setDraftAttachments([]);
    setTextInput('');
    setIsTurnActive(false);
    setTypedMessageText({});
    setTypingTargets({});
    setActiveChatStreamMessageId(null);
    setLiveActivity(null);
    setActivityLog([]);
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
      } = {}
    ): Promise<ReplyResponse | ApprovalRequiredResponse> => {
      abortActiveChatStream();
      const abortController = new AbortController();
      chatStreamAbortRef.current = abortController;
      setIsTurnActive(true);
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
                  assistantMessageId: event.assistantMessage.id
                };
                setActiveChatStreamMessageId(event.assistantMessage.id);
                setLiveActivity(null);
                setActivityLog([]);
                setMessages((current) =>
                  mergeUniqueMessages(current, [event.userMessage, event.assistantMessage])
                );
                setTypingTargets((current) => ({
                  ...current,
                  [event.assistantMessage.id]: event.assistantMessage.text
                }));
                setTypedMessageText((current) => ({
                  ...current,
                  [event.assistantMessage.id]: current[event.assistantMessage.id] ?? ''
                }));
                options.onStarted?.(event);
                return;
              }

              if (event.type === 'delta') {
                setMessages((current) => mergeUniqueMessages(current, [event.assistantMessage]));
                setTypingTargets((current) => ({
                  ...current,
                  [event.assistantMessage.id]: event.assistantMessage.text
                }));
                options.onDelta?.(event);
                return;
              }

              if (event.type === 'activity') {
                setLiveActivity(event.activity);
                setActivityLog((current) => {
                  if (current[current.length - 1] === event.activity) return current;
                  return [...current, event.activity].slice(-40);
                });
                options.onActivity?.(event);
                return;
              }

              if (event.type === 'completed') {
                result = event.result;
                const draft = activeChatStreamDraftRef.current;
                setMessages((current) => {
                  // The write path streams under a placeholder id, then finalizes under a NEW id.
                  // Drop the now-orphaned empty placeholder so it doesn't linger as a blank bubble.
                  const withoutStub =
                    draft && draft.assistantMessageId !== event.result.assistantMessage.id
                      ? current.filter((message) => message.id !== draft.assistantMessageId)
                      : current;
                  return mergeUniqueMessages(withoutStub, [
                    event.result.userMessage,
                    event.result.assistantMessage
                  ]);
                });
                clearActiveChatStreamDraft({ removeMessages: false });
                return;
              }

              throw new ChatStreamError(event.error, event.errorKind);
            },
            {
              signal: abortController.signal,
              voiceTurnId: options.voiceTurnId,
              attachments: options.attachmentIds ?? []
            }
          );
        } catch (streamError) {
          if (abortController.signal.aborted) throw streamError;
          // On a rate limit, surface a clear notice and DON'T fall back to batch — a retry would
          // just hit the same limit. The friendly message already names the agent + reset time.
          if (streamError instanceof ChatStreamError && streamError.kind === 'rate_limit') {
            clearActiveChatStreamDraft({ removeMessages: true });
            pushToast('error', 'AI limit reached', streamError.message);
            throw streamError; // caller restores the input so the user can retry later
          }
          console.warn('[chat][stream] stream failed, falling back to batch', streamError);
        }

        if (!result) {
          clearActiveChatStreamDraft({ removeMessages: true });
          let batchResult;
          try {
            batchResult = await service.sendMessage(
              message,
              source,
              options.voiceTurnId,
              options.attachmentIds ?? []
            );
          } catch (batchError) {
            // Never fail silently — the turn is over and the input is restored, so tell the user why.
            const message =
              batchError instanceof Error ? batchError.message : 'The agent could not respond.';
            pushToast('error', "Couldn't complete that", message);
            throw batchError;
          }
          setMessages((current) =>
            mergeUniqueMessages(current, [batchResult.userMessage, batchResult.assistantMessage])
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
          setIsTurnActive(false);
        }
        if (!result && !abortController.signal.aborted) {
          setActiveChatStreamMessageId(null);
        }
      }
    },
    [
      service,
      abortActiveChatStream,
      clearActiveChatStreamDraft,
      clearTypingStateForMessage,
      pushToast
    ]
  );

  const handleAttachFiles = useCallback(
    async (files: File[]) => {
      const maxAttachments = 8;
      const availableSlots = Math.max(0, maxAttachments - draftAttachments.length);
      const nextFiles = files.slice(0, availableSlots);
      if (nextFiles.length === 0) return;

      try {
        const uploaded = await Promise.all(
          nextFiles.map((file) => service.uploadChatAttachment(file))
        );
        setDraftAttachments((current) => [...current, ...uploaded]);
      } catch {
        pushToast(
          'error',
          'Attachment upload failed',
          'Oplyr could not attach one of those files.'
        );
      }
    },
    [service, pushToast, draftAttachments.length]
  );

  const handleRemoveDraftAttachment = useCallback((attachmentId: string) => {
    setDraftAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId)
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
    liveActivity,
    activityLog,
    draftAttachments,
    setDraftAttachments,
    textInput,
    setTextInput,
    isSubmittingTurn,
    isStreaming: Boolean(activeChatStreamMessageId),
    isTurnActive,
    streamChatMessage,
    abortActiveChatStream,
    resetChatState,
    handleAttachFiles,
    handleRemoveDraftAttachment,
    loadLogs,
    activeVoiceAssistantMessageIdRef
  };
}
