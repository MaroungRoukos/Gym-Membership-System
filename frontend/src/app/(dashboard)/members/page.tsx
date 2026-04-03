"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import {
  apiFetch,
  deleteMember,
  membersQuery,
  type Member,
} from "@/lib/api";

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
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
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(id: number) {
    if (!confirm("Delete this member?")) return;
    try {
      await deleteMember(id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
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
                <th className="px-4 py-3">Payment</th>
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
                    className="border-t border-[var(--border)] hover:bg-[var(--surface)]/40"
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
                        {m.membership_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-xs">
                      {m.latest_payment_status ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/members/${m.id}/edit`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="ml-3 text-[var(--danger)] hover:underline"
                        onClick={() => onDelete(m.id)}
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
