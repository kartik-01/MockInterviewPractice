type Props = {
  answer: string;
};

export function AnswerPanel({ answer }: Props) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner shadow-black/20">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Candidate answer
      </h2>
      <p className="min-h-[6rem] whitespace-pre-wrap text-sm leading-relaxed text-emerald-100/95">
        {answer || "—"}
      </p>
    </section>
  );
}
