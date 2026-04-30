"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { PaginationControls, parseOffset, parsePageSize } from "@/components/PaginationControls";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchCheckinsPage, quickCheckin, type Checkin } from "@/lib/api";

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
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Attendance"
        title="Fast, front-desk check-ins with premium visibility."
        description="Search by ID or name and keep your gym floor attendance log clean and real-time."
        imageSrc="/images/gym-checkins.jpg"
      />

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <form
        onSubmit={onQuickCheckin}
        className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:grid-cols-3"
      >
        <div>
          <label className="text-xs text-[var(--muted)]">Member ID</label>
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2"
            placeholder="M000001"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Name search</label>
          <input
            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2"
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
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-white/5 text-[var(--muted)]">
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
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState
                      title="No check-ins recorded"
                      message="Run a quick member check-in to begin today's attendance timeline."
                      imageSrc="/images/gym-checkins.jpg"
                    />
                  </td>
                </tr>
              ) : (
                checkins.map((c) => (
                  <tr key={c.id} className="border-t border-white/10 hover:bg-white/[0.03]">
                    <td className="px-4 py-2">{new Date(c.checked_in_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{c.member_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{c.member_id_number}</td>
                    <td className="px-4 py-2">
                      <StatusBadge label={c.source} tone="neutral" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <PaginationControls
        noun="check-ins"
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
