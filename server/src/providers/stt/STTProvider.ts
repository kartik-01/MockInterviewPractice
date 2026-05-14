import type { TranscriptEvent } from "../../types/index.js";

export interface STTProvider {
  start(): Promise<void>;
  sendAudio(chunk: Buffer): void;
  /** Hint STT to flush buffered audio (Deepgram Finalize). */
  flushTranscript(): void;
  stop(): Promise<void>;
  onTranscript(callback: (event: TranscriptEvent) => void): void;
  onError(callback: (error: Error) => void): void;
}
