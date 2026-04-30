"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { fetchCheckinsPage, quickCheckin, type Checkin } from "@/lib/api";

const PAGE_SIZES = [10, 20, 50, 100] as const;

function parsePageSize(raw: string | null): number {
  const value = Number(raw);
  return PAGE_SIZES.includes(value as (typeof PAGE_SIZES)[number]) ? value : 20;
}

function parseOffset(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export default function CheckinsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [idNumber, setIdNumber] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [limit, setLimit] = useState(() => parsePageSize(searchParams.get("limit")));
  const [offset, setOffset] = useState(() => parseOffset(searchParams.get("offset")));
  const ordering = searchParams.get("ordering") || "-checked_in_at";
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCheckinsPage({
        limit,
        offset,
        ordering,
      });
      setCheckins(data.results);
      setTotalCount(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load check-ins");
      setCheckins([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, ordering]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("ordering", ordering);
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [limit, offset, ordering, pathname, router, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (totalCount > 0 && offset >= totalCount) {
      setOffset(Math.max(0, Math.floor((totalCount - 1) / limit) * limit));
    }
  }, [limit, offset, totalCount]);

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
      setOffset(0);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setSubmitting(false);
    }
  }
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const start = totalCount === 0 ? 0 : offset + 1;
  const end = totalCount === 0 ? 0 : Math.min(offset + limit, totalCount);
  const disablePrev = loading || offset === 0;
  const disableNext = loading || offset + limit >= totalCount;

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
      <div className="flex items-center justify-end gap-2">
        <label className="text-xs text-[var(--muted)]">
          Page size
          <select
            className="ml-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setOffset(0);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-[var(--muted)]">
          Showing {start}-{end} of {totalCount} check-ins
        </span>
        <button
          type="button"
          disabled={disablePrev}
          onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
          className="rounded-md border border-[var(--border)] px-3 py-1 text-xs disabled:opacity-50"
        >
          Prev
        </button>
        <span className="text-xs text-[var(--muted)]">
          Page {page} / {totalPages} ({totalCount} check-ins)
        </span>
        <button
          type="button"
          disabled={disableNext}
          onClick={() => setOffset((prev) => prev + limit)}
          className="rounded-md border border-[var(--border)] px-3 py-1 text-xs disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
