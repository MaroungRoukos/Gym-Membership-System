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
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--border)]/80 bg-[var(--surface)]"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(10,15,26,0.88), rgba(15,24,40,0.65)), url('https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=1600&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Gym Operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
            Dashboard
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-200/90">
            Monitor memberships, payments, and upcoming expirations from one
            place.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/members/new"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
            >
              Add new member
            </Link>
            <Link
              href="/payments"
              className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Open payments
            </Link>
          </div>
        </div>
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
          title="Not active (unpaid)"
          value={data.not_active_memberships}
        />
        <SummaryCard
          title="Expiring soon"
          value={data.expiring_soon}
          hint={`Within ${data.expiring_days} days`}
        />
        <SummaryCard
          title="Unpaid balances"
          value={`$${Number(data.unpaid_balances).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        />
        <SummaryCard
          title="Monthly revenue"
          value={`$${Number(data.monthly_revenue).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        />
        <SummaryCard
          title="Yearly revenue"
          value={`$${Number(data.yearly_revenue).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        />
        <SummaryCard
          title="New members this month"
          value={data.new_members_this_month}
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
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]/80 bg-[var(--surface)]/70">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-[var(--surface-soft)]/70 text-[var(--muted)]">
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
                      {m.membership_status.replace("_", " ")}
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
