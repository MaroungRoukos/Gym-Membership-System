"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert } from "@/components/Alert";
import { DateInputWithCalendarButton } from "@/components/DateInputWithCalendarButton";
import {
  fetchMember,
  type Member,
  type MemberPlan,
  updateMember,
} from "@/lib/api";
import {
  addCalendarDaysToIsoDate,
  endDateForPlanFromStart,
  LB_PHONE_HINT,
  localDateStringToday,
  normalizeLbPhone,
} from "@/lib/memberUtils";

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
  const [hadCustomEndOnLoad, setHadCustomEndOnLoad] = useState(false);
  const [first_name, setFirstName] = useState("");
  const [last_name, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<MemberPlan>("monthly");
  const [paymentOption, setPaymentOption] = useState<"paid" | "unpaid">("unpaid");
  const [start_date, setStartDate] = useState("");
  const [useCustomEnd, setUseCustomEnd] = useState(false);
  const [end_date, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewEnd = useMemo(() => {
    if (useCustomEnd) return null;
    if (!start_date) return null;
    try {
      return endDateForPlanFromStart(start_date, plan);
    } catch {
      return null;
    }
  }, [start_date, plan, useCustomEnd]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchMember(id);
        if (cancelled) return;
        setMember(m);
        setFirstName(m.first_name);
        setLastName(m.last_name);
        setEmail(m.email);
        setPhone(m.phone);
        setPlan(m.plan);
        setPaymentOption(m.member_payment_status === "paid" ? "paid" : "unpaid");
        setStartDate(m.start_date);
        setEndDate(m.end_date);
        let custom = false;
        try {
          custom =
            m.end_date !== endDateForPlanFromStart(m.start_date, m.plan);
        } catch {
          custom = false;
        }
        setUseCustomEnd(custom);
        setHadCustomEndOnLoad(custom);
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
    setSubmitting(true);
    const body: Record<string, unknown> = {
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email,
      phone: normalizeLbPhone(phone),
      plan,
      start_date,
      member_payment_status: paymentOption === "paid" ? "paid" : "pending",
    };
    if (useCustomEnd && end_date) body.end_date = end_date;
    else if (hadCustomEndOnLoad) body.end_date = null;
    try {
      await updateMember(id, body);
      router.replace("/members");
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
          Choose Paid or Not paid (saved to the members list), set membership
          start, and optional custom end. End date follows the start date and
          plan unless you override it.
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Member ID:{" "}
          <span className="font-mono text-[var(--foreground)]">
            {member.id_number}
          </span>
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <Field label="First name" required htmlFor="edit-member-first-name">
          <input
            id="edit-member-first-name"
            required
            autoComplete="given-name"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={first_name}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </Field>
        <Field label="Last name">
          <input
            autoComplete="family-name"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={last_name}
            onChange={(e) => setLastName(e.target.value)}
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
        <Field label="Phone" required>
          <input
            required
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm"
            placeholder="+96131234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setPhone((p) => normalizeLbPhone(p))}
          />
          <p className="mt-1 text-xs text-[var(--muted)]">{LB_PHONE_HINT}</p>
        </Field>
        <Field label="Plan" required htmlFor="edit-member-plan">
          <select
            id="edit-member-plan"
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
        <div className="space-y-3">
          <div>
            <span className="text-xs text-[var(--muted)]" id="edit-payment-legend">
              Payment status
            </span>
            <div
              className="mt-2 flex flex-wrap gap-6"
              role="group"
              aria-labelledby="edit-payment-legend"
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="edit-member-payment-status"
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                  checked={paymentOption === "paid"}
                  onChange={() => setPaymentOption("paid")}
                />
                Paid
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="edit-member-payment-status"
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                  checked={paymentOption === "unpaid"}
                  onChange={() => setPaymentOption("unpaid")}
                />
                Not paid
              </label>
            </div>
          </div>
        </div>
        <Field label="Membership start date" required htmlFor="edit-member-start">
          <div className="space-y-2">
            <DateInputWithCalendarButton
              id="edit-member-start"
              name="membership_start"
              required
              value={start_date}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                onClick={() => setStartDate(localDateStringToday())}
              >
                Start today
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                onClick={() =>
                  setStartDate(
                    addCalendarDaysToIsoDate(localDateStringToday(), 7)
                  )
                }
              >
                Start in 1 week
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              First day of the plan. End date is computed from this (monthly:
              same calendar day next month, e.g. Apr 4 → May 4).
            </p>
          </div>
        </Field>
        {!useCustomEnd && previewEnd && start_date && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
            <span className="text-[var(--muted)]">Membership end date: </span>
            <span className="font-medium tabular-nums">{previewEnd}</span>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useCustomEnd}
            onChange={(e) => setUseCustomEnd(e.target.checked)}
          />
          Custom end date (override plan-based end date)
        </label>
        {useCustomEnd && (
          <Field label="End date" htmlFor="edit-member-end">
            <DateInputWithCalendarButton
              id="edit-member-end"
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
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="text-xs text-[var(--muted)]"
        htmlFor={htmlFor}
      >
        {label}
        {required ? " *" : ""}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
