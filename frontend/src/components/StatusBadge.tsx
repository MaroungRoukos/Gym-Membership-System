"use client";

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const styles: Record<typeof tone, string> = {
    success: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25",
    warning: "bg-amber-500/15 text-amber-200 ring-amber-400/25",
    danger: "bg-rose-500/15 text-rose-200 ring-rose-400/25",
    neutral: "bg-slate-500/15 text-slate-200 ring-white/15",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ${styles[tone]}`}
    >
      {label}
    </span>
  );
}
