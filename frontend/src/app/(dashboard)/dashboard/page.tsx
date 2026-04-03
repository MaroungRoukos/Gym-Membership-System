"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import { SummaryCard } from "@/components/SummaryCard";
import { fetchDashboard, type DashboardStats } from "@/lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchDashboard(30);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <Alert type="error">{error}</Alert>;
  }

  if (!data) {
    return <p className="text-[var(--muted)]">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Overview of members, memberships, and revenue.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total members" value={data.total_members} />
        <SummaryCard
          title="Active memberships"
          value={data.active_memberships}
        />
        <SummaryCard
          title="Expired memberships"
          value={data.expired_memberships}
        />
        <SummaryCard
          title="Total revenue"
          value={`$${Number(data.total_revenue).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          hint="Sum of paid payments"
        />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Expiring in {data.expiring_days} days
          </h2>
          <Link
            href="/expiring"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            View all
          </Link>
        </div>
        {data.expiring_memberships.length === 0 ? (
          <Alert type="info">No memberships expiring in this window.</Alert>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-[var(--surface)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Ends</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.expiring_memberships.map((m) => (
                  <tr
                    key={m.id}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-4 py-2">{m.full_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {m.id_number}
                    </td>
                    <td className="px-4 py-2 capitalize">{m.plan}</td>
                    <td className="px-4 py-2">{m.end_date}</td>
                    <td className="px-4 py-2 capitalize">
                      {m.membership_status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
