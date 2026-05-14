import {
  createClient,
  ListenLiveClient,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
} from "@deepgram/sdk";
import { DEEPGRAM_MODEL } from "../../config.js";
import type { TranscriptEvent } from "../../types/index.js";
import type { STTProvider } from "./STTProvider.js";

function extractLine(data: LiveTranscriptionEvent): string {
  const alt = data.channel?.alternatives?.[0];
  let text = alt?.transcript?.trim() ?? "";
  if (!text && alt?.words && alt.words.length > 0) {
    text = alt.words
      .map((w) => (w.punctuated_word || w.word || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return text;
}

export class DeepgramSTTProvider implements STTProvider {
  private connection: ListenLiveClient | null = null;
  private transcriptCb: ((event: TranscriptEvent) => void) | null = null;
  private errorCb: ((error: Error) => void) | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly sampleRate: number,
  ) {}

  onTranscript(callback: (event: TranscriptEvent) => void): void {
    this.transcriptCb = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCb = callback;
  }

  async start(): Promise<void> {
    const deepgram = createClient(this.apiKey);
    this.connection = deepgram.listen.live({
      model: DEEPGRAM_MODEL,
      language: "en-US",
      punctuate: true,
      smart_format: true,
      interim_results: true,
      endpointing: 300,
      utterance_end_ms: 1200,
      encoding: "linear16",
      sample_rate: this.sampleRate,
      channels: 1,
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.connection) {
        reject(new Error("No Deepgram connection"));
        return;
      }
      const t = setTimeout(() => {
        reject(new Error("Deepgram connection timeout"));
      }, 8000);

      this.connection.on(LiveTranscriptionEvents.Open, () => {
        clearTimeout(t);
        resolve();
      });

      this.connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
        clearTimeout(t);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    this.connection.on(
      LiveTranscriptionEvents.Transcript,
      (data: LiveTranscriptionEvent) => {
        const text = extractLine(data);
        if (!text) return;
        const ev: TranscriptEvent = {
          text,
          isFinal: Boolean(data.is_final),
          speechFinal: data.speech_final,
        };
        this.transcriptCb?.(ev);
      },
    );

    this.connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
      this.errorCb?.(err instanceof Error ? err : new Error(String(err)));
    });
  }

  flushTranscript(): void {
    try {
      this.connection?.finalize();
    } catch {
      /* ignore */
    }
  }

  sendAudio(chunk: Buffer): void {
    if (!this.connection) return;
    const u8 = new Uint8Array(chunk);
    const ab = u8.buffer.slice(
      u8.byteOffset,
      u8.byteOffset + u8.byteLength,
    ) as ArrayBuffer;
    this.connection.send(ab);
  }

  async stop(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.requestClose();
      } catch {
        /* ignore */
      }
      try {
        this.connection.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.connection = null;
  }
}
