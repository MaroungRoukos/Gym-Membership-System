export function Alert({
  type = "info",
  children,
}: {
  type?: "info" | "success" | "error";
  children: React.ReactNode;
}) {
  const tone =
    type === "error"
      ? "border-[var(--danger)]/55 bg-[var(--danger)]/10 text-rose-200"
      : type === "success"
        ? "border-[var(--success)]/55 bg-[var(--success)]/10 text-emerald-200"
        : "border-[var(--border)] bg-[var(--surface)]/70 text-[var(--muted)]";
  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-sm backdrop-blur ${tone}`}
    >
      {children}
    </div>
  );
}
