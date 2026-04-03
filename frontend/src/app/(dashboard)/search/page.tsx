"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import {
  apiFetch,
  membersQuery,
  type Member,
  type MemberPlan,
  type MembershipStatus,
  type PaymentStatus,
} from "@/lib/api";

export default function SearchPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | MembershipStatus>("");
  const [plan, setPlan] = useState<"" | MemberPlan>("");
  const [paymentStatus, setPaymentStatus] = useState<
    "" | PaymentStatus | "none"
  >("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Member[]>(
        membersQuery({
          search,
          status: status || undefined,
          plan: plan || undefined,
          payment_status: paymentStatus || undefined,
        })
      );
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [search, status, plan, paymentStatus]);

  useEffect(() => {
    const t = setTimeout(runSearch, 250);
    return () => clearTimeout(t);
  }, [runSearch]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Search &amp; filter</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Combine name/ID search with membership, plan, and payment filters.
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="text-xs text-[var(--muted)]">Name or ID</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Membership</label>
          <select
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "" | MembershipStatus)
            }
          >
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Plan</label>
          <select
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
            value={plan}
            onChange={(e) => setPlan(e.target.value as "" | MemberPlan)}
          >
            <option value="">Any</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">
            Latest payment status
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 capitalize"
            value={paymentStatus}
            onChange={(e) =>
              setPaymentStatus(e.target.value as "" | PaymentStatus | "none")
            }
          >
            <option value="">Any</option>
            <option value="none">No payments</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={runSearch}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Searching…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-[var(--surface)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">End</th>
                <th className="px-4 py-2">Membership</th>
                <th className="px-4 py-2">Payment</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    No results.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2">{m.full_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {m.id_number}
                    </td>
                    <td className="px-4 py-2 capitalize">{m.plan}</td>
                    <td className="px-4 py-2">{m.end_date}</td>
                    <td className="px-4 py-2 capitalize">
                      {m.membership_status}
                    </td>
                    <td className="px-4 py-2 capitalize text-xs">
                      {m.latest_payment_status ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/members/${m.id}/edit`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        Edit
                      </Link>
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
