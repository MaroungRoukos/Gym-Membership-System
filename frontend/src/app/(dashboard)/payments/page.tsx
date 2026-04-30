"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import {
  apiFetch,
  createPayment,
  fetchPayments,
  membersQuery,
  updatePayment,
  type Member,
  type Payment,
  type PaymentStatus,
} from "@/lib/api";

export default function PaymentsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filterMember, setFilterMember] = useState<number | "">("");
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | "">("");
  const [memberId, setMemberId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mData, pData] = await Promise.all([
        apiFetch<Member[]>(membersQuery({})),
        fetchPayments({
          member: filterMember || undefined,
          status: filterStatus || undefined,
        }),
      ]);
      setMembers(mData);
      setPayments(pData);
      setMemberId((prev) => {
        if (
          typeof prev === "number" &&
          mData.some((m) => m.id === prev)
        ) {
          return prev;
        }
        return mData.length ? mData[0].id : "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filterMember, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

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
        description,
      });
      setAmount("");
      setDescription("");
      setStatus("pending");
      setSuccess("Payment recorded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchPayment(id: number, next: PaymentStatus) {
    try {
      await updatePayment(id, { status: next });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Record payments and view history. Mark as paid to count toward
          revenue.
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={onRecord}
          className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
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
            </select>
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

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-medium">Filter history</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-[var(--muted)]">Member</label>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                value={filterMember === "" ? "" : filterMember}
                onChange={(e) =>
                  setFilterMember(e.target.value ? Number(e.target.value) : "")
                }
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
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(
                    e.target.value ? (e.target.value as PaymentStatus) : ""
                  )
                }
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Loading payments…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--surface)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    No payments match.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border)]">
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
                    <td className="px-4 py-2 capitalize">{p.status}</td>
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
