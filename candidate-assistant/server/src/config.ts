import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __configDir = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo package root (`candidate-assistant/`) — many editors put `.env` here. */
dotenv.config({ path: path.resolve(__configDir, "../../.env") });
/** Server-local overrides (`server/.env`). */
dotenv.config({ path: path.resolve(__configDir, "../.env") });

export const MIN_WORDS_FOR_QUESTION = 4;
export const QUESTION_CONFIDENCE_THRESHOLD = 0.75;
export const SILENCE_THRESHOLD_MS = 520;
export const INCOMPLETE_PHRASE_WAIT_MS = 700;
export const MAX_LISTENING_MS = 60_000;
/** Room for structured, interview-depth answers (system design, tradeoffs, examples). */
export const ANSWER_MAX_TOKENS = 1200;

export const PORT = Number(process.env.PORT) || 3001;
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY?.trim() || "";
export const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() || "";
/** Default: OpenAI GPT-OSS 120B on Groq — strong for technical + behavioral interview answers. */
export const GROQ_MODEL =
  process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

/**
 * Default: Nova 3 **general** (explicit id; same family as `nova-3`, tuned for broad English).
 * Use `nova-3-medical` only for clinical vocabulary.
 */
export const DEEPGRAM_MODEL =
  process.env.DEEPGRAM_MODEL?.trim() || "nova-3-general";
