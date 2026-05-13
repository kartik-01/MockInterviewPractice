const UI_STATES = [
  "idle",
  "listening",
  "answering",
  "done",
  "error",
] as const;

export type UiState = (typeof UI_STATES)[number];

function asUiState(s: string): UiState | null {
  return (UI_STATES as readonly string[]).includes(s) ? (s as UiState) : null;
}

export type ServerMessage =
  | { type: "status"; state: UiState }
  | { type: "transcript_partial"; text: string }
  | { type: "transcript_final"; text: string }
  | { type: "answer_token"; token: string }
  | { type: "answer_done" }
  | { type: "stop_listening" }
  | { type: "error"; message: string };

export function parseServerMessage(data: string): ServerMessage | null {
  try {
    const v = JSON.parse(data) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const t = o.type;
    if (t === "status" && typeof o.state === "string") {
      const st = asUiState(o.state);
      if (!st) return null;
      return { type: "status", state: st };
    }
    if (t === "transcript_partial" && typeof o.text === "string") {
      return { type: "transcript_partial", text: o.text };
    }
    if (t === "transcript_final" && typeof o.text === "string") {
      return { type: "transcript_final", text: o.text };
    }
    if (t === "answer_token" && typeof o.token === "string") {
      return { type: "answer_token", token: o.token };
    }
    if (t === "answer_done") return { type: "answer_done" };
    if (t === "stop_listening") return { type: "stop_listening" };
    if (t === "error" && typeof o.message === "string") {
      return { type: "error", message: o.message };
    }
    return null;
  } catch {
    return null;
  }
}
