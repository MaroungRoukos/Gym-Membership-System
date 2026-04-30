"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { PaginationControls, parseOffset, parsePageSize } from "@/components/PaginationControls";
import { StatusBadge } from "@/components/StatusBadge";
import {
  apiFetch,
  deleteMember,
  membersQuery,
  type PaginatedResponse,
  type Member,
} from "@/lib/api";

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
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") || "");
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ordering = sortBy === "name" ? "first_name" : "end_date";
      const data = await apiFetch<PaginatedResponse<Member>>(
        membersQuery({
          search: debouncedSearch || undefined,
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
  }, [debouncedSearch, limit, offset, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const ordering = sortBy === "name" ? "first_name" : "end_date";
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("ordering", ordering);
    if (debouncedSearch) params.set("search", debouncedSearch);
    else params.delete("search");
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [debouncedSearch, limit, offset, pathname, router, searchParams, sortBy]);

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
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Member Management"
        title="Build and retain a stronger gym community."
        description="Review members, monitor plan expirations, and manage member lifecycle with a modern fitness-focused workflow."
        imageSrc="/images/gym-members.jpg"
        actions={[{ href: "/members/new", label: "Add member" }]}
      />
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-3 md:items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-[var(--muted)]">Search members</label>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Find by name, ID, or phone"
            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Sort</label>
          <select
            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as "name" | "end_date");
              setOffset(0);
            }}
          >
            <option value="name">Name (A-Z)</option>
            <option value="end_date">End date (soonest)</option>
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
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/5 text-[var(--muted)]">
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
                    className="px-4 py-8"
                  >
                    <EmptyState
                      title="No members found"
                      message="Try changing your search or filters, then hit the floor with new signups."
                      imageSrc="/images/gym-members.jpg"
                    />
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/members/${m.id}`)}
                    className="cursor-pointer border-t border-white/10 hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {m.id_number}
                    </td>
                    <td className="px-4 py-3">{m.full_name}</td>
                    <td className="px-4 py-3 capitalize">{m.plan}</td>
                    <td className="px-4 py-3">{m.end_date}</td>
                    <td className="px-4 py-3 capitalize">
                      <StatusBadge
                        label={m.membership_status.replace("_", " ")}
                        tone={m.membership_status === "active" ? "success" : "warning"}
                      />
                    </td>
                    <td className="px-4 py-3 capitalize text-xs">
                      {m.member_payment_status === "paid" ? (
                        <StatusBadge label="Paid" tone="success" />
                      ) : (
                        <StatusBadge label="Pending" tone="warning" />
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
      <PaginationControls
        noun="members"
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
