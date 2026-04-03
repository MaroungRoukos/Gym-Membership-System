export function Alert({
  type = "info",
  children,
}: {
  type?: "info" | "success" | "error";
  children: React.ReactNode;
}) {
  const border =
    type === "error"
      ? "border-[var(--danger)] text-[var(--danger)]"
      : type === "success"
        ? "border-[var(--success)] text-[var(--success)]"
        : "border-[var(--border)] text-[var(--muted)]";
  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-sm ${border}`}
    >
      {children}
    </div>
  );
}
