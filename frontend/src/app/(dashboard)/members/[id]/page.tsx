"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import {
  addMemberNote,
  fetchCheckins,
  fetchMember,
  fetchMemberNotes,
  fetchMembershipHistory,
  fetchPayments,
  markMemberPaid,
  type Checkin,
  type Member,
  type MemberNote,
  type MemberPlan,
  type MembershipHistory,
  type Payment,
} from "@/lib/api";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return iso;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function memberInitials(m: Member): string {
  const a = m.first_name.trim().charAt(0);
  const b = m.last_name.trim().charAt(0);
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();
  return m.id_number?.charAt(0) ?? "?";
}

function planLabel(plan: MemberPlan) {
  const labels: Record<MemberPlan, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
    student: "Student",
    family: "Family",
    custom: "Custom",
  };
  return labels[plan];
}

function money(value: string | null | undefined) {
  const n = Number(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 border-b border-[var(--border)]/50 py-2.5 last:border-0 sm:grid-cols-[9.5rem_1fr] sm:items-start sm:gap-4 sm:py-2">
      <dt className="text-[0.7rem] font-medium leading-tight text-[var(--muted)] sm:pt-0.5 sm:text-right">
        {label}
      </dt>
      <dd className="min-w-0 text-sm font-normal leading-snug text-[var(--foreground)] sm:text-left">
        {value}
      </dd>
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "positive" | "caution" | "neutral";
}) {
  const c = {
    positive:
      "bg-emerald-500/[0.08] text-emerald-300/95 ring-1 ring-emerald-500/20",
    caution:
      "bg-amber-500/[0.08] text-amber-200/90 ring-1 ring-amber-500/20",
    neutral:
      "bg-[var(--background)] text-[var(--muted)] ring-1 ring-[var(--border)]",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[0.65rem] font-medium tracking-tight ${c[tone]}`}
    >
      {children}
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)]/80 bg-[var(--background)]/40">
      <h2 className="border-b border-[var(--border)]/60 bg-[var(--surface)]/80 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {title}
      </h2>
      <div className="px-3 py-1 pb-2 sm:px-3.5">{children}</div>
    </div>
  );
}

export default function MemberDetailsPage() {
  const params = useParams();
  const id = Number(params.id);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [history, setHistory] = useState<MembershipHistory[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const initials = useMemo(
    () => (member ? memberInitials(member) : ""),
    [member]
  );
  const accountBalance = money(member?.account_balance);
  const outstandingAmount = money(member?.outstanding_amount);
  const renewalBlocked = !!member && accountBalance < 0;

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const m = await fetchMember(id);
        const [n, h, p, c] = await Promise.all([
          fetchMemberNotes(id),
          fetchMembershipHistory(id),
          fetchPayments({ member: id }),
          fetchCheckins({ member: id }),
        ]);
        if (!cancelled) {
          setMember(m);
          setNotes(n);
          setHistory(h);
          setPayments(p);
          setCheckins(c);
        }
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

  if (!Number.isFinite(id)) {
    return <Alert type="error">Invalid member id.</Alert>;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-2.5 w-32 animate-pulse rounded bg-[var(--border)]" />
        <div className="mt-3 h-1 w-20 animate-pulse rounded bg-[var(--border)]/60" />
        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border)]">
          <div className="h-14 bg-[var(--surface)]" />
          <div className="space-y-0 border-t border-[var(--border)]/60 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex border-b border-[var(--border)]/40 py-2 last:border-0"
              >
                <div className="h-2.5 w-20 shrink-0 animate-pulse rounded bg-[var(--border)]" />
                <div className="ml-6 h-2.5 flex-1 animate-pulse rounded bg-[var(--border)]/50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        <Link
          href="/members"
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to members
        </Link>
        {!error && <p className="text-[var(--muted)]">Member not found.</p>}
      </div>
    );
  }

  async function onMarkPaid() {
    if (!member) return;
    setPaymentActionError(null);
    setMarkingPaid(true);
    try {
      const updated = await markMemberPaid(member.id);
      setMember(updated);
    } catch (e) {
      setPaymentActionError(
        e instanceof Error ? e.message : "Could not update payment status."
      );
    } finally {
      setMarkingPaid(false);
    }
  }

  async function onAddNote() {
    if (!member || !noteBody.trim()) return;
    setAddingNote(true);
    setPaymentActionError(null);
    try {
      await addMemberNote(member.id, noteBody.trim());
      const refreshed = await fetchMemberNotes(member.id);
      setNotes(refreshed);
      setNoteBody("");
    } catch (e) {
      setPaymentActionError(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setAddingNote(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      {paymentActionError && <Alert type="error">{paymentActionError}</Alert>}
      <nav
        className="mb-3 flex flex-wrap items-center gap-1.5 text-[0.75rem] text-[var(--muted)]"
        aria-label="Breadcrumb"
      >
        <Link
          href="/members"
          className="font-medium text-[var(--accent)] transition hover:underline"
        >
          Members
        </Link>
        <span aria-hidden className="text-[var(--border)]">
          /
        </span>
        <span className="min-w-0 max-w-[16rem] truncate text-[var(--foreground)]/90" title={member.full_name}>
          {member.id_number}
        </span>
      </nav>

      <article className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-8px_rgba(0,0,0,0.35)]">
        <div className="h-0.5 bg-gradient-to-r from-[var(--accent)] via-[var(--accent)]/60 to-transparent" />

        <header className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)]/80 text-sm font-semibold tabular-nums text-[var(--foreground)]"
                aria-hidden
              >
                {initials}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
                  Member
                </p>
                <h1 className="text-lg font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-xl">
                  {member.full_name}
                </h1>
                <p className="font-mono text-xs text-[var(--muted)]">
                  {member.id_number}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <StatusPill
                    tone={member.membership_status === "active" ? "positive" : "neutral"}
                  >
                    {member.membership_status === "active"
                      ? "Active membership"
                      : member.membership_status === "expired"
                        ? "Membership expired"
                        : "Membership not active"}
                  </StatusPill>
                  <StatusPill
                    tone={
                      member.member_payment_status === "paid" ? "positive" : "caution"
                    }
                  >
                    {member.member_payment_status === "paid"
                      ? "Payment received"
                      : "Payment pending"}
                  </StatusPill>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:pt-1">
              <Link
                href={`/membership?member=${member.id}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  renewalBlocked
                    ? "pointer-events-none border border-amber-300/30 bg-amber-500/10 text-amber-100/70"
                    : "border border-[var(--border)] bg-[var(--background)]/60 text-[var(--foreground)] hover:border-[var(--muted)] hover:bg-[var(--background)]"
                }`}
                aria-disabled={renewalBlocked}
              >
                Renew membership
              </Link>
              {member.member_payment_status !== "paid" && (
                <button
                  type="button"
                  onClick={onMarkPaid}
                  disabled={markingPaid}
                  className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  {markingPaid ? "Marking..." : "Mark payment paid"}
                </button>
              )}
              <Link
                href="/members"
                className="rounded-md border border-[var(--border)] bg-[var(--background)]/60 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--muted)] hover:bg-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Close
              </Link>
              <Link
                href={`/members/${member.id}/edit`}
                className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Edit record
              </Link>
            </div>
          </div>
        </header>

        {renewalBlocked ? (
          <div className="mx-4 mt-3 rounded-md border-l-2 border-amber-400 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 sm:mx-5">
            This member has an outstanding balance of ${Math.abs(accountBalance).toFixed(2)}.
            Please record payment before renewing.
            <Link
              href={`/payments?member=${member.id}`}
              className="ml-2 rounded-md border border-amber-300/35 px-2 py-1 text-xs font-medium hover:bg-amber-400/10"
            >
              Record payment
            </Link>
          </div>
        ) : null}

        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
          <Panel title="Contact & plan">
            <dl>
              <DataRow label="First name" value={member.first_name} />
              <DataRow label="Last name" value={member.last_name || "—"} />
              <DataRow
                label="Email"
                value={
                  member.email ? (
                    <a
                      href={`mailto:${member.email}`}
                      className="font-medium text-[var(--accent)] decoration-[var(--accent)]/30 underline-offset-2 transition hover:underline"
                    >
                      {member.email}
                    </a>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )
                }
              />
              <DataRow
                label="Phone"
                value={
                  member.phone ? (
                    <a
                      href={`tel:${member.phone.replace(/\s/g, "")}`}
                      className="font-mono text-[0.8125rem]"
                    >
                      {member.phone}
                    </a>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )
                }
              />
              <DataRow
                label="Plan"
                value={
                  <span className="font-medium">
                    {member.plan === "custom" && member.custom_plan_name
                      ? member.custom_plan_name
                      : planLabel(member.plan)}
                  </span>
                }
              />
              <DataRow
                label="Discount"
                value={<span>{Number(member.discount_percent || 0)}%</span>}
              />
              <DataRow
                label="Start date"
                value={
                  <span className="tabular-nums text-[0.8125rem]">
                    {formatDate(member.start_date)}
                  </span>
                }
              />
              <DataRow
                label="End date"
                value={
                  <span className="tabular-nums text-[0.8125rem]">
                    {formatDate(member.end_date)}
                  </span>
                }
              />
            </dl>
          </Panel>

          <Panel title="Payment & record">
            <dl>
              <DataRow
                label="Payment status"
                value={
                  <span
                    className={
                      member.member_payment_status === "paid"
                        ? "font-medium text-emerald-300/90"
                        : "font-medium text-amber-200/85"
                    }
                  >
                    {member.member_payment_status === "paid" ? "Paid" : "Pending"}
                  </span>
                }
              />
              <DataRow
                label="Payment date"
                value={
                  <span className="tabular-nums text-[0.8125rem]">
                    {formatDate(member.payment_received_on)}
                  </span>
                }
              />
              <DataRow
                label="Ledger (latest)"
                value={
                  <span className="capitalize text-[0.8125rem]">
                    {member.latest_payment_status ?? "—"}
                  </span>
                }
              />
              {accountBalance > 0 && (
                <DataRow
                  label="Balance"
                  value={
                    <span className="font-medium text-emerald-300/90">
                      Member has credit: ${member.account_balance}
                    </span>
                  }
                />
              )}
              <DataRow
                label="Outstanding amount"
                value={<span>${outstandingAmount.toFixed(2)}</span>}
              />
              <DataRow
                label="Account balance"
                value={
                  <span className={accountBalance < 0 ? "text-amber-200" : "text-emerald-200"}>
                    ${accountBalance.toFixed(2)}
                  </span>
                }
              />
              <DataRow
                label="Created"
                value={
                  <time
                    dateTime={member.created_at}
                    className="tabular-nums text-[0.8125rem] text-[var(--foreground)]/90"
                  >
                    {formatDateTime(member.created_at)}
                  </time>
                }
              />
              <DataRow
                label="Last updated"
                value={
                  <time
                    dateTime={member.updated_at}
                    className="tabular-nums text-[0.8125rem] text-[var(--foreground)]/90"
                  >
                    {formatDateTime(member.updated_at)}
                  </time>
                }
              />
            </dl>
          </Panel>
        </div>
        <div className="grid gap-3 border-t border-[var(--border)] p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
          <Panel title="Notes">
            <div className="space-y-3 py-2">
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                rows={3}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Add staff notes..."
              />
              <button
                type="button"
                onClick={onAddNote}
                disabled={addingNote || !noteBody.trim()}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {addingNote ? "Saving..." : "Add note"}
              </button>
              {notes.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-md border border-[var(--border)]/70 p-2">
                      <p className="text-sm">{n.body}</p>
                      <p className="mt-1 text-[0.7rem] text-[var(--muted)]">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Membership history">
            <div className="space-y-2 py-2">
              {history.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No membership history yet.</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="rounded-md border border-[var(--border)]/70 p-2">
                    <p className="text-sm capitalize">
                      {h.event} · {h.plan}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {h.start_date} to {h.end_date} ({h.payment_status})
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
        <div className="grid gap-3 border-t border-[var(--border)] p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
          <Panel title="Payment history">
            <div className="space-y-2 py-2">
              {payments.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No payments yet.</p>
              ) : (
                payments.slice(0, 10).map((p) => (
                  <div key={p.id} className="rounded-md border border-[var(--border)]/70 p-2">
                    <p className="text-sm">
                      ${p.amount} · <span className="capitalize">{p.status}</span>
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {p.method}
                      {p.invoice_number ? ` · ${p.invoice_number}` : ""} ·{" "}
                      {new Date(p.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>
          <Panel title="Attendance history">
            <div className="space-y-2 py-2">
              {checkins.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No check-ins yet.</p>
              ) : (
                checkins.slice(0, 12).map((c) => (
                  <div key={c.id} className="rounded-md border border-[var(--border)]/70 p-2">
                    <p className="text-sm">{new Date(c.checked_in_at).toLocaleString()}</p>
                    <p className="text-xs capitalize text-[var(--muted)]">{c.source}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </article>
    </div>
  );
}
