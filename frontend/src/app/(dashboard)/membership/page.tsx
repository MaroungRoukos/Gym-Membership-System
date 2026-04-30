"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import { DateInputWithCalendarButton } from "@/components/DateInputWithCalendarButton";
import {
  apiFetch,
  assignMembership,
  membersQuery,
  renewMember,
  type Member,
  type MemberPlan,
} from "@/lib/api";

const PLANS: { value: MemberPlan; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export default function MembershipPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState<number | "">("");
  const [assignPlan, setAssignPlan] = useState<MemberPlan>("monthly");
  const [assignStart, setAssignStart] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [renewPlan, setRenewPlan] = useState<MemberPlan | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    try {
      const data = await apiFetch<Member[]>(membersQuery({}));
      setMembers(data);
      setMemberId((prev) => {
        if (
          typeof prev === "number" &&
          data.some((m) => m.id === prev)
        ) {
          return prev;
        }
        return data.length ? data[0].id : "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const selected = members.find((m) => m.id === memberId) ?? null;

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!memberId) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await assignMembership(Number(memberId), {
        plan: assignPlan,
        start_date: assignStart,
      });
      setMessage("Membership assigned (plan and dates updated).");
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRenew(e: FormEvent) {
    e.preventDefault();
    if (!memberId) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await renewMember(
        Number(memberId),
        renewPlan || undefined
      );
      setMessage("Membership renewed (end date extended).");
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Renew failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Membership</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Assign a plan and start date, or renew an existing membership (extends
          end date).
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <label className="text-xs text-[var(--muted)]">Member</label>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              value={memberId === "" ? "" : memberId}
              onChange={(e) =>
                setMemberId(e.target.value ? Number(e.target.value) : "")
              }
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.id_number}) — ends {m.end_date}
                </option>
              ))}
            </select>
            {selected && (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Current:{" "}
                <span className="capitalize text-[var(--foreground)]">
                  {selected.plan}
                </span>{" "}
                · Active/expired:{" "}
                <span className="capitalize">
                  {selected.membership_status.replace("_", " ")}
                </span>{" "}
                ·{" "}
                <Link
                  href={`/members/${selected.id}/edit`}
                  className="text-[var(--accent)] hover:underline"
                >
                  Edit profile
                </Link>
              </p>
            )}
          </div>

          <form
            onSubmit={onAssign}
            className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
          >
            <h2 className="font-medium">Assign membership</h2>
            <p className="text-xs text-[var(--muted)]">
              Sets plan, start date, and end date (computed unless you edit member
              with a custom end).
            </p>
            <div>
              <label className="text-xs text-[var(--muted)]">Plan</label>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
                value={assignPlan}
                onChange={(e) => setAssignPlan(e.target.value as MemberPlan)}
              >
                {PLANS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-xs text-[var(--muted)]"
                htmlFor="assign-start-date"
              >
                Start date
              </label>
              <div className="mt-1">
                <DateInputWithCalendarButton
                  id="assign-start-date"
                  required
                  value={assignStart}
                  onChange={(e) => setAssignStart(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy || !memberId}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
            >
              Assign
            </button>
          </form>

          <form
            onSubmit={onRenew}
            className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
          >
            <h2 className="font-medium">Renew membership</h2>
            <p className="text-xs text-[var(--muted)]">
              If still active, extends from current end date. If expired, starts
              from today.
            </p>
            <div>
              <label className="text-xs text-[var(--muted)]">
                Plan (optional — same as current if empty)
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
                value={renewPlan}
                onChange={(e) =>
                  setRenewPlan(
                    e.target.value ? (e.target.value as MemberPlan) : ""
                  )
                }
              >
                <option value="">Keep current / default</option>
                {PLANS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || !memberId}
              className="rounded-lg border border-[var(--border)] px-4 py-2 hover:bg-[var(--background)] disabled:opacity-50"
            >
              Renew
            </button>
          </form>
        </>
      )}
    </div>
  );
}
