"use client";

export function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5 backdrop-blur">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs text-[var(--muted)]">{hint}</p> : null}
    </article>
  );
}
