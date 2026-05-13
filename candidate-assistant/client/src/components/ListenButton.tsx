import type { UiState } from "../types";

const LABELS: Record<UiState, string> = {
  idle: "Listen",
  listening: "Listening…",
  answering: "Answering…",
  done: "Listen again",
  error: "Try again",
};

type Props = {
  uiState: UiState;
  onPrimary: () => void;
  disabled?: boolean;
};

export function ListenButton({ uiState, onPrimary, disabled }: Props) {
  const label = LABELS[uiState];
  const isAnswering = uiState === "answering";
  return (
    <button
      type="button"
      onClick={onPrimary}
      disabled={disabled || isAnswering}
      className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      {label}
    </button>
  );
}
