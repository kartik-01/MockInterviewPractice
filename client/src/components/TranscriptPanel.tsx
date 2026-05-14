type Props = {
  transcript: string;
};

export function TranscriptPanel({ transcript }: Props) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner shadow-black/20">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Live transcript
      </h2>
      <p className="min-h-[4.5rem] whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
        {transcript || "Waiting for audio…"}
      </p>
    </section>
  );
}
