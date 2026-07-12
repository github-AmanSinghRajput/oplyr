import { useEffect, useRef } from 'react';
import { useApi } from '@/providers/ApiProvider';
import type { BrainUpdateEvent } from '@/containers/voice-console/lib/types';

/**
 * Live memory updates. The backend pushes a `brain_update` event through the existing
 * `/api/voice/events` SSE stream whenever atoms are captured. The Memory screen is the only place
 * that reacts to it (voice/chat use their own WebSocket + NDJSON transports, not this stream), so
 * this hook owns a single subscription for the screen's lifetime and tears it down on unmount.
 *
 * `onBrainUpdate` is read through a ref so the subscription is created once and never churns when
 * the callback identity changes between renders.
 */
export function useBrainEvents(onBrainUpdate: (event: BrainUpdateEvent) => void): void {
  const { service } = useApi();
  const handlerRef = useRef(onBrainUpdate);

  useEffect(() => {
    handlerRef.current = onBrainUpdate;
  }, [onBrainUpdate]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let attempt = 0;

    // Keep the live stream alive across drops (e.g. the local runtime restarting) with capped
    // exponential backoff. A connection that stayed up a while resets the backoff. Aborting on
    // unmount ends the loop cleanly.
    const run = async () => {
      while (!stopped) {
        const startedAt = Date.now();
        try {
          await service.streamAppEvents(
            (event) => {
              if (event.type === 'brain_update') {
                handlerRef.current(event);
              }
            },
            { signal: controller.signal }
          );
        } catch {
          // Abort (unmount) or a transient failure — fall through to the backoff/reconnect below.
        }
        if (stopped || controller.signal.aborted) {
          break;
        }
        attempt = Date.now() - startedAt > 10_000 ? 1 : attempt + 1;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    };

    void run();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [service]);
}
