export type SessionMachineState =
  | "idle"
  | "listening"
  | "answering"
  | "done"
  | "error";

export type SessionState = {
  state: SessionMachineState;
  transcript: string;
  finalTranscript: string;
  detectedQuestion: string | null;
  answerStarted: boolean;
  lastSpeechAt: number;
  startedAt: number;
  sampleRate: number;
};

export type TranscriptEvent = {
  text: string;
  isFinal: boolean;
  speechFinal?: boolean;
};
