"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { PaginationControls, parseOffset, parsePageSize } from "@/components/PaginationControls";
import { StatusBadge } from "@/components/StatusBadge";
import {
  apiFetch,
  createPayment,
  fetchPaymentsPage,
  membersQuery,
  updatePayment,
  type Member,
  type PaymentMethod,
  type Payment,
  type PaymentStatus,
} from "@/lib/api";

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

function parseSortBy(raw: string | null): "created_at" | "amount" | "due_date" {
  if (raw === "amount" || raw === "due_date") return raw;
  return "created_at";
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
  const [dueDate, setDueDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [limit, setLimit] = useState(() => parsePageSize(searchParams.get("limit")));
  const [offset, setOffset] = useState(() => parseOffset(searchParams.get("offset")));
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<"created_at" | "amount" | "due_date">(() =>
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

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ordering =
        sortBy === "created_at" ? "-created_at" : sortBy;
      const pData = await fetchPaymentsPage({
        member: filterMember || undefined,
        status: filterStatus || undefined,
        limit,
        offset,
        ordering,
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

  useEffect(() => {
    const ordering = sortBy === "created_at" ? "-created_at" : sortBy;
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("ordering", ordering);
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
    if (totalCount > 0 && offset >= totalCount) {
      setOffset(Math.max(0, Math.floor((totalCount - 1) / limit) * limit));
    }
  }, [limit, offset, totalCount]);

  async function onRecord(e: FormEvent) {
    e.preventDefault();
    if (!memberId || !amount) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createPayment({
        member: Number(memberId),
        amount,
        status,
        method,
        due_date: dueDate || null,
        invoice_number: invoiceNumber || undefined,
        description,
      });
      setAmount("");
      setDescription("");
      setStatus("pending");
      setMethod("cash");
      setDueDate("");
      setInvoiceNumber("");
      setSuccess("Payment recorded.");
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
      await loadPayments();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }
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

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={onRecord}
          className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
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
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Invoice #</label>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="font-medium">Filter history</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-[var(--muted)]">Member</label>
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2"
                value={filterMember === "" ? "" : filterMember}
                onChange={(e) => {
                  setFilterMember(e.target.value ? Number(e.target.value) : "");
                  setOffset(0);
                }}
              >
                <option value="">All members</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">Status</label>
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 capitalize"
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(
                    e.target.value ? (e.target.value as PaymentStatus) : ""
                  );
                  setOffset(0);
                }}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">Sort</label>
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as "created_at" | "amount" | "due_date"
                  )
                }
              >
                <option value="created_at">Newest first</option>
                <option value="amount">Amount (low to high)</option>
                <option value="due_date">Due date (old to new)</option>
              </select>
            </div>
          </div>
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
                      {p.status !== "failed" && (
                        <button
                          type="button"
                          className="text-[var(--muted)] hover:underline"
                          onClick={() => patchPayment(p.id, "failed")}
                        >
                          Failed
                        </button>
                      )}
                      {p.status !== "overdue" && (
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
