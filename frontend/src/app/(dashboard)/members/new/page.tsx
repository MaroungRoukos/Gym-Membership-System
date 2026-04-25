"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/Alert";
import { createMember, type MemberPlan } from "@/lib/api";

const PLANS: { value: MemberPlan; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export default function NewMemberPage() {
  const router = useRouter();
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<MemberPlan>("monthly");
  const [start_date, setStartDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [useCustomEnd, setUseCustomEnd] = useState(false);
  const [end_date, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const body: Record<string, unknown> = {
      full_name,
      email,
      phone,
      plan,
      start_date,
    };
    if (useCustomEnd && end_date) body.end_date = end_date;
    try {
      const m = await createMember(body);
      router.replace(`/members/${m.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/members" className="text-sm text-[var(--accent)] hover:underline">
          ← Back to members
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Add member</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Member ID is assigned automatically (e.g. M000001) when the record is
          created.
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <Field label="Full name" required>
          <input
            required
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={full_name}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Plan" required>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
            value={plan}
            onChange={(e) => setPlan(e.target.value as MemberPlan)}
          >
            {PLANS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date" required>
          <input
            type="date"
            required
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={start_date}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useCustomEnd}
            onChange={(e) => setUseCustomEnd(e.target.checked)}
          />
          Custom end date (otherwise computed from plan)
        </label>
        {useCustomEnd && (
          <Field label="End date">
            <input
              type="date"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              value={end_date}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        )}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Create member"}
          </button>
          <Link
            href="/members"
            className="rounded-lg border border-[var(--border)] px-4 py-2"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-[var(--muted)]">
        {label}
        {required ? " *" : ""}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
