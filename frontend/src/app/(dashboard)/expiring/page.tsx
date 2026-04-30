"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import { fetchDashboard, type DashboardStats } from "@/lib/api";

export default function ExpiringPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await fetchDashboard(days);
        if (!cancelled) setData(d);
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
  }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Expiring memberships</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Members whose end date falls between today and the selected window
            (active only).
          </p>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Days ahead</label>
          <select
            className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 14, 30, 60].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {loading || !data ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : data.expiring_memberships.length === 0 ? (
        <Alert type="info">No active memberships expiring in this window.</Alert>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--surface)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Ends</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.expiring_memberships.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2">{m.full_name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{m.id_number}</td>
                  <td className="px-4 py-2 capitalize">{m.plan}</td>
                  <td className="px-4 py-2">{m.end_date}</td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/members/${m.id}/edit`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href="/membership"
                      className="ml-3 text-[var(--muted)] hover:underline"
                    >
                      Renew
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
