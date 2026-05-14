function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const v =
      s < 0 ? Math.max(-32_768, Math.round(s * 32_768)) : Math.min(32_767, Math.round(s * 32_767));
    view.setInt16(i * 2, v, true);
  }
  return buffer;
}

function base64FromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export type AudioStreamHandle = {
  sampleRate: number;
  stop: () => void;
};

const audioConstraints: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Mic + AudioContext in the same async chain as the button (keeps `resume()` valid).
 */
export async function acquireMicAndAudioContext(): Promise<{
  stream: MediaStream;
  audioContext: AudioContext;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: false,
  });
  const audioContext = new AudioContext({ latencyHint: "interactive" });
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  if (audioContext.state !== "running") {
    stream.getTracks().forEach((t) => t.stop());
    await audioContext.close().catch(() => {});
    throw new Error(
      "Audio engine did not start (state: " + audioContext.state + "). Tap Listen again.",
    );
  }
  return { stream, audioContext };
}

/**
 * Continuous mono PCM16 for Deepgram `linear16`.
 *
 * **Important:** Do not time‑throttle or skip `onaudioprocess` frames — dropping most samples
 * creates a choppy stream and STT will hallucinate unrelated phrases.
 */
export function startPcmStreamingFromStream(
  stream: MediaStream,
  audioContext: AudioContext,
  onChunk: (base64Pcm: string) => void,
): AudioStreamHandle {
  const source = audioContext.createMediaStreamSource(stream);
  const bufferSize = 4096;
  const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

  const silent = audioContext.createGain();
  silent.gain.value = 0;

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0);
    const pcm = floatTo16BitPCM(input);
    onChunk(base64FromBuffer(pcm));
  };

  source.connect(processor);
  processor.connect(silent);
  silent.connect(audioContext.destination);

  const sampleRate = audioContext.sampleRate;

  return {
    sampleRate,
    stop: () => {
      processor.disconnect();
      source.disconnect();
      silent.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void audioContext.close();
    },
  };
}

export async function startPcmStreaming(
  onChunk: (base64Pcm: string) => void,
): Promise<AudioStreamHandle> {
  const { stream, audioContext } = await acquireMicAndAudioContext();
  return startPcmStreamingFromStream(stream, audioContext, onChunk);
}
