import type { UiState } from "../types";

type Props = {
  uiState: UiState;
};

const COPY: Record<UiState, string> = {
  idle: "Ready",
  listening: "Listening",
  answering: "Answering",
  done: "Finished",
  error: "Error",
};

const STYLE: Record<UiState, string> = {
  idle: "bg-slate-800 text-slate-200 ring-slate-600",
  listening: "bg-amber-500/20 text-amber-100 ring-amber-500/40",
  answering: "bg-emerald-500/20 text-emerald-100 ring-emerald-500/40",
  done: "bg-slate-700 text-slate-100 ring-slate-500",
  error: "bg-red-500/20 text-red-100 ring-red-500/50",
};

export function StatusBadge({ uiState }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STYLE[uiState]}`}
    >
      {COPY[uiState]}
    </span>
  );
}
