"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert } from "@/components/Alert";
import {
  fetchMember,
  type Member,
  type MemberPlan,
  updateMember,
} from "@/lib/api";

const PLANS: { value: MemberPlan; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export default function EditMemberPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [member, setMember] = useState<Member | null>(null);
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<MemberPlan>("monthly");
  const [start_date, setStartDate] = useState("");
  const [useCustomEnd, setUseCustomEnd] = useState(false);
  const [end_date, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchMember(id);
        if (cancelled) return;
        setMember(m);
        setFullName(m.full_name);
        setEmail(m.email);
        setPhone(m.phone);
        setPlan(m.plan);
        setStartDate(m.start_date);
        setEndDate(m.end_date);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
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
      const m = await updateMember(id, body);
      setMember(m);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!Number.isFinite(id)) {
    return <Alert type="error">Invalid member id.</Alert>;
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  if (!member) {
    return <Alert type="error">{error ?? "Member not found."}</Alert>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/members" className="text-sm text-[var(--accent)] hover:underline">
          ← Back to members
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Edit member</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          ID:{" "}
          <span className="font-mono text-[var(--foreground)]">
            {member.id_number}
          </span>{" "}
          — membership is{" "}
          <span className="capitalize">{member.membership_status}</span>; latest
          payment:{" "}
          <span className="capitalize">
            {member.latest_payment_status ?? "none"}
          </span>
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && (
        <Alert type="success">Saved successfully.</Alert>
      )}

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
          Set custom end date (otherwise auto when plan/start changes)
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
            {submitting ? "Saving…" : "Save changes"}
          </button>
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
