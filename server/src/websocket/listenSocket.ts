import type { WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import { DEEPGRAM_API_KEY, GROQ_API_KEY, MAX_LISTENING_MS } from "../config.js";
import { DeepgramSTTProvider } from "../providers/stt/DeepgramSTTProvider.js";
import { MockSTTProvider } from "../providers/stt/MockSTTProvider.js";
import type { STTProvider } from "../providers/stt/STTProvider.js";
import { GroqLLMProvider } from "../providers/llm/GroqLLMProvider.js";
import { MockLLMProvider } from "../providers/llm/MockLLMProvider.js";
import type { LLMProvider } from "../providers/llm/LLMProvider.js";
import { cleanQuestionText } from "../services/questionDetector.js";
import {
  createInitialSession,
  resetSessionForListen,
  softResetSession,
} from "../services/sessionState.js";
import type { SessionMachineState, SessionState } from "../types/index.js";
import { parseClientMessage } from "./protocol.js";

type ConnectionCtx = {
  session: SessionState;
  stt: STTProvider | null;
  /** Chunks before `ctx.stt` exists or while session is starting (ordered WS delivery). */
  pendingAudio: Buffer[];
  finalizedTranscript: string;
  liveTail: string;
  /** Last `is_final` text from STT (Deepgram can emit duplicate finals). */
  lastFinalText: string;
  maxListenTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeSend(socket: WebSocket, payload: object): void {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function flushPendingAudio(ctx: ConnectionCtx): void {
  if (!ctx.stt || ctx.pendingAudio.length === 0) return;
  for (const buf of ctx.pendingAudio) {
    ctx.stt.sendAudio(buf);
  }
  ctx.pendingAudio.length = 0;
}

function displayTranscript(ctx: ConnectionCtx): string {
  const f = ctx.finalizedTranscript.trim();
  const l = ctx.liveTail.trim();
  if (!f) return l;
  if (!l) return f;
  return `${f} ${l}`;
}

function pickLLM(): LLMProvider {
  return GROQ_API_KEY ? new GroqLLMProvider() : new MockLLMProvider();
}

function pickSTT(sampleRate: number): STTProvider {
  return DEEPGRAM_API_KEY
    ? new DeepgramSTTProvider(DEEPGRAM_API_KEY, sampleRate)
    : new MockSTTProvider();
}

function clearMaxListenTimer(ctx: ConnectionCtx): void {
  if (ctx.maxListenTimer) {
    clearTimeout(ctx.maxListenTimer);
    ctx.maxListenTimer = null;
  }
}

function pushStatusIfChanged(
  socket: WebSocket,
  ctx: ConnectionCtx,
  next: SessionMachineState,
): void {
  if (ctx.session.state === next) return;
  ctx.session.state = next;
  safeSend(socket, { type: "status", state: next });
}

async function teardownSTT(ctx: ConnectionCtx): Promise<void> {
  if (ctx.stt) {
    await ctx.stt.stop().catch(() => {});
    ctx.stt = null;
  }
}

async function runAnswerPipeline(
  socket: WebSocket,
  ctx: ConnectionCtx,
  question: string,
): Promise<void> {
  clearMaxListenTimer(ctx);
  ctx.session.detectedQuestion = question;
  safeSend(socket, { type: "stop_listening" });
  pushStatusIfChanged(socket, ctx, "answering");
  const llm = pickLLM();
  try {
    await llm.streamAnswer(question, (token) => {
      safeSend(socket, { type: "answer_token", token });
    });
    safeSend(socket, { type: "answer_done" });
    ctx.session.state = "done";
    safeSend(socket, { type: "status", state: "done" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Answer generation failed";
    ctx.session.state = "error";
    safeSend(socket, { type: "error", message: msg });
    safeSend(socket, { type: "status", state: "error" });
  }
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function handleTranscript(
  socket: WebSocket,
  ctx: ConnectionCtx,
  ev: {
    text: string;
    isFinal: boolean;
    speechFinal?: boolean;
  },
): void {
  if (ctx.closed || ctx.session.answerStarted) return;
  const text = ev.text.trim();
  if (!text) return;

  ctx.session.lastSpeechAt = Date.now();

  if (!ev.isFinal) {
    ctx.liveTail = text;
    safeSend(socket, {
      type: "transcript_partial",
      text: displayTranscript(ctx),
    });
  }

  if (ev.isFinal) {
    const n = normalizeWs(text);
    const prev = normalizeWs(ctx.lastFinalText);
    const cur = normalizeWs(displayTranscript(ctx));
    const f = normalizeWs(ctx.finalizedTranscript);

    if (n === prev) {
      ctx.liveTail = "";
    } else if (f.endsWith(n)) {
      ctx.liveTail = "";
      ctx.lastFinalText = n;
    } else if (n === cur) {
      ctx.finalizedTranscript = n;
      ctx.liveTail = "";
      ctx.lastFinalText = n;
    } else {
      ctx.finalizedTranscript = f ? `${f} ${n}` : n;
      ctx.liveTail = "";
      ctx.lastFinalText = ev.speechFinal ? "" : n;
    }

    if (ev.speechFinal) {
      ctx.lastFinalText = "";
    }

    safeSend(socket, {
      type: "transcript_final",
      text: displayTranscript(ctx),
    });
  }

  ctx.session.transcript = displayTranscript(ctx);
  ctx.session.finalTranscript = ctx.finalizedTranscript.trim();
}

async function finalizeListeningAndAnswer(
  socket: WebSocket,
  ctx: ConnectionCtx,
  emptyMessage: string,
): Promise<void> {
  clearMaxListenTimer(ctx);
  if (ctx.closed) return;
  if (ctx.session.answerStarted) return;
  ctx.session.answerStarted = true;

  try {
    ctx.stt?.flushTranscript();
  } catch {
    /* ignore */
  }
  await delay(320);
  await teardownSTT(ctx);

  const raw = ctx.session.transcript.trim();
  if (!raw) {
    ctx.session.answerStarted = false;
    ctx.session.state = "idle";
    safeSend(socket, { type: "error", message: emptyMessage });
    safeSend(socket, { type: "status", state: "idle" });
    safeSend(socket, { type: "stop_listening" });
    return;
  }

  const prompt = cleanQuestionText(raw) || raw;
  await runAnswerPipeline(socket, ctx, prompt);
}

function stopListening(socket: WebSocket, ctx: ConnectionCtx): void {
  void finalizeListeningAndAnswer(
    socket,
    ctx,
    "No speech captured. Speak, then tap Stop.",
  );
}

async function startListening(
  socket: WebSocket,
  ctx: ConnectionCtx,
  sampleRate: number,
): Promise<void> {
  await teardownSTT(ctx);
  clearMaxListenTimer(ctx);
  ctx.pendingAudio.length = 0;

  const now = Date.now();
  resetSessionForListen(ctx.session, sampleRate, now);
  ctx.finalizedTranscript = "";
  ctx.liveTail = "";
  ctx.lastFinalText = "";
  ctx.session.transcript = "";
  ctx.session.finalTranscript = "";

  const stt = pickSTT(sampleRate);
  ctx.stt = stt;

  stt.onTranscript((ev) => handleTranscript(socket, ctx, ev));
  stt.onError((err) => {
    if (ctx.closed || ctx.session.answerStarted) return;
    ctx.session.state = "error";
    safeSend(socket, { type: "error", message: err.message });
    safeSend(socket, { type: "status", state: "error" });
    void teardownSTT(ctx);
    clearMaxListenTimer(ctx);
  });

  try {
    await stt.start();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Speech service failed to start";
    ctx.session.state = "error";
    safeSend(socket, { type: "error", message: msg });
    safeSend(socket, { type: "status", state: "error" });
    ctx.stt = null;
    ctx.pendingAudio.length = 0;
    return;
  }

  flushPendingAudio(ctx);

  ctx.session.state = "listening";
  safeSend(socket, { type: "status", state: "listening" });

  ctx.maxListenTimer = setTimeout(() => {
    void finalizeListeningAndAnswer(
      socket,
      ctx,
      "Listening timed out. Tap Listen, speak, then Stop (or wait for timeout).",
    );
  }, MAX_LISTENING_MS);
}

function clearSession(socket: WebSocket, ctx: ConnectionCtx): void {
  void (async () => {
    clearMaxListenTimer(ctx);
    await teardownSTT(ctx);
    softResetSession(ctx.session);
    ctx.finalizedTranscript = "";
    ctx.liveTail = "";
    ctx.lastFinalText = "";
    ctx.pendingAudio.length = 0;
    safeSend(socket, { type: "status", state: "idle" });
  })();
}

export function registerListenSocket(app: FastifyInstance): void {
  app.get(
    "/ws/listen",
    { websocket: true },
    (socket: WebSocket /* , request */) => {
      const ctx: ConnectionCtx = {
        session: createInitialSession(),
        stt: null,
        pendingAudio: [],
        finalizedTranscript: "",
        liveTail: "",
        lastFinalText: "",
        maxListenTimer: null,
        closed: false,
      };

      socket.on("message", (raw: WebSocket.RawData) => {
        let parsed: unknown;
        try {
          const s = typeof raw === "string" ? raw : raw.toString("utf8");
          parsed = JSON.parse(s) as unknown;
        } catch {
          safeSend(socket, { type: "error", message: "Invalid JSON message" });
          return;
        }

        const r = parseClientMessage(parsed);
        if (!r.ok) {
          safeSend(socket, { type: "error", message: r.error });
          return;
        }

        const msg = r.message;
        switch (msg.type) {
          case "start_listening": {
            const sr = msg.sampleRate ?? 16_000;
            void startListening(socket, ctx, sr);
            break;
          }
          case "audio_chunk": {
            if (ctx.session.answerStarted) break;
            let buf: Buffer;
            try {
              buf = Buffer.from(msg.audio, "base64");
            } catch {
              safeSend(socket, { type: "error", message: "Invalid audio payload" });
              break;
            }
            if (buf.length === 0) break;
            if (!ctx.stt) {
              if (ctx.pendingAudio.length < 500) {
                ctx.pendingAudio.push(buf);
              }
              break;
            }
            ctx.stt.sendAudio(buf);
            break;
          }
          case "stop_listening":
            stopListening(socket, ctx);
            break;
          case "clear":
            clearSession(socket, ctx);
            break;
          default:
            break;
        }
      });

      socket.on("close", () => {
        ctx.closed = true;
        clearMaxListenTimer(ctx);
        void teardownSTT(ctx);
      });

      socket.on("error", () => {
        ctx.closed = true;
        clearMaxListenTimer(ctx);
        void teardownSTT(ctx);
      });
    },
  );
}
