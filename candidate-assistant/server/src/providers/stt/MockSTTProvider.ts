import type { TranscriptEvent } from "../../types/index.js";
import type { STTProvider } from "./STTProvider.js";

/** Linear16 LE mono: RMS in roughly 0..1; room noise often sits below ~0.01–0.02. */
function pcm16leRms(buf: Buffer): number {
  if (buf.length < 2) return 0;
  const n = Math.floor(buf.length / 2);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(i * 2) / 32_768;
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

/**
 * Deterministic mock when `DEEPGRAM_API_KEY` is missing.
 * Does **not** auto-play text on silence — only advances when audio chunks look like speech (RMS gate).
 */
export class MockSTTProvider implements STTProvider {
  private transcriptCb: ((event: TranscriptEvent) => void) | null = null;
  private errorCb: ((error: Error) => void) | null = null;
  private step = 0;
  private lastAdvanceAt = 0;
  private readonly phrase =
    "Okay so can you explain what database indexing is and why we use it in production";
  /** Ignore typical closed-mic / digital silence (mock only). */
  private readonly rmsThreshold = 0.018;
  private readonly minStepMs = 240;

  onTranscript(callback: (event: TranscriptEvent) => void): void {
    this.transcriptCb = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCb = callback;
  }

  async start(): Promise<void> {
    this.step = 0;
    this.lastAdvanceAt = 0;
  }

  flushTranscript(): void {}

  sendAudio(chunk: Buffer): void {
    if (pcm16leRms(chunk) < this.rmsThreshold) {
      return;
    }
    const now = Date.now();
    if (now - this.lastAdvanceAt < this.minStepMs) {
      return;
    }
    this.lastAdvanceAt = now;
    this.advance();
  }

  private advance(): void {
    const words = this.phrase.split(" ");
    this.step = Math.min(this.step + 2, words.length);
    const partial = words.slice(0, this.step).join(" ");
    try {
      this.transcriptCb?.({
        text: partial,
        isFinal: false,
      });
      if (this.step >= words.length) {
        this.transcriptCb?.({
          text: this.phrase,
          isFinal: true,
          speechFinal: true,
        });
      }
    } catch (e) {
      this.errorCb?.(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async stop(): Promise<void> {}
}
