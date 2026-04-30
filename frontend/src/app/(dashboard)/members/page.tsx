"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  apiFetch,
  deleteMember,
  membersQuery,
  type PaginatedResponse,
  type Member,
} from "@/lib/api";

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

export default function MembersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [limit, setLimit] = useState(() => parsePageSize(searchParams.get("limit")));
  const [offset, setOffset] = useState(() => parseOffset(searchParams.get("offset")));
  const [sortBy, setSortBy] = useState<"name" | "end_date">(() =>
    searchParams.get("ordering") === "end_date" ? "end_date" : "name"
  );
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ordering = sortBy === "name" ? "first_name" : "end_date";
      const data = await apiFetch<PaginatedResponse<Member>>(
        membersQuery({
          limit,
          offset,
          ordering,
        })
      );
      setMembers(data.results);
      setTotalCount(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setMembers([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, sortBy]);

  useEffect(() => {
    const ordering = sortBy === "name" ? "first_name" : "end_date";
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("ordering", ordering);
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [limit, offset, pathname, router, searchParams, sortBy]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (totalCount > 0 && offset >= totalCount) {
      setOffset(Math.max(0, Math.floor((totalCount - 1) / limit) * limit));
    }
  }, [limit, offset, totalCount]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      await deleteMember(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Could not delete member"
      );
    } finally {
      setDeleteLoading(false);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="text-sm text-[var(--muted)]">
            All members — use Search &amp; filter for advanced filters.
          </p>
        </div>
        <Link
          href="/members/new"
          className="inline-flex justify-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Add member
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--muted)]">
          Showing {start}-{end} of {totalCount} members
        </p>
        <div className="flex items-center gap-2">
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
          <select
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as "name" | "end_date");
              setOffset(0);
            }}
          >
            <option value="name">Sort by name</option>
            <option value="end_date">Sort by end date</option>
          </select>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete member?"
        message={
          pendingDelete
            ? `This will remove ${pendingDelete.full_name} (${pendingDelete.id_number}) and cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        danger
        loading={deleteLoading}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleteLoading) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      />

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[var(--surface)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">ID #</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3">Membership</th>
                <th className="px-4 py-3">Payment status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    No members yet.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/members/${m.id}`)}
                    className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface)]/40"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {m.id_number}
                    </td>
                    <td className="px-4 py-3">{m.full_name}</td>
                    <td className="px-4 py-3 capitalize">{m.plan}</td>
                    <td className="px-4 py-3">{m.end_date}</td>
                    <td className="px-4 py-3 capitalize">
                      <span
                        className={
                          m.membership_status === "active"
                            ? "text-[var(--success)]"
                            : "text-[var(--muted)]"
                        }
                      >
                        {m.membership_status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-xs">
                      {m.member_payment_status === "paid" ? (
                        <span className="text-[var(--success)]">Paid</span>
                      ) : (
                        <span className="text-amber-400/90">Pending</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`/members/${m.id}/edit`}
                        className="text-[var(--accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="ml-3 cursor-pointer text-[var(--danger)] hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteError(null);
                          setPendingDelete(m);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={disablePrev}
          onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
          className="rounded-md border border-[var(--border)] px-3 py-1 text-xs disabled:opacity-50"
        >
          Prev
        </button>
        <span className="text-xs text-[var(--muted)]">
          Page {page} / {totalPages}
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
