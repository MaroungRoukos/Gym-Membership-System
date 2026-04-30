"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import {
  fetchMember,
  markMemberPaid,
  type Member,
  type MemberPlan,
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
  };
  return labels[plan];
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

  const initials = useMemo(
    () => (member ? memberInitials(member) : ""),
    [member]
  );

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const m = await fetchMember(id);
        if (!cancelled) setMember(m);
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
                  <span className="font-medium">{planLabel(member.plan)}</span>
                }
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
      </article>
    </div>
  );
}
