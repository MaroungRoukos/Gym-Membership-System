"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/Alert";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  apiFetch,
  deleteMember,
  membersQuery,
  type Member,
} from "@/lib/api";

export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Member[]>(membersQuery({}));
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    </div>
  );
}
