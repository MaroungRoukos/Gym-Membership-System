"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert } from "@/components/Alert";
import { fetchCheckins, quickCheckin, type Checkin } from "@/lib/api";

export default function CheckinsPage() {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [idNumber, setIdNumber] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchCheckins();
      setCheckins(data.slice(0, 80));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load check-ins");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onQuickCheckin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const created = await quickCheckin({
        id_number: idNumber.trim() || undefined,
        search: search.trim() || undefined,
        source: "desk",
      });
      setMessage(`Checked in ${created.member_name} successfully.`);
      setIdNumber("");
      setSearch("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Attendance check-ins</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Quick check-in by member ID or name search.
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <form
        onSubmit={onQuickCheckin}
        className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-5 sm:grid-cols-3"
      >
        <div>
          <label className="text-xs text-[var(--muted)]">Member ID</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            placeholder="M000001"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Name search</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            placeholder="John"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {submitting ? "Checking in..." : "Quick check-in"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-[var(--muted)]">Loading check-ins...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/70">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[var(--surface-soft)]/70 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {checkins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                    No check-ins yet.
                  </td>
                </tr>
              ) : (
                checkins.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--border)]/70">
                    <td className="px-4 py-2">{new Date(c.checked_in_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{c.member_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{c.member_id_number}</td>
                    <td className="px-4 py-2 capitalize">{c.source}</td>
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
