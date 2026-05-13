import {
  INCOMPLETE_PHRASE_WAIT_MS,
  MIN_WORDS_FOR_QUESTION,
  QUESTION_CONFIDENCE_THRESHOLD,
  SILENCE_THRESHOLD_MS,
} from "../config.js";

const FILLER_PATTERN =
  /\b(uh|um|hmm|hm|ah|er|erm|like|you know|okay|ok|so|basically|actually|right)\b/gi;

/** Longest first so we match "can you explain" before "can you". */
const INCOMPLETE_ENDINGS = [
  "can you explain",
  "how would you",
  "tell me about",
  "let's say",
  "lets say",
  "could you",
  "can you",
  "what is",
  "what are",
  "imagine",
  "suppose",
  "explain",
];

const QUESTION_PATTERNS = [
  /\bwhat is\b/i,
  /\bwhat are\b/i,
  /\bwhy\b/i,
  /\bhow\b/i,
  /\bwhen\b/i,
  /\bwhere\b/i,
  /\bexplain\b/i,
  /\bdescribe\b/i,
  /\bdesign\b/i,
  /\btell me about\b/i,
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bhow would you\b/i,
  /\bwalk me through\b/i,
  /\bwhat happens if\b/i,
];

const TECH_PATTERNS = [
  /\bdesign a\b/i,
  /\bimplement\b/i,
  /\boptimize\b/i,
  /\bdebug\b/i,
  /\bcompare\b/i,
  /\bdifference between\b/i,
  /\btime complexity\b/i,
  /\bspace complexity\b/i,
  /\bindexing\b/i,
  /\bdatabase\b/i,
  /\bapi\b/i,
  /\bcache\b/i,
  /\bsystem design\b/i,
];

export function stripFillers(text: string): string {
  return text.replace(FILLER_PATTERN, " ").replace(/\s+/g, " ").trim();
}

/** Collapse consecutive duplicate blocks (common when STT re-issues the same final). */
function collapseDuplicateRuns(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  let guard = 0;
  while (guard++ < 64) {
    const maxUnit = Math.floor(t.length / 2);
    let cut: number | null = null;
    for (let unit = Math.min(maxUnit, 400); unit >= 12; unit--) {
      if (t.length < unit * 2) continue;
      const tail = t.slice(-unit);
      const mid = t.slice(t.length - 2 * unit, t.length - unit);
      if (tail === mid) {
        cut = t.length - unit;
        break;
      }
    }
    if (cut === null) break;
    const next = t.slice(0, cut).trimEnd();
    if (next === t) break;
    t = next;
  }
  return t;
}

export function cleanQuestionText(raw: string): string {
  let t = collapseDuplicateRuns(raw);
  t = stripFillers(t);
  if (!t) return "";

  t = t.replace(/\s+/g, " ").trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);

  const end = t.slice(-1);
  if (!/[.?!]/.test(end)) {
    const lower = t.toLowerCase();
    const isLikelyQuestion =
      QUESTION_PATTERNS.some((p) => p.test(t)) ||
      /\b(what|why|how|when|where|who|which|can you|could you|tell me)\b/i.test(
        lower,
      );
    t = `${t}${isLikelyQuestion ? "?" : "."}`;
  }

  return t;
}

function countWords(text: string): number {
  const s = stripFillers(text);
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function endsWithIncompletePhrase(lowerTrimmed: string): boolean {
  for (const phrase of INCOMPLETE_ENDINGS) {
    if (lowerTrimmed === phrase || lowerTrimmed.endsWith(` ${phrase}`)) {
      return true;
    }
  }
  return false;
}

function computeConfidence(text: string, words: number): number {
  let c = 0;
  if (QUESTION_PATTERNS.some((p) => p.test(text))) c = 0.76;
  if (TECH_PATTERNS.some((p) => p.test(text))) c += 0.12;
  if (/\?\s*$/.test(text.trim())) c += 0.06;
  if (words >= MIN_WORDS_FOR_QUESTION + 4) c += 0.06;
  return Math.min(1, c);
}

export function detectQuestion(input: {
  transcript: string;
  lastSpeechAt: number;
  now: number;
  /** Latest text from STT ended a phrase (`is_final`) — don't require extra silence like a missing "?". */
  phraseEndpointed?: boolean;
}): {
  hasQuestion: boolean;
  isComplete: boolean;
  mainQuestion: string;
  confidence: number;
  shouldAnswerNow: boolean;
  reason: string;
} {
  const raw = collapseDuplicateRuns(input.transcript.trim());
  const cleaned = cleanQuestionText(raw);
  const lower = raw.toLowerCase().trim();
  const words = countWords(raw);
  const confidence = computeConfidence(raw, words);
  const hasQuestion =
    words >= MIN_WORDS_FOR_QUESTION && confidence >= QUESTION_CONFIDENCE_THRESHOLD;

  const incompleteEnd = lower.length > 0 && endsWithIncompletePhrase(lower);
  const isComplete = Boolean(
    cleaned && words >= MIN_WORDS_FOR_QUESTION && !incompleteEnd,
  );

  const silenceMs = input.now - input.lastSpeechAt;
  const silenceStrongEnough = silenceMs >= SILENCE_THRESHOLD_MS;
  const silenceForWeakEnding =
    input.phraseEndpointed ||
    raw.trim().endsWith("?") ||
    raw.trim().endsWith("? ")
      ? silenceMs >= SILENCE_THRESHOLD_MS
      : silenceMs >= INCOMPLETE_PHRASE_WAIT_MS;

  const shouldAnswerNow = Boolean(
    hasQuestion &&
      isComplete &&
      confidence >= QUESTION_CONFIDENCE_THRESHOLD &&
      silenceStrongEnough &&
      silenceForWeakEnding,
  );

  let reason = "no signal";
  if (!hasQuestion) {
    reason =
      words < MIN_WORDS_FOR_QUESTION
        ? "not enough words"
        : "confidence below threshold";
  } else if (incompleteEnd) {
    reason = "incomplete phrase ending — wait for more";
  } else if (!silenceStrongEnough) {
    reason = "waiting for silence";
  } else if (!silenceForWeakEnding) {
    reason = "waiting extra beat for unstopped question";
  } else if (shouldAnswerNow) {
    reason = "question complete + silence — answer now";
  }

  return {
    hasQuestion,
    isComplete,
    mainQuestion: cleaned,
    confidence,
    shouldAnswerNow,
    reason,
  };
}
