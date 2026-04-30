"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/Alert";
import { fetchReports, type ReportsData } from "@/lib/api";

function MiniBars({
  values,
  color,
}: {
  values: Array<{ label: string; value: number }>;
  color: string;
}) {
  const max = useMemo(
    () => Math.max(1, ...values.map((v) => v.value)),
    [values]
  );
  return (
    <div className="grid grid-cols-6 gap-2">
      {values.map((v) => (
        <div key={v.label} className="flex flex-col items-center gap-2">
          <div className="flex h-28 items-end">
            <div
              className="w-8 rounded-t-md"
              style={{
                height: `${Math.max(8, (v.value / max) * 100)}%`,
                background: color,
              }}
              title={`${v.label}: ${v.value}`}
            />
          </div>
          <span className="text-[0.7rem] text-[var(--muted)]">{v.label.split(" ")[0]}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchReports();
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load reports");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <p className="text-[var(--muted)]">Loading reports...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Revenue, member growth, attendance, and expired membership analytics.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5">
          <h2 className="text-sm font-semibold">Monthly revenue</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Last 6 months</p>
          <div className="mt-4">
            <MiniBars
              color="linear-gradient(180deg,#4f9cff,#2f6fcf)"
              values={data.monthly_revenue.map((m) => ({
                label: m.label,
                value: m.revenue,
              }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5">
          <h2 className="text-sm font-semibold">New memberships growth</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Last 6 months</p>
          <div className="mt-4">
            <MiniBars
              color="linear-gradient(180deg,#34d399,#089981)"
              values={data.monthly_revenue.map((m) => ({
                label: m.label,
                value: m.new_members,
              }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5">
          <h2 className="text-sm font-semibold">Attendance (last 7 days)</h2>
          <div className="mt-4">
            <MiniBars
              color="linear-gradient(180deg,#a78bfa,#6d52d4)"
              values={data.attendance_week.map((m) => ({
                label: m.label,
                value: m.checkins,
              }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5">
          <h2 className="text-sm font-semibold">Expired members</h2>
          <p className="mt-2 text-4xl font-semibold text-rose-300">{data.expired_members_count}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Members with paid memberships that passed end date.
          </p>
        </section>
      </div>
    </div>
  );
}
