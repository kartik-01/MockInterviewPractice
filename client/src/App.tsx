import { ListenButton } from "./components/ListenButton";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { AnswerPanel } from "./components/AnswerPanel";
import { StatusBadge } from "./components/StatusBadge";
import { ErrorPanel } from "./components/ErrorPanel";
import { useCandidateAssistant } from "./hooks/useCandidateAssistant";

export default function App() {
  const {
    uiState,
    transcript,
    answer,
    error,
    startListen,
    stopListen,
    clear,
  } = useCandidateAssistant();

  const primaryDisabled = uiState === "listening" || uiState === "answering";

  const canStop = uiState === "listening";

  const onPrimary = () => {
    if (primaryDisabled) return;
    void startListen();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:py-14">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Candidate Answer Assistant
          </h1>
          <p className="text-sm font-medium text-amber-200/90">
            For mock interview practice only.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <StatusBadge uiState={uiState} />
          </div>
        </header>

        <ErrorPanel message={error} />

        <TranscriptPanel transcript={transcript} />
        <AnswerPanel answer={answer} />

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ListenButton
            uiState={uiState}
            onPrimary={onPrimary}
            disabled={primaryDisabled}
          />
          <button
            type="button"
            onClick={stopListen}
            className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 disabled:opacity-40"
            disabled={!canStop}
          >
            Stop
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-xl border border-slate-700 bg-transparent px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Clear
          </button>
        </div>

        <footer className="pt-4 text-xs text-slate-500">
          Tap Listen, speak your question, then Stop — the model answers from the
          transcript. Audio streams only in-session; nothing is stored on disk.
        </footer>
      </div>
    </div>
  );
}
