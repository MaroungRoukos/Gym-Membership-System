"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { DateInputWithCalendarButton } from "@/components/DateInputWithCalendarButton";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { PaginationControls, parseOffset, parsePageSize } from "@/components/PaginationControls";
import { StatusBadge } from "@/components/StatusBadge";
import {
  apiFetch,
  createPayment,
  fetchPayments,
  fetchPaymentsPage,
  membersQuery,
  updatePayment,
  type Member,
  type PaymentMethod,
  type Payment,
  type PaymentStatus,
} from "@/lib/api";

type SortOption = "-created_at" | "created_at" | "-amount" | "amount" | "due_date";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatInvoiceDatePart(isoDate: string) {
  return isoDate.replace(/-/g, "");
}

function computeNextInvoiceNumber(existing: string[], isoDate: string) {
  const prefix = `INV-${formatInvoiceDatePart(isoDate)}-`;
  const maxForDate = existing.reduce((max, invoice) => {
    if (!invoice?.startsWith(prefix)) return max;
    const suffix = invoice.slice(prefix.length);
    if (!/^\d{4}$/.test(suffix)) return max;
    const n = Number(suffix);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  const next = String(maxForDate + 1).padStart(4, "0");
  return `${prefix}${next}`;
}

function parseFilterMember(raw: string | null): number | "" {
  if (!raw) return "";
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return "";
  return Math.floor(value);
}

function parseFilterStatus(raw: string | null): PaymentStatus | "" {
  if (raw === "pending" || raw === "paid" || raw === "failed" || raw === "overdue") {
    return raw;
  }
  return "";
}

function parseSortBy(raw: string | null): SortOption {
  if (
    raw === "-created_at" ||
    raw === "created_at" ||
    raw === "-amount" ||
    raw === "amount" ||
    raw === "due_date"
  ) {
    return raw;
  }
  return "-created_at";
}

export default function PaymentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filterMember, setFilterMember] = useState<number | "">(() =>
    parseFilterMember(searchParams.get("member"))
  );
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | "">(() =>
    parseFilterStatus(searchParams.get("status"))
  );
  const [memberId, setMemberId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [useTodayPaymentDate, setUseTodayPaymentDate] = useState(true);
  const [paymentDate, setPaymentDate] = useState(() => isoToday());
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [lastCreatedInvoice, setLastCreatedInvoice] = useState<string | null>(null);
  const [memberRecentPayments, setMemberRecentPayments] = useState<Payment[]>([]);
  const [recentPaymentsLoading, setRecentPaymentsLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [limit, setLimit] = useState(() => parsePageSize(searchParams.get("limit")));
  const [offset, setOffset] = useState(() => parseOffset(searchParams.get("offset")));
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState({
    total: 0,
    pending: 0,
    paid: 0,
    overdue: 0,
    failed: 0,
  });
  const [sortBy, setSortBy] = useState<SortOption>(() =>
    parseSortBy(searchParams.get("ordering"))
  );

  const loadMembers = useCallback(async () => {
    const mData = await apiFetch<Member[]>(membersQuery({}));
    setMembers(mData);
    setMemberId((prev) => {
      if (
        typeof prev === "number" &&
        mData.some((m) => m.id === prev)
      ) {
        return prev;
      }
      return mData.length ? mData[0].id : "";
    });
  }, []);

  const loadMemberRecentPayments = useCallback(async (targetMemberId: number) => {
    setRecentPaymentsLoading(true);
    try {
      const data = await fetchPaymentsPage({
        member: targetMemberId,
        limit: 5,
        offset: 0,
        ordering: "-created_at",
      });
      setMemberRecentPayments(data.results);
    } catch {
      setMemberRecentPayments([]);
    } finally {
      setRecentPaymentsLoading(false);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pData = await fetchPaymentsPage({
        member: filterMember || undefined,
        status: filterStatus || undefined,
        limit,
        offset,
        ordering: sortBy,
      });
      setPayments(pData.results);
      setTotalCount(pData.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setPayments([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [filterMember, filterStatus, limit, offset, sortBy]);

  const loadStatusCounts = useCallback(async () => {
    try {
      const allForContext = await fetchPayments({
        member: filterMember || undefined,
      });
      const next = allForContext.reduce(
        (acc, p) => {
          acc.total += 1;
          acc[p.status] += 1;
          return acc;
        },
        { total: 0, pending: 0, paid: 0, overdue: 0, failed: 0 }
      );
      setStatusCounts(next);
    } catch {
      setStatusCounts({ total: 0, pending: 0, paid: 0, overdue: 0, failed: 0 });
    }
  }, [filterMember]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("ordering", sortBy);
    if (filterMember) params.set("member", String(filterMember));
    else params.delete("member");
    if (filterStatus) params.set("status", filterStatus);
    else params.delete("status");
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [
    filterMember,
    filterStatus,
    limit,
    offset,
    pathname,
    router,
    searchParams,
    sortBy,
  ]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadStatusCounts();
  }, [loadStatusCounts]);

  useEffect(() => {
    if (!memberId) {
      setMemberRecentPayments([]);
      setLastCreatedInvoice(null);
      return;
    }
    void loadMemberRecentPayments(Number(memberId));
  }, [loadMemberRecentPayments, memberId]);

  useEffect(() => {
    if (totalCount > 0 && offset >= totalCount) {
      setOffset(Math.max(0, Math.floor((totalCount - 1) / limit) * limit));
    }
  }, [limit, offset, totalCount]);

  async function onRecord(e: FormEvent) {
    e.preventDefault();
    if (!memberId || !amount || !paymentDate) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createPayment({
        member: Number(memberId),
        amount,
        status,
        method,
        due_date: dueDate || null,
        description,
        // TODO: Backend currently keeps `paid_at` read-only and derives timestamps from server-side create/status flows.
        // Keep using created_at behavior until API accepts an explicit payment date field.
      });
      setAmount("");
      setDescription("");
      setStatus("pending");
      setMethod("cash");
      setDueDate("");
      setLastCreatedInvoice(created.invoice_number || null);
      setSuccess(
        `Payment recorded. Invoice # ${created.invoice_number || "Generated"}`
      );
      if (memberId) {
        await loadMemberRecentPayments(Number(memberId));
      }
      await loadStatusCounts();
      await loadPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchPayment(id: number, next: PaymentStatus) {
    try {
      await updatePayment(id, { status: next });
      await loadStatusCounts();
      await loadPayments();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  const selectedFilterMember =
    members.find((m) => m.id === filterMember) ?? null;
  const selectedRecordMember = members.find((m) => m.id === memberId) ?? null;
  const generatedInvoiceNumber = useMemo(() => {
    const dateSource = paymentDate || isoToday();
    return computeNextInvoiceNumber(
      memberRecentPayments.map((p) => p.invoice_number),
      dateSource
    );
  }, [memberRecentPayments, paymentDate]);

  const filteredMemberOptions = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return members.slice(0, 8);
    return members
      .filter((m) => {
        return (
          m.full_name.toLowerCase().includes(term) ||
          m.id_number.toLowerCase().includes(term) ||
          m.phone.toLowerCase().includes(term)
        );
      })
      .slice(0, 8);
  }, [memberSearch, members]);

  const hasActiveFilters =
    filterMember !== "" || filterStatus !== "" || sortBy !== "-created_at";

  const summaryText = (() => {
    const statusText = filterStatus ? `${filterStatus} payments` : "all payments";
    const memberText = selectedFilterMember
      ? ` for ${selectedFilterMember.full_name}`
      : filterStatus
        ? " for all members"
        : "";
    return `Showing ${statusText}${memberText}`;
  })();

  const sortLabelMap: Record<SortOption, string> = {
    "-created_at": "Newest first",
    "created_at": "Oldest first",
    "-amount": "Amount high to low",
    amount: "Amount low to high",
    due_date: "Due date soonest",
  };

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Revenue Control"
        title="Premium payment operations for your gym."
        description="Track dues, update payment statuses instantly, and keep your membership cash flow healthy."
        imageSrc="/images/gym-payments.jpg"
      />

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <form
          onSubmit={onRecord}
          className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur lg:col-span-2"
        >
          <h2 className="font-medium">Record payment</h2>
          <div>
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
                  {m.full_name} ({m.id_number})
                </option>
              ))}
            </select>
          </div>
          {selectedRecordMember && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <div className="text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">
                  {selectedRecordMember.full_name}
                </span>{" "}
                · {selectedRecordMember.id_number} · {selectedRecordMember.phone}
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Invoice preview</p>
                <code className="mt-1 inline-flex rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs text-[var(--foreground)]">
                  {generatedInvoiceNumber}
                </code>
                {lastCreatedInvoice && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Invoice # (saved):{" "}
                    <span className="font-mono text-[var(--foreground)]">
                      {lastCreatedInvoice}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-[var(--muted)]">Payment date</label>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={useTodayPaymentDate}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUseTodayPaymentDate(checked);
                    if (checked) setPaymentDate(isoToday());
                  }}
                />
                Use today&apos;s date
              </label>
            </div>
            <DateInputWithCalendarButton
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={useTodayPaymentDate}
              showPickerButton={false}
            />
            <p className="text-xs text-[var(--muted)]">
              Payment date is when the payment is recorded/received.
            </p>
          </div>
          <div className="space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <p className="text-xs text-[var(--muted)]">Past invoices</p>
            {recentPaymentsLoading ? (
              <p className="text-xs text-[var(--muted)]">Loading past invoices…</p>
            ) : memberRecentPayments.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                No past invoices for this member.
              </p>
            ) : (
              <div className="space-y-2">
                {memberRecentPayments.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-5 gap-2 rounded-md border border-white/10 bg-[var(--background)]/30 px-2 py-1.5 text-[11px]"
                  >
                    <span className="col-span-2 truncate font-mono text-[var(--foreground)]">
                      {p.invoice_number || "—"}
                    </span>
                    <span className="tabular-nums">${p.amount}</span>
                    <span className="capitalize text-[var(--muted)]">{p.status}</span>
                    <span className="text-[var(--muted)]">
                      {new Date(p.created_at).toLocaleDateString()} · due {p.due_date ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Amount</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Status</label>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
              value={status}
              onChange={(e) => setStatus(e.target.value as PaymentStatus)}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Method</label>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Bank transfer</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Due date</label>
            <DateInputWithCalendarButton
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              showPickerButton={false}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Due date is when payment is/was expected (optional).
            </p>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Description</label>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save payment"}
          </button>
        </form>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <h2 className="font-medium">Payment history</h2>
          <div>
            <label className="text-xs text-[var(--muted)]">Search member</label>
            <input
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setMemberSearchOpen(true);
              }}
              onFocus={() => setMemberSearchOpen(true)}
              placeholder="Name, member ID, or phone"
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm"
            />
            {memberSearchOpen && filteredMemberOptions.length > 0 && (
              <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-white/10 bg-slate-950/95 p-1">
                {filteredMemberOptions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setFilterMember(m.id);
                      setOffset(0);
                      setMemberSearchOpen(false);
                      setMemberSearch("");
                    }}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10"
                  >
                    <span className="block">{m.full_name}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {m.id_number} · {m.phone}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedFilterMember && (
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)]/40 px-3 py-1 text-xs">
              <span>
                {selectedFilterMember.full_name} · {selectedFilterMember.id_number}
              </span>
              <button
                type="button"
                aria-label="Clear member filter"
                onClick={() => {
                  setFilterMember("");
                  setOffset(0);
                }}
                className="text-[var(--muted)] hover:text-white"
              >
                x
              </button>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs text-[var(--muted)]">Status</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setFilterStatus("");
                  setOffset(0);
                }}
                className={`rounded-lg border px-2.5 py-2 text-left text-xs ${
                  filterStatus === ""
                    ? "border-[var(--accent)] bg-[var(--accent)]/15"
                    : "border-white/15 bg-slate-900/40"
                }`}
              >
                <span className="block">All</span>
                <span className="text-[var(--muted)]">{statusCounts.total}</span>
              </button>
              {(["pending", "paid", "overdue", "failed"] as PaymentStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setFilterStatus(s);
                    setOffset(0);
                  }}
                  className={`rounded-lg border px-2.5 py-2 text-left text-xs capitalize ${
                    filterStatus === s
                      ? "border-[var(--accent)] bg-[var(--accent)]/15"
                      : "border-white/15 bg-slate-900/40"
                  }`}
                >
                  <span className="block">{s}</span>
                  <span className="text-[var(--muted)]">{statusCounts[s]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--muted)]">Sort</label>
            <div>
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortOption);
                  setOffset(0);
                }}
              >
                {Object.entries(sortLabelMap).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-[var(--muted)]">{summaryText}</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterMember("");
                setFilterStatus("");
                setSortBy("-created_at");
                setOffset(0);
                setMemberSearch("");
              }}
              className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:text-white"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Loading payments…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-white/5 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Due</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8"
                  >
                    <EmptyState
                      title="No payments in this view"
                      message="Adjust filters or record a new payment to populate this feed."
                      imageSrc="/images/gym-payments.jpg"
                    />
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-t border-white/10 hover:bg-white/[0.03]">
                    <td className="px-4 py-2 text-xs">
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/members/${p.member}/edit`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        {p.member_name}
                      </Link>
                      <span className="block font-mono text-xs text-[var(--muted)]">
                        {p.member_id_number}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">${p.amount}</td>
                    <td className="px-4 py-2">
                      <StatusBadge
                        label={p.status}
                        tone={
                          p.status === "paid"
                            ? "success"
                            : p.status === "failed"
                              ? "danger"
                              : "warning"
                        }
                      />
                    </td>
                    <td className="px-4 py-2 capitalize">{p.method}</td>
                    <td className="px-4 py-2">{p.due_date ?? "—"}</td>
                    <td className="px-4 py-2 space-x-2 text-xs">
                      {p.status !== "paid" && (
                        <button
                          type="button"
                          className="text-[var(--success)] hover:underline"
                          onClick={() => patchPayment(p.id, "paid")}
                        >
                          Mark paid
                        </button>
                      )}
                      {p.status !== "paid" && p.status !== "failed" && (
                        <button
                          type="button"
                          className="text-[var(--muted)] hover:underline"
                          onClick={() => patchPayment(p.id, "failed")}
                        >
                          Failed
                        </button>
                      )}
                      {p.status === "pending" && (
                        <button
                          type="button"
                          className="text-amber-300 hover:underline"
                          onClick={() => patchPayment(p.id, "overdue")}
                        >
                          Overdue
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <PaginationControls
        noun="records"
        count={totalCount}
        limit={limit}
        offset={offset}
        loading={loading}
        onLimitChange={(value) => {
          setLimit(value);
          setOffset(0);
        }}
        onOffsetChange={setOffset}
      />
    </div>
  );
}
