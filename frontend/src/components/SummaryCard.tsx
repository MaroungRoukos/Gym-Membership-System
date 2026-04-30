export function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)]/85 bg-[var(--surface)]/85 p-5 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.8)] backdrop-blur">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
