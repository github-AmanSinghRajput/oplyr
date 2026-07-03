import { downsampleTo16k, floatToInt16 } from './stream-protocol';
// Import the worklet source as a string and load it via a Blob URL. This works regardless of origin
// (the packaged app runs under file://, where an absolute "/pcm-worklet.js" path 404s and data: URLs
// aren't reliably accepted by addModule). The worklet runs in its own global scope, so `?raw` keeps
// it untransformed.
import pcmWorkletSource from '@/assets/pcm-worklet.js?raw';

export interface PcmCapture {
  analyser: AnalyserNode;
  stop: () => void;
}

/**
 * Capture mic audio as 16kHz mono Int16 frames. Calls onFrame for each chunk and onRms with a
 * 0..1 loudness value (for silence detection). Exposes an AnalyserNode for visualization.
 */
export async function startPcmCapture(
  stream: MediaStream,
  onFrame: (frame: Int16Array) => void,
  onRms: (rms: number) => void
): Promise<PcmCapture> {
  const audioContext = new AudioContext();
  // The context may start suspended (autoplay policy) after the async WS-open chain; resume it
  // so the worklet's process() runs and frames flow.
  if (audioContext.state === 'suspended') {
    await audioContext.resume().catch(() => undefined);
  }
  const workletUrl = URL.createObjectURL(
    new Blob([pcmWorkletSource], { type: 'application/javascript' })
  );
  try {
    await audioContext.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }
  const source = audioContext.createMediaStreamSource(stream);

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const node = new AudioWorkletNode(audioContext, 'pcm-processor');
  node.port.onmessage = (event) => {
    const float = event.data as Float32Array;
    let sum = 0;
    for (let i = 0; i < float.length; i += 1) sum += float[i] * float[i];
    onRms(Math.sqrt(sum / float.length));
    const down = downsampleTo16k(float, audioContext.sampleRate);
    onFrame(floatToInt16(down));
  };
  source.connect(node);

  // The worklet needs a destination to pull audio; route through a muted gain.
  const sink = audioContext.createGain();
  sink.gain.value = 0;
  node.connect(sink);
  sink.connect(audioContext.destination);

  return {
    analyser,
    stop: () => {
      node.port.onmessage = null;
      source.disconnect();
      analyser.disconnect();
      node.disconnect();
      sink.disconnect();
      void audioContext.close().catch(() => undefined);
    }
  };
}
