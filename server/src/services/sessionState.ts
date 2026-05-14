import type { SessionState } from "../types/index.js";

export function createInitialSession(): SessionState {
  return {
    state: "idle",
    transcript: "",
    finalTranscript: "",
    detectedQuestion: null,
    answerStarted: false,
    lastSpeechAt: 0,
    startedAt: 0,
    sampleRate: 16_000,
  };
}

export function resetSessionForListen(
  session: SessionState,
  sampleRate: number,
  now: number,
): void {
  session.state = "listening";
  session.transcript = "";
  session.finalTranscript = "";
  session.detectedQuestion = null;
  session.answerStarted = false;
  session.lastSpeechAt = now;
  session.startedAt = now;
  session.sampleRate = sampleRate;
}

export function softResetSession(session: SessionState): void {
  session.state = "idle";
  session.transcript = "";
  session.finalTranscript = "";
  session.detectedQuestion = null;
  session.answerStarted = false;
  session.lastSpeechAt = 0;
  session.startedAt = 0;
}
