type Props = {
  message: string | null;
};

export function ErrorPanel({ message }: Props) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
    >
      {message}
    </div>
  );
}
