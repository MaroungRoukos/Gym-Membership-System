"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { PaginationControls, parseOffset, parsePageSize } from "@/components/PaginationControls";
import { StatusBadge } from "@/components/StatusBadge";
import {
  apiFetch,
  fetchCheckinsPage,
  fetchMember,
  membersQuery,
  quickCheckin,
  quickCheckout,
  type Checkin,
  type Member,
  type MemberPlan,
  type MembershipStatus,
  type PaginatedResponse,
} from "@/lib/api";

type DeskTab = "recent" | "today" | "in_gym";

function planLabel(plan: MemberPlan) {
  const labels: Record<MemberPlan, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
    student: "Student",
    family: "Family",
    custom: "Custom",
  };
  return labels[plan];
}

function membershipLabel(status: MembershipStatus) {
  if (status === "active") return "Active";
  if (status === "expired") return "Expired";
  return "Inactive";
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const sec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function liveElapsedSeconds(checkInIso: string): number {
  const t = Date.parse(checkInIso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

async function resolveMemberFromInputs(
  rawId: string,
  rawName: string
): Promise<Member> {
  const idPart = rawId.trim();
  const namePart = rawName.trim();
  if (!idPart && !namePart) {
    throw new Error("Enter a member ID or name.");
  }

  const { results } = await apiFetch<PaginatedResponse<Member>>(
    `${membersQuery({ search: idPart || namePart, limit: 16 })}`
  );

  if (!results?.length) {
    throw new Error("Member not found.");
  }

  if (idPart) {
    const exact = results.find(
      (m) => (m.id_number ?? "").trim().toLowerCase() === idPart.toLowerCase()
    );
    if (exact) return exact;
  }

  if (results.length === 1) return results[0];

  throw new Error("Several members match — add more of the member ID or name.");
}

export default function CheckinsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visits, setVisits] = useState<Checkin[]>([]);
  const [idNumber, setIdNumber] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deskTab, setDeskTab] = useState<DeskTab>(
    () => (searchParams.get("desk") as DeskTab | null) ?? "recent"
  );
  const [limit, setLimit] = useState(() => parsePageSize(searchParams.get("limit")));
  const [offset, setOffset] = useState(() => parseOffset(searchParams.get("offset")));
  const ordering = searchParams.get("ordering") ?? "-check_in_time";
  const [totalCount, setTotalCount] = useState(0);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [openVisit, setOpenVisit] = useState<Checkin | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const tabVisitScope = useMemo(() => {
    if (deskTab === "in_gym") return "in_gym" as const;
    if (deskTab === "today") return "today" as const;
    return "";
  }, [deskTab]);

  const loadMemberAttendance = useCallback(async (memberId: number) => {
    const open = await fetchCheckinsPage({
      member: memberId,
      visit_scope: "in_gym",
      limit: 1,
      ordering: "-check_in_time",
    });
    setOpenVisit(open.results[0] && open.results[0].is_in_gym ? open.results[0] : null);
  }, []);

  /** Keep button label aligned with gym state while typing (debounced). */
  useEffect(() => {
    if (!idNumber.trim() && !search.trim()) {
      setSelectedMember(null);
      setOpenVisit(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      (async () => {
        try {
          const member = await resolveMemberFromInputs(idNumber, search);
          if (cancelled) return;
          setSelectedMember(member);
          const open = await fetchCheckinsPage({
            member: member.id,
            visit_scope: "in_gym",
            limit: 1,
            ordering: "-check_in_time",
          });
          if (cancelled) return;
          setOpenVisit(open.results[0]?.is_in_gym ? open.results[0] : null);
        } catch {
          if (!cancelled) {
            setSelectedMember(null);
            setOpenVisit(null);
          }
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [idNumber, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCheckinsPage({
        limit,
        offset,
        ordering,
        visit_scope: tabVisitScope || undefined,
      });
      setVisits(data.results);
      setTotalCount(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load visits");
      setVisits([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, ordering, tabVisitScope]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("ordering", ordering);
    params.set("desk", deskTab);
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [limit, offset, ordering, pathname, router, searchParams, deskTab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (totalCount > 0 && offset >= totalCount) {
      setOffset(Math.max(0, Math.floor((totalCount - 1) / limit) * limit));
    }
  }, [limit, offset, totalCount]);

  const attendanceBlocked =
    !!selectedMember && selectedMember.membership_status !== "active";
  const isInGym = !!openVisit;

  async function refreshAfterAction(memberId?: number | null) {
    await load();
    if (memberId != null) {
      await loadMemberAttendance(memberId);
      const fresh = await fetchMember(memberId);
      setSelectedMember(fresh);
    }
  }

  async function onDeskSubmit(e: FormEvent) {
    e.preventDefault();
    if (!idNumber.trim() && !search.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const member = await resolveMemberFromInputs(idNumber, search);
      setSelectedMember(member);

      const openResp = await fetchCheckinsPage({
        member: member.id,
        visit_scope: "in_gym",
        limit: 1,
        ordering: "-check_in_time",
      });
      const currentOpen = openResp.results[0]?.is_in_gym ? openResp.results[0] : null;
      setOpenVisit(currentOpen);

      if (currentOpen) {
        await quickCheckout({
          member: member.id,
          id_number: idNumber.trim() || undefined,
          search: search.trim() || undefined,
        });
        setMessage("Checked out successfully");
      } else {
        await quickCheckin({
          member: member.id,
          id_number: idNumber.trim() || undefined,
          search: search.trim() || undefined,
          source: "desk",
        });
        setMessage("Checked in successfully");
      }

      await refreshAfterAction(member.id);
      setNowTick(Date.now());
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Attendance"
        title="Front-desk attendance console"
        description="Resolve a member by ID or name, then check in or check out in one streamlined flow."
        imageSrc="/images/gym-checkins.jpg"
      />

      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      <form
        onSubmit={onDeskSubmit}
        className="space-y-4 rounded-2xl border border-[var(--border)]/80 bg-[var(--surface)]/30 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="text-xs font-medium text-[var(--muted)]">Member ID</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--background)]/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none ring-cyan-500/30 placeholder:text-[var(--muted)] focus-visible:ring-2"
              placeholder="e.g. M000042"
              value={idNumber}
              onChange={(e) => {
                setIdNumber(e.target.value);
              }}
              aria-label="Member ID"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--muted)]">Name search</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--background)]/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none ring-cyan-500/30 placeholder:text-[var(--muted)] focus-visible:ring-2"
              placeholder="First or last name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              aria-label="Member name search"
            />
          </div>
          <div className="flex gap-2 sm:flex-col-reverse sm:justify-end">
            <button
              type="submit"
              disabled={
                submitting ||
                (!idNumber.trim() && !search.trim()) ||
                !!(selectedMember && attendanceBlocked && !isInGym)
              }
              className="shrink-0 rounded-xl bg-cyan-500/90 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-45"
              aria-busy={submitting}
            >
              {submitting ? "Working…" : isInGym ? "Check out" : "Check in"}
            </button>
          </div>
        </div>

        <p className="text-[0.72rem] text-[var(--muted)]">
          Press Enter in either field while the IDs or name are filled to{" "}
          {isInGym ? "check them out." : "check them in."} Preview updates as you pause typing.
        </p>

        {selectedMember ? (
          <div className="rounded-2xl border border-[var(--border)]/70 bg-[var(--background)]/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                  {selectedMember.full_name}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                  {selectedMember.id_number ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {openVisit?.is_in_gym ? (
                  <span className="inline-flex rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-cyan-200">
                    In gym
                  </span>
                ) : null}
                <StatusBadge label={membershipLabel(selectedMember.membership_status)} tone="neutral" />
              </div>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3 border-t border-[var(--border)]/60 pt-2">
                <dt className="text-[var(--muted)]">Phone</dt>
                <dd>{selectedMember.phone || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--border)]/60 pt-2">
                <dt className="text-[var(--muted)]">Plan</dt>
                <dd className="capitalize">{planLabel(selectedMember.plan)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--border)]/60 pt-2">
                <dt className="text-[var(--muted)]">Membership</dt>
                <dd>{membershipLabel(selectedMember.membership_status)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--border)]/60 pt-2">
                <dt className="text-[var(--muted)]">Attendance</dt>
                <dd className={isInGym ? "font-medium text-cyan-100" : undefined}>
                  {isInGym ? "Currently checked in" : "Not checked in"}
                </dd>
              </div>
            </dl>
            {openVisit ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Last check-in:&nbsp;
                <span className="text-[var(--foreground)]">
                  {new Date(openVisit.check_in_time).toLocaleString()}
                </span>
              </p>
            ) : selectedMember ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Last check-in: — (not currently checked in)
              </p>
            ) : null}

            {attendanceBlocked ? (
              <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/[0.08] px-3 py-2.5">
                <p className="text-sm font-medium text-amber-100">
                  {selectedMember.membership_status === "expired"
                    ? "Membership expired. Check-in is blocked."
                    : "Membership inactive. Check-in is blocked."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href="/payments"
                    className="rounded-lg border border-amber-300/35 px-3 py-1 text-xs font-medium text-amber-50 hover:bg-amber-500/10"
                  >
                    Record payment
                  </Link>
                  <Link
                    href="/membership"
                    className="rounded-lg border border-amber-300/35 px-3 py-1 text-xs font-medium text-amber-50 hover:bg-amber-500/10"
                  >
                    Renew membership
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "recent" as DeskTab, label: "Recent visits" },
            { id: "today" as DeskTab, label: "Today" },
            { id: "in_gym" as DeskTab, label: "In gym now" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setDeskTab(t.id);
              setOffset(0);
            }}
            className={`rounded-xl border px-3.5 py-1.5 text-xs font-medium transition ${
              deskTab === t.id
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border)]/90 hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading recent visits…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]/80 bg-[var(--surface)]/20">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-[var(--border)]/70 bg-[var(--background)]/40 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Check-in</th>
                <th className="px-4 py-3 font-medium">Check-out</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Member ID</th>
                <th className="px-4 py-3 font-medium">Membership</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/60">
              {visits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10">
                    <EmptyState
                      title="No visits in this view"
                      message="Adjust filters or check someone in from the desk panel above."
                      imageSrc="/images/gym-checkins.jpg"
                    />
                  </td>
                </tr>
              ) : (
                visits.map((v) => {
                  void nowTick;
                  const secs =
                    v.duration_seconds !== null && v.duration_seconds !== undefined
                      ? v.duration_seconds
                      : v.is_in_gym
                        ? liveElapsedSeconds(v.check_in_time)
                        : null;
                  return (
                    <tr key={v.id} className="hover:bg-[var(--background)]/35">
                      <td className="px-4 py-2.5 text-[var(--foreground)]">
                        {new Date(v.check_in_time).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--foreground)]">
                        {v.check_out_time ? (
                          new Date(v.check_out_time).toLocaleString()
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--foreground)]">
                        {v.is_in_gym ? (
                          <span>
                            <span>{formatDuration(secs ?? 0)}</span>
                            <span className="ml-1 text-[var(--muted)]">(live)</span>
                          </span>
                        ) : (
                          formatDuration(secs)
                        )}
                      </td>
                      <td className="px-4 py-2.5">{v.member_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{v.member_id_number}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge
                            label={membershipLabel(v.membership_status)}
                            tone={
                              v.membership_status === "expired" ? "warning" : "neutral"
                            }
                          />
                          {v.is_in_gym ? (
                            <span className="rounded-md border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-[0.62rem] font-semibold text-cyan-100">
                              In gym
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={v.source.replace("_", " ")} tone="neutral" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      <PaginationControls
        noun="visits"
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
