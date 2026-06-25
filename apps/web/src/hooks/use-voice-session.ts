import { type RefObject, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/providers/ApiProvider';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { useToast } from '@/providers/ToastProvider';
import { mergeUniqueMessages } from '@/containers/voice-console/lib/helpers';
import {
  desktopVadConfig,
  getEffectiveEndpointDelayMs
} from '@/containers/voice-console/lib/endpointing';
import { startPcmCapture } from '@/containers/voice-console/lib/pcm-stream';
import type {
  ChatStreamEvent,
  StatusResponse,
  VoiceCommandOption,
  VoiceSettingsResponse
} from '@/containers/voice-console/lib/types';
import type { ChatStreamHandle } from './use-chat-stream';

interface VoiceSessionOptions {
  chat: ChatStreamHandle;
  voiceSettings: VoiceSettingsResponse | null;
}

interface VoiceSessionHandle {
  spokenReplyPreview: string;
  streamedTranscriptOverride: string;
  voiceActivity: string | null;
  recentVoiceActivities: string[];
  pendingCommandTitle: string | null;
  pendingCommandPrompt: string | null;
  pendingCommandOptions: VoiceCommandOption[];
  onApplyCommandOption: (option: VoiceCommandOption) => void;
  onDismissCommandOptions: () => void;
  onStart: () => void;
  onStop: () => void;
  micAnalyserRef: RefObject<AnalyserNode | null>;
  isRecording: boolean;
  onStopAndSend: () => void;
}

export function useVoiceSession({ chat, voiceSettings }: VoiceSessionOptions): VoiceSessionHandle {
  const { service, baseUrl } = useApi();
  const { setActiveScreen } = useNavigation();
  const { refreshStatus, setStatus } = useStatus();
  const { pushToast } = useToast();

  const [spokenReplyPreview, setSpokenReplyPreview] = useState('');
  const [streamedTranscriptOverride, setStreamedTranscriptOverride] = useState('');
  const [voiceActivity, setVoiceActivity] = useState<string | null>(null);
  const [recentVoiceActivities, setRecentVoiceActivities] = useState<string[]>([]);
  const [pendingCommandTitle, setPendingCommandTitle] = useState<string | null>(null);
  const [pendingCommandPrompt, setPendingCommandPrompt] = useState<string | null>(null);
  const [pendingCommandOptions, setPendingCommandOptions] = useState<VoiceCommandOption[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  // Ref for the live partial transcript (avoids stale closure in safety timeout)
  const streamedTranscriptOverrideRef = useRef('');

  // Streaming capture refs
  const wsRef = useRef<WebSocket | null>(null);
  const pcmStopRef = useRef<(() => void) | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Session state refs
  const hasDetectedSpeechRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const processingTurnRef = useRef(false);
  const isFinalizingRef = useRef(false);

  const silenceDelayMs = getEffectiveEndpointDelayMs(
    voiceSettings?.settings.silenceWindowMs ?? 800
  );

  // Keep streamedTranscriptOverrideRef in sync with state
  useEffect(() => {
    streamedTranscriptOverrideRef.current = streamedTranscriptOverride;
  }, [streamedTranscriptOverride]);

  const appendActivity = useCallback((message: string) => {
    setVoiceActivity(message);
    setRecentVoiceActivities((current) => {
      const next = [message, ...current.filter((item) => item !== message)];
      return next.slice(0, 5);
    });
  }, []);

  const updateVoiceSession = useCallback(
    (next: Partial<StatusResponse['voiceSession']>) => {
      setStatus((current) =>
        current
          ? {
              ...current,
              voiceSession: {
                ...current.voiceSession,
                ...next
              }
            }
          : current
      );
    },
    [setStatus]
  );

  const clearPendingCommand = useCallback(() => {
    setPendingCommandTitle(null);
    setPendingCommandPrompt(null);
    setPendingCommandOptions([]);
  }, []);

  const resetVoiceUi = useCallback(() => {
    setVoiceActivity(null);
    setSpokenReplyPreview('');
    setStreamedTranscriptOverride('');
    clearPendingCommand();
  }, [clearPendingCommand]);

  // Stop the silence-check interval
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Stop PCM capture and release the mic stream
  const stopCapture = useCallback(() => {
    clearSilenceTimer();

    pcmStopRef.current?.();
    pcmStopRef.current = null;

    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;

    analyserRef.current = null;

    setIsRecording(false);
    sessionActiveRef.current = false;
  }, [clearSilenceTimer]);

  // handleFinal: called when the WS sends {type:'final'}
  const handleFinal = useCallback(
    (text: string) => {
      // Close the WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const transcript = text.trim();
      // Replace any coarse streaming partial with the COMPLETE final transcript, so the voice
      // screen shows the full thing the user said (the same text that is sent to the AI).
      setStreamedTranscriptOverride(transcript);

      if (!transcript) {
        appendActivity('No speech detected');
        sessionActiveRef.current = false;
        updateVoiceSession({
          active: false,
          phase: 'idle',
          liveTranscript: '',
          error: 'No speech detected. Try again.'
        });
        processingTurnRef.current = false;
        isFinalizingRef.current = false;
        return;
      }

      processingTurnRef.current = true;
      isFinalizingRef.current = false;
      updateVoiceSession({
        active: true,
        phase: 'thinking',
        liveTranscript: transcript,
        lastTranscript: transcript
      });

      void (async () => {
        try {
          appendActivity('Sending your request to the assistant');
          const result = await chat.streamChatMessage(transcript, 'voice', {
            onStarted: () => {
              updateVoiceSession({
                active: true,
                phase: 'thinking',
                liveTranscript: transcript,
                lastTranscript: transcript,
                error: null
              });
            },
            onDelta: (event: Extract<ChatStreamEvent, { type: 'delta' }>) => {
              setSpokenReplyPreview(event.assistantMessage.text);
              updateVoiceSession({
                active: true,
                phase: 'speaking',
                liveTranscript: event.assistantMessage.text,
                lastTranscript: transcript,
                error: null
              });
            },
            onActivity: (event: Extract<ChatStreamEvent, { type: 'activity' }>) => {
              appendActivity(event.activity);
            }
          });

          setSpokenReplyPreview(result.assistantMessage.text);
          await refreshStatus();
          startTransition(() => {
            setActiveScreen(result.type === 'approval_required' ? 'review' : 'voice');
          });
          sessionActiveRef.current = false;
          updateVoiceSession({ active: false, phase: 'idle', liveTranscript: '', error: null });
        } catch (error) {
          console.error('Voice processing failed', error);
          const message =
            error instanceof Error ? error.message : 'Voice processing failed unexpectedly.';
          pushToast('error', 'Something went wrong', message);
          updateVoiceSession({
            active: false,
            phase: 'error',
            error: message
          });
          sessionActiveRef.current = false;
        } finally {
          processingTurnRef.current = false;
        }
      })();
    },
    [appendActivity, chat, pushToast, refreshStatus, setActiveScreen, updateVoiceSession]
  );

  // finalizeAndStop: called on silence detection or manual stop
  const finalizeAndStop = useCallback(
    (reason: 'process' | 'cancel') => {
      // Guard: only run once per turn
      if (isFinalizingRef.current) return;
      isFinalizingRef.current = true;

      clearSilenceTimer();
      stopCapture();

      const ws = wsRef.current;

      if (reason === 'cancel' || !hasDetectedSpeechRef.current) {
        // Discard: reset to idle
        if (ws) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'reset' }));
          }
          ws.close();
          wsRef.current = null;
        }
        isFinalizingRef.current = false;
        processingTurnRef.current = false;
        updateVoiceSession({ active: false, phase: 'idle', liveTranscript: '' });
        return;
      }

      // Process: send finalize and wait for the worker's {type:'final'} (the COMPLETE
      // transcript) in ws.onmessage. We intentionally wait for that final rather than sending
      // an interim partial, so the AI always receives the fully transcribed message.
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'finalize' }));
      }
      appendActivity('Finishing transcription…');
      updateVoiceSession({
        active: true,
        phase: 'thinking',
        liveTranscript: streamedTranscriptOverrideRef.current
      });

      // Fail-safe only: the final normally arrives in well under a second and clears this timer.
      // The window is generous so a slightly slower transcription is never cut off and sent
      // half-finished. If it genuinely times out, surface a retry instead of sending partial text.
      const safety = window.setTimeout(() => {
        if (!isFinalizingRef.current) return;
        const currentTranscript = streamedTranscriptOverrideRef.current.trim();
        if (!currentTranscript) {
          stopCapture();
          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
          }
          isFinalizingRef.current = false;
          processingTurnRef.current = false;
          sessionActiveRef.current = false;
          updateVoiceSession({
            active: false,
            phase: 'idle',
            liveTranscript: '',
            error: 'Transcription timed out. Please try again.'
          });
          return;
        }
        handleFinal(currentTranscript);
      }, 10000);

      safetyTimerRef.current = safety;
    },
    [appendActivity, clearSilenceTimer, handleFinal, stopCapture, updateVoiceSession]
  );

  const beginCapture = useCallback(async () => {
    if (processingTurnRef.current || stopRequestedRef.current) {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;

    // Build WebSocket URL
    const wsBase = baseUrl.replace(/^http/, 'ws');
    const token =
      window.desktopShell?.apiAuthToken ?? import.meta.env.VITE_LOCAL_API_AUTH_TOKEN ?? null;
    const wsUrl =
      wsBase + '/api/voice/stream' + (token ? '?token=' + encodeURIComponent(token) : '');

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    // Reset speech detection
    hasDetectedSpeechRef.current = false;
    lastSpeechAtRef.current = performance.now();

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          text?: string;
          message?: string;
        };

        if (msg.type === 'partial' && msg.text !== undefined) {
          setStreamedTranscriptOverride(msg.text);
          updateVoiceSession({ active: true, phase: 'listening', liveTranscript: msg.text });
        } else if (msg.type === 'final' && msg.text !== undefined) {
          // Clear the safety timer if set
          if (safetyTimerRef.current !== null) {
            window.clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
          }
          wsRef.current = null;
          handleFinal(msg.text);
        } else if (msg.type === 'error') {
          console.error('Voice stream error:', msg.message);
          pushToast('error', 'Something went wrong', msg.message ?? 'Voice stream error.');
          // Reset to idle
          stopCapture();
          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
          }
          sessionActiveRef.current = false;
          processingTurnRef.current = false;
          isFinalizingRef.current = false;
          updateVoiceSession({ active: false, phase: 'idle', liveTranscript: '', error: null });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // The close handler will handle cleanup
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      // Unexpected drop mid-capture (not a normal finalize/processing close) → recover to idle.
      if (sessionActiveRef.current && !isFinalizingRef.current && !processingTurnRef.current) {
        stopCapture();
        updateVoiceSession({
          active: false,
          phase: 'idle',
          liveTranscript: '',
          error: 'Voice connection lost.'
        });
      }
    };

    ws.onopen = async () => {
      try {
        const capture = await startPcmCapture(
          stream,
          (frame) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(frame);
            }
          },
          (rms) => {
            const now = performance.now();
            const threshold = hasDetectedSpeechRef.current
              ? desktopVadConfig.sustainThreshold
              : desktopVadConfig.startThreshold;
            if (rms >= threshold) {
              hasDetectedSpeechRef.current = true;
              lastSpeechAtRef.current = now;
            }
          }
        );
        analyserRef.current = capture.analyser;
        pcmStopRef.current = capture.stop;
      } catch (error) {
        console.error('Voice capture failed to start', error);
        isFinalizingRef.current = false;
        stopCapture();
        if (wsRef.current === ws) wsRef.current = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
        updateVoiceSession({
          active: false,
          phase: 'error',
          liveTranscript: '',
          error: 'Could not start the microphone.'
        });
      }
    };

    updateVoiceSession({ active: true, phase: 'listening', liveTranscript: '', error: null });
    appendActivity('Listening for your request');
    setIsRecording(true);

    // Start silence-check interval
    silenceTimerRef.current = window.setInterval(() => {
      const now = performance.now();
      if (hasDetectedSpeechRef.current && now - lastSpeechAtRef.current >= silenceDelayMs) {
        finalizeAndStop('process');
      }
    }, 200);
  }, [
    appendActivity,
    baseUrl,
    finalizeAndStop,
    handleFinal,
    pushToast,
    silenceDelayMs,
    stopCapture,
    updateVoiceSession
  ]);

  const stopSession = useCallback(async () => {
    stopRequestedRef.current = true;
    chat.abortActiveChatStream();
    finalizeAndStop('cancel');

    try {
      const response = await service.stopVoiceSession();
      updateVoiceSession(response.voiceSession);
    } catch {
      updateVoiceSession({
        active: false,
        phase: 'idle',
        liveTranscript: ''
      });
    }
  }, [chat, finalizeAndStop, service, updateVoiceSession]);

  const onStart = useCallback(async () => {
    if (sessionActiveRef.current || processingTurnRef.current) {
      return;
    }

    stopRequestedRef.current = false;
    resetVoiceUi();
    sessionActiveRef.current = true;

    try {
      // Warm the worker (best effort)
      await service.startVoiceSession();
      await beginCapture();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start the voice session.';
      pushToast('error', 'Voice unavailable', message);
      updateVoiceSession({
        active: false,
        phase: 'error',
        error: message
      });
      sessionActiveRef.current = false;
    }
  }, [beginCapture, pushToast, resetVoiceUi, service, updateVoiceSession]);

  const onStop = useCallback(() => {
    void stopSession();
  }, [stopSession]);

  const onStopAndSend = useCallback(() => {
    finalizeAndStop('process');
  }, [finalizeAndStop]);

  const onApplyCommandOption = useCallback(
    (option: VoiceCommandOption) => {
      void (async () => {
        try {
          clearPendingCommand();
          appendActivity('Applying your selection');
          const response = await service.applyVoiceCommandAction(option.action);
          chat.setMessages((current) => mergeUniqueMessages(current, [response.assistantMessage]));
          setSpokenReplyPreview(response.assistantMessage.text);
          if (response.suggestedScreen) {
            setActiveScreen(response.suggestedScreen);
          }
          sessionActiveRef.current = false;
          updateVoiceSession({ active: false, phase: 'idle', liveTranscript: '', error: null });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unable to apply the voice command.';
          pushToast('error', 'Voice command failed', message);
          updateVoiceSession({
            active: true,
            phase: 'error',
            error: message
          });
        }
      })();
    },
    [
      appendActivity,
      chat,
      clearPendingCommand,
      pushToast,
      service,
      setActiveScreen,
      updateVoiceSession
    ]
  );

  const onDismissCommandOptions = useCallback(() => {
    clearPendingCommand();
    appendActivity('Selection dismissed');
  }, [appendActivity, clearPendingCommand]);

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      sessionActiveRef.current = false;
      clearSilenceTimer();
      if (safetyTimerRef.current !== null) {
        window.clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      pcmStopRef.current?.();
      pcmStopRef.current = null;
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clearSilenceTimer]);

  return {
    spokenReplyPreview,
    streamedTranscriptOverride,
    voiceActivity,
    recentVoiceActivities,
    pendingCommandTitle,
    pendingCommandPrompt,
    pendingCommandOptions,
    onApplyCommandOption,
    onDismissCommandOptions,
    onStart,
    onStop,
    micAnalyserRef: analyserRef,
    isRecording,
    onStopAndSend
  };
}
