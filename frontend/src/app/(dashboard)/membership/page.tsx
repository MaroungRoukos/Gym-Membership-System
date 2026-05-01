"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { DateInputWithCalendarButton } from "@/components/DateInputWithCalendarButton";
import {
  apiFetch,
  assignMembership,
  membersQuery,
  renewMember,
  type Member,
  type MemberPlan,
  type MembershipStatus,
} from "@/lib/api";

const PLANS: { value: MemberPlan; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "student", label: "Student" },
  { value: "family", label: "Family" },
  { value: "custom", label: "Custom" },
];

function formatIsoDate(iso: string) {
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

function membershipStatusLabel(status: MembershipStatus) {
  return status.replace(/_/g, " ");
}

function toNumber(value: string | undefined) {
  const n = Number(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

const statusBadgeClass: Record<MembershipStatus, string> = {
  active:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 ring-1 ring-inset ring-emerald-500/20",
  expired:
    "border-rose-500/35 bg-rose-500/10 text-rose-200 ring-1 ring-inset ring-rose-500/15",
  not_active:
    "border-amber-500/35 bg-amber-500/10 text-amber-100 ring-1 ring-inset ring-amber-500/15",
};

const fieldClass =
  "mt-1.5 block w-full min-h-[42px] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const planSelectClass = `${fieldClass} capitalize`;
const cardClass =
  "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-6";

export default function MembershipPage() {
  const searchParams = useSearchParams();
  const preferredMemberId = Number(searchParams.get("member") || "");
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState<number | "">("");
  const [assignPlan, setAssignPlan] = useState<MemberPlan>("monthly");
  const [assignStart, setAssignStart] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [renewPlan, setRenewPlan] = useState<MemberPlan | "">("");
  const [loading, setLoading] = useState(true);
  const [assignLoading, setAssignLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [renewSuccess, setRenewSuccess] = useState<string | null>(null);
  const [renewError, setRenewError] = useState<string | null>(null);

  const loadMembers = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      setLoadError(null);
      const data = await apiFetch<Member[]>(membersQuery({}));
      setMembers(data);
      setMemberId((prev) => {
        if (typeof prev === "number" && data.some((m) => m.id === prev)) {
          return prev;
        }
        if (
          Number.isFinite(preferredMemberId) &&
          preferredMemberId > 0 &&
          data.some((m) => m.id === preferredMemberId)
        ) {
          return preferredMemberId;
        }
        return data.length ? data[0].id : "";
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [preferredMemberId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    setAssignSuccess(null);
    setAssignError(null);
    setRenewSuccess(null);
    setRenewError(null);
  }, [memberId]);

  const selected = members.find((m) => m.id === memberId) ?? null;
  const isActiveMember =
    selected?.membership_status?.toLowerCase() === "active";
  const accountBalance = toNumber(selected?.account_balance);
  const outstandingAmount = toNumber(selected?.outstanding_amount);
  const renewalBlocked = !!selected && accountBalance < 0;

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!memberId || isActiveMember) return;
    setAssignError(null);
    setAssignSuccess(null);
    setRenewSuccess(null);
    setRenewError(null);
    setAssignLoading(true);
    try {
      await assignMembership(Number(memberId), {
        plan: assignPlan,
        start_date: assignStart,
      });
      setAssignSuccess("Membership assigned. Plan and dates were updated.");
      await loadMembers({ silent: true });
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : "Could not assign membership."
      );
    } finally {
      setAssignLoading(false);
    }
  }

  async function onRenew(e: FormEvent) {
    e.preventDefault();
    if (!memberId) return;
    setRenewError(null);
    setRenewSuccess(null);
    setAssignSuccess(null);
    setAssignError(null);
    setRenewLoading(true);
    try {
      await renewMember(Number(memberId), renewPlan || undefined);
      setRenewSuccess("Membership renewed. End date was extended.");
      await loadMembers({ silent: true });
    } catch (err) {
      setRenewError(
        err instanceof Error ? err.message : "Could not renew membership."
      );
    } finally {
      setRenewLoading(false);
    }
  }

  async function onForceRenew() {
    if (!memberId) return;
    setRenewError(null);
    setRenewSuccess(null);
    setRenewLoading(true);
    try {
      await renewMember(Number(memberId), renewPlan || undefined, { force_renew: true });
      setRenewSuccess("Membership renewed with override.");
      await loadMembers({ silent: true });
    } catch (err) {
      setRenewError(err instanceof Error ? err.message : "Could not force renew membership.");
    } finally {
      setRenewLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Membership</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            Set a member&apos;s plan and start date, or renew to extend coverage.
            Assign replaces the active period from the chosen start date; renew
            adds time from the current end date or from today if they are
            expired.
          </p>
        </div>
        {selected && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)]/80 bg-[var(--surface-soft)]/80 px-3 py-2.5 text-sm"
            aria-live="polite"
          >
            <span className="text-[var(--muted)]">Selected:</span>
            <span className="font-medium text-[var(--foreground)]">
              {selected.full_name}
            </span>
            <span className="hidden sm:inline text-[var(--border)]">·</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass[selected.membership_status]}`}
            >
              {membershipStatusLabel(selected.membership_status)}
            </span>
            <span className="text-[var(--muted)]">
              <span className="text-[var(--foreground)]">{selected.plan}</span>
              {" · "}
              ends {formatIsoDate(selected.end_date)}
            </span>
          </div>
        )}
      </header>

      {loadError && <Alert type="error">{loadError}</Alert>}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading members…</p>
      ) : (
        <>
          <section className={cardClass} aria-labelledby="member-card-title">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <h2 id="member-card-title" className="sr-only">
                  Member selection
                </h2>
                <label
                  htmlFor="membership-member-select"
                  className="text-xs font-medium text-[var(--muted)]"
                >
                  Member
                </label>
                <select
                  id="membership-member-select"
                  className={fieldClass}
                  value={memberId === "" ? "" : memberId}
                  onChange={(e) =>
                    setMemberId(e.target.value ? Number(e.target.value) : "")
                  }
                  aria-describedby={
                    selected ? "member-summary-hint" : undefined
                  }
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.id_number})
                    </option>
                  ))}
                </select>
                <p id="member-summary-hint" className="mt-2 text-xs text-[var(--muted)]">
                  Choose who to assign or renew. Details update below.
                </p>
              </div>
              {selected ? (
                <Link
                  href={`/members/${selected.id}/edit`}
                  className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-transparent px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--muted)] hover:bg-[var(--background)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  Edit profile
                </Link>
              ) : null}
            </div>

            {selected ? (
              <div className="mt-4 border-t border-[var(--border)]/60 pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                  Current membership
                </p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Name</dt>
                    <dd className="mt-0.5 truncate text-sm font-medium text-[var(--foreground)]">
                      {selected.full_name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Member ID</dt>
                    <dd className="mt-0.5 font-mono text-sm text-[var(--foreground)]">
                      {selected.id_number}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Plan</dt>
                    <dd className="mt-0.5 text-sm capitalize text-[var(--foreground)]">
                      {selected.plan}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Status</dt>
                    <dd className="mt-0.5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass[selected.membership_status]}`}
                      >
                        {membershipStatusLabel(selected.membership_status)}
                      </span>
                    </dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <dt className="text-xs text-[var(--muted)]">
                      Coverage end date
                    </dt>
                    <dd className="mt-0.5 text-sm text-[var(--foreground)]">
                      {formatIsoDate(selected.end_date)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Outstanding</dt>
                    <dd className="mt-0.5 text-sm text-[var(--foreground)]">
                      ${outstandingAmount.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Account balance</dt>
                    <dd
                      className={`mt-0.5 text-sm ${
                        accountBalance < 0 ? "text-amber-200" : "text-emerald-200"
                      }`}
                    >
                      ${accountBalance.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </section>

          <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-6">
            {isActiveMember ? (
              <section
                className={`${cardClass} flex flex-col border-l-4 border-l-[var(--accent)]/35`}
                aria-labelledby="assign-heading"
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    New period
                  </p>
                  <h2
                    id="assign-heading"
                    className="mt-1 text-lg font-semibold text-[var(--foreground)]"
                  >
                    Assign membership
                  </h2>
                </div>
                <div className="mt-4 rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/35 p-4">
                  <p className="text-sm text-[var(--foreground)]">
                    This member already has an active membership. Use Renew
                    membership to extend their current plan.
                  </p>
                </div>
              </section>
            ) : (
              <form
                onSubmit={onAssign}
                className={`${cardClass} flex flex-col border-l-4 border-l-[var(--accent)]/70`}
                aria-labelledby="assign-heading"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                      New period
                    </p>
                    <h2
                      id="assign-heading"
                      className="mt-1 text-lg font-semibold text-[var(--foreground)]"
                    >
                      Assign membership
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                      Sets the member&apos;s plan and start date. The server
                      calculates the end date from the plan (monthly,
                      quarterly, etc.)—you normally do not set the end date
                      here.
                    </p>
                  </div>
                </div>

                {assignError && (
                  <div className="mb-4" role="alert">
                    <Alert type="error">{assignError}</Alert>
                  </div>
                )}
                {assignSuccess && (
                  <div className="mb-4" role="status">
                    <Alert type="success">{assignSuccess}</Alert>
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-4">
                  <div>
                    <label
                      htmlFor="assign-plan"
                      className="text-xs font-medium text-[var(--muted)]"
                    >
                      Plan
                    </label>
                    <select
                      id="assign-plan"
                      className={planSelectClass}
                      value={assignPlan}
                      onChange={(e) =>
                        setAssignPlan(e.target.value as MemberPlan)
                      }
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
                      className="text-xs font-medium text-[var(--muted)]"
                      htmlFor="assign-start-date"
                    >
                      Start date
                    </label>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Use the calendar control in the field. The end date is
                      derived from this start date and the plan you select
                      above.
                    </p>
                    <div className="mt-1.5">
                      <DateInputWithCalendarButton
                        id="assign-start-date"
                        required
                        value={assignStart}
                        onChange={(e) => setAssignStart(e.target.value)}
                        showPickerButton={false}
                        inputClassName="min-h-[42px]"
                      />
                    </div>
                  </div>
                  <div className="mt-auto pt-1">
                    <button
                      type="submit"
                      disabled={assignLoading || !memberId}
                      aria-busy={assignLoading}
                      className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {assignLoading ? "Assigning…" : "Assign membership"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            <form
              onSubmit={onRenew}
              className={`${cardClass} flex flex-col border-l-4 border-l-[var(--muted)]/50`}
              aria-labelledby="renew-heading"
            >
              <div className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Extend coverage
                </p>
                <h2
                  id="renew-heading"
                  className="mt-1 text-lg font-semibold text-[var(--foreground)]"
                >
                  Renew membership
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  <strong className="font-medium text-[var(--foreground)]/90">
                    Different from assign:
                  </strong>{" "}
                  renew keeps the existing membership timeline and adds another
                  term. If the member is still active, the extension runs from
                  their current end date. If expired, coverage starts from
                  today.
                </p>
              </div>

              {renewError && (
                <div className="mb-4" role="alert">
                  <Alert type="error">{renewError}</Alert>
                </div>
              )}
              {renewSuccess && (
                <div className="mb-4" role="status">
                  <Alert type="success">{renewSuccess}</Alert>
                </div>
              )}

              <div className="flex flex-1 flex-col gap-4">
                {renewalBlocked && selected ? (
                  <div className="rounded-lg border-l-2 border-amber-400 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    This member has an outstanding balance of $
                    {Math.abs(accountBalance).toFixed(2)}. Please record payment before renewing.
                    <div className="mt-2">
                      <Link
                        href={`/payments?member=${selected.id}`}
                        className="rounded-md border border-amber-300/35 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-400/10"
                      >
                        Record payment
                      </Link>
                    </div>
                  </div>
                ) : null}
                <div>
                  <label
                    htmlFor="renew-plan"
                    className="text-xs font-medium text-[var(--muted)]"
                  >
                    Plan for renewal
                  </label>
                  <select
                    id="renew-plan"
                    className={fieldClass}
                    value={renewPlan}
                    onChange={(e) =>
                      setRenewPlan(
                        e.target.value ? (e.target.value as MemberPlan) : ""
                      )
                    }
                    aria-describedby="renew-plan-hint"
                  >
                    <option value="">
                      Keep current plan (recommended)
                    </option>
                    {PLANS.map((o) => (
                      <option key={o.value} value={o.value}>
                        Switch to {o.label} for this renewal
                      </option>
                    ))}
                  </select>
                  <p id="renew-plan-hint" className="mt-1.5 text-xs text-[var(--muted)]">
                    Leave on the default to renew with their existing plan. Pick
                    another plan only if you are changing what they are paying
                    for going forward.
                  </p>
                </div>
                <div className="mt-auto pt-1">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={renewLoading || !memberId || renewalBlocked}
                      aria-busy={renewLoading}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)]/40 px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--muted)] hover:bg-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {renewLoading ? "Renewing…" : "Renew membership"}
                    </button>
                    {renewalBlocked ? (
                      <button
                        type="button"
                        onClick={onForceRenew}
                        disabled={renewLoading || !memberId}
                        className="w-full rounded-lg border border-amber-300/35 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-50 sm:w-auto"
                      >
                        Force renew
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
